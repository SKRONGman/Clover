/* ===================================================================
   DATA — ratings.js is written by refresh.py. Every game with a line
   carries a table of how often it ends with total T and margin M.
   The page never simulates; it looks things up.
   =================================================================== */
let R=null, GAMES=[], BY_ID={}, LOGOS={}, COLORS={};
const GRIDS={};                               // gi -> decoded table
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* leagues: every game carries league = "ncaaf" | "nfl" (college if missing) */
const LEAGUES=["ncaaf","nfl"], LEAGUE_NAME={ncaaf:"College",nfl:"NFL"};
let league="ncaaf";
const lgOf=G=>G.league||"ncaaf";
/* NFL names are long ("Kansas City Chiefs"); where space is tight use "Chiefs" */
const shortName=(G,t)=>lgOf(G)==="nfl"?((t===G.home?G.home_short:G.away_short)||t):t;
function loadLeague(){ try{ const v=localStorage.getItem("cloverLeague"); if(LEAGUES.includes(v)) league=v; }catch(e){} }
function setLeague(v){
  view="slips";
  league=v; try{localStorage.setItem("cloverLeague",v);}catch(e){}
  document.getElementById("tabNcaaf").setAttribute("aria-selected",v==="ncaaf");
  document.getElementById("tabNfl").setAttribute("aria-selected",v==="nfl");
  document.getElementById("tabCard").setAttribute("aria-selected","false");
  document.getElementById("viewSlips").classList.remove("hidden");
  document.getElementById("viewCard").classList.add("hidden");
  populateFilterOptions();
  renderGames(); renderHot();
}

/* ===================================================================
   FILTERS — Date, Game time (both leagues); Conference/FBS/FCS/Top25
   (college); Conference/Division (NFL). Applied to both Build your own
   and Hot Slips, so a filtered-out game can't be searched into a slip.
   =================================================================== */
const TIME_BUCKETS={morning:h=>h<12, afternoon:h=>h>=12&&h<16, evening:h=>h>=16&&h<20, primetime:h=>h>=20};
function defaultFilters(){ return {date:"today", time:"all", status:"upcoming", conf:"all", div:"all", fbs:false, fcs:false, top25:false}; }
let FILTERS={ncaaf:defaultFilters(), nfl:defaultFilters()};
function loadFilters(){
  try{
    const s=JSON.parse(localStorage.getItem("cloverFilters")||"null");
    if(s&&s.ncaaf) FILTERS.ncaaf=Object.assign(defaultFilters(),s.ncaaf);
    if(s&&s.nfl) FILTERS.nfl=Object.assign(defaultFilters(),s.nfl);
  }catch(e){}
}
function saveFilters(){ try{localStorage.setItem("cloverFilters",JSON.stringify(FILTERS));}catch(e){} }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function gameDateKey(G){ return dateKey(new Date(G.start)); }
/* the Thu-Mon window we're either in, or heading into next (Tue/Wed = between weekends) */
function weekendWindow(){
  const now=new Date(), day=now.getDay(), sinceThu=(day-4+7)%7;      // Thu=0..Wed=6
  const thu=new Date(now);
  thu.setDate(now.getDate()+(sinceThu<=4 ? -sinceThu : 7-sinceThu));
  thu.setHours(0,0,0,0);
  const mon=new Date(thu); mon.setDate(thu.getDate()+4); mon.setHours(23,59,59,999);
  return {thu,mon};
}
/* the day we show by default: today if it still has games, else the next day that does */
function defaultDayKey(lg){
  const games=GAMES.filter(G=>G.sim&&lgOf(G)===lg);
  if(!games.length) return null;
  const today=dateKey(new Date());
  if(games.some(G=>gameDateKey(G)===today)) return today;
  const later=games.map(gameDateKey).filter(k=>k>=today).sort();
  return later.length?later[0]:null;
}
function statusOf(G){ return G.status||"upcoming"; }   /* refresh.py will start shipping live/final */
function gameInWeekend(G,win){ const t=new Date(G.start).getTime(); return t>=win.thu.getTime()&&t<=win.mon.getTime(); }
function filterGame(G){
  const lg=lgOf(G), f=FILTERS[lg]; if(!f) return true;
  const d=new Date(G.start);
  if(f.date==="today"){ const k=defaultDayKey(lg); if(k&&gameDateKey(G)!==k) return false; }
  else if(f.date==="weekend"){ if(!gameInWeekend(G,weekendWindow())) return false; }
  else if(f.date!=="all"){ if(gameDateKey(G)!==f.date) return false; }
  if(f.status!=="all" && statusOf(G)!==f.status) return false;
  if(f.time!=="all"){ const test=TIME_BUCKETS[f.time]; if(test&&!test(d.getHours())) return false; }
  if(f.conf!=="all" && G.home_conf!==f.conf && G.away_conf!==f.conf) return false;
  if(lg==="ncaaf"){
    if(f.fbs||f.fcs){ const isFcs=!!G.fcs; if(f.fbs&&!f.fcs&&isFcs) return false; if(f.fcs&&!f.fbs&&!isFcs) return false; }
    if(f.top25 && !G.home_rank && !G.away_rank) return false;
  } else {
    if(f.div!=="all"){ const tail=d2=>String(d2||"").split(" ").pop(); if(tail(G.home_div)!==f.div && tail(G.away_div)!==f.div) return false; }
  }
  return true;
}
function filteredGames(lg){ return GAMES.map((G,gi)=>({G,gi})).filter(x=>x.G.sim&&lgOf(x.G)===lg&&filterGame(x.G)); }
/* Hot slips honour Game time / Conference / Division / Classification, but NEVER Date or
   Game status - they always search all upcoming games, so a thin day can't starve the search. */
