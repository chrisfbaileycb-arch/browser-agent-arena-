#!/usr/bin/env node
/**
 * Course smoke tests — renders every station of both obstacle courses the same way
 * backend/courses.py does, boots it in jsdom, and drives the real interactions:
 * clear/decoy calls, answer validation, reveal mechanics, and the agent-facing
 * contract (Course API, course-config, station ids).
 *
 * Run: npm run course:smoke
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// jsdom is a yarn devDependency of frontend/ (no root lockfile).
const { JSDOM, VirtualConsole } = createRequire(join(root, "frontend", "package.json"))("jsdom");
const coursesDir = join(root, "backend", "courses");

/* ---------------- fixtures ---------------- */
const puzzles = JSON.parse(execSync(`python3 ${join(root, "scripts", "kelp_puzzles.py")}`, { cwd: root }).toString());
const KELP_PUZZLE = puzzles["smoke-seed-1"];

/* ---------------- renderer (mirrors backend/courses.py) ---------------- */
function render(courseId, station, config) {
  const layout = readFileSync(join(coursesDir, courseId, "_layout.html"), "utf8");
  const body = readFileSync(join(coursesDir, courseId, `${station}.html`), "utf8");
  return layout
    .replaceAll("{{TITLE}}", station)
    .replaceAll("{{STATION}}", station)
    .replaceAll("{{CONFIG}}", JSON.stringify(config).replaceAll("</", "<\\/"))
    .replaceAll("{{BODY}}", body);
}

function configFor(courseId, station, extra = {}) {
  const order = COURSE_ORDER[courseId];
  return {
    course: courseId, attempt: "TEST", station, index: order.indexOf(station), order,
    names: order.map((s) => s), cleared: [], nonce: "nonce-" + station, decoys: 0,
    started_at: new Date().toISOString(), code: null, ...extra,
  };
}

const COURSE_ORDER = {
  "obstacle-1": ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"],
  "kelp-2": ["entry", "current", "maze", "crates", "tide", "cave", "lookalike", "finish"],
};

/* ---------------- fake course-attempts server ---------------- */
function makeServer(courseId, station) {
  const state = { cleared: 0, decoys: 0, calls: [], answers: [] };
  const isLast = station === COURSE_ORDER[courseId][COURSE_ORDER[courseId].length - 1];
  const expected = courseId === "kelp-2" ? KELP_PUZZLE[station]?.answer ?? null : null;

  const fetch = async (url, opts) => {
    const path = String(url).split("/TEST")[1] || String(url);
    const body = JSON.parse(opts.body || "{}");
    state.calls.push({ path, ...body });
    if (path === "/decoy") {
      state.decoys += 1;
      return { ok: true, json: async () => ({ decoys: state.decoys }) };
    }
    if (path === "/clear") {
      if (expected !== null && String(body.answer ?? "").trim().toLowerCase() !== expected.toLowerCase()) {
        return { ok: false, json: async () => ({ detail: "Not quite. That answer doesn't match this station's instructions (counted as a decoy hit)." }) };
      }
      state.cleared += 1;
      if (body.answer != null) state.answers.push(String(body.answer));
      return { ok: true, json: async () => (isLast ? { finished: true, code: "SOE-AB12-CD34" } : { finished: false, next_path: "/next-station" }) };
    }
    return { ok: false, json: async () => ({ detail: "unknown path " + path }) };
  };
  return { state, fetch };
}

/* ---------------- jsdom harness ---------------- */
function boot(courseId, station, config, server, { now } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => { /* swallow "not implemented: navigation" */ });
  const dom = new JSDOM(render(courseId, station, config), {
    runScripts: "dangerously",
    virtualConsole,
    url: "http://localhost/api/courses/" + courseId + "/" + station + "?a=TEST",
    beforeParse(window) {
      window.fetch = server.fetch;
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
      if (now != null) window.Date.now = () => now;
    },
  });
  return dom;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (dom, sel) => dom.window.document.querySelector(sel);
const $$ = (dom, sel) => [...dom.window.document.querySelectorAll(sel)];

