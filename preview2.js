function legRow(l,opts){
  const G=GAMES[l.gi], row=document.createElement("div"); row.className="leg";
  row.appendChild(legTeam(G,l.type)?logoTile(legTeam(G,l.type)):duoTile(G));
  const mid=document.createElement("div");
  mid.innerHTML=`<div class="pickName">${esc(legLabel(G,l))}</div><div class="who">${esc(legWho(G,l))}</div>`;
  if(hasLine(l.type)){
    const base=marketLine(G,l.type), moved=l.line!==base, q=dkQuote(G,l.type,l.line);
    const n=document.createElement("div"); n.className="nudge";
    n.innerHTML=`<button type="button" data-n="-0.5" aria-label="Lower the line">−</button>
      <button type="button" class="val${moved?" moved":""}" aria-label="Pick from every line">${legMarket(l.type)==="Spread"?fmtSp(l.line):l.line}</button>
      <button type="button" data-n="0.5" aria-label="Raise the line">+</button>
      <span class="hint">${moved?`market ${legMarket(l.type)==="Spread"?fmtSp(base):base}`:"tap number for all lines"}</span>`;
    n.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{ l.line=Math.round((l.line+ +b.dataset.n)*2)/2; opts.onChange(); });
    n.querySelector(".val").onclick=()=>openSheet(l,opts.onChange);
    mid.appendChild(n);
    const dk=document.createElement("div"); dk.className="dk";
    dk.textContent=q?`DraftKings pays ${money(q.dec)} (${q.am})${q.fair!==null?` · their chance ${pct(q.fair)}`:""}`:(G.alt?"DraftKings doesn't list this exact line":lgOf(G)==="nfl"?"DK alternate lines load every other Thursday for NFL":"DK alternate lines load Thursdays");
    mid.appendChild(dk);
  }
  row.appendChild(mid);
  const right=document.createElement("div"); right.className="right";
  right.innerHTML=`<div class="pct">${pct(prob(l.gi,[l]))}<small>this pick</small></div>`;
  if(opts.remove){ const b=document.createElement("button"); b.type="button"; b.className="rm"; b.textContent="Remove"; b.setAttribute("aria-label","Remove this pick"); b.onclick=()=>opts.remove(); right.appendChild(b); }
  if(opts.na){ const b=document.createElement("button"); b.type="button"; b.className="na"; b.textContent="Not on my app"; b.title="My app doesn't offer this pick — drop it and reshuffle"; b.onclick=()=>opts.na(l); right.appendChild(b); }
  row.appendChild(right);
  return row;
}
/* legs grouped by game, drawn as a Winner / Spread / Total grid with the two teams as rows.
   Over sits on the home row, Under on the away row. Tapping a cell adds or removes that pick;
   a selected spread/total also gets a chip below that opens the full line sheet. */
