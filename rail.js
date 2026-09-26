/* ===================================================================
   THE MY BET RAIL - the slip, always in view on the front door.
   Layout: option B, approved by Danny 2026-09-26 (mockup
   https://claude.ai/artifact/RnyCzSaKPXVSAz1ps5gSXr ). Top to bottom:
   whose bet / My Bet rows (pick, game, %, x) / Analytics / Bet Amount +
   Pays Out / Save Bet. Tapping a pick ("O 65.5") opens a small editor
   under its row: the side and the number. It reads and writes the same
   one slip (S) as every other screen; every % is a table lookup.
   =================================================================== */
const MOVED_BY=3;                 /* ruling 2 (2026-09-21): flag a move of 3 points or more */
let RAIL_EDIT=false;              /* N/A next to Clear reveals the per-pick buttons (ruling 1) */
let RAIL_PK=null;                 /* the pick editor: {gi, type, line(text)} or null */
const RAIL_ERR={};                /* "gi|market" -> why a typed line was not taken */

/* Ruling 2 (2026-09-21): the line-moved flag lives in My Bet only, never on the board or the
   tickets. It watches the pick's OWN number - spread and winner picks watch the spread, total
   picks watch the total - against the first DraftKings line refresh.py saved (G.open).
   Returns the sentence to show, or null. A game that has kicked off is past flagging. */
function movedNote(l){
  const G=GAMES[l.gi], o=G&&G.open; if(!o||!isOpen(G)||G.spread==null||G.total==null) return null;
  if(l.type==="over"||l.type==="under") return Math.abs(G.total-o.total)>=MOVED_BY?`Total opened ${o.total}, now ${G.total}`:null;
  const home=l.type==="homeML"||l.type==="homeSp", was=home?o.spread:-o.spread, now=home?G.spread:-G.spread;
  return Math.abs(now-was)>=MOVED_BY?`${shortName(G,home?G.home:G.away)} opened ${fmtSp(was)}, now ${fmtSp(now)}`:null;
}
/* the headline chance: settled legs are facts, not odds (same rule as the full My Bet screen) */
function railChance(){
  const {live,done}=splitLegs(S.legs);
  if(done.some(d=>d.r==="lost")) return {txt:"0%",p:0};
  if(!live.length) return {txt:"Hit",p:1};
  const {joint}=slipProb(live); return {txt:(joint*100).toFixed(2)+"%",p:joint};
}
/* the pick in a few characters: O 65.5 / U 44.5 / PITT -10.5 / PITT ML */
function pickShort(G,l){
  if(l.type==="over") return "O "+l.line;
  if(l.type==="under") return "U "+l.line;
  const t=abbrOf(G,legTeam(G,l.type));
  return hasLine(l.type)?`${t} ${fmtSp(l.line)}`:`${t} ML`;
}
/* kickoff at its shortest: 09/26 11a, 09/26 230p */
function kickShort(G){
  const d=kickDate(G), h=d.getHours(), m=d.getMinutes(), p=n=>String(n).padStart(2,"0");
  return `${p(d.getMonth()+1)}/${p(d.getDate())} ${G.tbd?"TBD":`${h%12||12}${m?p(m):""}${h<12?"a":"p"}`}`;
}
/* the two sides the editor offers for this pick's market */
function sidesOf(G,type){
  const m=legMarket(type);
  if(m==="Total") return [["over","Over"],["under","Under"]];
  if(m==="Spread") return [["awaySp",abbrOf(G,G.away)],["homeSp",abbrOf(G,G.home)]];
  return [["awayML",abbrOf(G,G.away)],["homeML",abbrOf(G,G.home)]];
}
const errKey=(gi,type)=>gi+"|"+legMarket(type);

