/* ===================================================================
   DATA — ratings.js is written by refresh.py. Every game with a line
   carries a table of how often it ends with total T and margin M.
   The page never simulates; it looks things up.
   =================================================================== */
let R=null, GAMES=[], BY_ID={}, LOGOS={}, COLORS={}, COLORS2={};
const GRIDS={};                               // gi -> decoded table
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* leagues: every game carries league = "ncaaf" | "nfl" (college if missing) */
const LEAGUES=["ncaaf","nfl"], LEAGUE_NAME={ncaaf:"College",nfl:"NFL"};
let league="ncaaf";
const lgOf=G=>G.league||"ncaaf";
const TABS={ncaaf:"slips",nfl:"slips",card:"card",history:"history"};
/* NFL names are long ("Kansas City Chiefs"); where space is tight use "Chiefs" */
const shortName=(G,t)=>lgOf(G)==="nfl"?((t===G.home?G.home_short:G.away_short)||t):t;
/* the board's short name on a narrow screen: CFBD's / ESPN's abbreviation ("MTSU", "KC"),
   shipped by refresh.py since row 5; initials until the first refresh that carries it */
const abbrOf=(G,t)=>(t===G.home?G.home_abbr:G.away_abbr)||initials(t);
function loadLeague(){ try{ const v=localStorage.getItem("cloverLeague"); if(LEAGUES.includes(v)) league=v; }catch(e){} }
function setLeague(v){
  league=v; try{localStorage.setItem("cloverLeague",v);}catch(e){}
  populateFilterOptions();
  renderGames(); renderHot(); show("slips");
}

/* refresh.py ships status on every game: upcoming / live / final. A finished game
   keeps its closing line, its final score and the six percentages it was priced at,
   but NOT its 20,000-run table - so it can be shown and graded, never re-priced. */
function statusOf(G){ return G.status||"upcoming"; }
/* shown on the page at all: still priceable (has a table), or kicked off with a
   line to show. The frozen six are NOT required - a game that had already
   finished before this feature shipped has no p, and must still appear. */
const onBoard=G=>!!(G.sim||((G.p||G.hp!=null)&&G.spread!=null&&G.total!=null));
const isOpen=G=>statusOf(G)==="upcoming";   /* still tappable */
function scoreOf(G){ return (G.hp==null||G.ap==null)?null:{h:G.hp,a:G.ap}; }
/* did this pick win, once the game is over? null while it is still being played. */
function settleLeg(G,l){
  const sc=scoreOf(G); if(!sc||statusOf(G)!=="final") return null;
  const v=legVal(l.type,l.line,sc.h+sc.a,sc.h-sc.a);
  return v===0?"push":(v>0?"won":"lost");
}
function splitLegs(legs){
  const live=[],done=[];
  legs.forEach(l=>{ const r=settleLeg(GAMES[l.gi],l); if(r) done.push({l,r}); else live.push(l); });
  return {live,done};
}
/* team score chips: darker team color behind, lighter one as the text. Rivalry
   games often share a color (Georgia/Alabama crimson), so the home chip darkens
   when the two are too close to tell apart. */
