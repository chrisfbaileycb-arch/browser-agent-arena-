import { useCallback, useEffect, useRef, useState } from "react";
import { REDUCED_MOTION } from "../components/Crab";
import { apply, pose, startState } from "./sim";

const STEP_MS = REDUCED_MOTION ? 70 : 340;
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Plays actions through the deterministic sim, frame by frame, so the 3D/2D yard can tween between poses.
export function useYard(ch) {
  const [state, setState] = useState(() => startState(ch));
  const [shown, setShown] = useState(() => pose(startState(ch)));
  const [fx, setFx] = useState({ kind: "idle", msg: "", seq: 0 });
  const ref = useRef({ s: startState(ch), acts: [] });
  const reset = useCallback(() => {
    const s = startState(ch);
    ref.current = { s, acts: [] };
    setState(s); setShown(pose(s)); setFx(f => ({ kind: "idle", msg: "", seq: f.seq + 1 }));
  }, [ch]);
  useEffect(reset, [reset]);
  const run = useCallback(async actions => {
    const r = ref.current, out = [];
    for (const a of actions) {
      if (r.s.status !== "playing" || r !== ref.current) break;
      const { state: s, event, frames } = apply(ch, r.s, a);
      r.acts.push(a);
      for (const f of frames) { setShown(f); await sleep(STEP_MS); if (r !== ref.current) return out; }
      r.s = s; setState(s); setFx(f => ({ ...event, seq: f.seq + 1 })); out.push(event);
      if (event.kind !== "ok") { await sleep(REDUCED_MOTION ? 100 : 550); break; }
    }
    return out;
  }, [ch]);
  return { state, shown, fx, run, reset, actions: () => [...ref.current.acts], live: () => ref.current.s };
}
