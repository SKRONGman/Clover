/* ---- the board: one row per game, Winner / Spread / Total, away team on top, Lines at the end.
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
  /* the full name where it fits, the abbreviation where it would not (clover.css swaps them at 800px) - never wrapped */
  return `<div class="tm"><span class="lg">${tile}</span>${rank?`<span class="rk">${rank}</span>`:""}<span class="nm" title="${esc(team)}">${esc(team)}</span><span class="ab" aria-hidden="true">${esc(abbrOf(G,team))}</span>${pts!=null?`<b class="sc">${pts}</b>`:""}</div>`;
}
/* day=true (the full My Bet screen): the slip spans days, so the time carries its weekday */
function boardRow(G,gi,day){
  const st=statusOf(G), when=(day?DAYS[new Date(G.start).getDay()]+" ":"")+new Date(G.start).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const tag=st==="final"?`<span class="fin">Final</span>`:st==="live"?`<span class="fin live">Live</span>`:"";
  /* the Lines button opens the ladder for this game (row 5); a game that has kicked off has no table to ladder */
  const lad=st==="upcoming"?`<button type="button" class="lnB" data-lad="${gi}" aria-label="Every line for ${esc(shortName(G,G.away))} at ${esc(shortName(G,G.home))}"><span>Lines</span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`:`<span class="lnB"></span>`;
  return `<div class="gr${st==="upcoming"?"":" done"}" data-gi="${gi}"><div class="tt">${esc(when)}${tag}</div><div class="lines">`
    +`<div class="tl">${teamCell(G,G.away)}${boardCell(gi,"awayML")}${boardCell(gi,"awaySp")}${boardCell(gi,"over")}</div>`
    +`<div class="tl">${teamCell(G,G.home)}${boardCell(gi,"homeML")}${boardCell(gi,"homeSp")}${boardCell(gi,"under")}</div></div>${lad}</div>`;
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
  out.innerHTML=`<div class="bh"><span class="tt"></span><div class="tl"><span></span><span>Winner</span><span>Spread</span><span>Total</span></div><span class="lnB"></span></div>`+lined.map(x=>boardRow(x.G,x.gi)).join("");
  out.querySelectorAll(".bc").forEach(b=>{ b.onclick=()=>toggleLeg(+b.dataset.gi,b.dataset.type); });
  out.querySelectorAll("[data-lad]").forEach(b=>{ b.onclick=()=>openLadder(+b.dataset.lad); b.classList.toggle("on",!!LADDER&&LADDER.gi===+b.dataset.lad); });
}

/* the full My Bet screen is in mybet.js (row 6): it draws picks with boardRow above -
   the old third drawing of a game (gcard / cellFor / legGroups) is gone. */
