/* ci/smoke_rail.js - part of the page smoke test (ci/smoke.js), split out to keep
   smoke.js under 20 KB. Drives the My Bet rail, option B (Danny, 2026-09-26):
   Bet Amount + Pays Out, the Analytics numbers, the pick editor (side + number)
   and Save Bet from the rail against a fake Supabase. Nothing leaves the machine. */
module.exports=async function railTests({ctx,sandbox,byId,js,flush,check,live}){
  /* earlier steps leave a one-game slate, so both picks (a total and a spread) come from that game */
  const gis=js(`GAMES.map((G,gi)=>G.sim&&G.total!=null&&G.spread!=null?gi:-1).filter(gi=>gi>=0)`);
  if(!gis.length){ check(live,"rail: needs a priced game"); return; }
  const a=gis[0], b=gis[gis.length>1?1:0], tick=()=>new Promise(r=>setImmediate(r)), settle=async()=>{ for(let i=0;i<6;i++) await tick(); flush(); };
  const line={value:"",focus(){},select(){}};
  sandbox.document.querySelector=sel=>sel==="#railLine"?line:sandbox.document.createElement("div");
  js(`S.legs=[]; S.pays=null; S.stake=null; S.payout=null; S.placed=null; REC.ui=""; RAIL_PK=null; show("slips");
      toggleLeg(${a},"over"); toggleLeg(${b},"homeSp"); render();`); flush();

  /* Bet Amount + Pays Out: the app's own numbers; pays per $1 = payout / stake */
  check(!/Save Bet<\/button>/.test(byId.rail.innerHTML)||/data-rsave disabled/.test(byId.rail.innerHTML),"rail: Save Bet must be off before a payout is typed");
  js(`setMoney("stake","10"); setMoney("payout","54.04"); render();`); flush();
  check(Math.abs(js("S.pays")-5.404)<1e-9&&js("payoutFor().dec")===js("S.pays"),"rail: $10 paying $54.04 must be $5.404 per $1");
  const r=byId.rail.innerHTML;
  check(/Coin Toss Line<\/span><b>18\.50%/.test(r)&&/Good Bet Minimum<\/span><b>19\.43%/.test(r)&&/\$5\.40/.test(r),"rail: Coin Toss Line 18.50%, Good Bet Minimum 19.43%, Returns $5.40");
  check(/Markov Prediction<\/span><b>\d+\.\d\d%/.test(r)&&/class="word"[^>]*>(Great|Good|Coin toss|Bad|Terrible)</.test(r),"rail: Markov Prediction to two decimals and a verdict word");
  check(!/Chance all/.test(r)&&!/railGo/.test(r)&&!/on \$1/.test(r),"rail: the old big chance, Open My Bet and 'pays on $1' are gone");
  js(`setMoney("payout","8"); render();`); flush();
  check(js("S.pays")===null&&/has to be more than the bet/.test(byId.rail.innerHTML),"rail: a payout under the bet is refused, with a reason");
  js(`setMoney("payout","54.04"); render();`); flush();
  /* an older slip typed as "pays on $1" carries over as a $1 bet */
  js(`S.stake=null; S.payout=null; S.pays=5.5; setMoney("stake","2");`);
  check(js("S.payout")==="5.50"&&Math.abs(js("S.pays")-2.75)<1e-9,"rail: an old per-$1 payout must seed Bet $1.00 / Pays $5.50");
  js(`setMoney("stake","10"); setMoney("payout","54.04"); render();`); flush();

  /* the row: O 65.5 | AWY @ HOM / MM/DD 11a | % | x */
  check(new RegExp(`class="ou"[^>]*>O ${js(`GAMES[${a}].total`)}<`).test(byId.rail.innerHTML),"rail: a total pick reads 'O <line>'");
  check(/<span>\d\d\/\d\d \d{1,4}[ap]<\/span>/.test(byId.rail.innerHTML),"rail: kickoff as 09/26 11a");
  /* the editor: Over -> Under and a new number, priced from the table */
  const T=js(`GAMES[${a}].total`);
  js(`openPick(${a},"over"); pickSide("under");`); line.value=String(T+3); js("commitPick()"); flush();
  const L=js(`S.legs.find(l=>l.gi===${a}&&legMarket(l.type)==='Total')`);
  check(L.type==="under"&&L.line===T+3&&js(`S.legs.filter(l=>l.gi===${a}&&legMarket(l.type)==='Total').length`)===1,"editor: Over 65.5 -> Under 68.5 must leave one total pick, the new one");
  check(Math.abs(L.p0-js(`prob(${a},[{type:"under",line:${T+3}}])`))<1e-12,"editor: the edited pick's chance is the table's, at the new line");
  js(`openPick(${a},"under");`); line.value="60.3"; js("commitPick()"); flush();
  check(js(`S.legs.find(l=>l.gi===${a}&&legMarket(l.type)==='Total').line`)===T+3&&/whole or half/.test(byId.rail.innerHTML),"editor: 60.3 is refused and the old line kept");
  js(`openPick(${a},"under");`); line.value=String(T+25); js("commitPick()"); flush();
  check(js(`S.legs.find(l=>l.gi===${a}&&legMarket(l.type)==='Total').line`)===T+3&&/Clover prices/.test(byId.rail.innerHTML),"editor: a line past the ladder's reach is refused");
  js(`openPick(${a},"under");`); line.value=String(Math.round(T)); js("commitPick()"); flush();
  check(/a tie pushes/.test(byId.rail.innerHTML),"editor: a whole number says a tie pushes");
  /* spread: switching teams keeps the game result, so the number flips sign (own number) */
  const sp=js(`GAMES[${b}].spread`);
  js(`openPick(${b},"homeSp")`); line.value=js("RAIL_PK.line");   /* the box opens holding the current line */
  js(`pickSide("awaySp")`); line.value=js("RAIL_PK.line"); js("commitPick()"); flush();
  const B=js(`S.legs.find(l=>l.gi===${b}&&legMarket(l.type)==='Spread')`);
  check(B.type==="awaySp"&&B.line===-sp,"editor: HOME -3 -> AWAY +3 (the side's own number)");

  /* Save Bet from the rail: stamps the slip, asks to sign in, then saves stake + payout */
  js(`localStorage.removeItem("cloverAuth"); railSave()`); await settle();
  check(js("!!S.placed&&S.placed.stake==='10'&&S.placed.payout==='54.04'")&&/class="rsign"/.test(byId.rail.innerHTML),"rail Save Bet: no sign-in -> stamp kept, email box in the rail");
  const tok="x."+Buffer.from(JSON.stringify({email:"danny@example.com"})).toString("base64")+".y";
  js(`sbKeep({at:${JSON.stringify(tok)},rt:"r",exp:Date.now()/1000+3600,email:"danny@example.com"}); REC.ui=""`);
  const sent=[]; sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve("9"),json:()=>Promise.resolve(9)}); };
  js("railSave()"); await settle();
  const bet=sent[0]&&JSON.parse(sent[0].o.body).bet;
  check(bet&&bet.stake===10&&bet.payout===54.04&&Math.abs(bet.pays-5.404)<1e-9,"rail Save Bet: the saved bet carries stake 10, payout 54.04, pays 5.404");
  check(/Saved &#183; Bet #9|Saved · Bet #9/.test(byId.rail.innerHTML)&&/\$10\.00 pays \$54\.04/.test(byId.rail.innerHTML),"rail Save Bet: shows Saved · Bet #9 and '$10.00 pays $54.04'");
  js(`localStorage.removeItem("cloverAuth"); S.legs=[]; S.pays=null; S.stake=null; S.payout=null; S.placed=null; REC.ui=""; render();`); flush();
  sandbox.FETCH=()=>Promise.reject(new Error("offline"));
};
