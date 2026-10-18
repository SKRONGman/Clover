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
let PSLIP=[];            /* the props slip: {gid,m,who,num,p} */
let PQ="";               /* player search box */
let PPAYOUT=null, PSTAKE=null;

const propsData=()=>(window.PROPS&&window.PROPS.games)||[];
const propKey=r=>`${r.gid}|${r.m}|${r.who}`;

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
  const q=PQ.trim().toLowerCase();
  return propsData().map(g=>{
    let rows=g.props||[];
    if(q) rows=rows.filter(r=>r.who.toLowerCase().includes(q));
    return {...g,props:rows};
  }).filter(g=>g.props.length);
}

function propRowHtml(g,r){
  const k=propKey({gid:g.id,m:r.m,who:r.who});
  const picked=PSLIP.find(x=>propKey(x)===k);
  const isTd=r.m==="any_td";
  const typed=picked?picked.num:null;
  const shown=isTd?r.yes/1000:propChance(r,typed);
  const off=!isTd&&typed!=null&&shown==null;
  return `<tr class="prow${picked?" on":""}">`
    +`<td class="who">${esc(r.who)}</td>`
    +`<td class="mk">${PROP_NAME[r.m]}</td>`
    +`<td class="dk">${isTd?"Yes":"DK "+r.line}</td>`
    +`<td class="num">${isTd?`<span class="na">—</span>`
        :`<input type="text" inputmode="decimal" class="pnum" data-k="${esc(k)}" value="${typed==null?"":typed}" placeholder="${r.line}" aria-label="Your app's number for ${esc(r.who)} ${PROP_NAME[r.m]}">`}</td>`
    +`<td class="pc">${off?`<span class="warn">off the board</span>`:pct(shown)}</td>`
    +`<td class="act"><button type="button" class="mini${picked?" on":""}" data-add="${esc(k)}"`
    +` aria-label="${picked?"Remove":"Add"} ${esc(r.who)} ${PROP_NAME[r.m]}">${picked?"Remove":"Add"}</button></td></tr>`;
}

function propGameHtml(g){
  const d=new Date(g.kick);
  const when=`${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()} `
    +d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const rows=g.props.slice()
    .sort((a,b)=>PROP_ORDER.indexOf(a.m)-PROP_ORDER.indexOf(b.m)||a.who.localeCompare(b.who))
    .map(r=>propRowHtml(g,r)).join("");
  return `<section class="pgame"><h3>${esc(g.away)} at ${esc(g.home)}<span class="when">${esc(when)}</span></h3>`
    +`<table class="ptab"><thead><tr><th>Player</th><th>Prop</th><th>Book</th>`
    +`<th>My app</th><th>Chance</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`;
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
  const data=propsData();
  if(!window.PROPS||!data.length){
    host.innerHTML=`<p class="hint">No NFL props loaded yet. They are pulled on game day — `
      +`a morning sweep, then about two hours and about fifteen minutes before each kickoff.</p>`;
    return;
  }
  const games=propGames();
  const when=window.PROPS.updated
    ?`Props updated ${new Date(window.PROPS.updated).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"})}`:"";
  host.innerHTML=`<div class="phead"><h2>NFL Props</h2><span class="stamp">${esc(when)}</span></div>`
    +`<p class="hint">Clover prices the number <b>your app</b> offers, not the book's. Type it in.</p>`
    +`<input type="search" id="pSearch" class="psearch" value="${esc(PQ)}" placeholder="Search a player" aria-label="Search a player">`
    +(games.length?games.map(propGameHtml).join(""):`<p class="hint">No player matches “${esc(PQ)}”.</p>`)
    +`<aside class="pslip"><h3>Props slip</h3>${propSlipHtml()}</aside>`;
}

/* ------------------------------------------------------------------ events */
function propFind(k){
  for(const g of propsData())
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
    if(cell) cell.innerHTML=(t.value!==""&&p==null)?`<span class="warn">off the board</span>`:pct(p);
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