const hex2rgb=h=>{h=String(h||"").replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h,16)||0;return [n>>16&255,n>>8&255,n&255];};
const lumOf=c=>{const v=hex2rgb(c).map(x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4);});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const contrastOf=(a,b)=>{const x=lumOf(a),y=lumOf(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const colDist=(a,b)=>{const A=hex2rgb(a),B=hex2rgb(b);return Math.abs(A[0]-B[0])+Math.abs(A[1]-B[1])+Math.abs(A[2]-B[2]);};
const shade=(c,f)=>"#"+hex2rgb(c).map(v=>Math.round(v*f).toString(16).padStart(2,"0")).join("");
/* DESIGN.md, team colors on dark (2026-09-21): the main color if it reads 2:1 or better
   on the card; else the second color if it has real color in it; else the main color
   lightened toward white until it reaches 3:1. Only matters when a logo fails to load. */
const CARD_BG="#1D2127";
const isColorful=c=>{const v=hex2rgb(c);return Math.max(...v)-Math.min(...v)>40;};
const lighten=(c,f)=>"#"+hex2rgb(c).map(v=>Math.round(v+(255-v)*f).toString(16).padStart(2,"0")).join("");
function teamColor(team){
  const main=COLORS[team], alt=COLORS2[team];
  if(!main) return "#3A4350";
  if(contrastOf(main,CARD_BG)>=2) return main;
  if(alt&&isColorful(alt)) return alt;
  let c=main; for(let i=0;i<30&&contrastOf(c,CARD_BG)<3;i++) c=lighten(c,.12);
  return c;
}
function chipColors(G,team){
  const other=team===G.home?G.away:G.home;
  let bg=COLORS[team]||"#26463D";
  if(team===G.home&&COLORS[other]&&colDist(bg,COLORS[other])<90) bg=shade(bg,.5);
  let fg=COLORS2[team]||"#FFFFFF";
  if(contrastOf(bg,fg)<3.5) fg=lumOf(bg)>.45?"#101815":"#FFFFFF";
  return {bg,fg};
}
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
  const g=gridFor(gi);
  if(!g){                                   /* game is over: no table, only the frozen six */
    const G=GAMES[gi];
    if(!dt&&!dm&&G&&G.p&&legs.length===1&&legs[0].line===(hasLine(legs[0].type)?marketLine(G,legs[0].type):0))
      return G.p[legs[0].type]??null;
    return null;
  }
  let win=0, push=0;
  for(let j=0;j<g.k;j++){
    const t=g.T[j]+dt, m=g.M[j]+dm; let ok=true, pu=false;
    for(let x=0;x<legs.length;x++){ const v=legVal(legs[x].type,legs[x].line,t,m); if(v===0){pu=true;break;} if(v<0){ok=false;break;} }
    if(pu) push+=g.C[j]; else if(ok) win+=g.C[j];
  }
  const d=g.n-push; return d>0 ? win/d : 0;
}
/* the whole slip: legs grouped by game, same-game legs looked up together.
   A game with no table (it has finished) drops out - renderCard settles those
   from the final score instead. */
function slipProb(legs,dt=0,dm=0){
  const by={}; legs.forEach(l=>{ if(!gridFor(l.gi)) return; (by[l.gi]=by[l.gi]||[]).push(l); });
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
/* ===================================================================
   STATE — one slip, shared by every screen. Legs are keyed by game id
   (not index) so a refresh doesn't scramble them.
   =================================================================== */
const S={legs:[], pays:null, who:"Danny", placed:null};   /* placed: the "I placed this" stamp (row 6) - never a lock */
function saveSlip(){ try{ localStorage.setItem("cloverSlip",JSON.stringify({legs:S.legs.map(l=>({id:GAMES[l.gi].id,type:l.type,line:l.line,p0:l.p0})),pays:S.pays,who:S.who,placed:S.placed})); }catch(e){} }
function loadSlip(){
  try{
    const s=JSON.parse(localStorage.getItem("cloverSlip")||"null"); if(!s) return;
    S.pays=s.pays??null; S.who=s.who||"Danny"; S.placed=s.placed||null;
    S.legs=(s.legs||[]).map(l=>{ const gi=BY_ID[l.id]; return gi==null||!onBoard(GAMES[gi])?null:{gi,type:l.type,line:l.line,p0:l.p0}; }).filter(Boolean);
  }catch(e){}
}
function findLeg(gi,type){ return S.legs.findIndex(l=>l.gi===gi&&l.type===type); }
/* Ruling 4 (2026-09-21): a game holds at most one pick per pick type. Tapping the other
   side swaps it - Over then Under holds only the Under. Works on any legs list. */
function swapIn(legs,gi,type,line){
  for(let i=legs.length-1;i>=0;i--) if(legs[i].gi===gi&&legMarket(legs[i].type)===legMarket(type)) legs.splice(i,1);
  /* p0 = what Clover said when you took it. Frozen here because the table is
     thrown away when the game ends, and because a line that moves later must
     not rewrite the number the pick was made on. */
  legs.push({gi,type,line,p0:prob(gi,[{type,line}])});
}
function toggleLeg(gi,type){
  const i=findLeg(gi,type);
  if(i>=0) S.legs.splice(i,1);
  else swapIn(S.legs,gi,type,hasLine(type)?marketLine(GAMES[gi],type):0);
  render();
}
function setLegs(legs){ S.legs=legs.map(l=>({gi:l.gi,type:l.type,line:hasLine(l.type)?l.line:0,p0:l.p0??prob(l.gi,[{type:l.type,line:hasLine(l.type)?l.line:0}])})); render(); }
/* Ruling 1 (2026-09-20): no verdict on a made-up payout. There is a payout only once a real one is typed. */
function payoutFor(){ return S.pays!=null&&S.pays>1 ? {dec:S.pays} : null; }

/* ===================================================================
   RENDER
   =================================================================== */
let view="slips";
/* four tabs: NCAA Slips / NFL Slips share the front door; History (row 8) opens a placeholder
   card until it ships. Build has no tab (2026-09-24): building happens on the board, with the
   ladder in the side column. The side column rides along on every view; on the full My Bet
   screen it holds only the ladder (row 6), since the rail would repeat the screen itself. */
const COMING={history:"History is row 8 of the build order - it is not built yet."};
function show(v){
  view=v;
  document.getElementById("viewSlips").classList.toggle("hidden",v!=="slips");
  document.getElementById("viewCard").classList.toggle("hidden",v!=="card");
  document.getElementById("viewOther").classList.toggle("hidden",!COMING[v]);
  document.getElementById("otherTxt").textContent=COMING[v]||"";
  document.getElementById("rail").classList.toggle("hidden",v==="card");
  /* roving tabindex: only the selected tab is in the Tab order; arrow keys move between them (preview3.js) */
  for(const k in TABS){ const t=document.getElementById("tab"+k[0].toUpperCase()+k.slice(1)), on=TABS[k]===v&&(TABS[k]!=="slips"||k===league);
    t.setAttribute("aria-selected",on); t.tabIndex=on?0:-1; }
  renderLadder();
  window.scrollTo({top:0});
}
function render(){
  saveSlip();
  renderGames(); renderCard(); renderRail(); renderLadder(); paintHotAll();
  document.getElementById("tabCount").textContent=S.legs.length||"";
}