/* ---- the pick editor ---- */
function openPick(gi,type){
  const k=findLeg(gi,type); if(k<0) return;
  if(RAIL_PK&&RAIL_PK.gi===gi&&legMarket(RAIL_PK.type)===legMarket(type)){ RAIL_PK=null; renderRail(); return; }
  RAIL_PK={gi,type,line:String(S.legs[k].line)}; delete RAIL_ERR[errKey(gi,type)];
  renderRail(); const n=document.querySelector("#railLine"); if(n){ n.focus(); n.select(); }
}
/* switching sides of a spread keeps the same game result, so the number flips sign (own number) */
function pickSide(type){
  const P=RAIL_PK; if(!P||P.type===type) return;
  const n=document.querySelector("#railLine"); if(n) P.line=n.value;
  if(legMarket(type)==="Spread"){ const v=parseFloat(P.line); if(!isNaN(v)) P.line=String(-v); }
  P.type=type; renderRail(); const m=document.querySelector("#railLine"); if(m) m.focus();
}
function commitPick(){
  const P=RAIL_PK; if(!P) return; const G=GAMES[P.gi], key=errKey(P.gi,P.type); RAIL_PK=null;
  const k=S.legs.findIndex(l=>l.gi===P.gi&&legMarket(l.type)===legMarket(P.type)); if(k<0||!isOpen(G)){ render(); return; }
  let line=0;
  if(hasLine(P.type)){
    const n=document.querySelector("#railLine"), v=parseFloat(n?n.value:P.line), base=marketLine(G,P.type), R=LADDER_R.wide;
    if(isNaN(v)||Math.round(v*2)!==v*2){ RAIL_ERR[key]="Use a whole or half number, like 65 or 65.5."; render(); return; }
    if(Math.abs(v-base)>R){ RAIL_ERR[key]=`Clover prices ${fmtLine(P.type,base-R)} to ${fmtLine(P.type,base+R)} on this game. Kept the old line.`; render(); return; }
    line=v;
  }
  delete RAIL_ERR[key];
  const old=S.legs[k]; if(old.type===P.type&&old.line===line){ render(); return; }
  swapIn(S.legs,P.gi,P.type,line); render();
}
const fmtLine=(type,v)=>legMarket(type)==="Spread"?fmtSp(v):String(v);

