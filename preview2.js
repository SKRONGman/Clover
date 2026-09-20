/* ---- build your own: every lined game, grouped by day, six picks each ---- */
function renderGames(){
  const out=document.getElementById("games");
  const all=GAMES.filter(G=>onBoard(G)&&lgOf(G)===league).length, lined=filteredGames(league);
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
        const open=isOpen(G);
        const g=document.createElement("div"); g.className="game"+(open?"":" done");
        g.appendChild(gameHead(G));
        const picks=document.createElement("div"); picks.className="picks";
        [["awaySp",`${shortName(G,G.away)} ${fmtSp(-G.spread)}`],["homeSp",`${shortName(G,G.home)} ${fmtSp(G.spread)}`],["over",`Over ${G.total}`],["under",`Under ${G.total}`],["awayML",`${shortName(G,G.away)} wins`],["homeML",`${shortName(G,G.home)} wins`]]
          .forEach(([type,label])=>{
            const b=document.createElement("button"); b.type="button"; b.className="pick"; b.dataset.gi=gi; b.dataset.type=type;
            const p=prob(gi,[{type,line:hasLine(type)?marketLine(G,type):0}]);
            b.innerHTML=`<span>${esc(label)}</span><b>${pct(p)}</b>`;
            if(open) b.onclick=()=>toggleLeg(gi,type);
            else { b.disabled=true; b.title="This game has started — picks are closed"; }
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

/* ---- the line above a game: matchup, or score chips once it has kicked off ---- */
function gameHead(G){
  const head=document.createElement("div"); head.className="gHead";
  const st=statusOf(G), sc=scoreOf(G);
  if(st==="upcoming"||!sc){
    head.appendChild(logoTile(G.away,true));
    head.appendChild(document.createTextNode(` ${shortName(G,G.away)} @ ${shortName(G,G.home)}`));
    head.appendChild(logoTile(G.home,true));
    const when=document.createElement("span"); when.className="when";
    when.textContent=new Date(G.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    head.appendChild(when);
    if(st!=="upcoming"){ const c=document.createElement("span"); c.className="hChip"+(st==="final"?" fin":""); c.textContent=st==="final"?"Final":"In Progress"; head.appendChild(c); }
    return head;
  }
  head.classList.add("hasScore");
  [[G.away,sc.a],[G.home,sc.h]].forEach(([team,pts])=>{
    const c=document.createElement("span"); c.className="tScore";
    if(st==="final"){ c.classList.add("off"); }                  /* grey once it is over */
    else { const col=chipColors(G,team); c.style.background=col.bg; c.style.color=col.fg; }
    c.innerHTML=`${esc(shortName(G,team))} <span class="pts">${pts}</span>`;
    head.appendChild(c);
  });
  const t=document.createElement("span"); t.className="hChip";
  t.textContent=new Date(G.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  head.appendChild(t);
  const c=document.createElement("span"); c.className="hChip"+(st==="final"?" fin":"");
  c.textContent=st==="final"?"Final":"In Progress"; head.appendChild(c);
  return head;
}

/* legs grouped by game, drawn as a Winner / Spread / Total grid with the two teams as rows.
   Over sits on the home row, Under on the away row. Tapping a cell adds or removes that pick;
   a selected spread/total also gets a chip below that opens the full line sheet. */
const MARKETS3=[["homeML","awayML","WINNER"],["homeSp","awaySp","SPREAD"],["over","under","TOTAL"]];
function cellFor(gi,type,legs,opts){
  const G=GAMES[gi], held=legs.find(l=>l.gi===gi&&l.type===type), open=isOpen(G);
  const line=held?held.line:(hasLine(type)?marketLine(G,type):0);
  const b=document.createElement("button"); b.type="button"; b.className="cell";
  b.setAttribute("aria-pressed",!!held);
  b.classList.toggle("na",!offered(gi,type));
  const p=held&&held.p0!=null?held.p0:prob(gi,[{type,line}]);   /* what it was priced at */
  const res=held?settleLeg(G,held):null;
  if(hasLine(type)){
    const txt=legMarket(type)==="Spread"?fmtSp(line):((type==="over"?"Over ":"Under ")+line);
    b.innerHTML=`<span class="ln">${esc(txt)}</span><span class="pp">${pct(p)}</span>`;
  }else{
    b.innerHTML=`<span class="pp">${pct(p)}</span>`;
  }
  if(res){
    b.classList.add(res==="lost"?"lost":"won");
    b.insertAdjacentHTML("beforeend",`<span class="res ${res==="lost"?"l":"w"}">${res.toUpperCase()}</span>`);
  }
  b.setAttribute("aria-label",`${legLabel(G,{type,line})} — ${pct(p)}${res?" — "+res:""}`);
  if(open){
    b.onclick=()=>{
      const i=legs.findIndex(l=>l.gi===gi&&l.type===type);
      if(i>=0) legs.splice(i,1); else legs.push({gi,type,line,p0:prob(gi,[{type,line}])});
      opts.onChange();
    };
  }else{
    b.disabled=true;
    b.title="This game has started — picks are locked";
  }
  return b;
}
function legGroups(container,legs,opts){
  const {groups}=slipProb(legs);
  groups.sort((a,b)=>GAMES[a.gi].start.localeCompare(GAMES[b.gi].start));
  const mixed=new Set(groups.map(gr=>lgOf(GAMES[gr.gi]))).size>1;
  groups.forEach(gr=>{
    const G=GAMES[gr.gi], gi=gr.gi;
    const meta=document.createElement("div"); meta.className="gMeta";
    const st=statusOf(G), sc=scoreOf(G);
    meta.textContent=whenShort(G)+(mixed?` · ${LEAGUE_NAME[lgOf(G)]}`:"")
      +(sc?` · ${shortName(G,G.away)} ${sc.a} – ${shortName(G,G.home)} ${sc.h}`:"");
    if(st!=="upcoming"){
      const c=document.createElement("span"); c.className="hChip"+(st==="final"?" fin":"");
      c.style.marginLeft="8px"; c.textContent=st==="final"?"Final":"In Progress"; meta.appendChild(c);
    }
    container.appendChild(meta);

    const grid=document.createElement("div"); grid.className="gcard"+(st==="upcoming"?"":" locked");
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
    if(opts.na&&st==="upcoming"){
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
  /* legs whose game has finished are settled facts, not probabilities. They come
     out of the math; what's left is the chance the games still being played hit. */
  const {live,done}=splitLegs(S.legs), lost=done.filter(d=>d.r==="lost").length;
  const {joint}=slipProb(live);
  if(done.length){
    const won=done.filter(d=>d.r==="won").length;
    if(lost){
      set("bigProb","0%"); set("bigSub",`${lost} leg${lost>1?"s":""} lost — this slip is done`);
      v.className="verdict neg"; v.textContent="Lost";
      set("why",`${won} of ${done.length} settled leg${done.length>1?"s":""} won, but a parlay needs every one.`);
    }else if(live.length){
      set("bigProb",pct(joint)); set("bigSub",`${won} leg${won>1?"s":""} in — chance the other ${live.length} land`);
      v.className="verdict mid"; v.textContent="Still alive";
      set("why",`Everything settled so far has won. That number is the rest of the slip, not the whole thing.`);
    }else{
      set("bigProb","Hit"); set("bigSub","every leg landed");
      v.className="verdict pos"; v.textContent="Won";
      set("why",pay?`$1 on this paid ${money(pay.dec)}.`:"");
    }
    ["oBook","oBreak","oFair","oEv"].forEach(id=>set(id,"—"));
    set("stressOut","");
    return;
  }
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

