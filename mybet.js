/* ===================================================================
   THE FULL MY BET SCREEN (row 6, 2026-09-24). Built from the approved
   mockup: https://claude.ai/artifact/7VoHDPSoVXQ4oWpqefsVT1
   - Has / Needs / Verdict at one size, with a bar showing the gap
   - the numbers in the order of the verdict's math: pays, fair pay,
     back on average, per $1
   - "I placed this" is a stamp, not a lock (Danny, 2026-09-24); saving
     it is record.js (row 7)
   - picks are the board's own rows (boardRow), filtered to the slip;
     the ladder opens in the side column. One drawing of a game.
   - "How solid is it": the 49-version stress check as a grid + one word
     (option C, Danny 2026-09-24)
   Every % is a table lookup, like everywhere else.
   =================================================================== */
let MB_EDIT=false;                       /* N/A on the picks card reveals per-pick N/A + Prohibited */
const VCOLOR={Great:"--great",Good:"--good","Coin toss":"--coin",Bad:"--badv",Terrible:"--terr"};
const slipSig=legs=>legs.map(l=>GAMES[l.gi].id+"|"+l.type+"|"+l.line).sort().join(",");
const setT=(id,v)=>{ document.getElementById(id).textContent=v; };
/* Has and Needs sit side by side and the verdict lives in the gap, so they get one decimal (16.6% vs 15.4%, not 17% vs 15%) */
const pct1=p=>p==null?"—":p>0.995?">99%":p<0.005?"<1%":(p*100).toFixed(1)+"%";

/* the picks, drawn as board rows, with the notes that belong to My Bet under each game */
function mbRowsHtml(){
  const by={}; S.legs.forEach(l=>{ (by[l.gi]=by[l.gi]||[]).push(l); });
  const gis=Object.keys(by).map(Number).sort((a,b)=>GAMES[a].start.localeCompare(GAMES[b].start)||a-b);
  const {groups}=slipProb(S.legs);
  return gis.map(gi=>{
    const G=GAMES[gi], L=by[gi], gr=groups.find(g=>g.gi===gi), open=isOpen(G);
    let notes="";
    L.forEach(l=>{ const mv=movedNote(l); if(mv) notes+=`<div class="flag mv">&#8599; <b>Line moved.</b> ${esc(mv)}. Check your app still shows the old number.</div>`; });
    if(gr&&L.length>1) notes+=`<div class="flag">Same game · together <b>${pct(gr.p)}</b> vs ${pct(gr.indep)} if unrelated</div>`;
    if(MB_EDIT&&open){
      L.forEach(l=>{ notes+=`<div class="flag ed"><span>${esc(legLabel(G,l))}</span><button type="button" class="na" data-mna="${findLeg(l.gi,l.type)}" aria-label="My app does not offer ${legMarket(l.type)} on this game">N/A</button></div>`; });
      notes+=pairsHtml(L,"mb");
    }
    return `<div class="gw">${boardRow(G,gi,true)}${notes?`<div class="notes">${notes}</div>`:""}</div>`;
  }).join("");
}

