/* ===================================================================
   HISTORY (row 8, 2026-09-26). Built from the approved mockup:
   https://claude.ai/artifact/PufiYFbfdgymMATGfNsYfh  (Danny: ledger, tap a row for its card)
   - Reads bets + picks from Supabase, signed in like Save bet (record.js).
     Everything on this screen is that table read back: the page grades nothing.
   - History grades, it never steers: nothing here feeds the slips (ruling 2 of 2026-09-20).
   - Numbers only for now; a bet's written recap shows when `recap` is filled in (deferred).
   - Voided bets are hidden until "Show voided" (greyed, never deleted).
   - "Clover's accuracy on every game" is R.scorecard, boiled down from results.json
     by refresh.py (grading.py). A report card, not a tuning knob.
   =================================================================== */
let HIST={rows:null,at:0,err:"",who:"all",lg:"all",voided:false,open:{},busy:false};
const HIST_TTL=60e3;
const num=v=>v==null?null:+v;

async function loadHistory(force){
  if(!sbSession()){ HIST.rows=null; renderHistory(); return; }
  if(!force&&HIST.rows&&Date.now()-HIST.at<HIST_TTL) { renderHistory(); return; }
  HIST.busy=true; renderHistory();
  try{
    const r=await sbCall("/rest/v1/bets?select=*,picks(*)&order=bet_no.desc",{method:"GET"});
    if(r.signin){ HIST.rows=null; HIST.err=""; }
    else if(r.ok){ HIST.rows=r.j||[]; HIST.at=Date.now(); HIST.err=""; }
    else HIST.err=r.status===403?`${sbSession()?.email||"This email"} isn't on Clover's members list, so there is nothing to show. Ask Danny to add it.`:"Couldn't load your bets. Check your connection and try again.";
  }catch(e){ HIST.err="Couldn't reach Clover's bet record. Check your connection and try again."; }
  HIST.busy=false; renderHistory();
}

/* ---- one bet, worked out ---- */
function betInfo(b){
  const picks=(b.picks||[]).slice().sort((a,c)=>a.kickoff<c.kickoff?-1:1);
  const pays=num(b.pays), stake=num(b.stake), payout=num(b.payout);
  const results=picks.map(p=>p.result||null), graded=picks.length>0&&results.every(Boolean);
  const res=b.voided_at?"void":b.slip_result||(graded?(results.includes("miss")?"lost":results.every(r=>r==="hit")?"won":"push"):"open");
  const net=stake==null||payout==null?null:res==="won"?payout-stake:res==="lost"?-stake:res==="push"?0:null;
  const pk=picks.map(p=>{
    const t=p.hp==null||p.ap==null?null:p.hp+p.ap, m=t==null?null:p.hp-p.ap;
    const v=t==null?null:legVal(p.type,p.type.endsWith("ML")?0:num(p.line),t,m);
    return Object.assign({},p,{chance:num(p.chance),close_chance:num(p.close_chance),line:num(p.line),v,
      final:t==null?null:(p.type==="over"||p.type==="under")?`${t} total`:`${p.game.split(" @ ")[0]} ${p.ap} @ ${p.game.split(" @ ")[1]} ${p.hp}`}); });
  const good=/Great|Good/.test(b.verdict)?"good":/Bad|Terrible/.test(b.verdict)?"bad":"toss";
  const sort=res==="won"||res==="lost"?{good:{won:"Good bet · won",lost:"Good bet · bad luck"},bad:{won:"Bad bet · got lucky",lost:"Bad bet · lost"},toss:{won:"Coin toss · won",lost:"Coin toss · lost"}}[good][res]:res==="push"?"Push":"";
  return {b,picks:pk,pays,stake,payout,res,net,graded,sort,good,league:pk[0]?pk[0].league:"ncaaf",
    hits:results.filter(r=>r==="hit").length,misses:results.filter(r=>r==="miss").length,pushes:results.filter(r=>r==="push").length,
    closed:pk.filter(p=>p.beat_close!=null).length,beat:pk.filter(p=>p.beat_close===true).length};
}
function histBets(){
  const all=(HIST.rows||[]).map(betInfo);
  return all.filter(x=>(HIST.who==="all"||x.b.who===HIST.who)&&(HIST.lg==="all"||x.league===HIST.lg)&&(HIST.voided||x.res!=="void"));
}
const wl=(w,l,p)=>`${w}–${l}${p?"–"+p:""}`;
const whenAt=iso=>whenShort({start:iso});
const resWord={won:"Won",lost:"Lost",push:"Push",open:"Open",void:"Voided"};

