/* ===================================================================
   FILTERS — Date, Game time (both leagues); Conference/FBS/FCS/Top25
   (college); Conference/Division (NFL). Build your own obeys all of them.
   Hot Slips ignore Date and Game status (see hotGames) and obey the rest.
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
/* what "Today" means: today if it has games in the chosen Game status, else the nearest
   day that does - forward for games still to come, backward for finished ones. It has to
   follow Game status, or Sunday night's default (today + upcoming only) shows nothing. */
function defaultDayKey(lg){
  const st=(FILTERS[lg]||{}).status||"upcoming";
  const days=[...new Set(GAMES.filter(G=>onBoard(G)&&lgOf(G)===lg&&(st==="all"||statusOf(G)===st)).map(gameDateKey))].sort();
  if(!days.length) return null;
  const today=dateKey(new Date());
  if(days.includes(today)) return today;
  const later=days.filter(k=>k>today), earlier=days.filter(k=>k<today);
  if(st==="final"||st==="live") return earlier.length?earlier[earlier.length-1]:later[0];
  return later.length?later[0]:earlier[earlier.length-1];
}
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
/* no games showing: name the filter that is hiding them, so an empty list is never a mystery.
   Date is tried last - someone who picked a day meant that day. */
function filterBlame(lg){
  const f=FILTERS[lg], off={status:"all",time:"all",conf:"all",div:"all",fbs:false,fcs:false,top25:false,date:"all"};
  const names={status:"Game status",time:"Game time",conf:"Conference",div:"Division",fbs:"FBS",fcs:"FCS",top25:"Top 25",date:"Date"};
  for(const k in off){
    if(f[k]===off[k]) continue;
    const was=f[k]; f[k]=off[k]; const n=filteredGames(lg).length; f[k]=was;
    if(n) return `Opening up ${names[k]} would show ${n} game${n===1?"":"s"}.`;
  }
  return "No single filter is hiding them — Clear All Filters starts over.";
}
function filteredGames(lg){ return GAMES.map((G,gi)=>({G,gi})).filter(x=>onBoard(x.G)&&lgOf(x.G)===lg&&filterGame(x.G)); }
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
  const lg=league, games=GAMES.filter(G=>onBoard(G)&&lgOf(G)===lg), f=FILTERS[lg];
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
  document.getElementById("nNcaaf").textContent=GAMES.filter(G=>G.sim&&lgOf(G)==="ncaaf").length||"";   /* tabs count what you can still bet */
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
