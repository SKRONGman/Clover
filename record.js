/* ===================================================================
   THE BET RECORD (row 7, 2026-09-25). Built from the approved mockup:
   https://claude.ai/artifact/SSRQRBwgm5aBZYk49jE1Gk
   - "I placed this" stays a stamp (row 6). "Save bet" is its own tap.
   - Bets live in Supabase (Danny, 2026-09-25; replaces the Google Sheet),
     private to the emails on the members list. The page is public; the
     bets are not. The publishable key below is meant to be public - the
     database's row rules are what keep strangers out.
   - Sign-in is an emailed link, once per device (Danny, 2026-09-25).
   - A saved bet can be voided, never deleted. Closing numbers and grades
     are written by GitHub (bets.py), never by the page.
   Plain fetch, no library: the page's CSP only allows its own scripts.
   =================================================================== */
const SB_URL="https://ptictqwxdqfzykpgwiqf.supabase.co";
const SB_KEY="sb_publishable_VXZzw6Ujao-fqhx_fxkPxg_NMk-hIJj";
const SITE="https://skrongman.github.io/Clover/";
let REC={ui:"",msg:"",email:""};          /* ui: "" | signin | sent | saving | err */

/* ---- session: kept in this browser only ---- */
function sbSession(){ try{ return JSON.parse(localStorage.getItem("cloverAuth")||"null"); }catch(e){ return null; } }
function sbKeep(s){ try{ s?localStorage.setItem("cloverAuth",JSON.stringify(s)):localStorage.removeItem("cloverAuth"); }catch(e){} }
function jwtEmail(t){ try{ return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).email||""; }catch(e){ return ""; } }
/* the emailed link lands back here with the session in the URL's #fragment */
function sbFromLink(){
  const h=location.hash.slice(1); if(!/access_token=|error_description=/.test(h)) return;
  const q=new URLSearchParams(h);
  if(q.get("access_token")) sbKeep({at:q.get("access_token"),rt:q.get("refresh_token"),exp:+q.get("expires_at")||Math.floor(Date.now()/1000)+(+q.get("expires_in")||3600),email:jwtEmail(q.get("access_token"))});
  else { REC.ui="signin"; REC.msg="That sign-in link didn't work ("+(q.get("error_description")||"expired")+"). Send a new one."; }
  history.replaceState(null,"",location.pathname+location.search);
}
async function sbToken(){
  const s=sbSession(); if(!s) return null;
  if(s.exp-60>Date.now()/1000) return s.at;
  const r=await fetch(SB_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.rt})});
  if(!r.ok){ sbKeep(null); return null; }
  const j=await r.json(); sbKeep({at:j.access_token,rt:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+j.expires_in,email:s.email});
  return j.access_token;
}
async function sbCall(path,opt){
  const t=await sbToken(); if(!t) return {signin:true};
  const r=await fetch(SB_URL+path,{...opt,headers:{apikey:SB_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json",...(opt.headers||{})}});
  if(r.status===401){ sbKeep(null); return {signin:true}; }
  const body=await r.text(); let j=null; try{ j=body?JSON.parse(body):null; }catch(e){}
  return {ok:r.ok,status:r.status,j};
}

/* ---- the three actions ---- */
async function sendLink(email){
  REC.email=email; REC.ui="saving"; renderStamp();
  try{
    const r=await fetch(SB_URL+"/auth/v1/otp?redirect_to="+encodeURIComponent(SITE),{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,create_user:true})});
    if(r.ok){ REC.ui="sent"; REC.msg=""; }
    else { REC.ui="signin"; REC.msg=r.status===429?"Too many links sent. Wait a minute, then try again.":"Couldn't send the link. Check the email address and try again."; }
  }catch(e){ REC.ui="signin"; REC.msg="Couldn't reach Clover's bet record. Check your connection and try again."; }
  renderStamp();
}
async function saveBet(){
  const P=S.placed; if(!P||P.saved) return;
  if(!sbSession()){ REC.ui="signin"; REC.msg=""; renderStamp(); return; }
  REC.ui="saving"; renderStamp();
  const needs=1/P.pays, bet={id:P.id,placed_at:P.at,who:P.who,pays:P.pays,chance:+P.p.toFixed(4),needs:+needs.toFixed(4),verdict:grade(P.p*P.pays-1).word};
  try{
    const r=await sbCall("/rest/v1/rpc/save_bet",{method:"POST",body:JSON.stringify({bet,picks:P.picks})});
    if(r.signin){ REC.ui="signin"; REC.msg="Sign in again on this device to save."; }
    else if(r.ok){ P.saved={no:r.j,at:new Date().toISOString()}; REC.ui=""; saveSlip(); }
    else if(r.status===403||(r.j&&r.j.code==="42501")){ REC.ui="err"; REC.msg=`${sbSession()?.email||"This email"} isn't on Clover's members list, so nothing was saved. Ask Danny to add it.`; }
    else { REC.ui="err"; REC.msg="Nothing was saved. Your stamp is kept. Check your connection and tap Try again."; }
  }catch(e){ REC.ui="err"; REC.msg="Nothing was saved. Your stamp is kept. Check your connection and tap Try again."; }
  render();
}
async function voidBet(){
  const P=S.placed; if(!P||!P.saved||P.voided) return;
  REC.ui="saving"; renderStamp();
  try{
    const r=await sbCall("/rest/v1/bets?id=eq."+P.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({voided_at:new Date().toISOString()})});
    if(r.ok){ P.voided=true; REC.ui=""; saveSlip(); }
    else { REC.ui="err"; REC.msg=r.signin?"Sign in again on this device to void it.":"Couldn't void it. Check your connection and try again."; }
  }catch(e){ REC.ui="err"; REC.msg="Couldn't void it. Check your connection and try again."; }
  render();
}