/* 49 versions of the games: total (rows) and home margin (columns) each nudged -3..+3 */
function stressGrid(dec){
  const rows=[]; let same=0; const seen=new Set(), mid=grade(slipProb(S.legs).joint*dec-1).word;
  for(let dt=-3;dt<=3;dt++){ const r=[]; for(let dm=-3;dm<=3;dm++){
    const j=slipProb(S.legs,dt,dm).joint, w=grade(j*dec-1).word; seen.add(w); if(w===mid) same++; r.push({j,w,dt,dm}); } rows.push(r); }
  const order=ORDER.filter(w=>seen.has(w)), word=same===49?"Solid":same>=35?"Mostly holds":"Shaky";
  return {rows,same,mid,order,word};
}
function stressHtml(dec){
  const s=stressGrid(dec), sg=v=>v>0?"+"+v:String(v);
  const sum=s.same===49?`${s.mid} in all 49 versions`:`${s.mid} in ${s.same} of 49 versions, from ${s.order[0]} to ${s.order[s.order.length-1]}`;
  let g=`<span></span>`+[-3,-2,-1,0,1,2,3].map(v=>`<span class="ax">${sg(v)}</span>`).join("");
  s.rows.forEach((r,i)=>{ g+=`<span class="ax ay">${sg(i-3)}</span>`+r.map(c=>`<span class="c${c.dt===0&&c.dm===0?" mid":""}" style="background:var(${VCOLOR[c.w]})" title="Total ${sg(c.dt)}, home margin ${sg(c.dm)}: ${pct(c.j)}, ${c.w}"></span>`).join(""); });
  return {word:s.word,html:`<div class="axT">Home margin &#8594;</div><div class="axW"><span class="axL">Total &#8595;</span><div class="sgrid" role="img" aria-label="${esc(sum)}">${g}</div></div>`
    +`<div class="legend">${ORDER.map(w=>`<span><i style="background:var(${VCOLOR[w]})"></i>${w}</span>`).join("")}</div>`};
}