/* ---- the tiles: record, money, beat the close, Clover on your picks ---- */
function histTiles(B){
  const live=B.filter(x=>x.res!=="void"), done=live.filter(x=>x.graded), open=live.filter(x=>!x.graded);
  const W=done.filter(x=>x.res==="won").length, L=done.filter(x=>x.res==="lost").length, P=done.filter(x=>x.res==="push").length;
  const H=live.reduce((s,x)=>s+x.hits,0), M=live.reduce((s,x)=>s+x.misses,0), PP=live.reduce((s,x)=>s+x.pushes,0);
  const money=done.filter(x=>x.net!=null), net=money.reduce((s,x)=>s+x.net,0), noStake=done.length-money.length, atRisk=open.reduce((s,x)=>s+(x.stake||0),0);
  const closed=live.reduce((s,x)=>s+x.closed,0), beat=live.reduce((s,x)=>s+x.beat,0), noClose=live.reduce((s,x)=>s+x.picks.filter(p=>(p.result==="hit"||p.result==="miss")&&p.beat_close==null).length,0);
  const gp=live.flatMap(x=>x.picks.filter(p=>p.result==="hit"||p.result==="miss")), said=gp.length?gp.reduce((s,p)=>s+p.chance,0)/gp.length:null, hit=gp.length?gp.filter(p=>p.result==="hit").length/gp.length:null;
  const tile=(k,v,s,cls)=>`<div class="tile"><span class="k">${k}</span><span class="v ${cls||""}">${v}</span><span class="s">${s}</span></div>`;
  return `<div class="tiles">
    ${tile("Record",done.length?wl(W,L,P):"—",`slips won–lost${P?"–push":""} · picks ${wl(H,M,PP)}`,W>L?"good":L>W?"bad":"")}
    ${tile("Money",money.length?(net<0?"−":"")+money0(Math.abs(net)):"—",[noStake?`${noStake} settled without a stake`:"",atRisk?`${money0(atRisk)} open`:"",!money.length&&!noStake&&!atRisk?"type a Bet Amount when you save":""].filter(Boolean).join(" · ")||`${money.length} settled bet${money.length>1?"s":""}`,net>0?"good":net<0?"bad":"")}
    ${tile("Beat the close",closed?`${beat} of ${closed}`:"—",`picks priced before kickoff${noClose?` · ${noClose} had no close`:""}`,closed&&beat*2>closed?"good":"")}
    ${tile("Clover on your picks",gp.length?`said ${pct(said)} · hit ${pct(hit)}`:"—",`your ${gp.length} graded pick${gp.length===1?"":"s"} · every game below`,gp.length?"txt":"")}
  </div>`;
}
const money0=d=>"$"+(Math.round(d*100)/100).toFixed(2).replace(/\.00$/,"");