const MARKETS3=[["homeML","awayML","WINNER"],["homeSp","awaySp","SPREAD"],["over","under","TOTAL"]];
function cellFor(gi,type,legs,opts){
  const G=GAMES[gi], held=legs.find(l=>l.gi===gi&&l.type===type);
  const line=held?held.line:(hasLine(type)?marketLine(G,type):0);
  const b=document.createElement("button"); b.type="button"; b.className="cell";
  b.setAttribute("aria-pressed",!!held);
  b.classList.toggle("na",!offered(gi,type));
  const p=prob(gi,[{type,line}]);
  if(hasLine(type)){
    const txt=legMarket(type)==="Spread"?fmtSp(line):((type==="over"?"Over ":"Under ")+line);
    b.innerHTML=`<span class="ln">${esc(txt)}</span><span class="pp">${pct(p)}</span>`;
  }else{
    b.innerHTML=`<span class="pp">${pct(p)}</span>`;
  }
  b.setAttribute("aria-label",`${legLabel(G,{type,line})} — ${pct(p)}`);
  b.onclick=()=>{
    const i=legs.findIndex(l=>l.gi===gi&&l.type===type);
    if(i>=0) legs.splice(i,1); else legs.push({gi,type,line});
    opts.onChange();
  };
  return b;
}
function legGroups(container,legs,opts){
  const {groups}=slipProb(legs);
  groups.sort((a,b)=>GAMES[a.gi].start.localeCompare(GAMES[b.gi].start));
  const mixed=new Set(groups.map(gr=>lgOf(GAMES[gr.gi]))).size>1;
  groups.forEach(gr=>{
    const G=GAMES[gr.gi], gi=gr.gi;
    const meta=document.createElement("div"); meta.className="gMeta";
    meta.textContent=whenShort(G)+(mixed?` · ${LEAGUE_NAME[lgOf(G)]}`:"");
    container.appendChild(meta);

    const grid=document.createElement("div"); grid.className="gcard";
    grid.appendChild(document.createElement("span"));
    MARKETS3.forEach(([,,h])=>{ const c=document.createElement("span"); c.className="colh"; c.textContent=h; grid.appendChild(c); });
    [["home",G.home,0],["away",G.away,1]].forEach(([side,team,ix])=>{
      const t=document.createElement("div"); t.className="team";
      const ha=document.createElement("span"); ha.className="ha"; ha.textContent=side==="home"?"H":"A"; t.appendChild(ha);
      t.appendChild(logoTile(team,true));
      const nm=document.createElement("span"); nm.className="nm"; nm.textContent=shortName(G,team); t.appendChild(nm);
      grid.appendChild(t);
      MARKETS3.forEach(m=>grid.appendChild(cellFor(gi,m[ix],legs,opts)));
    });
    if(opts.na){
      grid.appendChild(document.createElement("span"));
      MARKETS3.forEach(m=>{
        const blocked=!offered(gi,m[0])&&!offered(gi,m[1]);
        const b=document.createElement("button"); b.type="button"; b.className="naBtn"; b.textContent="N/A";
        b.setAttribute("aria-pressed",blocked);
        b.title=`My app doesn't offer ${legMarket(m[0])} on this game`;
        b.setAttribute("aria-label",`Mark ${legMarket(m[0])} as not available on this game`);
        b.onclick=()=>{ naAdd(gi,m[0]); naAdd(gi,m[1]); opts.na(); };
        grid.appendChild(b);
      });
    }
    container.appendChild(grid);

    /* line sheet stays reachable for any selected spread/total */
    const lined=gr.legs.filter(l=>hasLine(l.type));
    if(lined.length){
      const row=document.createElement("div"); row.className="together";
      const wrap=document.createElement("span");
      lined.forEach(l=>{
        const base=marketLine(G,l.type), moved=l.line!==base;
        const b=document.createElement("button"); b.type="button";
        b.textContent=`${legLabel(G,l)} · all lines${moved?` (market ${legMarket(l.type)==="Spread"?fmtSp(base):base})`:""}`;
        b.onclick=()=>openSheet(l,opts.onChange); wrap.appendChild(b); wrap.appendChild(document.createTextNode(" "));
      });
      row.appendChild(wrap); container.appendChild(row);
    }

    if(gr.legs.length>1){
      const t=document.createElement("div"); t.className="together";
      t.innerHTML=`<span>Same game · together <b>${pct(gr.p)}</b> vs ${pct(gr.indep)} if unrelated</span>`;
      if(opts.prohib){
        const wrap=document.createElement("span"), logged=new Set(prohibLog().map(r=>r.key));
        for(let x=0;x<gr.legs.length;x++)for(let y=x+1;y<gr.legs.length;y++){
          const a1=gr.legs[x], c1=gr.legs[y], key=prohibKey(G,a1,c1), done=logged.has(key);
          const b=document.createElement("button"); b.type="button"; b.className=done?"done":""; b.disabled=done;
          b.textContent=(done?"Logged ✓":"Prohibited")+(gr.legs.length>2?` · ${legMarket(a1.type)} + ${legMarket(c1.type)}`:"");
          b.onclick=()=>{prohibAdd(G,a1,c1);opts.onChange();}; wrap.appendChild(b); wrap.appendChild(document.createTextNode(" "));
        }
        t.appendChild(wrap);
      }
      container.appendChild(t);
    }
  });
}