/* ---------------- tiny test runner ---------------- */
let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log("  ✗ " + name + " — " + err.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

/* ---------------- shared contract checks ---------------- */
async function contract(courseId, station, config, server) {
  const dom = boot(courseId, station, config, server);
  const w = dom.window;
  assert(typeof w.Course === "object" && w.Course, "window.Course missing");
  for (const m of ["clear", "decoy", "cfg"]) assert(m in w.Course, "Course." + m + " missing");
  if (courseId === "kelp-2") for (const m of ["el", "P", "stage"]) assert(m in w.Course, "Course." + m + " missing");
  const cfg = JSON.parse($(dom, "#course-config").textContent);
  assertEqual(cfg.station, station, "course-config station");
  assertEqual($(dom, "body").dataset.station, station, "body[data-station]");
  assert($$(dom, "#course-map .post").length === COURSE_ORDER[courseId].length, "course map posts");
  assert($(dom, "#timer"), "timer missing");
  assert($(dom, "#toast"), "toast missing");
  dom.window.close();
}

/* ================= obstacle-1 ================= */
async function obstacle1() {
  console.log("\nObstacle Course 1 — The Tidepool Gauntlet");

  for (const st of COURSE_ORDER["obstacle-1"]) {
    await test(`contract: ${st}`, () => contract("obstacle-1", st, configFor("obstacle-1", st), makeServer("obstacle-1", st)));
  }

  await test("start: skip is a decoy, go clears", async () => {
    const server = makeServer("obstacle-1", "start");
    const dom = boot("obstacle-1", "start", configFor("obstacle-1", "start"), server);
    $(dom, "#skip").click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "decoy count after skip");
    assert($(dom, "#toast").textContent.includes("TRAP!"), "toast announces trap");
    $(dom, "#go").click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called on go");
    dom.window.close();
  });

  await test("wall: scroll reveals the hold, clicking clears", async () => {
    const server = makeServer("obstacle-1", "wall");
    const dom = boot("obstacle-1", "wall", configFor("obstacle-1", "wall"), server);
    $(dom, "#ladder").click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "ladder is a decoy");
    assert(!$(dom, "#grab-hold"), "hold hidden before scroll");
    dom.window.document.getElementById("wall").dispatchEvent(new dom.window.Event("scroll"));
    const hold = $(dom, "#grab-hold");
    assert(hold, "hold revealed after scroll");
    hold.click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called on hold");
    dom.window.close();
  });

  await test("doors: only the carved door clears", async () => {
    const server = makeServer("obstacle-1", "doors");
    const dom = boot("obstacle-1", "doors", configFor("obstacle-1", "doors"), server);
    $(dom, "#door-continue").click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "continue CTA is a decoy");
    const pass = $(dom, "#pass").textContent;
    const doors = $$(dom, ".door");
    assertEqual(doors.length, 3, "three doors");
    const wrong = doors.find((d) => !d.textContent.includes(pass));
    wrong.click();
    await sleep(10);
    assertEqual(server.state.decoys, 2, "wrong door is a decoy");
    doors.find((d) => d.textContent.includes(pass)).click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called on real door");
    dom.window.close();
  });

  await test("rope: validation, then the three knots clear", async () => {
    const server = makeServer("obstacle-1", "rope");
    const dom = boot("obstacle-1", "rope", configFor("obstacle-1", "rope"), server);
    const d = dom.window.document;
    d.getElementById("knot-1-next").click();
    assert($(dom, "#rope-err").textContent.includes("3 letters"), "short name rejected");
    d.getElementById("climber").value = "Pinchy";
    d.getElementById("knot-1-next").click();
    assert(!d.getElementById("knot-2").hidden, "knot 2 shown");
    d.getElementById("grip").value = "Slip knot";
    d.getElementById("knot-2-next").click();
    assert($(dom, "#rope-err").textContent.includes("slipped"), "wrong knot rejected");
    d.getElementById("grip").value = "Bowline";
    d.getElementById("knot-2-next").click();
    assert(!d.getElementById("knot-3").hidden, "knot 3 shown");
    const a = Number($(dom, "#num-a").textContent), b = Number($(dom, "#num-b").textContent);
    d.getElementById("length").value = String(a + b + 1);
    d.getElementById("knot-3-next").click();
    assert($(dom, "#rope-err").textContent.includes("Wrong rope length"), "wrong sum rejected");
    d.getElementById("length").value = String(a + b);
    d.getElementById("knot-3-next").click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called at the top");
    dom.window.close();
  });

  await test("beam: out-of-order is a decoy, 1-2-3 clears", async () => {
    const server = makeServer("obstacle-1", "beam");
    const dom = boot("obstacle-1", "beam", configFor("obstacle-1", "beam"), server);
    const planks = $$(dom, ".plank");
    assertEqual(planks.length, 3, "three planks");
    planks.find((p) => p.dataset.n === "3").click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "wrong order counts as decoy");
    for (const n of ["1", "2", "3"]) planks.find((p) => p.dataset.n === n).click();
    await sleep(10);
    assertEqual($(dom, "#beam-status").textContent, "Beam crossed!", "status after crossing");
    assertEqual(server.state.cleared, 1, "clear called after beam");
    dom.window.close();
  });

  await test("tunnel: side passages decoy, lantern clears", async () => {
    const server = makeServer("obstacle-1", "tunnel");
    const dom = boot("obstacle-1", "tunnel", configFor("obstacle-1", "tunnel"), server);
    $$(dom, ".side")[0].click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "side passage is a decoy");
    $(dom, "#lantern").click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called at lantern");
    dom.window.close();
  });

  await test("finish: raising the flag issues the code", async () => {
    const server = makeServer("obstacle-1", "finish");
    const cfg = configFor("obstacle-1", "finish");
    const dom = boot("obstacle-1", "finish", cfg, server);
    $(dom, "#raise-flag").click();
    await sleep(10);
    assertEqual($(dom, "#finish-code").textContent, "SOE-AB12-CD34", "code displayed");
    assert(!$(dom, "#result").hidden, "result revealed");
    assert($(dom, "#finish-board").classList.contains("raised"), "flag raised");
    assert($(dom, "#raise-flag").disabled, "button disabled after raising");
    dom.window.close();
  });
}