/* ---- what the bet looks like when saved: each pick at the moment of the stamp ---- */
function snapPicks(legs){
  return legs.map(l=>{ const G=GAMES[l.gi], line=hasLine(l.type)?l.line:null;
    return {game_id:String(G.id),league:lgOf(G),kickoff:G.start,game:`${G.away} @ ${G.home}`,type:l.type,label:legLabel(G,l),line,
      market_line:l.type==="homeML"?G.spread:l.type==="awayML"?(G.spread==null?null:-G.spread):marketLine(G,l.type),
      chance:+prob(l.gi,[{type:l.type,line:hasLine(l.type)?l.line:0}]).toFixed(4)}; });
}
const newId=()=>crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));

/* ---- the stamp box under the bet card ---- */
function renderStamp(){
  const P=S.placed, box=document.getElementById("placedBox"); if(!box) return;
  box.classList.toggle("hidden",!P); if(!P) return;
  const same=P.sig===slipSig(S.legs), t=new Date(P.at).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"});
  let head=`Placed · ${esc(P.who)} · ${money(P.pays)} on $1 · ${t}`, sub, acts="", extra="", cls="placed";
  if(P.voided){ cls+=" void"; head=`Voided · Bet #${P.saved.no}`; sub="Still saved, marked void. Clover leaves it out of your record and History."; }
  else if(P.saved){ head=`<span class="check">&#10003;</span>Saved · Bet #${P.saved.no}`;
    sub=same?`${esc(P.who)} · ${money(P.pays)} on $1 · ${P.picks.length} pick${P.picks.length>1?"s":""} at ${pct1(P.p)}. GitHub adds the closing numbers before kickoff and the grade after the final.`
            :`Picks changed since you saved it. Those changes are not saved. Place the new slip to save it as a new bet.`;
    acts=`<button type="button" class="sec sm" data-rec="void">Void</button>`; }
  else if(!same){ sub="Picks changed since you placed it. Unmark it, or place the new slip."; acts=`<button type="button" class="sec sm" data-rec="unplace">Unmark</button>`; }
  else { sub=`Placed at ${pct1(P.p)}. Not saved yet, so you can still fix picks or the payout.`;
    acts=`<button type="button" class="sec sm" data-rec="unplace">Unmark</button><button type="button" class="primary" data-rec="save">Save bet</button>`; }
  if(REC.ui==="saving"){ acts=`<button type="button" class="primary" disabled>Working&#8230;</button>`; }
  else if(REC.ui==="err"){ cls+=" err"; head="Couldn't save the bet"; sub=esc(REC.msg); acts=`<button type="button" class="primary" data-rec="${P.saved?"void":"save"}">Try again</button>`; }
  else if(REC.ui==="sent"){ head="Check your email"; sub=`We sent a sign-in link to ${esc(REC.email)}. Open it on this device. You come back here signed in, with your stamp still waiting. Then tap Save bet.`; acts=`<button type="button" class="sec sm" data-rec="resend">Send again</button>`; }
  else if(REC.ui==="signin"){ sub=`Placed at ${pct1(P.p)}. Not saved yet.`; acts="";
    extra=`<form class="signin"><label class="hint" for="sbEmail">${REC.msg?esc(REC.msg):"Sign in once on this device to save bets. Clover emails you a sign-in link."}</label>
      <div class="line"><input id="sbEmail" type="email" autocomplete="email" required value="${esc(REC.email)}" placeholder="you@example.com"><button type="submit" class="primary">Email me a link</button></div>
      <span class="hint">Only Danny's and Jaclyn's emails are let in. Your stamp waits here while you sign in.</span></form>`; }
  box.className=cls;
  box.innerHTML=`<div class="row"><div><b>${head}</b><span class="hint">${sub}</span></div><div class="acts">${acts}</div></div>${extra}`;
  box.querySelectorAll("[data-rec]").forEach(b=>{ b.onclick=()=>({save:saveBet,void:voidBet,unplace:()=>{ S.placed=null; REC.ui=""; render(); },resend:()=>{ REC.ui="signin"; renderStamp(); }})[b.dataset.rec](); });
  const f=box.querySelector(".signin"); if(f) f.onsubmit=e=>{ e.preventDefault(); const v=f.querySelector("input").value.trim(); if(v) sendLink(v); };
}
sbFromLink();
