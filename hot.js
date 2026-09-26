/* ===================================================================
   HOT SLIPS - the ticket (v3, Danny's pick of 2026-09-26). One strip per slip:
   the slip's chance in a lit box on the left with "Use this slip" under it,
   then one small table per pick, games left to right. Each table is a header
   (kickoff, pick type) and two rows - the favored team on top, the pick lit.
   Tapping a row opens that pick's menu: N/A (and Prohibited for a same-game
   pair). No N/A button on the ticket itself. The search is in preview3.js.
   =================================================================== */
const HOT_HEAD={Winner:"To Win",Spread:"Spread",Total:"Total"};
/* the two rows of a pick's table. Winner / Spread: home and away at the pick's own line, the
   market favorite first. Total: the home team carries Over and the away team Under (Danny's
   sketch), the better chance first. Every % is a table lookup, as everywhere. */
function hotRows(G,gi,l){
  const mk=legMarket(l.type), team=t=>({t,abbr:abbrOf(G,t)});
  let home,away;
  if(mk==="Total"){
    home={...team(G.home),leg:{type:"over",line:l.line},num:`O ${l.line}`};
    away={...team(G.away),leg:{type:"under",line:l.line},num:`U ${l.line}`};
  }else{
    const hT=mk==="Winner"?"homeML":"homeSp", aT=mk==="Winner"?"awayML":"awaySp";
    const hL=mk==="Winner"?0:(l.type===hT?l.line:-l.line), aL=mk==="Winner"?0:-hL;
    home={...team(G.home),leg:{type:hT,line:hL},num:mk==="Spread"?fmtSp(hL):""};
    away={...team(G.away),leg:{type:aT,line:aL},num:mk==="Spread"?fmtSp(aL):""};
  }
  [home,away].forEach(r=>{ r.p=prob(gi,[r.leg]); r.on=r.leg.type===l.type; });
  const homeFirst=mk==="Total"?home.p>=away.p:prob(gi,[{type:"homeML",line:0}])>=0.5;
  return homeFirst?[home,away]:[away,home];
}
function hotGameHtml(s,l,i,k){
  const G=GAMES[l.gi], d=kickDate(G), open=HOT_MENU&&HOT_MENU.i===i&&HOT_MENU.k===k;
  const when=`${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()} ${kickTime(G)}`;
  const rows=hotRows(G,l.gi,l).map(r=>`<button type="button" class="r${r.on?" on":""}" data-menu="${i}:${k}" aria-expanded="${open}" aria-label="${esc(legLabel(G,r.leg))} - ${pct(r.p)}. Open this pick's menu">`
    +`${tileHtml(r.t)}<span class="nm" title="${esc(r.t)}">${esc(r.abbr)}</span>${r.num?`<span class="ln">${esc(r.num)}</span>`:""}<span class="p">${pct(r.p)}</span></button>`).join("");
  const menu=open?`<div class="pop"><p class="hint">${esc(legLabel(G,l))}</p>`
    +`<button type="button" class="sec" data-na="${k}" aria-label="My app does not offer ${legMarket(l.type)} on ${esc(G.away)} at ${esc(G.home)}">N/A - not offered</button>`
    +pairsHtml(s.legs.filter(x=>x.gi===l.gi),"hot")
    +`<button type="button" class="ghost" data-close="1">Cancel</button></div>`:"";
  return `<div class="pk2"><div class="r h"><span>${esc(when)}</span><span>${HOT_HEAD[legMarket(l.type)]}</span></div>${rows}${menu}</div>`;
}
/* a pure function so the tests can read the HTML */
function hotTicketHtml(s,i){
  const {joint}=slipProb(s.legs), inBet=sameLegs(s.legs,S.legs);
  return `<div class="v3side"><div class="v3head"><span class="big">${pct(joint)}</span></div>`
    +(inBet?`<div class="inbet">&#10003; In My Bet</div>`:`<button type="button" class="sec" data-use="${i}">Use this slip</button>`)+`</div>`
    +`<div class="pks3 n${s.legs.length}">${s.legs.map((l,k)=>hotGameHtml(s,l,i,k)).join("")}</div>`;
}
function paintHot(d,s,i){
  d.classList.toggle("on",sameLegs(s.legs,S.legs));
  d.innerHTML=hotTicketHtml(s,i);
  d.querySelectorAll("[data-menu]").forEach(b=>b.onclick=()=>{ const [ti,tk]=b.dataset.menu.split(":").map(Number);
    HOT_MENU=HOT_MENU&&HOT_MENU.i===ti&&HOT_MENU.k===tk?null:{i:ti,k:tk}; paintHotAll(); });
  d.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{ HOT_MENU=null; paintHotAll(); });
  d.querySelectorAll("[data-use]").forEach(b=>b.onclick=()=>{ setLegs(s.legs); HOT_MENU=null; RAIL_EDIT=false; paintHotAll(); });
  d.querySelectorAll("[data-na]").forEach(b=>b.onclick=()=>{ const l=s.legs[+b.dataset.na]; naMark(l.gi,l.type); });
  d.querySelectorAll("[data-ph]").forEach(b=>b.onclick=()=>{ const L=s.legs.filter(l=>l.gi===+b.dataset.gi); prohibAdd(GAMES[+b.dataset.gi],L[+b.dataset.x],L[+b.dataset.y]); paintHotAll(); });
}
/* repaint every ticket without a new search: the slip changed, or a menu opened */
function paintHotAll(){ const out=document.getElementById("hotOut"); Array.from(out.children||[]).forEach((d,i)=>{ if(HOT[i]) paintHot(d,HOT[i],i); }); }