function renderCard(){
  const n=S.legs.length, pay=payoutFor(), box=document.getElementById("mbBet"), v=document.getElementById("verdict");
  const paysIn=document.getElementById("pays");
  if(document.activeElement!==paysIn) paysIn.value=S.pays!=null?S.pays:"";
  document.querySelectorAll("#whoChips [data-who]").forEach(b=>b.setAttribute("aria-pressed",S.who===b.dataset.who));
  setT("mbCount",n?`· ${n}`:"");
  const edit=document.getElementById("mbEdit"); edit.textContent=MB_EDIT?"Done":"N/A"; edit.setAttribute("aria-expanded",MB_EDIT); edit.classList.toggle("hidden",!n);
  const legsEl=document.getElementById("legs");
  legsEl.innerHTML=n?mbRowsHtml():`<p class="empty">No picks yet. Tap any pick on NCAA Slips or NFL Slips, or use a hot slip.</p>`;
  legsEl.querySelectorAll(".bc").forEach(b=>{ b.onclick=()=>toggleLeg(+b.dataset.gi,b.dataset.type); });
  legsEl.querySelectorAll("[data-lad]").forEach(b=>{ b.onclick=()=>openLadder(+b.dataset.lad); b.classList.toggle("on",!!LADDER&&LADDER.gi===+b.dataset.lad); });
  legsEl.querySelectorAll("[data-mna]").forEach(b=>{ b.onclick=()=>{ const l=S.legs[+b.dataset.mna]; naMark(l.gi,l.type); }; });
  legsEl.querySelectorAll("[data-ph]").forEach(b=>{ b.onclick=()=>{ const L=S.legs.filter(l=>l.gi===+b.dataset.gi); prohibAdd(GAMES[+b.dataset.gi],L[+b.dataset.x],L[+b.dataset.y]); render(); }; });

  const {live,done}=splitLegs(S.legs), lost=done.filter(d=>d.r==="lost").length, joint=slipProb(live).joint;
  const nums=(a,b,c,d)=>{ setT("nPay",a); setT("nFair",b); setT("nBack",c); setT("nEv",d); };
  let vc="--muted", need=null, has=n?joint:null, stress="";
  v.textContent=""; setT("why",""); setT("evSub","");
  setT("needV","—"); setT("needS",n?"type your app's payout":"");
  if(!n){ setT("hasV","—"); setT("hasS","Add picks from NCAA Slips or NFL Slips"); nums("—","—","—","—"); }
  else if(done.length){
    const won=done.length-lost; nums(pay?money(pay.dec):"—","—","—","—"); setT("needS","");
    if(lost){ has=0; setT("hasV","0%"); setT("hasS",`${lost} pick${lost>1?"s":""} lost`); v.textContent="Lost"; vc="--terr"; setT("why",`${won} of ${done.length} settled pick${done.length>1?"s":""} won, but a parlay needs every one.`); }
    else if(live.length){ setT("hasV",pct(joint)); setT("hasS",`${won} in · chance the other ${live.length} land`); v.textContent="Still alive"; vc="--text"; setT("why","Everything settled so far has won. That number is the rest of the slip, not the whole thing."); }
    else { has=1; setT("hasV","Hit"); setT("hasS","every pick landed"); v.textContent="Won"; vc="--great"; setT("why",pay?`$1 on this paid ${money(pay.dec)}.`:""); }
  } else {
    setT("hasV",pct1(joint)); setT("hasS",n===1?"chance this pick hits":n===2?"chance both picks hit":`chance all ${n} picks hit`);
    if(!pay){ nums("—",joint>0?money(1/joint):"—","—","—"); setT("why","Type what your app pays on $1. Clover never guesses a payout, so there is no verdict until you do."); stress=`<p class="hint">Type the payout to see how solid it is.</p>`; }
    else {
      const dec=pay.dec, ev=joint*dec-1, g=grade(ev), c=`${ev>=0?"+":"−"}${Math.round(Math.abs(ev)*100)}¢`;
      need=1/dec; vc=VCOLOR[g.word];
      setT("needV",pct1(need)); setT("needS",`to break even at ${money(dec)}`);
      v.textContent=g.word; setT("evSub",`${c} per $1`);
      setT("why",`${g.why} Bet $1: it pays ${money(dec)} if it hits, and on average you get back ${money(joint*dec)}.`);
      nums(money(dec),joint>0?money(1/joint):"—",money(joint*dec),c);
      const s=stressHtml(dec); stress=s.html; setT("sWord",s.word);
      document.getElementById("sWord").style.color=`var(${s.word==="Solid"?"--great":s.word==="Shaky"?"--coin":"--text"})`;
    }
  }
  box.setAttribute("style",`--vc:var(${vc})`);
  /* the bar: has vs needs on one scale */
  const top=Math.max(has||0,need||0), max=[.1,.2,.3,.5,.75,1].find(m=>m>=top*1.25)||1, w=x=>Math.min(100,x/max*100)+"%";
  document.getElementById("meter").classList.toggle("hidden",!n);
  document.getElementById("mHas").style.width=w(has||0);
  const mn=document.getElementById("mNeed"); mn.classList.toggle("hidden",need==null); if(need!=null) mn.style.left=w(need);
  setT("sc0","0%"); setT("sc1",Math.round(max*50)+"%"); setT("sc2",Math.round(max*100)+"%");
  /* how solid */
  document.getElementById("stressBox").classList.toggle("hidden",!n||done.length>0);
  document.getElementById("sGrid").innerHTML=stress;
  if(!stress.includes("sgrid")) setT("sWord","");
  /* the stamp: "I placed this" marks the slip; it never locks it */
  const P=S.placed, go=document.getElementById("place");
  go.disabled=!n||!pay||!live.length; go.classList.toggle("hidden",!!P&&!P.voided&&P.sig===slipSig(S.legs));   /* picks changed or voided: place the new slip */
  renderStamp();                                           /* record.js: stamp, Save bet, sign-in, void */
}
function placeSlip(){
  const pay=payoutFor(); if(!S.legs.length||!pay) return;
  const live=splitLegs(S.legs).live;
  /* id made here, so a retried save can never make a second copy (row 7); picks frozen as they were at the stamp */
  S.placed={id:newId(),who:S.who,pays:pay.dec,at:new Date().toISOString(),sig:slipSig(S.legs),p:slipProb(live).joint,picks:snapPicks(live)};
  REC.ui=""; render();
}
document.getElementById("place").onclick=placeSlip;
document.getElementById("mbEdit").onclick=()=>{ MB_EDIT=!MB_EDIT; renderCard(); };
document.getElementById("clearSlip").onclick=()=>{ S.legs=[]; S.pays=null; S.placed=null; REC.ui=""; MB_EDIT=false; render(); };
document.querySelectorAll("#whoChips [data-who]").forEach(b=>{ b.onclick=()=>{ S.who=b.dataset.who; render(); }; });
