/* ===================================================================
   THE MY BET RAIL - the slip, always in view on the front door (row 4,
   2026-09-21). Picks, chance, whose bet, payout, verdict, Open My Bet.
   It reads and writes the same one slip (S) as every other screen.
   =================================================================== */
const MOVED_BY=3;                 /* ruling 2 (2026-09-21): flag a move of 3 points or more */
let RAIL_EDIT=false;              /* N/A next to Clear reveals the per-pick buttons (ruling 1) */

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
  const {joint}=slipProb(live); return {txt:pct(joint),p:joint};
}
function railHtml(){
  const n=S.legs.length;
  const head=`<div class="rhead"><h2>My Bet</h2>${n?`<span><button type="button" class="edit${RAIL_EDIT?" on":""}" id="railEdit" aria-expanded="${RAIL_EDIT}" aria-label="${RAIL_EDIT?"Done":"Mark a pick my app does not offer"}">${RAIL_EDIT?"Done":"N/A"}</button><button type="button" class="ghost" id="railClear">Clear</button></span>`:""}</div>`;
  if(!n) return head+`<p class="empty">Tap any pick, or use a hot slip. Your picks collect here while you look around.</p>`;
  const legs=S.legs.slice().sort((a,b)=>GAMES[a.gi].start.localeCompare(GAMES[b.gi].start)||a.gi-b.gi);
  let moved=false;
  const rows=legs.map(l=>{ const G=GAMES[l.gi], mv=movedNote(l), res=settleLeg(G,l), k=findLeg(l.gi,l.type); if(mv) moved=true;
    return `<div class="pk">${legTile(G,l.type)}<div class="two"><div class="lbl">${esc(legLabel(G,l))}</div><div class="who">${esc(legWho(G,l))} · ${esc(whenShort(G))}</div>`
      +(mv?`<div class="mv">&#8599; <b>Line moved.</b> ${esc(mv)}</div>`:"")+`</div>`
      +`<span class="pp${res?" "+res:""}">${res?res.toUpperCase():pct(prob(l.gi,[l]))}</span>`
      +(RAIL_EDIT&&isOpen(G)?`<button type="button" class="na" data-rna="${k}" aria-label="My app does not offer ${legMarket(l.type)} on this game">N/A</button>`:"")
      +`<button type="button" class="rm" data-rm="${k}" aria-label="Remove ${esc(legLabel(G,l))}">&#215;</button></div>`; }).join("");
  const ch=railChance(), pay=payoutFor(), ev=pay?ch.p*pay.dec-1:null, g=pay?grade(ev):null;
  return head+`<div class="legs">${rows}</div>`+(RAIL_EDIT?pairsHtml(S.legs,"rail"):"")
    +(moved?`<p class="hint">A moved line is the news, on screen. Check your app still shows the old number before you place it.</p>`:"")
    +`<div class="joint"><span class="sub">Chance all ${n} hit</span><span class="big">${ch.txt}</span></div>`
    +`<div class="fld"><label for="railPay">Your app pays on $1</label><input id="railPay" type="number" step="0.01" min="1" inputmode="decimal" placeholder="6.00" value="${S.pays!=null?S.pays:""}"></div>`
    +`<div class="fld"><span class="sub">Whose bet</span><div class="chips">${["Danny","Jaclyn"].map(w=>`<button type="button" class="chip" data-who="${w}" aria-pressed="${S.who===w}">${w}</button>`).join("")}</div></div>`
    +(g?`<div class="verdict ${g.cls}"><span class="word">${g.word}</span><span class="ev">${ev>=0?"+":"−"}${Math.round(Math.abs(ev)*100)}¢ per $1</span><span class="needs">Needs ${pct(1/pay.dec)}, has ${ch.txt}</span></div>`
      :`<p class="hint">Type the payout to get a verdict. Clover never guesses one.</p>`)
    +(S.placed?`<p class="stamp">Placed · ${esc(S.placed.who)} · ${money(S.placed.pays)} on $1</p>`:"")
    +`<button type="button" class="primary" id="railGo">Open My Bet</button>`;
}
function renderRail(){
  const box=document.getElementById("rail");
  const focused=document.activeElement&&document.activeElement.id==="railPay";
  /* typing a payout repaints the rail on every keystroke; keep the caret where it was */
  const keep=focused?box.querySelector("#railPay"):null, sel=keep?[keep.selectionStart,keep.selectionEnd]:null;
  box.innerHTML=railHtml();
  if(keep){ const inp=box.querySelector("#railPay"); if(inp){ inp.value=keep.value; inp.focus(); try{inp.setSelectionRange(sel[0],sel[1]);}catch(e){} } }
  box.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ S.legs.splice(+b.dataset.rm,1); render(); });
  box.querySelectorAll("[data-rna]").forEach(b=>b.onclick=()=>{ const l=S.legs[+b.dataset.rna]; naMark(l.gi,l.type); });
  box.querySelectorAll("[data-who]").forEach(b=>b.onclick=()=>{ S.who=b.dataset.who; render(); });
  box.querySelectorAll("[data-ph]").forEach(b=>b.onclick=()=>{ const L=S.legs.filter(l=>l.gi===+b.dataset.gi); prohibAdd(GAMES[+b.dataset.gi],L[+b.dataset.x],L[+b.dataset.y]); render(); });
  const e=box.querySelector("#railEdit"); if(e) e.onclick=()=>{ RAIL_EDIT=!RAIL_EDIT; renderRail(); };
  const c=box.querySelector("#railClear"); if(c) c.onclick=()=>{ S.legs=[]; S.pays=null; S.placed=null; RAIL_EDIT=false; render(); };
  const go=box.querySelector("#railGo"); if(go) go.onclick=()=>show("card");
  const p=box.querySelector("#railPay"); if(p) p.oninput=ev=>{ const v=parseFloat(ev.target.value); S.pays=isNaN(v)||v<=1?null:v; render(); };
}