/* ---- The Card: live, no Analyze button ---- */
function renderCard(){
  const n=S.legs.length, legsEl=document.getElementById("legs");
  legsEl.innerHTML="";
  const paysIn=document.getElementById("pays"), pay=payoutFor(n);
  document.getElementById("who").value=S.who;
  if(document.activeElement!==paysIn) paysIn.value=S.pays!=null?S.pays:"";
  paysIn.placeholder=PAYOUT[n]?PAYOUT[n].toFixed(2):"";
  document.getElementById("paysEst").classList.toggle("hidden",!(pay&&pay.est));
  document.getElementById("paysNote").textContent = pay&&!pay.est ? "Using the payout you typed." : pay ? "Type what your app shows for this slip. Until you do, this is a typical pick'em payout — an estimate." : n?"No typical payout on file for that many picks — type your app's.":"";
  const set=(id,v)=>document.getElementById(id).textContent=v;
  const v=document.getElementById("verdict");
  if(!n){
    set("bigProb","—"); set("bigSub","Add picks from the Slips tab"); v.textContent=""; set("why","");
    ["oBook","oBreak","oFair","oEv"].forEach(id=>set(id,"—")); set("stressOut","");
    legsEl.innerHTML=`<p class="empty">Nothing on the card yet.</p>`; return;
  }
  legGroups(legsEl,S.legs,{onChange:render,removable:true});
  const {joint}=slipProb(S.legs);
  set("bigProb",pct(joint));
  set("bigSub",n===1?"chance this pick hits":n===2?"chance both picks hit":`chance all ${n} picks hit`);
  if(!pay){ v.textContent=""; set("why","Type your app's payout above to get a verdict."); ["oBook","oBreak","oFair","oEv"].forEach(id=>set(id,"—")); set("stressOut",""); return; }
  const dec=pay.dec, ev=joint*dec-1, g=grade(ev), cents=Math.round(Math.abs(ev)*100);
  v.className="verdict "+g.cls; v.textContent=g.word+(pay.est?" (est. payout)":"");
  set("why",`${g.why} Bet $1: it pays ${money(dec)} if it hits. On average you get back ${money(joint*dec)} — about ${cents}¢ ${ev>=0?"ahead":"lost"} per $1.`);
  set("oBook",money(dec)); set("oBreak",(100/dec).toFixed(1)+"%"); set("oFair",joint>0?money(1/joint):"—"); set("oEv",(ev>=0?"+":"−")+cents+"¢");
  /* stress: total AND margin each nudged -3..+3 → 49 versions of the game, all lookups */
  const words=[];
  for(let dt=-3;dt<=3;dt++)for(let dm=-3;dm<=3;dm++) words.push(grade(slipProb(S.legs,dt,dm).joint*dec-1).word);
  const same=words.filter(w=>w===g.word).length, seen=ORDER.filter(w=>words.includes(w));
  set("stressOut", same===49 ? `Solid. It stays "${g.word}" no matter which way the game drifts.`
    : same>=35 ? `Mostly holds. It's "${g.word}" in ${same} of 49 versions, ranging from "${seen[0]}" to "${seen[seen.length-1]}".`
    : `Shaky. Small changes in the game move it anywhere from "${seen[0]}" to "${seen[seen.length-1]}". Don't lean on this one.`);
}

/* ---- hot slips: built right here from the tables, so "Not on my app" can
   reshuffle instantly. Same rules as before: up to 3 picks from one game,
   ranked by chance the whole slip hits, top slips must actually differ. ---- */