/* ---- drawing ---- */
function railRow(l){
  const G=GAMES[l.gi], res=settleLeg(G,l), k=findLeg(l.gi,l.type), open=isOpen(G), mv=movedNote(l);
  const ed=RAIL_PK&&RAIL_PK.gi===l.gi&&legMarket(RAIL_PK.type)===legMarket(l.type), err=RAIL_ERR[errKey(l.gi,l.type)];
  const label=esc(pickShort(G,l));
  let h=`<div class="rk">`
    +(open?`<button type="button" class="ou" data-pk="${k}" aria-expanded="${!!ed}" aria-label="Change ${esc(legLabel(G,l))}">${label}</button>`:`<span class="ou off">${label}</span>`)
    +`<span class="gm"><span>${esc(abbrOf(G,G.away))} @ ${esc(abbrOf(G,G.home))}</span><span>${kickShort(G)}</span></span>`
    +`<span class="pp${res?" "+res:""}">${res?res.toUpperCase():pct(prob(l.gi,[l]))}</span>`
    +(RAIL_EDIT&&open?`<button type="button" class="na" data-rna="${k}" aria-label="My app does not offer ${legMarket(l.type)} on this game">N/A</button>`:"")
    +`<button type="button" class="rm" data-rm="${k}" aria-label="Remove ${esc(legLabel(G,l))}">&#215;</button>`;
  if(ed){
    const P=RAIL_PK;
    h+=`<div class="ped"><div class="seg2" role="group" aria-label="Side">${sidesOf(G,l.type).map(([t,n])=>`<button type="button" data-side="${t}" aria-pressed="${P.type===t}">${esc(n)}</button>`).join("")}</div>`
      +(hasLine(P.type)?`<input id="railLine" class="lin" inputmode="decimal" value="${esc(P.line)}" aria-label="Line">`:"")
      +`<button type="button" class="ok" data-pok>Done</button></div>`;
  }
  if(err) h+=`<p class="rnote err">${esc(err)}</p>`;
  else if(!ed&&hasLine(l.type)&&l.line%1===0&&!res) h+=`<p class="rnote">Whole number: a tie pushes.</p>`;
  if(mv) h+=`<p class="rnote mv">&#8599; <b>Line moved.</b> ${esc(mv)}</p>`;
  return h+`</div>`;
}
/* Save Bet, and every state the bet record can be in (record.js does the saving) */
function railSaveHtml(pay){
  const P=S.placed, same=P&&!P.voided&&P.sig===slipSig(S.legs), live=splitLegs(S.legs).live.length;
  if(REC.ui==="saving") return `<button type="button" class="primary rsave" disabled>Saving&#8230;</button>`;
  if(REC.ui==="signin") return `<form class="rsign"><label class="hint" for="railEmail">${REC.msg?esc(REC.msg):"Sign in once on this device to save bets. Clover emails you a link."}</label>`
    +`<input id="railEmail" type="email" autocomplete="email" required value="${esc(REC.email)}" placeholder="you@example.com"><button type="submit" class="primary">Email me a link</button></form>`;
  if(REC.ui==="sent") return `<p class="hint">Check your email. We sent a sign-in link to ${esc(REC.email)}. Open it on this device, then tap Save Bet.</p><button type="button" class="primary rsave" data-rsave>Save Bet</button>`;
  if(same&&P.saved) return `<button type="button" class="primary rsave" disabled>Saved &#183; Bet #${P.saved.no}</button><p class="stamp">${esc(P.who)} &#183; ${payText(P)}</p>`;
  const err=REC.ui==="err"?`<p class="rnote err">${esc(REC.msg)}</p>`:"";
  return err+`<button type="button" class="primary rsave" data-rsave${pay&&live?"":" disabled"}>${REC.ui==="err"?"Try again":"Save Bet"}</button>`;
}
/* what was bet, in the app's own words when we have them */
function payText(P){ return P.stake?`${money(+P.stake)} pays ${money(+P.payout)}`:`${money(P.pays)} on $1`; }
function railHtml(){
  const n=S.legs.length;
  const who=`<div class="rsec"><div class="chips rwho">${["Danny","Jaclyn"].map(w=>`<button type="button" class="chip" data-who="${w}" aria-pressed="${S.who===w}">${w}</button>`).join("")}</div></div>`;
  const head=`<div class="rhead"><h2 class="rlab">My Bet</h2>${n?`<span><button type="button" class="ghost rg${RAIL_EDIT?" on":""}" id="railEdit" aria-expanded="${RAIL_EDIT}" aria-label="${RAIL_EDIT?"Done":"Mark a pick my app does not offer"}">${RAIL_EDIT?"Done":"N/A"}</button><button type="button" class="ghost rg" id="railClear">Clear</button></span>`:""}</div>`;
  if(!n) return who+`<div class="rsec">${head}<p class="empty">Tap any pick, or use a hot slip. Your picks collect here while you look around.</p></div>`;
  const legs=S.legs.slice().sort((a,b)=>GAMES[a.gi].start.localeCompare(GAMES[b.gi].start)||a.gi-b.gi);
  const ch=railChance(), pay=payoutFor(), dec=pay?pay.dec:null, g=pay?grade(ch.p*dec-1):null;
  const moved=legs.some(l=>movedNote(l));
  const st=S.stake!=null?S.stake:S.pays!=null?"1.00":"", po=S.payout!=null?S.payout:S.pays!=null?S.pays.toFixed(2):"";
  return who+`<div class="rsec">${head}<div class="rrows">${legs.map(railRow).join("")}</div>`
    +(RAIL_EDIT?pairsHtml(S.legs,"rail"):"")
    +(moved?`<p class="hint">A moved line is the news, on screen. Check your app still shows the old number before you place it.</p>`:"")+`</div>`
    +`<div class="rsec"><h3 class="rlab">Analytics</h3><div class="rbox">`
    +`<div class="kv"><span>Markov Prediction</span><b>${ch.txt}</b></div>`
    +`<div class="rside r3">${g?`<span class="word" style="color:var(${VCOLOR[g.word]})">${g.word}</span>`:`<span class="word">&#8212;</span><span class="sm">Type the payout</span>`}</div>`
    +`<div class="kv"><span>Coin Toss Line</span><b>${pay?(100/dec).toFixed(2)+"%":"&#8212;"}</b></div>`
    +`<div class="kv"><span>Good Bet Minimum</span><b>${pay?(105/dec).toFixed(2)+"%":"&#8212;"}</b></div></div></div>`
    +`<div class="rsec"><div class="rbox">`
    +`<div class="kv"><label for="railStake">Bet Amount</label><span class="money"><i>$</i><input id="railStake" data-money="stake" inputmode="decimal" placeholder="10.00" value="${esc(st)}"></span></div>`
    +`<div class="rside"><span class="sm">Returns</span><b>${pay?money(dec):"&#8212;"}</b><span class="sm">per $1</span></div>`
    +`<div class="kv"><label for="railPayout">Pays Out</label><span class="money"><i>$</i><input id="railPayout" data-money="payout" inputmode="decimal" placeholder="54.04" value="${esc(po)}"></span></div></div>`
    +(moneyNote()?`<p class="rnote err">${moneyNote()}</p>`:"")+`</div>`
    +railSaveHtml(pay);
}
/* Bet Amount + Pays Out, exactly as the app shows them. The verdict still works per $1:
   pays = payout / stake. Ruling 1 (2026-09-20) stands - no payout typed, no verdict. */
