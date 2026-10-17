/* ci/smoke_combos.js - the page's % on SAME-GAME slips must equal Python's.

   Test 1 in smoke.js covers one pick at the market line, against the six percentages
   refresh.py froze. That case can never have one leg push while another leg loses -
   which is exactly where preview1.js and sim.py parted ways until 2026-10-17: prob()
   stopped checking at the first LOSING leg, so a later pushing leg went unseen, and
   the page's answer moved with the order the picks were tapped.

   ci/checks.py (combo_fixture) prices every same-game combination in Python, straight
   off the tables the page reads - both sides of each market, at the market line and
   the whole numbers either side, since a whole line pushes on a tie. Every slip here
   is priced twice, legs reversed the second time, so order dependence fails loudly.

   Called from smoke.js right after test 1, BEFORE test 5c strips the slate down to one
   game. Does nothing when --combos= is not passed. */
const fs = require("fs");

module.exports = function ({ sandbox, js, check, live }) {
  const arg = process.argv.find(a => a.startsWith("--combos="));
  if (!arg) return;
  const combos = JSON.parse(fs.readFileSync(arg.slice(9), "utf8"));
  if (!combos.length) return;
  sandbox.COMBOS = combos;
  const [worst, priced, ordered] = js(`(()=>{ let w=0,c=0,ord=0;
    COMBOS.forEach(x=>{ const gi=BY_ID[x.id]; if(gi==null||!GAMES[gi].sim) return;
      const legs=x.legs.map(l=>({gi,type:l.type,line:l.line}));
      const a=prob(gi,legs), b=prob(gi,legs.slice().reverse());
      w=Math.max(w,Math.abs(a-x.p),Math.abs(b-x.p)); if(a!==b) ord++; c++; });
    return [w,c,ord]; })()`);
  check(live || priced >= 100, "expected at least 100 same-game slips priced, saw " + priced);
  check(worst <= 1e-12, "page % differs from Python's on a same-game slip by " + worst);
  check(ordered === 0, ordered + " same-game slips priced differently when the legs were reversed");
};