let hotN=3, HOT=[];
const HOT_TOP=6, BEAM=600;
function gameBlocks(gi){
  const G=GAMES[gi], ok=t=>offered(gi,t);
  const W=["homeML","awayML"].filter(ok).map(t=>({gi,type:t,line:0}));
  const P=["homeSp","awaySp"].filter(ok).map(t=>({gi,type:t,line:marketLine(G,t)}));
  const T=["over","under"].filter(ok).map(t=>({gi,type:t,line:G.total}));
  const combos=[...W,...P,...T].map(l=>[l]);
  W.forEach(w=>P.forEach(p=>combos.push([w,p])));
  W.forEach(w=>T.forEach(t=>combos.push([w,t])));
  P.forEach(p=>T.forEach(t=>combos.push([p,t])));
  W.forEach(w=>P.forEach(p=>T.forEach(t=>combos.push([w,p,t]))));
  return combos.map(legs=>({legs,p:prob(gi,legs)}));
}
function buildSlips(N){
  const gis=hotGames(league).map(x=>x.gi);
  let beam=[{k:0,p:1,b:null,prev:null}];
  gis.forEach(gi=>{
    const blocks=gameBlocks(gi), by={};
    const push=x=>{(by[x.k]=by[x.k]||[]).push(x);};
    beam.forEach(ps=>{ push(ps); blocks.forEach(b=>{ const k=ps.k+b.legs.length; if(k<=N) push({k,p:ps.p*b.p,b,prev:ps}); }); });
    beam=[]; for(const k in by){ by[k].sort((a,b)=>b.p-a.p); beam.push(...by[k].slice(0,BEAM)); }
  });
  const full=beam.filter(x=>x.k===N).sort((a,b)=>b.p-a.p);
  const need=Math.max(2,Math.ceil(N/2)), out=[];        // no two slips share more than half their picks
  for(const s of full){
    const legs=[]; for(let x=s;x&&x.b;x=x.prev) legs.unshift(...x.b.legs);
    const keys=new Set(legs.map(l=>l.gi+":"+l.type));
    if(out.some(o=>{let sh=0;o.keys.forEach(k=>{if(keys.has(k))sh++;});return N-sh<need;})) continue;
    out.push({keys,legs:legs.map(l=>({...l}))});
    if(out.length===HOT_TOP) break;
  }
  return out;
}
function renderHot(){
  const out=document.getElementById("hotOut"), st=document.getElementById("hotStatus");
  out.innerHTML="";
  const name=LEAGUE_NAME[league], all=GAMES.filter(G=>G.sim&&lgOf(G)===league).length, lined=hotGames(league).length;
  if(!all){ st.textContent=`No ${name} games with lines yet — lines load closer to game day.`; return; }
  if(!lined){ st.textContent=`No ${name} games match these filters — loosen them to search for slips.`; return; }
  st.textContent=`Searching ${lined} ${name} games for the best ${hotN}-pick slips…`;
  setTimeout(()=>{
    const t0=performance.now();
    HOT=buildSlips(hotN);
    if(!HOT.length){ st.textContent="Couldn't build a slip with the pick types your app offers — turn a type back on or clear \"Not on my app\"."; return; }
    const na=[...NA].filter(k=>BY_ID[k.split("|")[0]]!=null).length;
    st.textContent=`Top ${HOT.length} ${name} slips from ${lined} games, ranked by the chance the whole slip hits${na?` · skipping ${na} pick${na>1?"s":""} you marked not on your app`:""}. Tap one to adjust lines.`;
    HOT.forEach((s,i)=>{ const d=document.createElement("div"); d.className="hs"; out.appendChild(d); paintHot(d,s,i); });
  },20);
}
function paintHot(d,s,i){
  const {joint}=slipProb(s.legs), n=s.legs.length;
  const moved=s.legs.some(l=>hasLine(l.type)&&l.line!==marketLine(GAMES[l.gi],l.type));
  const open=d.classList.contains("open");
  d.innerHTML=`<button type="button" class="hsHead" aria-expanded="${open}">
      <span><span class="big">${pct(joint)}</span> <span class="sub">Win Rate Probability</span>${moved?` <b style="color:var(--mid)">· lines moved</b>`:""}</span>
      <span class="sub">${open?"":"tap to edit"}</span></button>
    <div class="hsBody"></div>
    <div class="hsFoot"><button class="primary" type="button" data-use="1">Use this slip</button>${moved?`<button class="ghost" type="button" data-reset="1">Back to market lines</button>`:""}</div>`;
  const repaint=()=>paintHot(d,s,i);
  legGroups(d.querySelector(".hsBody"),s.legs,{onChange:repaint,prohib:true,na:()=>{ renderGames(); renderHot(); }});
  d.querySelector(".hsHead").onclick=()=>{ d.classList.toggle("open"); repaint(); };
  d.querySelector("[data-use]").onclick=()=>{ setLegs(s.legs); show("card"); };
  const rs=d.querySelector("[data-reset]"); if(rs) rs.onclick=()=>{ s.legs.forEach(l=>{ if(hasLine(l.type)) l.line=marketLine(GAMES[l.gi],l.type); }); repaint(); };
}