/* ---- the ledger: one row per bet; tap it for the card ---- */
function histPick(p){
  const t=p.type, lab=t==="over"?`O ${p.line}`:t==="under"?`U ${p.line}`:t.endsWith("Sp")?`${p.label.replace(/ [-+][\d.]+$/,"")} ${fmtSp(p.line)}`:p.label.replace(/ to win$/,"")+" ML";
  return `<b>${esc(lab)}</b>${p.result?` <span class="${p.result}">${p.result==="hit"?"&#10003;":p.result==="miss"?"&#10007;":"push"}</span>`:""}`;
}
function ledgerRow(x){
  const b=x.b, cls=x.res==="void"?"void":x.res;
  const d=new Date(b.placed_at);
  return `<tr class="lr ${cls}${HIST.open[b.id]?" on":""}" data-bet="${b.id}" tabindex="0" role="button" aria-expanded="${!!HIST.open[b.id]}">
    <td class="no">#${b.bet_no}<span class="g">${esc(b.who)}</span></td><td class="when">${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}<span class="g">${d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span></td>
    <td class="picks">${x.picks.map(histPick).join(" · ")}</td>
    <td class="hn">${pct1(num(b.chance))} · ${pct1(num(b.needs))}</td>
    <td class="hn">${x.stake!=null&&x.payout!=null?`${money0(x.stake)} → ${money0(x.payout)}`:x.pays?`${x.pays.toFixed(2)}×`:"—"}</td>
    <td class="res"><span class="rw ${cls}">${resWord[x.res]}</span>${x.graded?` <small>${x.hits} of ${x.picks.length}</small>`:x.res==="open"?` <small>${x.hits+x.misses+x.pushes} of ${x.picks.length} final</small>`:""}</td></tr>`;
}
function betCard(x){
  const b=x.b, rows=x.picks.map(p=>{
    const G={start:p.kickoff}, when=whenAt(p.kickoff);
    const close=p.close_chance==null?`<span class="dim">no close${p.result||new Date(p.kickoff)<Date.now()?" (saved after kickoff)":""}</span>`
      :`${pct1(p.close_chance)}${p.close_market!=null?` <span class="dim">(line ${p.type.endsWith("Sp")||p.type.endsWith("ML")?fmtSp(num(p.close_market)):p.close_market})</span>`:""}`;
    const beat=p.beat_close==null?`<span class="dim">—</span>`:p.beat_close?`<span class="hit">Yes</span>`:`<span class="miss">No</span>`;
    const by=p.v==null?"":p.v===0?"push":(p.v>0?"by ":"short by ")+Math.abs(p.v);
    const res=p.result?`<span class="${p.result}">${p.result==="hit"?"Hit":p.result==="miss"?"Miss":"Push"}</span><span class="g">${esc(p.final)}${by?", "+by:""}</span>`
      :new Date(p.kickoff)<Date.now()?`<span class="dim">in play</span>`:`<span class="dim">${kickTime(G)}</span>`;
    return `<tr><td class="pk">${esc(p.label)}<span class="g">${esc(p.game)} · ${when}</span></td><td>${pct1(p.chance)}</td><td class="ck">${close}</td><td>${beat}</td><td class="r">${res}</td></tr>`; });
  const sort=x.sort?`<span class="sort ${x.good}">${x.sort}</span>`:"";
  const money=x.res==="void"?"":x.net!=null?`<span class="hm ${x.net>0?"hit":x.net<0?"miss":""}">${x.net>0?"+":x.net<0?"−":""}${money0(Math.abs(x.net))}</span>`
    :x.stake!=null&&x.payout!=null?`<span class="hm dim">to win ${money0(x.payout-x.stake)}</span>`:`<span class="hm dim">no stake</span>`;
  return `<tr class="lc"><td colspan="6"><div class="bet ${x.res}">
    <table class="bp"><tr><th>Pick</th><th>Chance when saved</th><th>At kickoff</th><th>Beat the close</th><th class="r">Result</th></tr>${rows.join("")}</table>
    <div class="bf"><span>Chance <b>${pct1(num(b.chance))}</b></span><span>Needed <b>${pct1(num(b.needs))}</b></span><span>Verdict <b>${esc(b.verdict)}</b></span><span>Pays <b>${x.pays?x.pays.toFixed(2)+"×":"—"}</b></span>${sort}${money}</div>
    ${b.recap?`<p class="recap">${esc(b.recap)}</p>`:""}${x.res==="void"?`<p class="hint">Voided ${whenAt(b.voided_at)}. Left out of every number above.</p>`:""}
  </div></td></tr>`;
}

