/* ci/smoke_props.js - boots the real page code against props.js and drives the
   NFL Props tab. Standalone (the props workflow runs it on its own), but it
   uses the same stand-in DOM idea as ci/smoke.js: what is tested is the page's
   own logic, above all that every chance on the screen is a LOOKUP that agrees
   with what props.py computed - never a second copy of the math in JavaScript.

   usage: node ci/smoke_props.js <folder holding the page>              */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = process.argv[2] || ".";
const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
const PAGE_JS = [...fs.readFileSync(path.join(root, "index.html"), "utf8")
  .matchAll(/<script src="([^"?]+)[^"]*"/g)].map(m => m[1]);

function el(tag) {
  const kids = [], cls = new Set();
  const store = { tagName: tag || "div", dataset: {}, style: {}, children: kids, options: [],
                  value: "", textContent: "", innerHTML: "", disabled: false };
  const api = {
    appendChild: c => { kids.push(c); return c; }, append: (...c) => kids.push(...c),
    remove() {}, focus() {}, blur() {}, click() {}, scrollIntoView() {}, setSelectionRange() {},
    showModal() {}, close() {}, addEventListener() {}, removeEventListener() {},
    setAttribute: (k, v) => { store["@" + k] = String(v); }, getAttribute: k => store["@" + k] ?? null,
    removeAttribute: k => { delete store["@" + k]; }, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
                 contains: c => cls.has(c),
                 toggle: (c, on) => { const w = on === undefined ? !cls.has(c) : !!on; w ? cls.add(c) : cls.delete(c); return w; } },
  };
  return new Proxy(store, { get: (t, k) => (k in api ? api[k] : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
}
const byId = {}, timers = [], mem = {};
const document = {
  getElementById: id => byId[id] || (byId[id] = el()), createElement: t => el(t),
  createTextNode: s => ({ textContent: s }), querySelector: () => el(), querySelectorAll: () => [],
  addEventListener() {}, activeElement: null, body: el("body"),
  head: { appendChild(s) {
    const name = String(s.src).split("?")[0];
    try {
      if (name === "ratings.js") vm.runInContext(fs.readFileSync(path.join(root, "ratings.js"), "utf8"), ctx);
      else if (name === "props.js") vm.runInContext(fs.readFileSync(path.join(root, "props.js"), "utf8"), ctx);
      else return s;
      s.onload();
    } catch (e) { if (s.onerror) s.onerror(e); }
    return s; } },
};
const sandbox = {
  document, console, atob, performance, Date, Math, JSON, Intl, CSS: { escape: s => s },
  localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, scrollTo() {},
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  location: { hash: "", pathname: "/Clover/", search: "" }, history: { replaceState() {} },
  URLSearchParams, crypto: globalThis.crypto,
  fetch: (...a) => sandbox.FETCH(...a), FETCH: () => Promise.reject(new Error("offline")),
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
const js = code => vm.runInContext(code, ctx);
const flush = () => { while (timers.length) timers.shift()(); };

/* A props file the test owns, so the checks below do not drift with the live
   slate. Shaped exactly as props.py writes it. */
const FIXTURE = {
  updated: "2026-10-18T14:20:00+00:00",
  markets: ["pass_yds", "pass_tds", "rush_yds", "rec_yds", "rec", "any_td"],
  games: [{
    id: "g1", kick: "2026-10-18T17:00:00Z", home: "Kansas City Chiefs",
    away: "Los Angeles Chargers", pulled: "2026-10-18T14:20:00+00:00",
    props: [
      /* 41 rungs, 59.5 to 79.5 in halves; the book's own 69.5 sits at index 20 */
      { m: "rec_yds", who: "Rashee Rice", line: 69.5, dk: 500, lo: 59.5, step: 0.5,
        p: Array.from({ length: 41 }, (_, i) => 800 - 15 * i) },
      { m: "rec", who: "Travis Kelce", line: 4.5, dk: 520, lo: 0.5, step: 0.5, p: [990, 960, 920, 870, 810, 740, 660, 580, 490, 400, 320, 250, 190, 140, 100, 70, 50] },
      { m: "any_td", who: "Isiah Pacheco", line: null, yes: 412 },
    ],
  }],
};
fs.writeFileSync(path.join(root, ".props_fixture.js"),
  "window.PROPS=" + JSON.stringify(FIXTURE) + ";\n");

try {
  for (const f of PAGE_JS) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  flush();

  /* the real props.js the workflow just wrote must at least parse and be shaped right */
  const real = js("window.PROPS");
  check(real && Array.isArray(real.games), "props.js did not load, or has no games list");
  if (real && real.games) {
    for (const g of real.games) {
      check(g.id && g.kick && g.home && g.away, "a game is missing id/kick/teams");
      for (const r of (g.props || [])) {
        if (r.m === "any_td") { check(r.yes >= 0 && r.yes <= 1000, `${r.who}: anytime TD chance out of range`); continue; }
        check(Array.isArray(r.p) && r.p.length > 0, `${r.who} ${r.m}: empty ladder`);
        check(r.step > 0 && r.lo >= 0, `${r.who} ${r.m}: bad ladder origin`);
        check(r.p.every(v => v >= 0 && v <= 1000), `${r.who} ${r.m}: chance out of range`);
        /* a ladder must never rise: a higher number is never likelier to be cleared */
        check(r.p.every((v, i) => i === 0 || r.p[i - 1] >= v), `${r.who} ${r.m}: ladder rises`);
        /* the line itself must sit inside the ladder, or the page cannot price the book's own number */
        const i = Math.round((r.line - r.lo) / r.step);
        check(i >= 0 && i < r.p.length, `${r.who} ${r.m}: the book's own line is off the ladder`);
      }
    }
  }

  /* now drive the tab against the fixture */
  js("window.PROPS=" + JSON.stringify(FIXTURE) + ";");
  js("PSLIP=[];PQ='';PPAYOUT=null;PSTAKE=null;");

  const rec = FIXTURE.games[0].props[0];
  /* 1. every chance is a lookup, straight out of the table props.py shipped */
  check(js("propChance(window.PROPS.games[0].props[0],69.5)") === rec.p[Math.round((69.5 - rec.lo) / rec.step)] / 1000,
        "the chance at the book's line is not the ladder entry");
  check(js("propChance(window.PROPS.games[0].props[0],59.5)") === rec.p[0] / 1000, "first rung wrong");
  check(js("propChance(window.PROPS.games[0].props[0],79.5)") === rec.p[40] / 1000, "last rung wrong");
  /* 2. a number the book never offered still prices, which is the whole point */
  check(js("propChance(window.PROPS.games[0].props[0],66.0)") === rec.p[13] / 1000,
        "an off-book number does not price off the ladder");
  /* ...and a higher number is always harder to clear */
  check(js("propChance(window.PROPS.games[0].props[0],75.0)") < js("propChance(window.PROPS.games[0].props[0],65.0)"),
        "a higher number came back likelier");
  /* 3. off the end of the ladder = no chance, never a guess */
  check(js("propChance(window.PROPS.games[0].props[0],400)") === null, "a number past the ladder invented a chance");
  check(js("propChance(window.PROPS.games[0].props[0],10)") === null, "a number below the ladder invented a chance");
  check(js("propChance(window.PROPS.games[0].props[0],null)") === null, "a blank number invented a chance");
  /* 4. anytime TD is Yes-only and needs no number */
  check(js("propChance(window.PROPS.games[0].props[2],null)") === 0.412, "anytime TD does not read its Yes chance");

  /* 5. the slip multiplies, and reports a same-game pair honestly */
  js("PSLIP=[{gid:'g1',m:'rec_yds',who:'Rashee Rice',num:69.5,p:0.5},{gid:'g1',m:'rec',who:'Travis Kelce',num:4.5,p:0.4}];");
  check(Math.abs(js("pslipChance()") - 0.2) < 1e-9, "a props slip does not multiply its picks");
  check(js("pslipSameGame()") === 1, "a same-game props pair is not flagged");
  check(js("propSlipHtml()").includes("floor"), "the same-game warning is missing");
  js("PSLIP=[{gid:'g1',m:'rec_yds',who:'A',num:1,p:0.5},{gid:'g2',m:'rec',who:'B',num:1,p:0.5}];");
  check(js("pslipSameGame()") === 0, "two different games were called a same-game pair");

  /* 6. no payout typed, no verdict (ruling 1 of 2026-09-20, same as Hot Slips) */
  js("PPAYOUT=null;PSTAKE=null;");
  check(!js("propSlipHtml()").includes("verdict"), "a verdict appeared before a payout was typed");
  js("PSTAKE=10;PPAYOUT=40;");
  const withPay = js("propSlipHtml()");
  check(withPay.includes("verdict"), "no verdict after a real payout was typed");
  /* 0.25 chance x $40 on $10 = EV 0.0 -> Coin toss on the one verdict scale */
  check(withPay.includes("Coin toss"), "the props verdict does not use the one verdict scale");

  /* 7. the props tab never borrows the game slip, and the game slip never sees props */
  check(js("typeof slip==='undefined'||!(slip.legs||[]).some(l=>l.m)"), "a prop leaked into the game slip");

  /* 8. the screen draws without a DOM tantrum, and an empty file says so kindly */
  js("renderProps();");
  js("window.PROPS={updated:null,games:[],markets:[]};renderProps();");
  check(String(byId.viewProps.innerHTML).includes("game day"), "an empty props file does not explain itself");

  /* 9. the two-level prop-type filter. One state (PON, the markets); the group
        chips are derived from it, so the two rows can never disagree. */
  js("window.PROPS=" + JSON.stringify(FIXTURE) + ";PQ='';PON=new Set();");
  check(js("propGroups().map(g=>g.k).join(',')") === "recv,td",
        "a group with no prop on the board was drawn, or one with props was not");
  check(js("propGames()[0].props.length") === 3, "the board is filtered before any chip is tapped");
  js("propGroupToggle('recv');");
  check(js("[...PON].sort().join(',')") === "rec,rec_yds", "tapping a group did not light its markets");
  check(js("propGames()[0].props.map(r=>r.m).sort().join(',')") === "rec,rec_yds",
        "the board did not narrow to the lit group");
  check(js("propFilterHtml()").includes('data-pm="rec_yds"'),
        "a lit multi-market group did not open its second row");
  js("PON.delete('rec');");
  check(js("propFilterHtml()").includes('class="chip part"'), "a half-lit group is not marked");
  js("propGroupToggle('recv');");
  check(js("[...PON].sort().join(',')") === "rec,rec_yds", "a half-lit group did not fill");
  js("propGroupToggle('recv');");
  check(js("PON.size") === 0, "a full group did not clear");
  /* a single-market group needs no second row - its own chip is the market */
  js("propGroupToggle('td');");
  check(!js("propFilterHtml()").includes('data-pm='), "a one-market group opened a pointless second row");
  check(js("propGames()[0].props.length") === 1, "the Touchdowns chip did not narrow the board");
  js("propGroupToggle('all');");
  check(js("PON.size") === 0 && js("propGames()[0].props.length") === 3, "All did not clear the chips");
  /* a market props.py ships that the page has never heard of must still show up */
  const EXTRA = JSON.parse(JSON.stringify(FIXTURE));
  EXTRA.games[0].props.push({ m: "player_sacks", who: "Nick Bolton", line: 0.5, dk: 150, lo: 0.5, step: 0.5, p: [380, 120] });
  js("window.PROPS=" + JSON.stringify(EXTRA) + ";PON=new Set();");
  check(js("propGroups().map(g=>g.k).join(',')").endsWith("other"), "an unknown market did not land in Other");
  check(js("propGames()[0].props.length") === 4, "an unknown market fell off the board");
  js("window.PROPS=" + JSON.stringify(FIXTURE) + ";PON=new Set();PQ='';PSEC={};");

  /* 10. the prop type is a heading, and Anytime TD opens shut (Danny's sketch) */
  let card = js("propGameHtml(propGames()[0])");
  check(!card.includes('<th class="mk">') && !card.includes('<td class="mk">'),
        "the Prop column is still being drawn per row");
  check(card.includes("Receptions") && card.includes("Anytime TD"),
        "a prop type heading is missing from the card");
  check(card.includes("Rashee Rice"), "an open section did not draw its players");
  check(!card.includes("Isiah Pacheco"), "Anytime TD did not open shut");
  /* tapping the heading opens it, and tapping again shuts it */
  js("PSEC['g1|any_td']=true;");
  check(js("propGameHtml(propGames()[0])").includes("Isiah Pacheco"),
        "tapping an Anytime TD heading did not open it");
  js("PSEC={};PQ='Pacheco';");
  check(js("propGameHtml(propGames()[0])").includes("Isiah Pacheco"),
        "a search hit stayed hidden inside a shut heading");
  js("PQ='';PON=new Set(['any_td']);");
  check(js("propGameHtml(propGames()[0])").includes("Isiah Pacheco"),
        "filtering to Touchdowns left the section shut");
  js("PON=new Set();PQ='';PSEC={};");

} catch (e) {
  fails.push("threw: " + (e && e.stack || e));
} finally {
  try { fs.unlinkSync(path.join(root, ".props_fixture.js")); } catch (e) {}
}

if (fails.length) {
  console.log("  FAIL  props page test");
  fails.forEach(f => console.log("        - " + f));
  process.exit(1);
}
console.log("  ok    props page test (ladder lookups, off-book numbers, off-ladder refusals, anytime TD, same-game warning, no verdict without a payout, one verdict scale)");
