/* ci/smoke.js - boots the real page code without a browser and drives every screen.
   usage: node ci/smoke.js <folder holding preview1-3.js> <ratings.js to load>
   The DOM here is a stand-in that accepts anything; what is being tested is the
   page's own logic: table lookups, hot slips, the slip, My Bet, the line sheet. */
const fs=require("fs"), path=require("path"), vm=require("vm");
const [root,ratingsFile]=process.argv.slice(2), live=process.argv.includes("--live");   /* --live: real data, may be an empty off-season slate */
/* load exactly the scripts index.html loads, in its order - so a script the page forgot to load fails here too */
const PAGE_JS=[...fs.readFileSync(path.join(root,"index.html"),"utf8").matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m=>m[1]);
const fails=[]; const check=(ok,msg)=>{ if(!ok) fails.push(msg); };

function el(tag){
  const kids=[], cls=new Set(), store={tagName:tag||"div",dataset:{},style:{},children:kids,options:[],value:"",textContent:"",innerHTML:"",disabled:false};
  const api={
    appendChild:c=>{kids.push(c);return c;}, append:(...c)=>{kids.push(...c);}, remove(){}, focus(){}, blur(){}, click(){},
    scrollIntoView(){}, showModal(){store.open=true;}, close(){store.open=false;}, addEventListener(){}, removeEventListener(){},
    setAttribute:(k,v)=>{store["@"+k]=String(v);}, getAttribute:k=>store["@"+k]??null, removeAttribute:k=>{delete store["@"+k];},
    insertAdjacentHTML(){}, querySelector:()=>el(), querySelectorAll:()=>[], closest:()=>null, contains:()=>false,
    classList:{add:(...c)=>c.forEach(x=>cls.add(x)),remove:(...c)=>c.forEach(x=>cls.delete(x)),contains:c=>cls.has(c),
               toggle:(c,on)=>{const want=on===undefined?!cls.has(c):!!on; want?cls.add(c):cls.delete(c); return want;}},
  };
  return new Proxy(store,{ get:(t,k)=>k in api?api[k]:t[k], set:(t,k,v)=>{t[k]=v;return true;} });
}
const byId={}, timers=[], mem={};
const document={ getElementById:id=>byId[id]||(byId[id]=el()), createElement:t=>el(t), createTextNode:s=>({textContent:s}),
  querySelector:()=>el(), querySelectorAll:()=>[], addEventListener(){}, activeElement:null, body:el("body"),
  head:{appendChild(s){ if(String(s.src).startsWith("ratings.js")){ vm.runInContext(fs.readFileSync(ratingsFile,"utf8"),ctx); s.onload(); } return s; }} };
const sandbox={ document, console, atob, performance, Date, Math, JSON, Intl,
  localStorage:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];}},
  navigator:{clipboard:{writeText:()=>Promise.resolve()}}, setTimeout:f=>{timers.push(f);return timers.length;}, clearTimeout(){},
  scrollTo(){}, addEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}) };
sandbox.window=sandbox;
const ctx=vm.createContext(sandbox);
const flush=()=>{ while(timers.length) timers.shift()(); };
const js=code=>vm.runInContext(code,ctx);

