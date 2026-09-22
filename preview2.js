/* ---- the board: one row per game, Winner / Spread / Total, away team on top.
   Spread and total buttons show the LINE at market (every spread and total sits at
   48-52% there, so the % was noise); the chance appears once the number differs
   from the market line - a held pick that was moved on the line sheet. Winner
   always shows its chance. Every % is a table lookup (DESIGN.md, row 3). ---- */
function boardCell(gi,type){
  const G=GAMES[gi], held=S.legs.find(l=>l.gi===gi&&l.type===type), open=isOpen(G), ok=offered(gi,type);
  const line=held?held.line:(hasLine(type)?marketLine(G,type):0), p=prob(gi,[{type,line}]);
  const moved=held&&hasLine(type)&&line!==marketLine(G,type);
  let main=!hasLine(type)?pct(p):legMarket(type)==="Spread"?fmtSp(line):(type==="over"?"O ":"U ")+line;
  if(moved) main+=`<small>${pct(p)}</small>`;
  const res=held?settleLeg(G,held):null;
  return `<button type="button" class="bc${ok?"":" na"}${res?" "+res:""}" data-gi="${gi}" data-type="${type}" aria-pressed="${!!held}"`
    +` aria-label="${esc(legLabel(G,{type,line}))} - ${pct(p)}"${open?"":" disabled"}>${main}${res?`<small>${res.toUpperCase()}</small>`:""}</button>`;
}
function teamCell(G,team){
  const rank=team===G.home?G.home_rank:G.away_rank, sc=scoreOf(G), pts=sc?(team===G.home?sc.h:sc.a):null;
  const c=teamColor(team), tile=LOGOS[team]?`<img src="${esc(LOGOS[team])}" alt="" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><i style="background:${c};display:none">${esc(initials(team))}</i>`:`<i style="background:${c}">${esc(initials(team))}</i>`;
  return `<div class="tm"><span class="lg">${tile}</span>${rank?`<span class="rk">${rank}</span>`:""}<span class="nm">${esc(team)}</span>${pts!=null?`<b class="sc">${pts}</b>`:""}</div>`;
}
function boardRow(G,gi){
  const st=statusOf(G), when=new Date(G.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const tag=st==="final"?`<span class="fin">Final</span>`:st==="live"?`<span class="fin live">Live</span>`:"";
  return `<div class="gr${st==="upcoming"?"":" done"}" data-gi="${gi}"><div class="tt">${esc(when)}${tag}</div><div class="lines">`
    +`<div class="tl">${teamCell(G,G.away)}${boardCell(gi,"awayML")}${boardCell(gi,"awaySp")}${boardCell(gi,"over")}</div>`
    +`<div class="tl">${teamCell(G,G.home)}${boardCell(gi,"homeML")}${boardCell(gi,"homeSp")}${boardCell(gi,"under")}</div></div></div>`;
}
function boardTitle(){
  const f=FILTERS[league], k=f.date==="today"?defaultDayKey(league):f.date;
  if(f.date==="weekend") return "This weekend";
  if(f.date==="all") return "All games";
  if(!k) return "Games";
  const [y,m,d]=k.split("-").map(Number), dt=new Date(y,m-1,d);
  return dt.toLocaleDateString([],{weekday:"long",month:"short",day:"numeric"});
}
function renderGames(){
  const out=document.getElementById("games"), all=GAMES.filter(G=>onBoard(G)&&lgOf(G)===league).length, lined=filteredGames(league);
  document.getElementById("gamesTitle").textContent=boardTitle();
  document.getElementById("gamesCount").textContent=all?`${lined.length} game${lined.length===1?"":"s"}`:"";
  if(!all){ out.innerHTML=`<p class="empty">No ${LEAGUE_NAME[league]} games with lines yet - they load closer to game day.</p>`; return; }
  if(!lined.length){ out.innerHTML=`<p class="empty">No ${LEAGUE_NAME[league]} games match these filters. ${esc(filterBlame(league))}</p>`; return; }
  out.innerHTML=`<div class="bh"><span class="tt"></span><div class="tl"><span></span><span>Winner</span><span>Spread</span><span>Total</span></div></div>`+lined.map(x=>boardRow(x.G,x.gi)).join("");
  out.querySelectorAll(".bc").forEach(b=>{ b.onclick=()=>toggleLeg(+b.dataset.gi,b.dataset.type); });
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
      if(i>=0) legs.splice(i,1); else swapIn(legs,gi,type,line);          /* ruling 4: one pick per pick type per game */
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
      container.appendChild(t);
    }
  });
}

/* ---- the full My Bet screen (row 6 rebuilds it; restyled only, no function change) ---- */
function renderCard(){
  const n=S.legs.length, legsEl=document.getElementById("legs");
  legsEl.innerHTML="";
  const paysIn=document.getElementById("pays"), pay=payoutFor();
  document.getElementById("who").value=S.who;
  if(document.activeElement!==paysIn) paysIn.value=S.pays!=null?S.pays:"";
  document.getElementById("paysNote").textContent = pay ? "Using the payout you typed." : "Type what your app shows for this slip. Clover gives no verdict until you do — it won't guess a payout.";
  const set=(id,v)=>document.getElementById(id).textContent=v;
  const v=document.getElementById("verdict");
  if(!n){
    set("bigProb","—"); set("bigSub","Add picks from NCAA Slips or NFL Slips"); v.textContent=""; set("why","");
    ["oBook","oBreak","oFair","oEv"].forEach(id=>set(id,"—")); set("stressOut","");
    legsEl.innerHTML=`<p class="empty">No picks yet.</p>`; return;
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
  if(!pay){ v.textContent=""; set("why","Type your app's payout below to get a verdict."); ["oBook","oBreak","oFair","oEv"].forEach(id=>set(id,"—")); set("stressOut","Needs the payout first."); return; }
  const dec=pay.dec, ev=joint*dec-1, g=grade(ev), cents=Math.round(Math.abs(ev)*100);
  v.className="verdict "+g.cls; v.textContent=g.word;
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
    <p class="small" style="margin:10px 0 0">"Fair pays" is what $1 on that line deserves to pay if it hits, by our numbers. "DK pays" is DraftKings' real price for that exact line, and "DK's chance" is what their price implies once their cut is removed — a second opinion from a real book. If your app pays more than DK for the same move, that's a good deal. Whole numbers can push — prefer the half-point.${G.alt?"":` <b>No DraftKings alternate lines for this game yet</b> — they load Thursdays.`}</p>`;
  const dlg=document.getElementById("sheet");
  box.querySelector(".close").onclick=()=>dlg.close();
  box.querySelectorAll("tr[data-l]").forEach(tr=>tr.querySelector(".use").onclick=()=>{ l.line=+tr.dataset.l; dlg.close(); onChange(); });
  dlg.showModal();
  const cur=box.querySelector("tr.cur"); if(cur) cur.scrollIntoView({block:"center"});
}
document.getElementById("sheet").addEventListener("click",e=>{ if(e.target.id==="sheet") e.target.close(); });

