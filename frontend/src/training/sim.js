// Deterministic yard simulation. Mirrors backend/training_sim.py 1:1 (the server re-simulates to validate results).
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ORDER = ["up", "right", "down", "left"];
const BLOCK = { "#": "a wall", C: "a crate", L: "the lever", P: "the pole" };
const TALL = new Set(["#", "L", "P"]);

export const tile = (ch, x, y) => (y >= 0 && y < ch.grid.length && x >= 0 && x < ch.grid[0].length ? ch.grid[y][x] : "#");

export function startState(ch) {
  const [x, y, dir] = ch.start;
  return { x, y, dir, h: 0, claw_up: false, claw_open: false, holding: null, gates: false, actions: 0, stumbles: 0, status: "playing" };
}

export const pose = s => ({ x: s.x, y: s.y, h: s.h, dir: s.dir, claw_up: s.claw_up, claw_open: s.claw_open, holding: s.holding, gates: s.gates });

function enter(ch, s, x, y, how) {
  const t = tile(ch, x, y);
  if (BLOCK[t] || (t === "G" && !s.gates)) return ["stumble", `Bumped into ${BLOCK[t] || "a closed gate"}.`];
  if (t === "^" && s.h === 0 && how !== "climb") return ["stumble", "That ledge is too high. Climb it."];
  s.x = x; s.y = y; s.h = t === "^" ? 1 : 0;
  if (t === "Y") return ["fail", "Fell into the pit. Climb the rope to swing across."];
  if (t === "R") return ["fail", "Stepped on a red danger tile."];
  if (t === "F" && (!ch.need_key || s.holding === "key")) return ["success", "Reached the flag!"];
  return null;
}

export function apply(ch, state, a) {
  const s = { ...state, actions: state.actions + 1 };
  const frames = [];
  const done = (kind, msg) => {
    if (kind === "stumble") s.stumbles += 1;
    else if (kind === "fail" || kind === "success") s.status = kind === "fail" ? "failed" : "success";
    if (kind === "ok" && tile(ch, s.x, s.y) === "F") msg += " The flag needs the key from the pole.";
    return { state: s, event: { kind, msg }, frames: frames.length ? frames : [pose(s)] };
  };
  let [dx, dy] = DIRS[s.dir];
  const front = tile(ch, s.x + dx, s.y + dy);
  switch (a.type) {
    case "move": {
      if (DIRS[a.dir]) s.dir = a.dir;
      else if (a.dir === "back") s.dir = ORDER[(ORDER.indexOf(s.dir) + 2) % 4];
      [dx, dy] = DIRS[s.dir];
      for (let i = 0; i < a.n; i++) {
        const ev = enter(ch, s, s.x + dx, s.y + dy, "walk");
        frames.push(pose(s));
        if (ev) return done(...ev);
      }
      return done("ok", `Moved ${a.dir} ${a.n}.`);
    }
    case "turn":
      s.dir = ORDER[(ORDER.indexOf(s.dir) + (a.dir === "right" ? 1 : 3)) % 4];
      return done("ok", `Turned ${a.dir}.`);
    case "jump": {
      if (TALL.has(front) || (front === "G" && !s.gates) || (front === "^" && s.h === 0)) return done("stumble", "Too tall to jump over.");
      const ev = enter(ch, s, s.x + 2 * dx, s.y + 2 * dy, "walk");
      return ev ? done(...ev) : done("ok", "Jumped.");
    }
    case "climb": {
      if (front === "^" && s.h === 0) { const ev = enter(ch, s, s.x + dx, s.y + dy, "climb"); return ev ? done(...ev) : done("ok", "Climbed the ledge."); }
      if (front === "Y") { const ev = enter(ch, s, s.x + 2 * dx, s.y + 2 * dy, "walk"); return ev ? done(...ev) : done("ok", "Swung across on the rope."); }
      return done("stumble", "Nothing to climb here.");
    }
    case "lift_claw": case "lower_claw":
      s.claw_up = a.type === "lift_claw";
      return done("ok", s.claw_up ? "Claw up." : "Claw down.");
    case "open_claw": case "close_claw":
      s.claw_open = a.type === "open_claw";
      return done("ok", s.claw_open ? "Claw open." : "Claw closed.");
    case "grab":
      if (front !== "P") return done("stumble", "Nothing to grab here. Face the pole.");
      if (!s.claw_up) return done("stumble", "Lift your claw first: the notches are high.");
      if (!s.claw_open) return done("stumble", "Open your claw first.");
      if (s.holding) return done("stumble", "Your claw is already full.");
      s.claw_open = false;
      if (a.notches !== ch.key_notch) return done("stumble", `Notch ${a.notches} is empty.`);
      s.holding = "key";
      return done("ok", `Got the key from notch ${a.notches}!`);
    case "release":
      if (!s.holding) return done("ok", "Nothing to release.");
      s.holding = null; s.claw_open = true;
      return done("ok", "Released the key.");
    case "pull_lever":
      if (front !== "L") return done("stumble", "No lever in front of you.");
      s.gates = true;
      return done("ok", "Gates open!");
    default:
      return done("ok", `Waited ${a.n || 1}.`);
  }
}

export function describe(a) {
  if (a.type === "move") return `move(${a.dir}, ${a.n})`;
  if (a.type === "turn") return `turn(${a.dir})`;
  if (a.type === "grab") return `grab(pole, ${a.notches})`;
  if (a.type === "wait") return `wait(${a.n})`;
  return `${a.type}()`;
}
