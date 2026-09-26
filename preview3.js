/* ---- hot slips: built right here from the tables, so an N/A tap can
   reshuffle instantly. Same rules as before: up to 3 picks from one game,
   ranked by chance the whole slip hits, top slips must actually differ. ---- */
let hotN=3, HOT=[], HOT_MENU=null;   /* HOT_MENU: {i,k} = the ticket and pick whose N/A menu is open */
const HOT_TOP=6, BLOCKS={};
/* every same-game combination at market lines, priced once per page load (the
   lookups are the slow part). p=0 blocks are impossible pairs - never offered. */
function gameBlocks(gi){
  if(!BLOCKS[gi]){
    const G=GAMES[gi];
    const W=["homeML","awayML"].map(t=>({gi,type:t,line:0}));
    const P=["homeSp","awaySp"].map(t=>({gi,type:t,line:marketLine(G,t)}));
    const T=["over","under"].map(t=>({gi,type:t,line:G.total}));
    const combos=[...W,...P,...T].map(l=>[l]);
    W.forEach(w=>P.forEach(p=>combos.push([w,p])));
    W.forEach(w=>T.forEach(t=>combos.push([w,t])));
    P.forEach(p=>T.forEach(t=>combos.push([p,t])));
    W.forEach(w=>P.forEach(p=>T.forEach(t=>combos.push([w,p,t]))));
    BLOCKS[gi]=combos.map(legs=>({legs,p:prob(gi,legs)})).filter(b=>b.p>0);
  }
  return BLOCKS[gi].filter(b=>b.legs.every(l=>offered(gi,l.type)));
}
/* The single most likely N-pick slip that shares at most `cap` picks with each slip
   already chosen. Exact, not a beam: games are independent, so the best slip is a
   knapsack over games. State = picks used + picks shared with each earlier slip. */
function bestSlip(games,N,taken,cap){
  const K=N+1, base=cap+1, m=taken.length, size=K*Math.pow(base,m);
  const best=new Array(size); best[0]={p:1,b:null,prev:null};
  games.forEach(blocks=>{
    const use=blocks.map(b=>{ const sh=taken.map(o=>b.legs.filter(l=>o.keys.has(l.gi+":"+l.type)).length);
      let d=0; sh.forEach((c,i)=>{ d+=c*Math.pow(base,i); }); return {b,sh,d:d*K,hit:d>0}; });
    for(let idx=size-1;idx>=0;idx--){                    /* downward, so one game is never used twice */
      const s=best[idx]; if(!s) continue;
      const k=idx%K; let rest=(idx-k)/K; const have=[];
      for(let i=0;i<m;i++){ have.push(rest%base); rest=(rest-have[i])/base; }
      use.forEach(u=>{
        if(k+u.b.legs.length>N) return;
        if(u.hit&&u.sh.some((c,i)=>have[i]+c>cap)) return;
        const to=idx+u.b.legs.length+u.d, p=s.p*u.b.p;
        if(!best[to]||p>best[to].p) best[to]={p,b:u.b,prev:s};
      });
    }
  });
  let top=null;
  for(let idx=N;idx<size;idx+=K) if(best[idx]&&(!top||best[idx].p>top.p)) top=best[idx];
  if(!top) return null;
  const legs=[]; for(let x=top;x&&x.b;x=x.prev) legs.unshift(...x.b.legs);
  return {p:top.p,keys:new Set(legs.map(l=>l.gi+":"+l.type)),legs:legs.map(l=>({...l}))};
}
/* one league at a time: the search is a knapsack over that league's games */
function buildSlips(N,lg){
  const games=hotGames(lg).map(x=>gameBlocks(x.gi)).filter(b=>b.length);
  const cap=N-Math.max(2,Math.ceil(N/2)), out=[];       // no two slips share more than half their picks
  while(out.length<HOT_TOP){ const s=bestSlip(games,N,out,cap); if(!s) break; s.league=lg; out.push(s); }
  return out;
}
/* Hot Slips page (2026-09-26): both leagues, college first then the NFL, each its own top six.
   HOT_LG is the page's League chip: "all" | "ncaaf" | "nfl". The drawing lives in hot.js. */