/* ---- habits: by pick type, slip size, who ---- */
function habitsHtml(B){
  const live=B.filter(x=>x.res!=="void"), P=live.flatMap(x=>x.picks.map(p=>Object.assign({slip:x},p)));
  const ps=picks=>{ const h=picks.filter(p=>p.result==="hit").length, m=picks.filter(p=>p.result==="miss").length, c=picks.filter(p=>p.beat_close!=null).length, b=picks.filter(p=>p.beat_close===true).length;
    return [h||m?wl(h,m):`<span class="dim">${picks.length?picks.length+" open":"—"}</span>`,c?`${b} of ${c}`:`<span class="dim">—</span>`]; };
  const ss=slips=>{ const d=slips.filter(x=>x.graded), w=d.filter(x=>x.res==="won").length, l=d.filter(x=>x.res==="lost").length;
    return d.length?wl(w,l,d.length-w-l):`<span class="dim">${slips.length?slips.length+" open":"—"}</span>`; };
  const row=(name,slips,picks)=>{ const [pk,bc]=ps(picks); return `<tr><td>${name}</td><td>${slips===null?`<span class="dim">—</span>`:ss(slips)}</td><td>${pk}</td><td>${bc}</td></tr>`; };
  const types=[["Totals",p=>legMarket(p.type)==="Total"],["Spreads",p=>legMarket(p.type)==="Spread"],["Winners",p=>legMarket(p.type)==="Winner"]];
  const sizes=[...new Set(live.map(x=>x.picks.length))].sort((a,b)=>a-b);
  return `<div class="card"><h3>Habits</h3><table class="hb"><tr><th></th><th>Slips</th><th>Picks</th><th>Beat close</th></tr>
    ${types.map(([n,f])=>row(n,null,P.filter(f))).join("")}
    ${sizes.map(n=>row(`${n}-pick slips`,live.filter(x=>x.picks.length===n),P.filter(p=>p.slip.picks.length===n))).join("")}
    ${["Danny","Jaclyn"].map(w=>row(w,live.filter(x=>x.b.who===w),P.filter(p=>p.slip.b.who===w))).join("")}
  </table></div>`;
}
function scorecardHtml(){
  const sc=R&&R.scorecard; if(!sc||!sc.games) return `<div class="card"><h3>Clover's accuracy on every game it priced</h3><p class="hint">Nothing graded yet. Every game Clover priced shows up here once it is final.</p></div>`;
  const bands=(HIST.lg!=="all"&&sc.leagues&&sc.leagues[HIST.lg])||sc.bands, d=sc.since?new Date(sc.since):null, since=d?`${d.getMonth()+1}/${d.getDate()}`:"";
  const hitPct=h=>h==null?"—":(h*100).toFixed(h<0.1?1:0)+"%";     /* a 100% band is 100%, not ">99%" */
  const lab=b=>b.hi>=1?`${Math.round(b.lo*100)}% or more`:b.lo===0?`under ${Math.round(b.hi*100)}%`:`${Math.round(b.lo*100)}–${Math.round(b.hi*100-1)}%`;
  return `<div class="card"><h3>Clover's accuracy on every game it priced</h3><p class="hint">${sc.games} games since ${since} · all six picks per game${HIST.lg!=="all"?` · ${HIST.lg==="nfl"?"NFL":"college"} only`:""} · from the refresh, not your bets</p>
    <table class="hb"><tr><th>Clover said</th><th>Actually hit</th><th class="r">Picks</th></tr>
    ${bands.slice().reverse().map(b=>`<tr><td>${lab(b)}</td><td>${b.n?hitPct(b.hit):`<span class="dim">—</span>`}</td><td class="r">${b.n}</td></tr>`).join("")}</table></div>`;
}