/* ---- line sheet: every rung for one pick (was the Line Mover tab) ---- */
const MOVES=[]; for(let k=-10;k<=10;k+=0.5) MOVES.push(k);   // every half-point, DK quotes live on the .5s
function openSheet(l,onChange){
  const G=GAMES[l.gi], base=marketLine(G,l.type), sp=legMarket(l.type)==="Spread";
  const side=l.type==="over"?"Over":l.type==="under"?"Under":legTeam(G,l.type);
  const fmt=v=>sp?fmtSp(v):String(v);
  const rows=MOVES.map(k=>{ const L=base+k, p=prob(l.gi,[{type:l.type,line:L}]), q=dkQuote(G,l.type,L); return {k,L,p,q}; });
  const box=document.getElementById("sheetIn");
  box.innerHTML=`<h2><span>${esc(side)} — every line</span><button type="button" class="close" aria-label="Close">×</button></h2>
    <p class="small" style="margin:0 0 4px">${esc(shortName(G,G.away))} @ ${esc(shortName(G,G.home))} · market ${esc(fmt(base))}. Tap a line to use it.</p>
    <div class="scroll"><table class="ladder">
      <tr><th>Line</th><th>Our chance</th><th>Fair pays</th><th>DK pays</th><th>DK's chance</th></tr>
      ${rows.map(r=>`<tr class="${r.k===0?"base":""}${r.L===l.line?" cur":""}" data-l="${r.L}">
        <td><button type="button" class="use">${esc(fmt(r.L))}${r.k===0?" <span class='small'>(market)</span>":""}</button></td>
        <td class="p">${pct(r.p)}</td><td>${r.p>0?money(1/r.p):"—"}</td>
        <td>${r.q?`${money(r.q.dec)} <span class="small">${r.q.am}</span>`:"—"}</td>
        <td class="p" style="color:var(--muted)">${r.q&&r.q.fair!==null?pct(r.q.fair):"—"}</td></tr>`).join("")}
    </table></div>
    <p class="small" style="margin:10px 0 0">"Fair pays" is what $1 on that line deserves to pay if it hits, by our numbers. "DK pays" is DraftKings' real price for that exact line, and "DK's chance" is what their price implies once their cut is removed — a second opinion from a real book. If your app pays more than DK for the same move, that's a good deal. Whole numbers can push — prefer the half-point.${G.alt?"":` <b>No DraftKings alternate lines for this game yet</b> — ${lgOf(G)==="nfl"?"NFL ones load every other Thursday":"they load Thursdays"}.`}</p>`;
  const dlg=document.getElementById("sheet");
  box.querySelector(".close").onclick=()=>dlg.close();
  box.querySelectorAll("tr[data-l]").forEach(tr=>tr.querySelector(".use").onclick=()=>{ l.line=+tr.dataset.l; dlg.close(); onChange(); });
  dlg.showModal();
  const cur=box.querySelector("tr.cur"); if(cur) cur.scrollIntoView({block:"center"});
}
document.getElementById("sheet").addEventListener("click",e=>{ if(e.target.id==="sheet") e.target.close(); });

/* ---- "not on my app": picks the app doesn't offer. Keyed by game id so they
   expire with the game. These DO change the hot slips (reshuffle). ---- */