function setMoney(k,v){
  if(S.stake==null&&S.payout==null&&S.pays!=null){ S.stake="1.00"; S.payout=S.pays.toFixed(2); }   /* an older slip typed as "pays on $1" */
  S[k]=v===""?null:v;
  const s=parseFloat(S.stake), p=parseFloat(S.payout);
  S.pays=s>0&&p>s?p/s:null;
}
function moneyNote(){ const s=parseFloat(S.stake), p=parseFloat(S.payout); return s>0&&p>0&&p<=s?"Pays Out has to be more than the bet.":""; }
/* rail Save Bet: stamp the slip (made here if it is new or its picks changed), then save it */
async function railSave(){
  const P=S.placed;
  if(!P||P.voided||P.sig!==slipSig(S.legs)||!P.saved&&(P.pays!==S.pays||P.who!==S.who)) placeSlip();
  if(!S.placed) return;
  if(!sbSession()){ REC.ui="signin"; REC.msg=""; render(); return; }
  REC.ui="saving"; renderRail(); await saveBet(); render();
}
function renderRail(){
  const box=document.getElementById("rail");
  const f=document.activeElement, fid=f&&box.contains(f)?f.id:null;
  /* typing repaints the rail on every keystroke; keep the caret where it was */
  const sel=fid&&f.selectionStart!=null?[f.selectionStart,f.selectionEnd]:null, val=fid&&f.tagName==="INPUT"?f.value:null;
  box.innerHTML=railHtml();
  if(fid){ const inp=document.getElementById(fid); if(inp){ if(val!=null&&inp.tagName==="INPUT") inp.value=val; inp.focus(); if(sel) try{inp.setSelectionRange(sel[0],sel[1]);}catch(e){} } }
  box.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ RAIL_PK=null; S.legs.splice(+b.dataset.rm,1); render(); });
  box.querySelectorAll("[data-rna]").forEach(b=>b.onclick=()=>{ const l=S.legs[+b.dataset.rna]; naMark(l.gi,l.type); });
  box.querySelectorAll("[data-pk]").forEach(b=>b.onclick=()=>{ const l=S.legs[+b.dataset.pk]; openPick(l.gi,l.type); });
  box.querySelectorAll("[data-side]").forEach(b=>b.onclick=()=>pickSide(b.dataset.side));
  box.querySelectorAll("[data-who]").forEach(b=>b.onclick=()=>{ S.who=b.dataset.who; render(); });
  box.querySelectorAll("[data-ph]").forEach(b=>b.onclick=()=>{ const L=S.legs.filter(l=>l.gi===+b.dataset.gi); prohibAdd(GAMES[+b.dataset.gi],L[+b.dataset.x],L[+b.dataset.y]); render(); });
  box.querySelectorAll("[data-money]").forEach(i=>i.oninput=()=>{ setMoney(i.dataset.money,i.value.trim()); render(); });
  const ok=box.querySelector("[data-pok]"); if(ok) ok.onclick=commitPick;
  const ln=document.querySelector("#railLine"); if(ln){ ln.oninput=()=>{ RAIL_PK.line=ln.value; }; ln.onkeydown=e=>{ if(e.key==="Enter") commitPick(); if(e.key==="Escape"){ RAIL_PK=null; renderRail(); } }; }
  const e=box.querySelector("#railEdit"); if(e) e.onclick=()=>{ RAIL_EDIT=!RAIL_EDIT; renderRail(); };
  const c=box.querySelector("#railClear"); if(c) c.onclick=()=>{ S.legs=[]; S.pays=null; S.stake=null; S.payout=null; S.placed=null; REC.ui=""; RAIL_EDIT=false; RAIL_PK=null; render(); };
  const sv=box.querySelector("[data-rsave]"); if(sv) sv.onclick=railSave;
  const fm=box.querySelector(".rsign"); if(fm) fm.onsubmit=ev=>{ ev.preventDefault(); const v=fm.querySelector("input").value.trim(); if(v) sendLink(v).then(()=>renderRail()); };
}