let HOT_LG="all";
function renderHot(){
  const out=document.getElementById("hotOut"), st=document.getElementById("hotStatus");
  out.innerHTML=""; HOT=[]; HOT_MENU=null;
  const lgs=LEAGUES.filter(lg=>HOT_LG==="all"||lg===HOT_LG), lined=lgs.filter(lg=>hotGames(lg).length);
  if(!lined.length){ st.textContent=`No ${HOT_LG==="all"?"":LEAGUE_NAME[HOT_LG]+" "}games with lines yet - lines load closer to game day.`; return; }
  /* built right here, not on a timer: a background tab throttles timers and the list would sit on "Searching" */
  lined.forEach(lg=>{ HOT.push(...buildSlips(hotN,lg)); });
  if(!HOT.length){ st.textContent="No slip can be built with the pick types turned on. Turn one back on, or clear N/A."; return; }
  const from=lined.map(lg=>`${hotGames(lg).length} ${LEAGUE_NAME[lg]}`).join(" and ");
  st.textContent=`The ${hotN}-pick slips most likely to hit, from ${from} games. Tap any pick to mark it N/A.`;
  HOT.forEach((s,i)=>{ const d=document.createElement("div"); d.className="hs"; out.appendChild(d); paintHot(d,s,i); });
}
const sameLegs=(a,b)=>a.length===b.length&&a.every(x=>b.some(y=>y.gi===x.gi&&y.type===x.type&&y.line===x.line));
const tileHtml=team=>{ const c=teamColor(team), u=LOGOS[team];
  return `<span class="lg">${u?`<img src="${esc(u)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><i style="background:${c};display:none">${esc(initials(team))}</i>`:`<i style="background:${c}">${esc(initials(team))}</i>`}</span>`; };
const legTile=(G,type)=>{ const t=legTeam(G,type); return t?tileHtml(t):`<span class="lg ou">O/U</span>`; };
/* same-game pairs inside a slip - Prohibited lives here (rail, My Bet) and in the hot ticket's pick menu (hot.js) */
function pairsHtml(legs,who){
  const by={}; legs.forEach(l=>{ (by[l.gi]=by[l.gi]||[]).push(l); });
  const logged=new Set(prohibLog().map(r=>r.key)), rows=[];
  for(const gi in by){ const L=by[gi], G=GAMES[gi];
    for(let x=0;x<L.length;x++)for(let y=x+1;y<L.length;y++){
      const key=prohibKey(G,L[x],L[y]), done=logged.has(key), lbl=L.length>2?` (${legMarket(L[x].type)} + ${legMarket(L[y].type)})`:"";
      rows.push(`<div class="pair"><span>Same-game pair${esc(lbl)}</span>${done?`<span class="logged">Logged as prohibited</span>`
        :`<button type="button" class="sec sm" data-ph="${who}" data-gi="${gi}" data-x="${x}" data-y="${y}">Prohibited</button>`}</div>`); } }
  return rows.join("");
}

/* ---- N/A: pick types the app doesn't offer, one game at a time. Keyed by game id so
   they expire with the game. One tap hides BOTH sides of that pick type for that game and
   the hot slips reshuffle (ruling 4 of 2026-09-20 stands). ---- */
function naLoad(){ try{return new Set(JSON.parse(localStorage.getItem("cloverNA")||"[]"));}catch(e){return new Set();} }
let NA=new Set();
function naKey(gi,type){ return `${GAMES[gi].id}|${type}`; }
function naHas(gi,type){ return NA.has(naKey(gi,type)); }
function naSave(){ try{ localStorage.setItem("cloverNA",JSON.stringify([...NA].filter(k=>BY_ID[k.split("|")[0]]!=null))); }catch(e){} naButtons(); }
const NA_PAIRS=[["homeML","awayML"],["homeSp","awaySp"],["over","under"]];
function naMark(gi,type){
  NA_PAIRS.find(m=>m.includes(type)).forEach(t=>NA.add(naKey(gi,t)));
  S.legs=S.legs.filter(l=>!(l.gi===gi&&legMarket(l.type)===legMarket(type)));      /* the pick leaves the slip too */
  naSave(); renderHot(); render();
}
function naCount(){ return [...NA].filter(k=>BY_ID[k.split("|")[0]]!=null).length/2; }
function naButtons(){
  const n=naCount(); document.getElementById("naWrap").classList.toggle("hidden",!n);
  document.getElementById("naTxt").textContent=`Skipping ${n} pick type${n===1?"":"s"} you marked N/A.`;
}
document.getElementById("naClear").onclick=()=>{ NA=new Set(); naSave(); renderHot(); render(); };
/* which pick types the app offers at all - a fast global lever */
let MARKETS={Winner:true,Spread:true,Total:true};
function marketsLoad(){ try{ Object.assign(MARKETS,JSON.parse(localStorage.getItem("cloverMarkets")||"{}")); }catch(e){} }
function marketsSave(){ try{ localStorage.setItem("cloverMarkets",JSON.stringify(MARKETS)); }catch(e){} }
function offered(gi,type){ return MARKETS[legMarket(type)] && !naHas(gi,type); }

/* ---- prohibited log (notebook only — does not change the picks) ---- */
function prohibLog(){ try{return JSON.parse(localStorage.getItem("udProhibited")||"[]");}catch(e){return [];} }
function prohibKey(G,a,b){ return `${G.away} @ ${G.home}|${legLabel(G,a)}|${legLabel(G,b)}`; }
function prohibPattern(a,b){
  const m=[legMarket(a.type),legMarket(b.type)].sort().join(" + ");
  if(legMarket(a.type)!=="Total"&&legMarket(b.type)!=="Total") return m+(legSide(a.type)===legSide(b.type)?", same team":", opposite teams");
  return m;
}
function prohibAdd(G,a,b){
  const L=prohibLog(), key=prohibKey(G,a,b);
  if(L.some(r=>r.key===key)) return;
  L.push({key,date:new Date().toISOString().slice(0,10),league:LEAGUE_NAME[lgOf(G)],game:`${G.away} @ ${G.home}`,a:legLabel(G,a),b:legLabel(G,b),pattern:prohibPattern(a,b)});
  try{localStorage.setItem("udProhibited",JSON.stringify(L.slice(-500)));}catch(e){}
  prohibButtons();
}
function prohibButtons(){
  const n=prohibLog().length;
  document.getElementById("prohibCopy").textContent=`Copy Prohibited log (${n})`;
  document.getElementById("prohibCopy").classList.toggle("hidden",!n); document.getElementById("prohibClear").classList.toggle("hidden",!n);
}
document.getElementById("prohibCopy").onclick=()=>{
  const L=prohibLog();
  const tsv=["date\tleague\tgame\tpick A\tpick B\tpattern"].concat(L.map(r=>[r.date,r.league||"College",r.game,r.a,r.b,r.pattern].join("\t"))).join("\n");
  navigator.clipboard.writeText(tsv).then(()=>{const b=document.getElementById("prohibCopy");b.textContent="Copied";setTimeout(prohibButtons,1800);});
};
document.getElementById("prohibClear").onclick=()=>{
  const b=document.getElementById("prohibClear");
  if(b.dataset.armed){ try{localStorage.removeItem("udProhibited");}catch(e){} delete b.dataset.armed; b.textContent="Clear log"; prohibButtons(); renderHot(); return; }
  b.dataset.armed="1"; b.textContent="Sure? Tap again"; setTimeout(()=>{delete b.dataset.armed;b.textContent="Clear log";},2500);
};

/* ---- wiring ---- */
document.getElementById("tabHot").onclick=()=>show("hot");
document.getElementById("tabNcaaf").onclick=()=>setLeague("ncaaf");
document.getElementById("tabNfl").onclick=()=>setLeague("nfl");
document.getElementById("tabCard").onclick=()=>show("card");
document.getElementById("tabHistory").onclick=()=>show("history");
/* arrow keys on the tabs (row 6): Left/Right move and open, Home/End jump to the ends */
document.querySelector(".tabs").addEventListener("keydown",e=>{
  const t=[...document.querySelectorAll(".tabs [role=tab]")], i=t.indexOf(document.activeElement), n=t.length;
  const k={ArrowRight:(i+1)%n,ArrowLeft:(i-1+n)%n,Home:0,End:n-1}[e.key];
  if(i<0||k===undefined) return; e.preventDefault(); t[k].click(); t[k].focus();
});
document.getElementById("otherBack").onclick=()=>show("hot");
document.getElementById("fClear").onclick=()=>{ FILTERS[league]=defaultFilters(); reFilter(); };
document.getElementById("backToSlips").onclick=()=>show("slips");
document.querySelectorAll("#stake,#payout").forEach(i=>i.addEventListener("input",()=>{ setMoney(i.dataset.money,i.value.trim()); render(); }));
document.querySelectorAll("#lgChips .chip").forEach(b=>b.onclick=()=>{
  HOT_LG=b.dataset.lg; document.querySelectorAll("#lgChips .chip").forEach(x=>x.setAttribute("aria-pressed",x===b)); renderHot(); });
(function chips(){
  const c=document.getElementById("chips");
  for(let n=2;n<=6;n++){ const b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=n; b.setAttribute("aria-pressed",n===hotN);
    b.onclick=()=>{hotN=n;c.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",+x.textContent===n));renderHot();}; c.appendChild(b); }
})();
function marketChips(){
  const c=document.getElementById("markets"); c.innerHTML="";
  ["Winner","Spread","Total"].forEach(m=>{ const b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=m; b.setAttribute("aria-pressed",!!MARKETS[m]);
    b.onclick=()=>{ MARKETS[m]=!MARKETS[m]; marketsSave(); marketChips(); renderHot(); render(); }; c.appendChild(b); });
}

function init(){
  R=window.RATINGS||null;
  GAMES=(R&&R.upcoming)||[]; LOGOS=(R&&R.logos)||{}; COLORS=(R&&R.colors)||{}; COLORS2=(R&&R.colors2)||{};
  GAMES.forEach((G,i)=>{
    BY_ID[G.id]=i;
    if(new Date(G.start).getTime()>=Date.now()) return;
    delete G.sim;                       // kicked off = not priceable, whatever the file says
    if(!G.status) delete G.p;           // a lines file from before status shipped: drop it as before
    else if(G.status==="upcoming") G.status="live";   // kicked off since the last refresh
  });
  const tag=document.getElementById("ratingsTag");
  const count=lg=>GAMES.filter(G=>G.sim&&lgOf(G)===lg).length, nC=count("ncaaf"), nN=count("nfl");
  document.getElementById("nNcaaf").textContent=nC?`${nC}`:""; document.getElementById("nNfl").textContent=nN?`${nN}`:"";
  if(!R){ tag.textContent="Couldn't load the lines file — reload the page"; tag.classList.add("stale"); }
  else {
    const gen=new Date(R.generated), lg=R.lines_generated?new Date(R.lines_generated):gen, mins=Math.round((Date.now()-lg)/60000);
    const ago=mins<60?`${mins} min ago`:mins<2880?`${Math.round(mins/60)} hr ago`:`${Math.round(mins/1440)} days ago`;
    const lined=nC+nN;
    const alt=R.alt_generated?new Date(R.alt_generated):null;
    const newest=(alt&&alt>lg)?alt:lg;
    tag.textContent=`Lines updated ${newest.toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})} (${ago})`;
    if(mins>360||!lined) tag.classList.add("stale");
    if(!lined) tag.textContent+=" — no games with lines right now";
    /* a feed was down on the last refresh: that league is showing older lines (refresh.py sets R.stale) */
    const down=Object.keys(R.stale||{});
    if(down.length){
      const when=t=>t?new Date(t).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"}):"unknown";
      const who=down.length>1?"All":(down[0]==="nfl"?"NFL":"College");
      tag.textContent+=` · API ISSUE — ${who} lines last updated ${when(R.stale[down[0]].since)}`;
      tag.title=down.map(k=>`${k==="nfl"?"NFL":"College"}: ${R.stale[k].reason}`).join(" | ");
      tag.classList.add("stale");
    }
  }
  loadLeague();
  if(!count(league)&&count(league==="ncaaf"?"nfl":"ncaaf")) league=league==="ncaaf"?"nfl":"ncaaf";   // open on whichever league has games
  loadFilters(); populateFilterOptions();
  NA=naLoad(); marketsLoad(); marketChips(); naButtons(); loadSlip(); prohibButtons(); setFiltersOpen(false); renderHot(); render(); show("hot");
}
/* ratings.js with a cache-buster, without document.write; works from file:// too */
(function(){ const s=document.createElement("script"); s.src="ratings.js?v="+Date.now(); s.onload=init; s.onerror=init; document.head.appendChild(s); })();