function naLoad(){ try{return new Set(JSON.parse(localStorage.getItem("cloverNA")||"[]"));}catch(e){return new Set();} }
let NA=new Set();
function naKey(gi,type){ return `${GAMES[gi].id}|${type}`; }
function naHas(gi,type){ return NA.has(naKey(gi,type)); }
function naSave(){ try{ localStorage.setItem("cloverNA",JSON.stringify([...NA].filter(k=>BY_ID[k.split("|")[0]]!=null))); }catch(e){} naButtons(); }
function naAdd(gi,type){ NA.add(naKey(gi,type)); naSave(); }
function naButtons(){
  const b=document.getElementById("naClear"), n=[...NA].filter(k=>BY_ID[k.split("|")[0]]!=null).length;
  b.textContent=`Clear N/A (${n})`; b.classList.toggle("hidden",!n);
}
document.getElementById("naClear").onclick=()=>{ NA=new Set(); naSave(); renderHot(); renderGames(); };
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
document.getElementById("tabNcaaf").onclick=()=>setLeague("ncaaf");
document.getElementById("tabNfl").onclick=()=>setLeague("nfl");
document.getElementById("hotToggle").onclick=e=>{
  const b=e.currentTarget, open=b.getAttribute("aria-expanded")!=="true";
  b.setAttribute("aria-expanded",open); b.textContent=open?"Hide":"Show";
  document.getElementById("hotBody").classList.toggle("hidden",!open);
  document.getElementById("hotOut").classList.toggle("hidden",!open);
  try{localStorage.setItem("cloverHotOpen",open?"1":"0");}catch(e2){}
};
document.getElementById("fClear").onclick=()=>{ FILTERS[league]=defaultFilters(); saveFilters(); populateFilterOptions(); renderGames(); renderHot(); };
document.getElementById("tabCard").onclick=()=>show("card");
document.getElementById("barGo").onclick=()=>show("card");
document.getElementById("backToSlips").onclick=()=>show("slips");
document.getElementById("clearSlip").onclick=()=>{S.legs=[];render();};
document.getElementById("pays").addEventListener("input",e=>{ const v=parseFloat(e.target.value); S.pays=isNaN(v)||v<=1?null:v; render(); });
document.getElementById("who").onchange=e=>{S.who=e.target.value;saveSlip();};
document.getElementById("copy").onclick=()=>{
  const n=S.legs.length; if(!n) return;
  const {joint}=slipProb(S.legs), pay=payoutFor(n);
  const desc=S.legs.map(l=>{const G=GAMES[l.gi];return `${lgOf(G)==="nfl"?"NFL ":""}${G.away} @ ${G.home} ${legLabel(G,l)}`;}).join(" | ");
  const row=[new Date().toISOString().slice(0,10),S.who,desc,n,pay?money(pay.dec)+(pay.est?" est":""):"",pct(joint),pay?grade(joint*pay.dec-1).word:"",""].join("\t");
  navigator.clipboard.writeText(row).then(()=>{const b=document.getElementById("copy");b.textContent="Copied — paste in the sheet";setTimeout(()=>b.textContent="Copy row for the log",2200);});
};
(function chips(){
  const c=document.getElementById("chips");
  for(let n=2;n<=6;n++){ const b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=n; b.setAttribute("aria-pressed",n===hotN);
    b.onclick=()=>{hotN=n;c.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",+x.textContent===n));renderHot();}; c.appendChild(b); }
})();
function marketChips(){
  const c=document.getElementById("markets"); c.innerHTML="";
  ["Winner","Spread","Total"].forEach(m=>{ const b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=m; b.setAttribute("aria-pressed",!!MARKETS[m]);
    b.onclick=()=>{ MARKETS[m]=!MARKETS[m]; marketsSave(); marketChips(); renderGames(); renderHot(); }; c.appendChild(b); });
}

function init(){
  R=window.RATINGS||null;
  GAMES=(R&&R.upcoming)||[]; LOGOS=(R&&R.logos)||{}; COLORS=(R&&R.colors)||{};
  GAMES.forEach((G,i)=>{ BY_ID[G.id]=i; if(new Date(G.start).getTime()<Date.now()) delete G.sim; });   // kicked off = off the board
  const tag=document.getElementById("ratingsTag");
  const count=lg=>GAMES.filter(G=>G.sim&&lgOf(G)===lg).length, nC=count("ncaaf"), nN=count("nfl");
  document.getElementById("nNcaaf").textContent=nC?`${nC}`:""; document.getElementById("nNfl").textContent=nN?`${nN}`:"";
  if(!R){ tag.textContent="No lines file loaded — run refresh.py first"; tag.classList.add("stale"); }
  else {
    const gen=new Date(R.generated), lg=R.lines_generated?new Date(R.lines_generated):gen, mins=Math.round((Date.now()-lg)/60000);
    const ago=mins<60?`${mins} min ago`:mins<2880?`${Math.round(mins/60)} hr ago`:`${Math.round(mins/1440)} days ago`;
    const lined=nC+nN;
    const alt=R.alt_generated?new Date(R.alt_generated):null;
    const newest=(alt&&alt>lg)?alt:lg;
    tag.textContent=`Last refresh — ${newest.toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})} (${ago})`;
    if(mins>360||!lined) tag.classList.add("stale");
    if(!lined) tag.textContent+=" — run refresh.py";
  }
  loadLeague();
  if(!count(league)&&count(league==="ncaaf"?"nfl":"ncaaf")) league=league==="ncaaf"?"nfl":"ncaaf";   // open on whichever league has games
  loadFilters(); populateFilterOptions();
  NA=naLoad(); marketsLoad(); marketChips(); naButtons(); loadSlip(); prohibButtons(); restoreHotOpen(); renderHot(); render(); show("slips");
  document.getElementById("tabNcaaf").setAttribute("aria-selected",league==="ncaaf");
  document.getElementById("tabNfl").setAttribute("aria-selected",league==="nfl");
}
/* ratings.js with a cache-buster, without document.write; works from file:// too */
(function(){ const s=document.createElement("script"); s.src="ratings.js?v="+Date.now(); s.onload=init; s.onerror=init; document.head.appendChild(s); })();