function hotGames(lg){
  const f=FILTERS[lg], saved={date:f.date,status:f.status};
  f.date="all"; f.status="upcoming";
  const out=GAMES.map((G,gi)=>({G,gi})).filter(x=>x.G.sim&&lgOf(x.G)===lg&&filterGame(x.G));
  f.date=saved.date; f.status=saved.status;
  return out;
}
function populateFilterOptions(){
  const lg=league, games=GAMES.filter(G=>G.sim&&lgOf(G)===lg), f=FILTERS[lg];
  const lbl=d=>`${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
  const keyLbl=k=>{ const [y,m,dd]=k.split("-").map(Number); return lbl(new Date(y,m-1,dd)); };

  /* Date: "today, else the next day with games" is the default */
  const dSel=document.getElementById("fDate"), win=weekendWindow();
  const dates=[...new Set(games.map(gameDateKey))].sort();
  const dk=defaultDayKey(lg), isToday=dk===dateKey(new Date());
  const dLbl=dk?(isToday?`Today (${keyLbl(dk)})`:keyLbl(dk)):"Today";
  dSel.innerHTML=`<option value="today">${esc(dLbl)}</option>`
    +`<option value="weekend">This weekend (${lbl(win.thu)}–${lbl(win.mon)})</option>`
    +`<option value="all">Any date</option>`
    +dates.map(k=>`<option value="${k}">${esc(keyLbl(k))}</option>`).join("");
  dSel.value=[...dSel.options].some(o=>o.value===f.date)?f.date:"today";
  document.getElementById("fTime").value=f.time;
  document.getElementById("fStatus").value=f.status||"upcoming";

  /* Conference: a dropdown for college (too many to be buttons), AFC/NFC buttons for the NFL */
  const ncaaf=lg==="ncaaf";
  document.getElementById("fConfSel").classList.toggle("hidden",!ncaaf);
  document.getElementById("fConfChips").classList.toggle("hidden",ncaaf);
  document.getElementById("fRowNcaafExtra").classList.toggle("hidden",!ncaaf);
  document.getElementById("fDivWrap").classList.toggle("hidden",ncaaf);
  if(ncaaf){
    const cSel=document.getElementById("fConf");
    const confs=[...new Set(games.flatMap(G=>[G.home_conf,G.away_conf]).filter(Boolean))].sort();
    cSel.innerHTML=`<option value="all">All conferences</option>`+confs.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    cSel.value=[...cSel.options].some(o=>o.value===f.conf)?f.conf:"all";
    document.getElementById("fFbs").setAttribute("aria-pressed",!!f.fbs);
    document.getElementById("fFcs").setAttribute("aria-pressed",!!f.fcs);
    document.getElementById("fTop25").setAttribute("aria-pressed",!!f.top25);
  }else{
    document.getElementById("fAfc").setAttribute("aria-pressed",f.conf==="AFC");
    document.getElementById("fNfc").setAttribute("aria-pressed",f.conf==="NFC");
    /* Division buttons are North/South/East/West; they combine with the conference picked above */
    const wrap=document.getElementById("fDivChips");
    if(!wrap.dataset.built){
      wrap.innerHTML=["North","South","East","West"].map(d=>`<button type="button" class="chip" data-div="${d}" aria-pressed="false">${d}</button>`).join("");
      wrap.querySelectorAll("[data-div]").forEach(btn=>btn.onclick=()=>{
        const cur=FILTERS.nfl.div;
        FILTERS.nfl.div = cur===btn.dataset.div ? "all" : btn.dataset.div;
        saveFilters(); populateFilterOptions(); renderGames(); renderHot();
      });
      wrap.dataset.built="1";
    }
    wrap.querySelectorAll("[data-div]").forEach(btn=>btn.setAttribute("aria-pressed",f.div===btn.dataset.div));
  }
  document.getElementById("nNcaaf").textContent=GAMES.filter(G=>G.sim&&lgOf(G)==="ncaaf").length||"";
  document.getElementById("nNfl").textContent=GAMES.filter(G=>G.sim&&lgOf(G)==="nfl").length||"";
}
const reFilter=()=>{saveFilters();populateFilterOptions();renderGames();renderHot();};
document.getElementById("fDate").onchange=e=>{FILTERS[league].date=e.target.value;reFilter();};
document.getElementById("fTime").onchange=e=>{FILTERS[league].time=e.target.value;reFilter();};
document.getElementById("fStatus").onchange=e=>{FILTERS[league].status=e.target.value;reFilter();};
document.getElementById("fConf").onchange=e=>{FILTERS[league].conf=e.target.value;reFilter();};
document.getElementById("fAfc").onclick=()=>{FILTERS.nfl.conf=FILTERS.nfl.conf==="AFC"?"all":"AFC";reFilter();};
document.getElementById("fNfc").onclick=()=>{FILTERS.nfl.conf=FILTERS.nfl.conf==="NFC"?"all":"NFC";reFilter();};
document.getElementById("fFbs").onclick=()=>{FILTERS.ncaaf.fbs=!FILTERS.ncaaf.fbs;reFilter();};
document.getElementById("fFcs").onclick=()=>{FILTERS.ncaaf.fcs=!FILTERS.ncaaf.fcs;reFilter();};
document.getElementById("fTop25").onclick=()=>{FILTERS.ncaaf.top25=!FILTERS.ncaaf.top25;reFilter();};

function gridFor(gi){
  if(GRIDS[gi]) return GRIDS[gi];
  const s=GAMES[gi]&&GAMES[gi].sim; if(!s) return null;
  const raw=atob(s.c), vals=[]; let v=0, sh=0;
  for(let i=0;i<raw.length;i++){ const b=raw.charCodeAt(i); v|=(b&0x7f)<<sh; if(b&0x80) sh+=7; else { vals.push(v); v=0; sh=0; } }
  const k=vals.length>>1, T=new Int16Array(k), M=new Int16Array(k), C=new Int32Array(k);
  let idx=-1;
  for(let j=0;j<k;j++){ idx+=vals[2*j]+1; C[j]=vals[2*j+1]; T[j]=s.t0+Math.floor(idx/s.nm); M[j]=s.m0+idx%s.nm; }
  return GRIDS[gi]={T,M,C,k,n:s.n};
}
/* positive = hits, 0 = push, negative = loses. Line is always the side's OWN number. */
function legVal(type,line,t,m){
  switch(type){
    case "over":   return t-line;
    case "under":  return line-t;
    case "homeSp": return m+line;
    case "awaySp": return line-m;
    case "homeML": return m;
    default:       return -m;                 // awayML
  }
}
/* chance every leg (all from game gi) hits together, pushes thrown out.
   dt/dm shift the whole game by that many points (stress test). */
function prob(gi,legs,dt=0,dm=0){
  const g=gridFor(gi); if(!g) return null;
  let win=0, push=0;
  for(let j=0;j<g.k;j++){
    const t=g.T[j]+dt, m=g.M[j]+dm; let ok=true, pu=false;
    for(let x=0;x<legs.length;x++){ const v=legVal(legs[x].type,legs[x].line,t,m); if(v===0){pu=true;break;} if(v<0){ok=false;break;} }
    if(pu) push+=g.C[j]; else if(ok) win+=g.C[j];
  }
  const d=g.n-push; return d>0 ? win/d : 0;
}
/* the whole slip: legs grouped by game, same-game legs looked up together */
function slipProb(legs,dt=0,dm=0){
  const by={}; legs.forEach(l=>{(by[l.gi]=by[l.gi]||[]).push(l);});
  let joint=1; const groups=[];
  for(const gi in by){ const G=by[gi], p=prob(+gi,G,dt,dm); const indep=G.reduce((a,l)=>a*prob(+gi,[l],dt,dm),1); joint*=p; groups.push({gi:+gi,legs:G,p,indep}); }
  return {joint,groups};
}

/* ---------- odds math ---------- */
const amToP=a=>a<0?-a/(-a+100):100/(a+100);
const toDec=a=>a>0?1+a/100:1+100/Math.abs(a);
/* What DraftKings pays for this exact line, and their chance once the cut is removed. null if DK doesn't list it. */
function dkQuote(G,type,line){
  const A=G&&G.alt; if(!A||line==null) return null;
  const find=(arr,pt)=>{const r=(arr||[]).find(x=>Math.abs(x[0]-pt)<1e-9);return r?r[1]:null;};
  let mine=null, other=null;
  if(type==="over"){mine=find(A.totals.over,line);other=find(A.totals.under,line);}
  else if(type==="under"){mine=find(A.totals.under,line);other=find(A.totals.over,line);}
  else if(type==="homeSp"){mine=find(A.spreads.home,line);other=find(A.spreads.away,-line);}
  else if(type==="awaySp"){mine=find(A.spreads.away,line);other=find(A.spreads.home,-line);}
  if(mine===null) return null;
  const pa=amToP(mine), fair=other===null?null:pa/(pa+amToP(other));
  return {am:(mine>0?"+":"")+mine, dec:toDec(mine), fair};
}
/* Typical pick'em multipliers - a STAND-IN until you type the real payout. */
const PAYOUT={1:1.909,2:3,3:6,4:10,5:20,6:25};
function grade(ev){
  if(ev>=0.15) return {word:"Great",cls:"pos",why:"Pays well above what the odds deserve."};
  if(ev>=0.05) return {word:"Good",cls:"pos",why:"You're getting a little better than fair."};
  if(ev>=-0.05)return {word:"Coin toss",cls:"mid",why:"Roughly fair. Fun money, not smart money."};
  if(ev>=-0.20)return {word:"Bad",cls:"neg",why:"Doesn't pay enough for how often it hits."};
  return {word:"Terrible",cls:"neg",why:"Long shot that pays like a short one."};
}
const ORDER=["Great","Good","Coin toss","Bad","Terrible"];
const pct=p=>p==null?"—":p>0.995?">99%":p<0.005?"<1%":(p*100).toFixed(p<0.1?1:0)+"%";
const fmtSp=v=>(v>0?"+":"")+v;
const money=d=>"$"+d.toFixed(2);

/* ---------- labels ---------- */
function marketLine(G,type){ return type==="over"||type==="under"?G.total:type==="homeSp"?G.spread:type==="awaySp"?-G.spread:null; }
function hasLine(type){ return type!=="homeML"&&type!=="awayML"; }
function legLabel(G,l){
  switch(l.type){
    case "homeML": return `${G.home} to win`;
    case "awayML": return `${G.away} to win`;
    case "homeSp": return `${G.home} ${fmtSp(l.line)}`;
    case "awaySp": return `${G.away} ${fmtSp(l.line)}`;
    case "over":   return `Over ${l.line}`;
    default:       return `Under ${l.line}`;
  }
}
function legTeam(G,type){ return type==="homeML"||type==="homeSp"?G.home:type==="awayML"||type==="awaySp"?G.away:null; }
function legWho(G,l){ const t=legTeam(G,l.type); return t===null?`${shortName(G,G.away)} @ ${shortName(G,G.home)}`:t===G.home?`vs ${shortName(G,G.away)}`:`at ${shortName(G,G.home)}`; }
function legMarket(type){ return hasLine(type)?(type==="over"||type==="under"?"Total":"Spread"):"Winner"; }
function legSide(type){ return type==="homeML"||type==="homeSp"?"home":type==="awayML"||type==="awaySp"?"away":type; }
function whenShort(G){ const d=new Date(G.start); return `${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()} ${d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`; }
function initials(t){ return t.split(/\s+/).map(w=>w[0]).join("").replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase(); }
function logoTile(team,sm){
  const d=document.createElement("div"); d.className="logo"+(sm?" sm":"");
  const u=LOGOS[team];
  if(u){ const img=document.createElement("img"); img.src=u; img.alt=""; img.loading="lazy"; img.onerror=()=>{d.textContent=initials(team);}; d.appendChild(img); }
  else { d.textContent=initials(team); const c=COLORS[team]; if(c){d.style.background=c;d.style.color="#fff";d.style.borderColor=c;} }
  return d;
}
function duoTile(G){
  const a=LOGOS[G.away], h=LOGOS[G.home], d=document.createElement("div");
  if(a&&h){ d.className="logo duo"; [a,h].forEach(u=>{const i=document.createElement("img");i.src=u;i.alt="";i.loading="lazy";i.onerror=()=>{d.className="logo";d.textContent="O/U";};d.appendChild(i);}); }
  else { d.className="logo"; d.textContent="O/U"; }
  return d;
}

/* ===================================================================
   STATE — one slip, shared by every screen. Legs are keyed by game id
   (not index) so a refresh doesn't scramble them.
   =================================================================== */
const S={legs:[], pays:null, who:"Danny"};
function saveSlip(){ try{ localStorage.setItem("cloverSlip",JSON.stringify({legs:S.legs.map(l=>({id:GAMES[l.gi].id,type:l.type,line:l.line})),pays:S.pays,who:S.who})); }catch(e){} }
function loadSlip(){
  try{
    const s=JSON.parse(localStorage.getItem("cloverSlip")||"null"); if(!s) return;
    S.pays=s.pays??null; S.who=s.who||"Danny";
    S.legs=(s.legs||[]).map(l=>{ const gi=BY_ID[l.id]; return gi==null||!GAMES[gi].sim?null:{gi,type:l.type,line:l.line}; }).filter(Boolean);
  }catch(e){}
}
function findLeg(gi,type){ return S.legs.findIndex(l=>l.gi===gi&&l.type===type); }
function toggleLeg(gi,type){
  const i=findLeg(gi,type);
  if(i>=0) S.legs.splice(i,1);
  else { const G=GAMES[gi]; S.legs.push({gi,type,line:hasLine(type)?marketLine(G,type):0}); }
  render();
}
function setLegs(legs){ S.legs=legs.map(l=>({gi:l.gi,type:l.type,line:hasLine(l.type)?l.line:0})); render(); }
function payoutFor(n){ return S.pays!=null&&S.pays>1 ? {dec:S.pays,est:false} : PAYOUT[n] ? {dec:PAYOUT[n],est:true} : null; }

/* ===================================================================
   RENDER
   =================================================================== */
let view="slips";
function show(v){
  view=v;
  document.getElementById("viewSlips").classList.toggle("hidden",v!=="slips");
  document.getElementById("viewCard").classList.toggle("hidden",v!=="card");
  document.getElementById("tabNcaaf").setAttribute("aria-selected",v==="slips"&&league==="ncaaf");
  document.getElementById("tabNfl").setAttribute("aria-selected",v==="slips"&&league==="nfl");
  document.getElementById("tabCard").setAttribute("aria-selected",v==="card");
  document.getElementById("bar").classList.toggle("hidden",v!=="slips"||!S.legs.length);
  window.scrollTo({top:0});
}
function restoreHotOpen(){
  let open=true; try{ open=localStorage.getItem("cloverHotOpen")!=="0"; }catch(e){}
  const b=document.getElementById("hotToggle");
  b.setAttribute("aria-expanded",open); b.textContent=open?"Hide":"Show";
  document.getElementById("hotBody").classList.toggle("hidden",!open);
  document.getElementById("hotOut").classList.toggle("hidden",!open);
}
function render(){
  saveSlip();
  renderBar(); renderGames(); renderCard();
  document.getElementById("tabCount").textContent=S.legs.length;
}
function renderBar(){
  const bar=document.getElementById("bar"), n=S.legs.length;
  bar.classList.toggle("hidden",view!=="slips"||!n);
  if(!n) return;
  const {joint}=slipProb(S.legs), pay=payoutFor(n);
  const g=pay?grade(joint*pay.dec-1):null;
  document.getElementById("barProb").textContent=pct(joint);
  document.getElementById("barSub").textContent=`${n} pick${n>1?"s":""}${g?` · ${g.word}`:""}${pay&&pay.est?" (est. payout)":""}`;
}

/* ---- build your own: every lined game, grouped by day, six picks each ---- */
function renderGames(){
  const out=document.getElementById("games");
  const all=GAMES.filter(G=>G.sim&&lgOf(G)===league).length, lined=filteredGames(league);
  const cnt=document.getElementById("filterCount");
  cnt.textContent = !all ? "" : lined.length===all
    ? `${all} ${LEAGUE_NAME[league]} game${all===1?"":"s"} with a line`
    : `Showing ${lined.length} of ${all} ${LEAGUE_NAME[league]} games with a line`;
  const fkey=league+"|"+JSON.stringify(FILTERS[league]);
  if(out.dataset.built!==fkey){
    out.innerHTML="";
    if(!all){ out.innerHTML=`<p class="empty">No ${LEAGUE_NAME[league]} games with lines yet — they load closer to game day.</p>`; out.dataset.built=fkey; return; }
    if(!lined.length){ out.innerHTML=`<p class="empty">No ${LEAGUE_NAME[league]} games match these filters.</p>`; out.dataset.built=fkey; return; }
    const byDay={};
    lined.forEach(x=>{ const d=new Date(x.G.start), k=`${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`; (byDay[k]=byDay[k]||[]).push(x); });
    let first=true;
    for(const day in byDay){
      const det=document.createElement("details"); det.className="day"; det.open=first; first=false;
      det.innerHTML=`<summary>${esc(day)} <span class="small">${byDay[day].length} games</span></summary><div class="dayGrid"></div>`;
      const grid=det.querySelector(".dayGrid");
      byDay[day].forEach(({G,gi})=>{
        const g=document.createElement("div"); g.className="game";
        const head=document.createElement("div"); head.className="gHead";
        head.appendChild(logoTile(G.away,true)); head.appendChild(document.createTextNode(` ${shortName(G,G.away)} @ ${shortName(G,G.home)}`)); head.appendChild(logoTile(G.home,true));
        const when=document.createElement("span"); when.className="when"; when.textContent=new Date(G.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}); head.appendChild(when);
        g.appendChild(head);
        const picks=document.createElement("div"); picks.className="picks";
        [["awaySp",`${shortName(G,G.away)} ${fmtSp(-G.spread)}`],["homeSp",`${shortName(G,G.home)} ${fmtSp(G.spread)}`],["over",`Over ${G.total}`],["under",`Under ${G.total}`],["awayML",`${shortName(G,G.away)} wins`],["homeML",`${shortName(G,G.home)} wins`]]
          .forEach(([type,label])=>{
            const b=document.createElement("button"); b.type="button"; b.className="pick"; b.dataset.gi=gi; b.dataset.type=type;
            const p=prob(gi,[{type,line:hasLine(type)?marketLine(G,type):0}]);
            b.innerHTML=`<span>${esc(label)}</span><b>${pct(p)}</b>`;
            b.onclick=()=>toggleLeg(gi,type);
            picks.appendChild(b);
          });
        g.appendChild(picks); grid.appendChild(g);
      });
      out.appendChild(det);
    }
    out.dataset.built=fkey;
  }
  out.querySelectorAll(".pick").forEach(b=>{ b.setAttribute("aria-pressed",findLeg(+b.dataset.gi,b.dataset.type)>=0); b.classList.toggle("na",!offered(+b.dataset.gi,b.dataset.type)); b.title=offered(+b.dataset.gi,b.dataset.type)?"":"Marked as not on your app"; });
}

/* ---- one leg row (used by the Card and by hot slips) ---- */
