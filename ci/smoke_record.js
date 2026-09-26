/* ci/smoke_record.js - part of the page smoke test (ci/smoke.js), split out to keep
   smoke.js under 20 KB. Drives the bet record (record.js, row 7) against a fake
   Supabase: sign-in link, save, failed save, retry with the same id, void, and an
   email that is not on the members list. Nothing leaves the machine. */
/* 7. the bet record (row 7): sign-in, save, retry, void - against a fake Supabase */
module.exports=async function recordTests({ctx,sandbox,byId,js,flush,check,live}){
  if(!ctx.__rec){ check(live,"row 7: the bet record tests never ran (no slip was placed)"); return; }
  const tick=()=>new Promise(r=>setImmediate(r)), settle=async()=>{ for(let i=0;i<6;i++) await tick(); flush(); };
  const reply=(status,body)=>Promise.resolve({ok:status<300,status,text:()=>Promise.resolve(body==null?"":JSON.stringify(body)),json:()=>Promise.resolve(body)});
  js(`S.placed=JSON.parse(__rec); S.legs=[]; REC.ui=""; localStorage.removeItem("cloverAuth"); show("card"); render();`); flush();
  let sent=[]; sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return reply(200,{}); };
  js("saveBet()"); await settle();
  check(sent.length===0&&/class="signin"/.test(byId.placedBox.innerHTML),"row 7: Save bet with no sign-in must ask for an email, not call Supabase");
  js(`sendLink("danny@example.com")`); await settle();
  check(/\/auth\/v1\/otp\?redirect_to=https%3A%2F%2Fskrongman\.github\.io%2FClover%2F/.test(sent[0]&&sent[0].u)&&/Check your email/.test(byId.placedBox.innerHTML),"row 7: the sign-in link must point back at the live page");
  /* the link lands with the session in the #fragment */
  const tok="x."+Buffer.from(JSON.stringify({email:"danny@example.com"})).toString("base64")+".y";
  sandbox.location.hash="#access_token="+tok+"&refresh_token=r1&expires_in=3600&token_type=bearer&type=magiclink";
  js("sbFromLink()");
  check(sandbox.location.hash===""&&js("sbSession().email")==="danny@example.com","row 7: the emailed link must sign this browser in and clear the URL");
  sent=[]; sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return reply(500,{message:"down"}); };
  js("REC.ui=''; saveBet()"); await settle();
  check(/Couldn't save/.test(byId.placedBox.innerHTML)&&js("!S.placed.saved"),"row 7: a failed save must say so and keep the stamp unsaved");
  sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return reply(200,7); };
  js("saveBet()"); await settle();
  const b1=JSON.parse(sent[0].o.body), b2=JSON.parse(sent[1].o.body);
  check(b1.bet.id===b2.bet.id&&b1.bet.id===js("S.placed.id"),"row 7: a retry must send the same bet id (no double save)");
  check(/rest\/v1\/rpc\/save_bet$/.test(sent[1].u)&&/Bearer x\./.test(sent[1].o.headers.Authorization)&&b2.picks.length>0,"row 7: save goes to save_bet with the user's token and the picks");
  check(js("S.placed.saved&&S.placed.saved.no")===7&&/Saved · Bet #7/.test(byId.placedBox.innerHTML)&&/data-rec="void"/.test(byId.placedBox.innerHTML)&&!/data-rec="unplace"/.test(byId.placedBox.innerHTML),"row 7: a saved bet shows its number and Void, and no Unmark");
  check(/Saved #7/.test(byId.rail.innerHTML)||js("view")==="card","row 7: the rail stamp says Saved");
  sent=[]; sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return reply(204,null); };
  js("voidBet()"); await settle();
  check(sent[0]&&sent[0].o.method==="PATCH"&&/bets\?id=eq\./.test(sent[0].u)&&"voided_at" in JSON.parse(sent[0].o.body)&&/Voided · Bet #7/.test(byId.placedBox.innerHTML),"row 7: Void marks the bet voided, never deletes it");
  js(`S.placed=JSON.parse(__rec); REC.ui=""; render();`); flush();
  sandbox.FETCH=()=>reply(403,{code:"42501",message:"not allowed"});
  js("saveBet()"); await settle();
  check(/members list/.test(byId.placedBox.innerHTML),"row 7: an email that is not a member must be told, not shown Saved");
  js(`S.placed=null; localStorage.removeItem("cloverAuth"); render();`); flush();
};
