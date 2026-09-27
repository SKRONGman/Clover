/* ci/smoke_history.js - part of the page smoke test (ci/smoke.js). Drives the History
   tab (history.js, row 8) against a fake Supabase holding bet #1 and bet #2 as the real
   ones came back on 2026-09-26 (numbers as strings, like PostgREST sends them), plus a
   voided one. Nothing leaves the machine. */
module.exports=async function historyTests({ctx,sandbox,byId,js,flush,check,live}){
  const tick=()=>new Promise(r=>setImmediate(r)), settle=async()=>{ for(let i=0;i<8;i++) await tick(); flush(); };
  const reply=(status,body)=>Promise.resolve({ok:status<300,status,text:()=>Promise.resolve(body==null?"":JSON.stringify(body)),json:()=>Promise.resolve(body)});
  const P=(id,game_id,kickoff,game,type,label,line,market_line,chance,close_market,close_chance,hp,ap,result,beat_close)=>
    ({id,bet_id:"b",game_id,league:"ncaaf",kickoff,game,type,label,line,market_line,chance,close_market,close_chance,closed_at:close_chance==null?null:"2026-09-26T18:13:00+00:00",hp,ap,result,beat_close});
  const ROWS=[
    {id:"b2",bet_no:2,saved_at:"2026-09-27T00:06:32+00:00",placed_at:"2026-09-27T00:06:26+00:00",who:"Danny",pays:"2.635",n_picks:4,chance:"0.3774",needs:"0.3795",verdict:"Coin toss",voided_at:null,slip_result:null,graded_at:null,stake:"10",payout:"26.35",
     picks:[P(13,"401862782","2026-09-27T00:00:00+00:00","Florida Atlantic @ UL Monroe","awayML","Florida Atlantic to win",null,-11.5,0.7772,null,null,null,null,null,null),
            P(14,"401860895","2026-09-27T01:00:00+00:00","Oregon State @ UTEP","awayML","Oregon State to win",null,-11.5,0.7789,null,null,null,null,null,null),
            P(15,"401860891","2026-09-27T02:00:00+00:00","Rice @ Fresno State","homeML","Fresno State to win",null,-12.5,0.7956,null,null,null,null,null,null),
            P(16,"401858470","2026-09-27T03:00:00+00:00","Minnesota @ Washington","homeML","Washington to win",null,-11.5,0.7837,null,null,null,null,null,null)]},
    {id:"b1",bet_no:1,saved_at:"2026-09-26T16:24:06+00:00",placed_at:"2026-09-26T16:08:29+00:00",who:"Danny",pays:"5.404",n_picks:3,chance:"0.1985",needs:"0.1850",verdict:"Good",voided_at:null,slip_result:"lost",graded_at:"2026-09-27T01:10:00+00:00",stake:null,payout:null,
     picks:[P(10,"401858236","2026-09-26T16:00:00+00:00","Bucknell @ Pittsburgh","over","Over 62.5",62.5,62.5,0.5554,null,null,59,0,"miss",null),
            P(11,"401858237","2026-09-26T19:00:00+00:00","Central Arkansas @ Florida State","over","Over 62.5",62.5,62.5,0.5291,63.5,0.5521,34,7,"miss",true),
            P(12,"401858463","2026-09-26T19:30:00+00:00","Iowa @ Michigan","under","Under 44.5",44.5,38.5,0.6754,40.5,0.628,19,20,"hit",false)]},
    {id:"b0",bet_no:0,saved_at:"2026-09-25T20:00:00+00:00",placed_at:"2026-09-25T20:00:00+00:00",who:"Jaclyn",pays:"3",n_picks:1,chance:"0.5",needs:"0.3333",verdict:"Great",voided_at:"2026-09-25T20:05:00+00:00",slip_result:null,graded_at:null,stake:"5",payout:"15",
     picks:[P(1,"x","2026-09-26T16:00:00+00:00","A @ B","homeSp","B -3.5",-3.5,-3.5,0.5,null,null,null,null,null,null)]}];
  const out=()=>byId.histOut.innerHTML, status=()=>byId.histStatus.textContent;
  /* 1. not signed in: ask for an email, call nothing */
  let sent=[]; sandbox.FETCH=(u,o)=>{ sent.push({u,o}); return reply(200,ROWS); };
  js(`localStorage.removeItem("cloverAuth"); REC.ui=""; HIST.rows=null; HIST.at=0; show("history");`); await settle();
  check(sent.length===0&&/class="signin"/.test(out())&&!byId.viewHistory.classList.contains("hidden"),"row 8: History with no sign-in must ask for an email, not call Supabase");
  /* 2. signed in: one GET for bets + picks with the user's token, newest first */
  const tok="x."+Buffer.from(JSON.stringify({email:"danny@example.com"})).toString("base64")+".y";
  js(`sbKeep({at:${JSON.stringify(tok)},rt:"r1",exp:Math.floor(Date.now()/1000)+3600,email:"danny@example.com"}); HIST.rows=null; HIST.at=0; show("history");`); await settle();
  check(sent.length===1&&/\/rest\/v1\/bets\?select=\*,picks\(\*\)&order=bet_no\.desc$/.test(sent[0].u)&&/Bearer x\./.test(sent[0].o.headers.Authorization),"row 8: History must read bets+picks once, newest first, with the user's token");
  check(/3 bets saved · 1 settled · 1 open · 1 voided/.test(status()),"row 8: the status line must count saved, settled, open and voided: "+status());
  /* 3. the tiles from bet #1 (lost 1 of 3, no stake) and bet #2 (open, $10) */
  const h=out();
  check(/Record<\/span><span class="v bad">0–1<\/span><span class="s">slips won–lost · picks 1–2</.test(h),"row 8: the Record tile must read 0–1 slips, picks 1–2");
  check(/Money<\/span><span class="v ">—<\/span><span class="s">1 settled without a stake · \$10 open/.test(h),"row 8: Money with no stake on the settled bet must say so, and show the open $10");
  check(/Beat the close<\/span><span class="v ">1 of 2<\/span><span class="s">picks priced before kickoff · 1 had no close/.test(h),"row 8: Beat the close must read 1 of 2, 1 with no close");
  check(/Clover on your picks<\/span><span class="v txt">said 59% · hit 33%/.test(h),"row 8: Clover on your picks must average the graded picks' chance against their hit rate");
  /* 4. the ledger: two rows, the voided one hidden; bet #1 lost 1 of 3; tapping opens the card */
  check((h.match(/<tr class="lr /g)||[]).length===2&&!/#0</.test(h)&&/class="rw lost">Lost<\/span> <small>1 of 3/.test(h)&&/class="rw open">Open<\/span> <small>0 of 4 final/.test(h),"row 8: two live rows, the voided one hidden, results counted");
  check(/\$10 → \$26\.35/.test(h)&&/5\.40×/.test(h)&&/19\.9% · 18\.5%/.test(h),"row 8: the ledger shows money or the multiplier, and chance · needed");
  check(/<b>O 62\.5<\/b> <span class="miss">/.test(h)&&/<b>U 44\.5<\/b> <span class="hit">/.test(h)&&/<b>Florida Atlantic ML<\/b>/.test(h),"row 8: picks in one line with their marks");
  js(`HIST.open["b1"]=true; renderHistory();`); flush();
  const c=out();
  check(/class="lc"/.test(c)&&/<span class="g">59 total, short by 3\.5</.test(c)&&/41 total, short by 21\.5/.test(c)&&/39 total, by 5\.5/.test(c),"row 8: the card must show each final and the points it hit or missed by");
  check(/no close \(saved after kickoff\)/.test(c)&&/55\.2% <span class="dim">\(line 63\.5\)/.test(c)&&/<span class="hit">Yes<\/span>/.test(c)&&/<span class="miss">No<\/span>/.test(c),"row 8: the card must show the closing chance and line, beat-the-close, and no close for a pick saved after kickoff");
  check(/class="sort good">Good bet · bad luck</.test(c)&&/Verdict <b>Good<\/b>/.test(c)&&/class="hm dim">no stake</.test(c),"row 8: the slip-level sort (verdict x result) and the money line");
  js(`HIST.open["b2"]=true; renderHistory();`); flush();
  check(/to win \$16\.35/.test(out())&&!/class="sort/.test(out().split('data-bet="b2"')[1].split("data-bet=\"b1\"")[0]),"row 8: an open bet shows what it would win and no sort yet");
  /* 5. chips: whose, league, voided */
  js(`HIST.who="Jaclyn"; renderHistory();`); flush();
  check(/No bets match these chips/.test(out()),"row 8: the Whose chip must filter the ledger");
  js(`HIST.voided=true; renderHistory();`); flush();
  check(/<tr class="lr void/.test(out())&&/#0</.test(out())&&/class="rw void">Voided/.test(out()),"row 8: Show voided must bring the voided bet back, greyed");
  js(`HIST.who="all"; HIST.voided=false; HIST.lg="nfl"; renderHistory();`); flush();
  check(/No bets match these chips/.test(out()),"row 8: the League chip must filter the ledger");
  js(`HIST.lg="all"; renderHistory();`); flush();
  /* 6. habits + the scorecard from ratings.js */
  check(/<td>Totals<\/td><td><span class="dim">—<\/span><\/td><td>1–2<\/td><td>1 of 2<\/td>/.test(out())&&/<td>3-pick slips<\/td><td>0–1<\/td><td>1–2<\/td>/.test(out())&&/<td>Jaclyn<\/td><td><span class="dim">—/.test(out()),"row 8: Habits must count picks by type and slips by size and who");
  js(`R.scorecard={games:42,since:"2026-09-20T02:30+00:00",bands:[{lo:0,hi:0.3,n:27,said:0.115,hit:0.037},{lo:0.3,hi:0.45,n:16,said:0.397,hit:0.375},{lo:0.45,hi:0.55,n:164,said:0.5,hit:0.5},{lo:0.55,hi:0.7,n:16,said:0.603,hit:0.625},{lo:0.7,hi:0.9,n:13,said:0.797,hit:0.923},{lo:0.9,hi:1,n:14,said:0.967,hit:1}],leagues:{ncaaf:[{lo:0,hi:0.3,n:1,said:0.1,hit:0}],nfl:[{lo:0,hi:0.3,n:2,said:0.1,hit:0.5}]}}; renderHistory();`); flush();
  check(/42 games since \d+\/\d+ /.test(out())&&/<td>90% or more<\/td><td>100%<\/td><td class="r">14/.test(out())&&/<td>55–69%<\/td><td>63%<\/td><td class="r">16/.test(out())&&/<td>under 30%<\/td><td>3\.7%<\/td><td class="r">27/.test(out()),"row 8: the scorecard table must read from R.scorecard, best band first");
  js(`HIST.lg="nfl"; renderHistory();`); flush();
  check(/NFL only/.test(out())&&/<td class="r">2<\/td>/.test(out()),"row 8: the League chip must switch the scorecard to that league");
  js(`HIST.lg="all"; delete R.scorecard;`);
  /* 7. a failed load says so and offers Try again; a 403 names the members list */
  sandbox.FETCH=()=>reply(500,{message:"down"});
  js(`HIST.rows=null; HIST.at=0; loadHistory(true);`); await settle();
  check(/Couldn&#39;t load your bets/.test(out())&&/id="histRetry"/.test(out()),"row 8: a failed load must say so and offer Try again");
  sandbox.FETCH=()=>reply(403,{code:"42501"});
  js(`loadHistory(true);`); await settle();
  check(/members list/.test(out()),"row 8: a 403 must name the members list");
  /* 8. History never grades: the page only reads (no PATCH, no POST) */
  check(sent.every(s=>!s.o||!s.o.method||s.o.method==="GET"),"row 8: History must never write to Supabase");
  js(`HIST.rows=null; HIST.at=0; localStorage.removeItem("cloverAuth"); show("hot");`); flush();
};
