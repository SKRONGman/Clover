/* ci/smoke.js - boots the real page code without a browser and drives every screen.
   usage: node ci/smoke.js <folder holding preview1-3.js> <ratings.js to load>
   The DOM here is a stand-in that accepts anything; what is being tested is the
   page's own logic: table lookups, hot slips, the slip, My Bet, the line sheet. */
const fs=require("fs"), path=require("path"), vm=require("vm");
const [root,ratingsFile]=process.argv.slice(2), live=process.argv.includes("--live");   /* --live: real data, may be an empty off-season slate */
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
  for(const f of ["preview1.js","preview2.js","preview3.js"]) vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),ctx,{filename:f});
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
      check(bad===0,`${lg} ${N}-pick: ${bad} malformed hot slips`); }
    js("hotN=3; renderHot()"); flush(); check(live||js("HOT.length>0&&slipProb(HOT[0].legs).joint>0.1"),lg+": no believable 3-pick hot slip"); }

  /* 5. build a slip by hand, open My Bet, type a payout, open the line sheet */
  if(js("GAMES.filter(G=>G.sim).length")>=3){
  js(`(()=>{ const pick=GAMES.map((G,gi)=>gi).filter(gi=>GAMES[gi].sim).slice(0,3);
      toggleLeg(pick[0],"homeSp"); toggleLeg(pick[0],"over"); toggleLeg(pick[1],"awayML"); toggleLeg(pick[2],"under"); render(); })()`); flush();
  check(js("S.legs.length")===4,"slip should hold 4 picks");
  const sp=js("slipProb(S.legs)"); check(sp.joint>0&&sp.joint<1&&sp.groups.length===3,"slip chance out of range");
  check(js("S.legs.find(l=>l.type==='homeSp').line===GAMES[S.legs[0].gi].spread"),"spread must be the side's OWN number");
  js(`show("card"); renderCard(); S.pays=11; renderCard();`); flush();
  js(`openSheet(S.legs[0],()=>{}); show("slips"); render();`); flush();
  }

  /* 6. one verdict scale: +15c / +5c / -5c / -20c */
  const words=js(`[0.15,0.05,-0.05,-0.20,-0.21].map(v=>JSON.stringify(grade(v)))`);
  ["Great","Good","Coin toss","Bad","Terrible"].forEach((w,i)=>check(words[i].includes(w),`grade(${[0.15,0.05,-0.05,-0.2,-0.21][i]}) should be ${w}, got ${words[i]}`));
}catch(e){ fails.push("page threw: "+(e&&e.stack||e)); }

if(fails.length){ console.log("  FAIL  page smoke test"); fails.forEach(f=>console.log("        "+f)); process.exit(1); }
console.log("  ok    page smoke test"+(live?" on the live data file":"")+" (boot, lookups = Python, hot slips 2-6 both leagues, slip, My Bet, line sheet, verdict scale)");