/* ---- the screen ---- */
function renderHistory(){
  const out=document.getElementById("histOut"), st=document.getElementById("histStatus"); if(!out) return;
  document.querySelectorAll("#histWho .chip").forEach(c=>c.setAttribute("aria-pressed",c.dataset.who===HIST.who));
  document.querySelectorAll("#histLg .chip").forEach(c=>c.setAttribute("aria-pressed",c.dataset.lg===HIST.lg));
  const vb=document.getElementById("histVoid"); vb.setAttribute("aria-pressed",HIST.voided);
  if(!sbSession()){ st.textContent="Your saved bets, graded."; out.innerHTML=`<div class="card signCard"><b>${REC.ui==="sent"?"Check your email":"Sign in to see your bets"}</b>${REC.ui==="sent"
      ?`<p class="hint">We sent a sign-in link to ${esc(REC.email)}. Open it on this device; you come back here signed in.</p><button type="button" class="sec sm" id="histResend">Send again</button>`
      :`<form class="signin"><label class="hint" for="histEmail">${REC.msg?esc(REC.msg):"Clover emails you a sign-in link, once per device. Only Danny's and Jaclyn's emails are let in."}</label>
         <div class="line"><input id="histEmail" type="email" autocomplete="email" required value="${esc(REC.email)}" placeholder="you@example.com"><button type="submit" class="primary">Email me a link</button></div></form>`}</div>`;
    const f=out.querySelector(".signin"); if(f) f.onsubmit=async e=>{ e.preventDefault(); const v=f.querySelector("input").value.trim(); if(v){ await sendLink(v); renderHistory(); } };
    const rs=out.querySelector("#histResend"); if(rs) rs.onclick=()=>{ REC.ui="signin"; renderHistory(); };
    return; }
  if(HIST.rows===null){ st.textContent=HIST.busy?"Loading your bets…":""; out.innerHTML=HIST.err?`<div class="card"><p class="hint">${esc(HIST.err)}</p><button type="button" class="sec sm" id="histRetry">Try again</button></div>`:""; const rb=out.querySelector("#histRetry"); if(rb) rb.onclick=()=>loadHistory(true); return; }
  const B=histBets(), all=(HIST.rows||[]).length, voided=(HIST.rows||[]).filter(r=>r.voided_at).length;
  const settled=B.filter(x=>x.graded&&x.res!=="void").length, open=B.filter(x=>x.res==="open").length;
  st.textContent=all?`${all} bet${all>1?"s":""} saved · ${settled} settled · ${open} open${voided?` · ${voided} voided`:""}${HIST.err?" · "+HIST.err:""}`:"No bets saved yet. Save one from My Bet and it lands here.";
  out.innerHTML=!all?"":`${histTiles(B)}
    <div class="card ledger"><div class="hscroll"><table class="hl"><tr><th>Bet</th><th>Placed</th><th>Picks</th><th>Chance · needed</th><th>Money</th><th>Result</th></tr>
      ${B.map(x=>ledgerRow(x)+(HIST.open[x.b.id]?betCard(x):"")).join("")||`<tr><td colspan="6" class="dim">No bets match these chips.</td></tr>`}</table></div>
      <p class="hint">Tap a bet for every pick: the chance when saved, at kickoff, and the final. Grades land on the refresh after each final.</p></div>
    <div class="two">${habitsHtml(B)}${scorecardHtml()}</div>`;
  out.querySelectorAll("tr.lr").forEach(r=>{ const go=()=>{ HIST.open[r.dataset.bet]=!HIST.open[r.dataset.bet]; renderHistory(); };
    r.onclick=go; r.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } }; });
}
function wireHistory(){
  document.querySelectorAll("#histWho .chip").forEach(c=>c.onclick=()=>{ HIST.who=c.dataset.who; renderHistory(); });
  document.querySelectorAll("#histLg .chip").forEach(c=>c.onclick=()=>{ HIST.lg=c.dataset.lg; renderHistory(); });
  document.getElementById("histVoid").onclick=()=>{ HIST.voided=!HIST.voided; renderHistory(); };
}
