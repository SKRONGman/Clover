/* ===================================================================
   NFL PROPS - the tab (props phase step one, rulings 1-5 of 2026-09-27).
   Danny types the number HIS app offers; Clover reads the chance out of the
   ladder props.py shipped in props.js. The page does no math: the chance is
   P[(number - lo) / step], exactly like every other % in Clover.

   Props-only slips (Danny, 2026-10-17): a prop never shares a slip with a
   winner/spread/total pick. Same-game props are allowed but warn.
   Anytime TD is Yes-only, so it has no number to type.
   =================================================================== */
const PROP_NAME={pass_yds:"Pass yds",pass_tds:"Pass TDs",rush_yds:"Rush yds",
                 rec_yds:"Rec yds",rec:"Receptions",any_td:"Anytime TD"};
const PROP_ORDER=["any_td","pass_yds","pass_tds","rush_yds","rec_yds","rec"];
/* Prop types in two levels: a group row, and the markets of whichever groups are
   lit. Built to grow - when props.py starts shipping combos, defence or kicking,
   add the market to PROP_GROUPS and it appears. A market no group claims lands in
   "Other" by itself, so a new market can never go missing off the board. */
const PROP_GROUPS=[{k:"pass",label:"Passing",   m:["pass_yds","pass_tds"]},
                   {k:"rush",label:"Rushing",   m:["rush_yds"]},
                   {k:"recv",label:"Receiving", m:["rec_yds","rec"]},
                   {k:"td",  label:"Touchdowns",m:["any_td"]}];
const mName=m=>PROP_NAME[m]||String(m).replace(/_/g," ");
/* Prop type is a heading inside the game card, not a column on every row
   (Danny's sketch, 2026-10-18). Anytime TD opens shut: it is 24 players on a
   card with no number to type, and it is 44% of the board. */
const PROP_CLOSED=new Set(["any_td"]);
let PSEC={};             /* "gameId|market" -> open, once tapped */
let PSLIP=[];            /* the props slip: {gid,m,who,num,p} */
let PQ="";               /* player search box */
let PON=new Set();       /* prop types switched on. empty = every type */
let PPAYOUT=null, PSTAKE=null;

const propsData=()=>(window.PROPS&&window.PROPS.games)||[];
const propKey=r=>`${r.gid}|${r.m}|${r.who}`;

/* ------------------------------------------------- a finished game is gone */
/* Danny, 2026-10-18: props may stay up after kickoff, but once the game is
   OVER the card goes. Two signals, whichever lands first:
     - the slate says final. props ids ARE the odds-api event ids, the same ids
       the NFL slate carries, so a props game looks itself up in R.upcoming.
       Exact, but only as fresh as the last refresh commit.
     - kickoff + PROP_OVER_H hours. Needs no data and no refresh, so it still
       clears the board on a night when nothing runs.
   A game already graded has left the slate; the clock covers that too. */
const PROP_OVER_H=4;
function propGameOver(g,now){
  const t=Date.parse(g.kick);
  if(isFinite(t)&&(now||Date.now())-t>=PROP_OVER_H*3600e3) return true;
  const slate=(window.R&&window.R.upcoming)||[];
  const m=slate.find(x=>String(x.id)===String(g.id));
  return !!(m&&m.status==="final");
}

/* The one lookup. Returns the over/yes chance at `num`, or null if the number
   is off the end of the ladder props.py shipped. No math, just an index. */
function propChance(row,num){
  if(row.m==="any_td") return row.yes/1000;
  if(num==null||!isFinite(num)) return null;
  const i=Math.round((num-row.lo)/row.step);
  if(i<0||i>=row.p.length) return null;
  return row.p[i]/1000;
}

/* A props slip's chance: picks are treated as independent unless two sit on
   the same game, which is why those warn. Same convention as prob(). */
function pslipChance(){
  if(!PSLIP.length) return null;
  return PSLIP.reduce((a,x)=>a*x.p,1);
}
function pslipSameGame(){
  const seen={}; let n=0;
  PSLIP.forEach(x=>{ if(seen[x.gid]) n++; seen[x.gid]=1; });
  return n;
}

function propGames(){
  const q=PQ.trim().toLowerCase(), now=Date.now();
  return propsData().filter(g=>!propGameOver(g,now)).map(g=>{
    let rows=g.props||[];
    if(q) rows=rows.filter(r=>r.who.toLowerCase().includes(q));
    if(PON.size) rows=rows.filter(r=>PON.has(r.m));
    return {...g,props:rows};
  }).filter(g=>g.props.length);
}
/* every game still on the board - finished ones are not "filtered out", they
   are gone, so they must not be counted in the chips or the N-of-M line */
