import { useCallback, useState } from "react";
import { WEBGL } from "./Crab";

const ORDER = ["low", "medium", "high"];
export const PRESETS = {
  high: { dpr: [1, 2], aa: true, shadows: true, env: true, post: "full", heads: true, crowd: 720 },
  medium: { dpr: [1, 1.5], aa: true, shadows: false, env: true, post: "lite", heads: false, crowd: 720 },
  low: { dpr: [1, 1], aa: false, shadows: false, env: false, post: null, heads: false, crowd: 360 },
};

export function detectQuality() {
  if (!WEBGL) return "low";
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const small = Math.min(window.screen.width, window.screen.height) < 700;
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
  } catch { gpu = ""; }
  if (/swiftshader|llvmpipe|software/i.test(gpu) || cores <= 2 || mem <= 2) return "low";
  if (small || cores <= 4 || mem <= 4) return "medium";
  return "high";
}

// "auto" follows device detection and steps down when FPS drops; a manual choice is remembered.
export function useQuality() {
  const [choice, setChoice] = useState(() => localStorage.getItem("soe_quality") || "auto");
  const [auto, setAuto] = useState(detectQuality);
  const level = choice === "auto" ? auto : choice;
  const choose = useCallback(c => { localStorage.setItem("soe_quality", c); setChoice(c); }, []);
  const degrade = useCallback(() => {
    const i = ORDER.indexOf(level);
    if (i <= 0) return;
    if (choice === "auto") setAuto(ORDER[i - 1]); else choose(ORDER[i - 1]);
  }, [level, choice, choose]);
  return { choice, level, preset: PRESETS[level], choose, degrade };
}
