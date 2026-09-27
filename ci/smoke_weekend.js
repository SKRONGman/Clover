/* ci/smoke_weekend.js - part of the page smoke test (ci/smoke.js), split out to keep
   smoke.js under 20 KB. "This weekend" on a Monday night (row 5): the window rolls
   forward once no game left in it has yet to kick off. */
module.exports=async function weekendTests({ctx,js,check}){
  /* "This weekend" on a Monday night (row 5): the window rolls forward once no game left in it
     has yet to kick off. Fake slate: one Monday-night game; the clock is Monday 6 PM, then 8 PM. */
  {
    const saved=js("GAMES"); const mon=new Date(2026,8,21,19,15);   /* Mon 2026-09-21 7:15 PM local */
    const mk=st=>js(`GAMES=[{league:"nfl",start:${JSON.stringify(mon.toISOString())},status:"${st}",hp:0,ap:0,spread:-3,total:44,home:"A",away:"B",id:"w"}]`);
    mk("upcoming"); const w1=js(`weekendWindow(new Date(2026,8,21,18,0))`);
    check(w1.thu.getDate()===17&&w1.mon.getDate()===21,"weekend: Monday 6 PM with MNF still to come must stay on this weekend");
    mk("live");     const w2=js(`weekendWindow(new Date(2026,8,21,20,0))`);
    check(w2.thu.getDate()===24&&w2.mon.getDate()===28,"weekend: Monday 8 PM with MNF under way must roll to next weekend");
    const w3=js(`weekendWindow(new Date(2026,8,23,12,0))`);
    check(w3.thu.getDate()===24,"weekend: Wednesday must point at the coming weekend");
    ctx.__saved=saved; js("GAMES=__saved");
  }
};