const propLive=()=>{const now=Date.now();return propsData().filter(g=>!propGameOver(g,now));};
const propTotal=()=>propLive().reduce((a,g)=>a+(g.props||[]).length,0);

/* ------------------------------------------------------------- prop filters */
/* every market actually in the file, known ones in PROP_ORDER, new ones after */
function propMarkets(){
  const seen=[];
  propLive().forEach(g=>(g.props||[]).forEach(r=>{ if(!seen.includes(r.m)) seen.push(r.m); }));
  return seen.sort((a,b)=>{const i=PROP_ORDER.indexOf(a),j=PROP_ORDER.indexOf(b);
    return (i<0?99:i)-(j<0?99:j)||a.localeCompare(b);});
}
/* the groups worth drawing: only those with a market on today's board */
function propGroups(){
  const have=propMarkets(), out=[], placed={};
  PROP_GROUPS.forEach(g=>{ const m=g.m.filter(x=>have.includes(x));
    if(m.length){ m.forEach(x=>placed[x]=1); out.push({k:g.k,label:g.label,m}); } });
  const rest=have.filter(x=>!placed[x]);
  if(rest.length) out.push({k:"other",label:"Other",m:rest});
  return out;
}
/* how many props sit behind each chip, after the player search only */
function propCounts(){
  const q=PQ.trim().toLowerCase(), c={};
  propLive().forEach(g=>(g.props||[]).forEach(r=>{
    if(q&&!r.who.toLowerCase().includes(q)) return;
    c[r.m]=(c[r.m]||0)+1; }));
  return c;
}
function propFilterHtml(){
  const G=propGroups(); if(G.length<2) return "";
  const c=propCounts(), tot=G.reduce((a,g)=>a+g.m.reduce((b,m)=>b+(c[m]||0),0),0);
  const on=g=>g.m.some(m=>PON.has(m)), full=g=>g.m.every(m=>PON.has(m));
  const chip=(d,lab,lit,n,part)=>`<button type="button" class="chip${part?" part":""}" ${d}`
    +` aria-pressed="${lit}"${n?"":" disabled"}>${esc(lab)} <span class="n">${n||0}</span></button>`;
  let h=`<div class="chips">`+chip(`data-pg="all"`,"All",PON.size===0,tot)
    +G.map(g=>chip(`data-pg="${g.k}"`,g.label,on(g),
        g.m.reduce((a,m)=>a+(c[m]||0),0),on(g)&&!full(g))).join("")+`</div>`;
  const open=G.filter(g=>g.m.length>1&&on(g));
  if(open.length) h+=`<div class="chips sub">`
    +open.map(g=>g.m.map(m=>chip(`data-pm="${m}"`,mName(m),PON.has(m),c[m]||0)).join("")).join("")
    +`</div>`;
  return `<div class="pfilt">${h}</div>`;
}
/* a half-lit group fills; a full one clears. One state: PON, the markets. */
function propGroupToggle(k){
  if(k==="all"){ PON=new Set(); renderProps(); return; }
  const g=propGroups().find(x=>x.k===k); if(!g) return;
  const full=g.m.every(m=>PON.has(m));
  g.m.forEach(m=>full?PON.delete(m):PON.add(m));
  renderProps();
}

function propRowHtml(g,r){
  const k=propKey({gid:g.id,m:r.m,who:r.who});
  const picked=PSLIP.find(x=>propKey(x)===k);
  const isTd=r.m==="any_td";
  const typed=picked?picked.num:null;
  /* nothing typed = price the book's own line, which is the field's placeholder.
     An empty Chance column would make the whole board read as dashes on open. */
  const shown=isTd?r.yes/1000:propChance(r,typed==null?r.line:typed);
  const off=!isTd&&typed!=null&&shown==null;
  return `<tr class="prow${picked?" on":""}">`
    +`<td class="who">${esc(r.who)}</td>`
    +`<td class="dk">${isTd?"Yes":"DK "+r.line}</td>`
    +`<td class="num">${isTd?`<span class="na">—</span>`
        :`<input type="text" inputmode="decimal" class="pnum" data-k="${esc(k)}" value="${typed==null?"":typed}" placeholder="${r.line}" aria-label="Your app's number for ${esc(r.who)} ${PROP_NAME[r.m]}">`}</td>`
    +`<td class="pc">${off?`<span class="warn">off the board</span>`:pct(shown)}</td>`
    +`<td class="act"><button type="button" class="mini${picked?" on":""}" data-add="${esc(k)}"`
    +` aria-label="${picked?"Remove":"Add"} ${esc(r.who)} ${PROP_NAME[r.m]}">${picked?"Remove":"Add"}</button></td></tr>`;
}