try{
  for(const f of PAGE_JS) vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),ctx,{filename:f});
  flush();
  const n=js("GAMES.length"); check(live||n>0,"no games loaded");

  /* 1. every % on the page is a table lookup - and it must equal what Python froze */
  const worst=js(`(()=>{ let w=0,c=0; GAMES.forEach((G,gi)=>{ if(!G.sim||!G.p) return;
      ["homeML","awayML","homeSp","awaySp","over","under"].forEach(t=>{ const line=hasLine(t)?marketLine(G,t):0;
        w=Math.max(w,Math.abs(prob(gi,[{type:t,line}])-G.p[t])); c++; }); }); return [w,c]; })()`);
  check(live||worst[1]>=30,"expected at least 30 priced picks, saw "+worst[1]);
  check(worst[0]<=0.00006,"page % differs from Python's by "+worst[0]);

  /* 2. a game that has kicked off is not priceable */
  check(js(`GAMES.filter(G=>new Date(G.start)<Date.now()).every(G=>!G.sim&&statusOf(G)!=="upcoming")`),"a kicked-off game still has a table");

  /* 3. the alert Danny asked for */
  const tag=byId.ratingsTag.textContent;
  if(js("!!(R&&R.stale)")) check(/API ISSUE/.test(tag)&&byId.ratingsTag.classList.contains("stale"),"stale data but no API ISSUE alert: "+tag);
  else check(!/API ISSUE/.test(tag),"API ISSUE shown on healthy data");

  /* 4. hot slips, both leagues, every size */
  for(const lg of ["ncaaf","nfl"]){ js(`setLeague("${lg}")`); flush();
    for(let N=2;N<=6;N++){ js(`hotN=${N}; renderHot()`); flush();
      const bad=js(`HOT.filter(s=>s.legs.length!==${N}||!(slipProb(s.legs).joint>=0&&slipProb(s.legs).joint<=1)).length`);
      check(bad===0,`${lg} ${N}-pick: ${bad} malformed hot slips`);
      check(js("HOT.every(s=>slipProb(s.legs).joint>0)"),`${lg} ${N}-pick: a hot slip that cannot hit (0%)`);
      check(js("HOT.every((s,i)=>!i||slipProb(HOT[i-1].legs).joint>=slipProb(s.legs).joint-1e-12)"),`${lg} ${N}-pick: hot slips out of order`);
      const half=N-Math.max(2,Math.ceil(N/2));
      check(js(`HOT.every((a,i)=>HOT.every((b,j)=>j<=i||[...a.keys].filter(k=>b.keys.has(k)).length<=${half}))`),`${lg} ${N}-pick: two hot slips share more than half their picks`);
      if(js(`hotGames("${lg}").length`)>=12) check(js("HOT.length")===6,`${lg} ${N}-pick: ${js("HOT.length")} slips from a full slate, expected 6`); }
    js("hotN=3; renderHot()"); flush(); check(live||js("HOT.length>0&&slipProb(HOT[0].legs).joint>0.1"),lg+": no believable 3-pick hot slip"); }

  /* 5. build a slip by hand, open My Bet, type a payout, open the line sheet */
  if(js("GAMES.filter(G=>G.sim).length")>=3){
  js(`(()=>{ const pick=GAMES.map((G,gi)=>gi).filter(gi=>GAMES[gi].sim).slice(0,3);
      toggleLeg(pick[0],"homeSp"); toggleLeg(pick[0],"over"); toggleLeg(pick[1],"awayML"); toggleLeg(pick[2],"under"); render(); })()`); flush();
  check(js("S.legs.length")===4,"slip should hold 4 picks");
  const sp=js("slipProb(S.legs)"); check(sp.joint>0&&sp.joint<1&&sp.groups.length===3,"slip chance out of range");
  check(js("S.legs.find(l=>l.type==='homeSp').line===GAMES[S.legs[0].gi].spread"),"spread must be the side's OWN number");
  /* ruling 1: no verdict, anywhere (full screen or rail), until a real payout is typed */
  js(`S.pays=null; show("card"); render();`); flush();
  const words=/Great|Good|Coin toss|Bad|Terrible|est\./;
  check(byId.verdict.textContent===""&&!words.test(byId.rail.innerHTML)&&!words.test(byId.why.textContent),"a verdict is showing before any payout was typed");
  js(`S.pays=11; render();`); flush();
  check(words.test(byId.verdict.textContent)&&words.test(byId.rail.innerHTML)&&/Needs \d/.test(byId.rail.innerHTML),"no verdict after a payout was typed");
  js(`openSheet(S.legs[0],()=>{}); show("slips"); render();`); flush();

  /* row 4 (rulings of 2026-09-21) */
  js(`S.legs=[]; S.pays=null; render();`); flush();
  const gi=js("GAMES.findIndex(G=>G.sim)");
  /* 4: tapping the other side swaps the pick - one pick per pick type per game */
  js(`toggleLeg(${gi},"over"); toggleLeg(${gi},"under"); toggleLeg(${gi},"homeSp"); toggleLeg(${gi},"awaySp"); toggleLeg(${gi},"homeML");`); flush();
  check(js("S.legs.length")===3&&js(`S.legs.map(l=>l.type).sort().join()`)==="awaySp,homeML,under","swap rule: expected under+awaySp+homeML, got "+js("S.legs.map(l=>l.type).join()"));
  /* 1: N/A is the edit button - closed tickets show one N/A and no Prohibited; opened ones show one per pick */
  js("renderHot()"); flush();
  if(js("HOT.length")){
    const closed=js("hotTicketHtml(HOT[0],0)"), open=js("HOT_EDIT=0; hotTicketHtml(HOT[0],0)"); js("HOT_EDIT=null");
    check((closed.match(/>N\/A</g)||[]).length===1&&!/Prohibited/.test(closed),"a closed ticket must show exactly one N/A and no Prohibited");
    check((open.match(/>N\/A</g)||[]).length===js("HOT[0].legs.length")&&/Done/.test(open),"an opened ticket must show N/A beside every pick and Done");
    const pi=js("HOT.findIndex(s=>new Set(s.legs.map(l=>l.gi)).size<s.legs.length)");
    if(pi>=0) check(/Prohibited|Logged as prohibited/.test(js(`HOT_EDIT=${pi}; hotTicketHtml(HOT[${pi}],${pi})`)),"an opened ticket with a same-game pair must offer Prohibited");
    js("HOT_EDIT=null");
  }
  const rail0=js("RAIL_EDIT=false; renderRail(); document.getElementById('rail').innerHTML");
  check((rail0.match(/>N\/A</g)||[]).length===1,"the rail must show one N/A next to Clear until opened");
  check((js("RAIL_EDIT=true; renderRail(); document.getElementById('rail').innerHTML").match(/>N\/A</g)||[]).length===js("S.legs.length"),"an opened rail must show N/A on every pick (header says Done)");
  js("RAIL_EDIT=false");
  /* 2: the moved flag - My Bet rail only, and only at 3 points or more, on the pick's own number */
  js(`GAMES[${gi}].open={spread:GAMES[${gi}].spread+3,total:GAMES[${gi}].total-2}; render();`); flush();
  check(js(`movedNote(S.legs.find(l=>l.type==="under"))===null`),"total moved 2: must not flag");
  check(js(`/opened/.test(movedNote(S.legs.find(l=>l.type==="awaySp"))||"")&&/opened/.test(movedNote(S.legs.find(l=>l.type==="homeML"))||"")`),"spread moved 3: spread and winner picks must flag");
  check(/Line moved\./.test(byId.rail.innerHTML),"the rail must show the Line moved flag");
  check(!/Line moved/.test(byId.games.innerHTML)&&!/Line moved/.test(js("hotTicketHtml(HOT[0]||{legs:[]},0)")),"Line moved must never appear on the board or a ticket");
  js(`delete GAMES[${gi}].open;`);
  /* the board: at market a spread or total shows the line only; winner shows its chance */
  const row=js(`boardRow(GAMES[${gi}],${gi})`);
  check(!/[OU] \d[\d.]*<small>/.test(row)&&/O \d/.test(row)&&/%/.test(row),"board: totals at market must show the line only, winner its chance");
  js(`S.legs.find(l=>l.type==="under").line+=3; render();`); flush();
  check(/U \d[\d.]*<small>[\d.<>]+%/.test(js(`boardRow(GAMES[${gi}],${gi})`)),"board: a moved total must show its chance");
  js(`S.legs=[]; S.pays=null; render();`); flush();
  }

  /* 5b. "Today" follows Game status: the default view is never empty while there are games still to come */
  for(const lg of ["ncaaf","nfl"]){ js(`FILTERS["${lg}"]=defaultFilters()`);
    if(js(`GAMES.some(G=>G.sim&&lgOf(G)==="${lg}")`)) check(js(`filteredGames("${lg}").length`)>0,lg+": default filters show no games though some are still to come"); }

  /* 5c. a one-game slate: no slip may be built from picks that cannot both happen */
  js(`(()=>{ let kept=false; GAMES.forEach((G,gi)=>{ if(G.sim&&!kept){kept=true;return;} delete G.sim; delete GRIDS[gi]; }); for(const k in BLOCKS) delete BLOCKS[k]; })()`);
  for(const lg of ["ncaaf","nfl"]){ js(`setLeague("${lg}")`); for(let N=2;N<=3;N++){ js(`hotN=${N}; renderHot()`); flush();
    check(js("HOT.every(s=>slipProb(s.legs).joint>0)"),`${lg} one-game slate, ${N}-pick: offered a slip that cannot hit`); } }

  /* 6. one verdict scale: +15c / +5c / -5c / -20c */
  const words=js(`[0.15,0.05,-0.05,-0.20,-0.21].map(v=>JSON.stringify(grade(v)))`);
  ["Great","Good","Coin toss","Bad","Terrible"].forEach((w,i)=>check(words[i].includes(w),`grade(${[0.15,0.05,-0.05,-0.2,-0.21][i]}) should be ${w}, got ${words[i]}`));
}catch(e){ fails.push("page threw: "+(e&&e.stack||e)); }

if(fails.length){ console.log("  FAIL  page smoke test"); fails.forEach(f=>console.log("        "+f)); process.exit(1); }
console.log("  ok    page smoke test"+(live?" on the live data file":"")+" (boot, lookups = Python, hot slips 2-6 both leagues, default day, one-game slate, slip, My Bet, line sheet, verdict scale, swap, N/A hidden until edit, moved flag rail-only at 3+, line-only at market)");
