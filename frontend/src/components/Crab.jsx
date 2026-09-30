import { lazy, Suspense } from "react";
import Crab2D from "./Crab2D";

const Crab3DView = lazy(() => import("./Crab3D"));

export const WEBGL = (() => {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2")) || !!c.getContext("webgl");
  } catch { return false; }
})();
export const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// 3D toon crab everywhere; falls back to the 2D SVG crab when WebGL is unavailable (and while the 3D chunk loads).
export default function Crab({ color = "#FF5A4E", accent = "#FFD23F", accessory = "none", mood = "idle", size = 120, interactive = false, label, testId }) {
  const flat = <Crab2D color={color} accent={accent} accessory={accessory} mood={REDUCED_MOTION ? "idle" : mood} size={size} label={label} testId={testId} />;
  if (!WEBGL) return flat;
  return (
    <Suspense fallback={flat}>
      <Crab3DView color={color} accent={accent} accessory={accessory} mood={mood} size={size} interactive={interactive} still={REDUCED_MOTION} label={label} testId={testId} />
    </Suspense>
  );
}