/* open unless it is a closed-by-default type - but a search or a chip that
   names the type opens it, or the hits would hide inside a shut heading */
function propSecOpen(gid,m){
  const k=gid+"|"+m;
  if(k in PSEC) return PSEC[k];
  if(PQ.trim()||PON.has(m)) return true;
  return !PROP_CLOSED.has(m);
}
function propGameHtml(g){
  const d=new Date(g.kick);
  const when=`${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()} `
    +d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const by={};
  g.props.forEach(r=>{ (by[r.m]=by[r.m]||[]).push(r); });
  const mks=Object.keys(by).sort((a,b)=>{const i=PROP_ORDER.indexOf(a),j=PROP_ORDER.indexOf(b);
    return (i<0?99:i)-(j<0?99:j)||a.localeCompare(b);});
  const body=mks.map(m=>{
    const open=propSecOpen(g.id,m), k=esc(g.id+"|"+m);
    const head=`<tr class="psec"><td colspan="5"><button type="button" class="sech"`
      +` data-sec="${k}" aria-expanded="${open}">`
      +`<span class="car">${open?"\u25be":"\u25b8"}</span>${esc(mName(m))}`
      +`<span class="n">${by[m].length}</span></button></td></tr>`;
    if(!open) return head;
    return head+by[m].slice().sort((x,y)=>x.who.localeCompare(y.who))
      .map(r=>propRowHtml(g,r)).join("");
  }).join("");
  return `<section class="pgame"><h3>${esc(g.away)} at ${esc(g.home)}<span class="when">${esc(when)}</span></h3>`
    +`<div class="tscroll"><table class="ptab"><thead><tr><th>Player</th><th>Book</th>`
    +`<th>My app</th><th>Chance</th><th></th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function propSlipHtml(){
  if(!PSLIP.length) return `<p class="hint">No props yet. Type the number your app offers, then Add.</p>`;
  const same=pslipSameGame(), p=pslipChance();
  const legs=PSLIP.map((x,i)=>`<li>${esc(x.who)} <span class="mk">${PROP_NAME[x.m]}</span>`
    +`${x.m==="any_td"?"":` <span class="ln">${x.num>=0?"o":""}${x.num}</span>`}`
    +` <span class="p">${pct(x.p)}</span>`
    +`<button type="button" class="x" data-drop="${i}" aria-label="Drop ${esc(x.who)}">&times;</button></li>`).join("");
  const warn=same?`<p class="warn">${same} pick${same>1?"s":""} from a game you already used. Props on the same game move together, so the real chance is higher than the number above — treat it as a floor.</p>`:"";
  let verdict="";
  if(PPAYOUT&&PSTAKE&&p!=null){
    const ev=(p*PPAYOUT-PSTAKE)/PSTAKE, G=grade(ev);
    verdict=`<p class="verdict ${G.cls}"><b>${G.word}</b> — ${esc(G.why)}`
      +` <span class="sub">${pct(p)} to hit · pays ${(PPAYOUT/PSTAKE).toFixed(2)}x · needs ${pct(PSTAKE/PPAYOUT)}</span></p>`;
  }
  return `<ul class="plegs">${legs}</ul>`
    +`<p class="ptot">${PSLIP.length} pick${PSLIP.length>1?"s":""} · <b>${pct(p)}</b> to hit all</p>`
    +warn
    +`<div class="prow2"><label>Stake <input type="text" inputmode="decimal" id="pStake" value="${PSTAKE==null?"":PSTAKE}" placeholder="10"></label>`
    +`<label>Pays <input type="text" inputmode="decimal" id="pPay" value="${PPAYOUT==null?"":PPAYOUT}" placeholder="26.35"></label></div>`
    +verdict
    +`<button type="button" class="ghost" id="pClear">Clear</button>`;
}

function renderProps(){
  const host=document.getElementById("viewProps");
  if(!host) return;
  const data=propLive();
  if(window.PROPS&&propsData().length&&!data.length){
    host.innerHTML=`<div class="phead"><h2>NFL Props</h2></div>`
      +`<p class="hint">Every game Clover priced today is over. The next slate's props `
      +`are pulled on game day — a morning sweep, then about two hours and about `
      +`fifteen minutes before each kickoff.</p>`;
    return;
  }
  if(!window.PROPS||!data.length){
    host.innerHTML=`<p class="hint">No NFL props loaded yet. They are pulled on game day — `
      +`a morning sweep, then about two hours and about fifteen minutes before each kickoff.</p>`;
    return;
  }
  const games=propGames();
  const shown=games.reduce((a,g)=>a+g.props.length,0), all=propTotal();
  const when=window.PROPS.updated
    ?`Props updated ${new Date(window.PROPS.updated).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})}`:"";
  const q=PQ.trim();
  const none=`<p class="hint">Nothing matches ${PON.size?"those prop types":""}`
    +`${PON.size&&q?" and ":""}${q?`“${esc(q)}”`:""}.</p>`;
  host.innerHTML=`<div class="phead"><h2>NFL Props</h2><span class="stamp">${esc(when)}</span></div>`
    +`<p class="hint">Clover prices the number <b>your app</b> offers, not the book's. Type it in.</p>`
    +`<input type="search" id="pSearch" class="psearch" value="${esc(PQ)}" placeholder="Search a player" aria-label="Search a player">`
    +propFilterHtml()
    +`<p class="fcount">${shown===all?`${all} props · ${games.length} game${games.length===1?"":"s"}`
        :`${shown} of ${all} props · ${games.length} game${games.length===1?"":"s"}`}</p>`
    +(games.length?games.map(propGameHtml).join(""):none)
    +`<aside class="pslip"><h3>Props slip</h3>${propSlipHtml()}</aside>`;
}

