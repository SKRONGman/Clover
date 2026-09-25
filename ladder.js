/* ===================================================================
   THE LADDER - every line for one game, with Clover's chance at each
   (row 5, 2026-09-24). One drawing, one home: a card in the side
   column - above the rail on the front door, alone on the full My Bet
   screen (row 6 retired the dialog).
   Tap a line to hold it; the board and the rail show the held line
   with its chance (line-only-at-market rule, DESIGN.md). Every % is
   a table lookup. Replaces the old line sheet.
   =================================================================== */
let LADDER=null;            /* {gi, type, wide} or null */
const LADDER_R={narrow:5, wide:10};
/* the type to open on: the pick already held on this game, else the home spread */
function ladderOpenType(gi){ const held=S.legs.find(l=>l.gi===gi&&hasLine(l.type)); return held?held.type:"homeSp"; }
function openLadder(gi,type){
  LADDER=LADDER&&LADDER.gi===gi&&!type?null:{gi,type:type||ladderOpenType(gi),wide:LADDER&&LADDER.gi===gi?LADDER.wide:false};
  renderLadder();
}
function closeLadder(){ LADDER=null; renderLadder(); }
/* every half-point from R under the market to R over it, DK quotes live on the .5s */
function ladderRows(gi,type,wide){
  const G=GAMES[gi], base=marketLine(G,type), k=findLeg(gi,type), held=k>=0?S.legs[k].line:null, R=LADDER_R[wide?"wide":"narrow"], out=[];
  for(let d=-R;d<=R;d+=0.5){ const L=+(base+d).toFixed(1); out.push({L,p:prob(gi,[{type,line:L}]),q:dkQuote(G,type,L),mkt:d===0,cur:held===L}); }
  return out;
}
function ladderHtml(){
  if(!LADDER) return "";
  const {gi,type,wide}=LADDER, G=GAMES[gi], sp=legMarket(type)==="Spread", open=isOpen(G);
  const seg=(t,label)=>`<button type="button" class="chip" data-lt="${t}" aria-pressed="${type===t}">${esc(label)}</button>`;
  const fmt=v=>sp?fmtSp(v):String(v);
  const rows=ladderRows(gi,type,wide).map(r=>`<tr class="${r.mkt?"base":""}${r.cur?" cur":""}">`
    +`<td><button type="button" class="use" data-use="${r.L}"${open?"":" disabled"}>${(type==="over"?"O ":type==="under"?"U ":"")+fmt(r.L)}${r.mkt?" <span class=\"sub\">market</span>":""}</button></td>`
    +`<td class="p">${pct(r.p)}</td><td>${r.q?money(r.q.dec):"—"}</td><td class="dk">${r.q&&r.q.fair!==null?pct(r.q.fair):"—"}</td></tr>`).join("");
  return `<div class="rhead"><h2>Lines</h2><button type="button" class="close" data-lclose aria-label="Close">×</button></div>`
    +`<p class="hint">${esc(shortName(G,G.away))} @ ${esc(shortName(G,G.home))} · ${esc(whenShort(G))}. Tap the number your app shows.</p>`
    +`<div class="seg">${seg("awaySp",`${shortName(G,G.away)} ${fmtSp(-G.spread)}`)}${seg("homeSp",`${shortName(G,G.home)} ${fmtSp(G.spread)}`)}</div>`
    +`<div class="seg">${seg("over",`Over ${G.total}`)}${seg("under",`Under ${G.total}`)}</div>`
    +`<div class="scroll"><table class="ladder"><tr><th>Line</th><th>Chance</th><th>DK pays</th><th>DK's %</th></tr>${rows}</table></div>`
    +`<div class="lfoot"><button type="button" class="ghost" data-lwide>${wide?"Show ±5":"Show ±10"}</button>`
    +`<span class="hint">${G.alt?"DK's % is their price with the cut removed.":"DK prices load Thursdays."} Whole numbers can push.</span></div>`;
}
function wireLadder(box){
  box.querySelectorAll("[data-lt]").forEach(b=>b.onclick=()=>{ LADDER.type=b.dataset.lt; renderLadder(); });
  box.querySelectorAll("[data-use]").forEach(b=>b.onclick=()=>{ swapIn(S.legs,LADDER.gi,LADDER.type,+b.dataset.use); render(); });
  const w=box.querySelector("[data-lwide]"); if(w) w.onclick=()=>{ LADDER.wide=!LADDER.wide; renderLadder(); };
  const c=box.querySelector("[data-lclose]"); if(c) c.onclick=closeLadder;
  /* centre the held (else market) rung inside the ladder's own scroll box - never scroll the page (row 6) */
  const cur=box.querySelector("tr.cur")||box.querySelector("tr.base"), sc=box.querySelector(".scroll"); if(cur&&sc&&sc.clientHeight) sc.scrollTop=cur.offsetTop-sc.clientHeight/2;
}
function renderLadder(){
  const card=document.getElementById("ladder");
  if(LADDER&&(!GAMES[LADDER.gi]||!GAMES[LADDER.gi].sim)) LADDER=null;   /* the game kicked off or left the slate */
  card.classList.toggle("hidden",!LADDER);
  card.innerHTML=LADDER?ladderHtml():"";
  wireLadder(card);
  /* the full My Bet screen has no rail beside it, so an empty side column says what goes there */
  document.getElementById("ladHint").classList.toggle("hidden",!!LADDER||view!=="card");
  document.querySelectorAll("[data-lad]").forEach(b=>b.classList.toggle("on",!!LADDER&&+b.dataset.lad===LADDER.gi));
}