/* ================= kelp-2 ================= */
async function kelp2() {
  console.log("\nObstacle Course 2 — The Kelp Forest Circuit");

  for (const st of COURSE_ORDER["kelp-2"]) {
    await test(`contract: ${st}`, () => contract("kelp-2", st, configFor("kelp-2", st, { puzzle: KELP_PUZZLE[st].puzzle }), makeServer("kelp-2", st)));
  }

  await test("entry: the vendor offer traps, dismissing works, enter clears", async () => {
    const server = makeServer("kelp-2", "entry");
    const dom = boot("kelp-2", "entry", configFor("kelp-2", "entry", { puzzle: KELP_PUZZLE.entry.puzzle }), server);
    const P = KELP_PUZZLE.entry.puzzle;
    assert(dom.window.document.body.querySelector(".overlay"), "overlay shown");
    dom.window.document.getElementById(P.ids.c).click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "accepting the offer is a decoy");
    dom.window.document.getElementById(P.ids.e).click();
    assert(!dom.window.document.body.querySelector(".overlay"), "overlay dismissed");
    dom.window.document.getElementById(P.ids.a).click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called on enter");
    dom.window.close();
  });

  await test("current: infinite scroll loads buoys, only the tagged one clears", async () => {
    const server = makeServer("kelp-2", "current");
    const dom = boot("kelp-2", "current", configFor("kelp-2", "current", { puzzle: KELP_PUZZLE.current.puzzle }), server);
    const P = KELP_PUZZLE.current.puzzle;
    const list = dom.window.document.getElementById(P.ids.b);
    const first = list.querySelectorAll(".buoy").length;
    assertEqual(first, P.batch, "first batch rendered");
    dom.window.document.getElementById(P.ids.c).click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "nearest buoy is a decoy");
    list.dispatchEvent(new dom.window.Event("scroll"));
    await sleep(320);
    assert(list.querySelectorAll(".buoy").length > first, "more buoys after scrolling to the end");
    for (let i = 0; i < 6; i++) {
      if ([...list.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === P.verb + " buoy " + P.target)) break;
      list.dispatchEvent(new dom.window.Event("scroll"));
      await sleep(320);
    }
    const btn = [...list.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === P.verb + " buoy " + P.target);
    assert(btn, "target buoy present");
    btn.click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called with target");
    assertEqual(server.state.answers[0], P.target, "answer is the target tag");
    dom.window.close();
  });

  await test("maze: chained dropdowns clear with direction|passage", async () => {
    const server = makeServer("kelp-2", "maze");
    const dom = boot("kelp-2", "maze", configFor("kelp-2", "maze", { puzzle: KELP_PUZZLE.maze.puzzle }), server);
    const P = KELP_PUZZLE.maze.puzzle;
    const d = dom.window.document;
    const dir = d.getElementById(P.ids.a), pass = d.getElementById(P.ids.c), swim = d.getElementById(P.ids.e);
    // the marshal's instruction names one direction + one passage pair — that pair is the answer
    const wantDir = P.dirs.find((x) => P.instruction.includes(x));
    const wantPass = P.passages[wantDir].find((x) => P.instruction.includes(x));
    assert(wantDir && wantPass, "instruction pair resolvable");
    assert(swim.disabled, "swim disabled initially");
    dir.value = wantDir;
    dir.dispatchEvent(new dom.window.Event("change"));
    assertEqual(pass.querySelectorAll("option").length - 1, 4, "passages chained to direction");
    assert(pass.value === "" && !pass.disabled, "passage enabled after direction");
    pass.value = wantPass;
    pass.dispatchEvent(new dom.window.Event("change"));
    assert(!swim.disabled, "swim enabled after passage");
    swim.click();
    await sleep(10);
    assertEqual(server.state.answers[0], wantDir + "|" + wantPass, "answer format direction|passage");
    dom.window.close();
  });

  await test("crates: wrong stack order is rejected, correct order seals", async () => {
    const server = makeServer("kelp-2", "crates");
    const dom = boot("kelp-2", "crates", configFor("kelp-2", "crates", { puzzle: KELP_PUZZLE.crates.puzzle }), server);
    const P = KELP_PUZZLE.crates.puzzle;
    const d = dom.window.document;
    const buttons = [...d.querySelectorAll(".pile .crate .btn")];
    assertEqual(buttons.length, 4, "four crates");
    const byId = Object.fromEntries(P.crates.map((c) => [c.id, c]));
    const heaviestFirst = P.rule.includes("heaviest first");
    const rightOrder = [...P.crates].sort((x, y) => (heaviestFirst ? y.kg - x.kg : x.kg - y.kg)).map((c) => c.id);
    const wrongOrder = [...rightOrder].reverse();
    const place = (id) => d.querySelector(`.pile .crate.${id} .btn`).click();
    wrongOrder.forEach(place);
    assert(!d.getElementById(P.ids.e).disabled, "seal enabled when stack full");
    d.getElementById(P.ids.e).click();
    await sleep(10);
    assertEqual(server.state.cleared, 0, "wrong order rejected");
    assert(dom.window.document.getElementById("toast").textContent.includes("Not quite"), "server message shown");
    d.getElementById(P.ids.g).click(); // restack
    rightOrder.forEach(place);
    d.getElementById(P.ids.e).click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "correct order clears");
    assertEqual(server.state.answers[0], rightOrder.join(","), "answer is bottom-first order");
    void byId;
    dom.window.close();
  });

  await test("tide: forcing the gate decoys, waiting for open clears", async () => {
    const server = makeServer("kelp-2", "tide");
    const P = KELP_PUZZLE.tide.puzzle;
    const nowMs = Math.floor((P.open_s / 2 - P.offset) * 1000); // phase == open_s/2 → open
    const dom = boot("kelp-2", "tide", configFor("kelp-2", "tide", { puzzle: P }), server, { now: nowMs });
    const d = dom.window.document;
    const status = d.getElementById(P.ids.b);
    assert(status.textContent.includes("OPEN"), "gate open in window");
    assert(!d.getElementById(P.ids.c).disabled, "swim enabled while open");
    d.getElementById(P.ids.e).click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "forcing the gate decoys");
    d.getElementById(P.ids.c).click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called when gate open");
    dom.window.close();
  });

  await test("cave: the faded sign is stale, the carved word passes", async () => {
    const server = makeServer("kelp-2", "cave");
    const dom = boot("kelp-2", "cave", configFor("kelp-2", "cave", { puzzle: KELP_PUZZLE.cave.puzzle }), server);
    const P = KELP_PUZZLE.cave.puzzle;
    const d = dom.window.document;
    assert(d.getElementById(P.ids.b).srcdoc.includes(P.word), "password carved inside the frame");
    d.getElementById(P.ids.g).click();
    await sleep(10);
    assertEqual(server.state.decoys, 1, "faded sign is a decoy");
    d.getElementById(P.ids.c).value = P.fake;
    d.getElementById(P.ids.e).click();
    await sleep(10);
    assertEqual(server.state.cleared, 0, "stale password rejected");
    d.getElementById(P.ids.c).value = P.word;
    d.getElementById(P.ids.e).click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "carved password clears");
    dom.window.close();
  });

  await test("lookalike: only the serial-matched button clears", async () => {
    const server = makeServer("kelp-2", "lookalike");
    const dom = boot("kelp-2", "lookalike", configFor("kelp-2", "lookalike", { puzzle: KELP_PUZZLE.lookalike.puzzle }), server);
    const P = KELP_PUZZLE.lookalike.puzzle;
    const d = dom.window.document;
    const btn = [...d.querySelectorAll(".mirror")].find((b) => b.id === P.buttons.find((x) => x.serial === P.serial).id);
    assert(btn, "real button present");
    btn.click();
    await sleep(10);
    assertEqual(server.state.cleared, 1, "clear called on real button");
    assertEqual(server.state.answers[0], P.serial, "answer is the serial");
    dom.window.close();
  });

  await test("finish: ringing the buoy issues the code", async () => {
    const server = makeServer("kelp-2", "finish");
    const dom = boot("kelp-2", "finish", configFor("kelp-2", "finish", { puzzle: KELP_PUZZLE.finish.puzzle }), server);
    const P = KELP_PUZZLE.finish.puzzle;
    const d = dom.window.document;
    d.getElementById(P.ids.a).click();
    await sleep(10);
    assertEqual(d.getElementById("finish-code").textContent, "SOE-AB12-CD34", "code displayed");
    assert(!d.getElementById("result").hidden, "result revealed");
    dom.window.close();
  });
}

/* ================= run ================= */
await obstacle1();
await kelp2();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.error("\n" + f.name + "\n  " + (f.err.stack || f.err.message));
  process.exit(1);
}