/* ------------------------------------------------------------------ events */
function propFind(k){
  for(const g of propLive())
    for(const r of (g.props||[]))
      if(propKey({gid:g.id,m:r.m,who:r.who})===k) return {g,r};
  return null;
}
function propToggle(k){
  const i=PSLIP.findIndex(x=>propKey(x)===k);
  if(i>=0){ PSLIP.splice(i,1); renderProps(); return; }
  const f=propFind(k); if(!f) return;
  const inp=document.querySelector(`.pnum[data-k="${CSS.escape(k)}"]`);
  const num=f.r.m==="any_td"?null:parseFloat(inp&&inp.value!==""?inp.value:f.r.line);
  const p=propChance(f.r,num);
  if(p==null) return;
  PSLIP.push({gid:f.g.id,m:f.r.m,who:f.r.who,num,p});
  renderProps();
}
function propsClick(e){
  const sc=e.target.closest("[data-sec]");
  if(sc){ const k=sc.dataset.sec, g=k.split("|")[0], m=k.slice(g.length+1);
    PSEC[k]=!propSecOpen(g,m); renderProps(); return; }
  const pg=e.target.closest("[data-pg]"); if(pg){ propGroupToggle(pg.dataset.pg); return; }
  const pm=e.target.closest("[data-pm]");
  if(pm){ const m=pm.dataset.pm; PON.has(m)?PON.delete(m):PON.add(m); renderProps(); return; }
  const a=e.target.closest("[data-add]"); if(a){ propToggle(a.dataset.add); return; }
  const d=e.target.closest("[data-drop]"); if(d){ PSLIP.splice(+d.dataset.drop,1); renderProps(); return; }
  if(e.target.id==="pClear"){ PSLIP=[]; PPAYOUT=PSTAKE=null; renderProps(); }
}
function propsInput(e){
  const t=e.target;
  if(t.classList&&t.classList.contains("pnum")){
    const f=propFind(t.dataset.k); if(!f) return;
    const i=PSLIP.findIndex(x=>propKey(x)===t.dataset.k);
    const num=parseFloat(t.value);
    const cell=t.closest("tr").querySelector(".pc");
    const p=propChance(f.r,num);
    /* cleared the field: fall back to the book's line, same as the first draw */
    const back=t.value===""?propChance(f.r,f.r.line):p;
    if(cell) cell.innerHTML=(t.value!==""&&p==null)?`<span class="warn">off the board</span>`:pct(back);
    if(i>=0&&p!=null){ PSLIP[i].num=num; PSLIP[i].p=p;
      const host=document.querySelector(".pslip"); if(host) host.innerHTML=`<h3>Props slip</h3>${propSlipHtml()}`; }
    return;
  }
  if(t.id==="pSearch"){ PQ=t.value; const s=t.selectionStart; renderProps();
    const n=document.getElementById("pSearch"); if(n){ n.focus(); n.setSelectionRange(s,s); } return; }
  if(t.id==="pStake"||t.id==="pPay"){
    const v=parseFloat(t.value); const ok=isFinite(v)&&v>0;
    if(t.id==="pStake") PSTAKE=ok?v:null; else PPAYOUT=ok?v:null;
    const host=document.querySelector(".pslip");
    if(host){ host.innerHTML=`<h3>Props slip</h3>${propSlipHtml()}`;
      const n=document.getElementById(t.id); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } }
  }
}
