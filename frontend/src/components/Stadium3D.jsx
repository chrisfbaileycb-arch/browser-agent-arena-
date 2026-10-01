import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, DepthOfField, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CrabModel } from "./Crab3D";
import { REDUCED_MOTION } from "./Crab";

const LANES = [-1.4, 1.4];
const NEON = ["#FF5A4E", "#12B5A5", "#4D8BFF", "#FFD23F", "#FF9F1C", "#8B5CF6"];
const THEMES = {
  tidepool: { bg: "#0A0820", ground: "turf", stands: "concrete", neon: NEON, hemi: ["#6C7CFF", "#1A0F2E"], points: ["#FF9F1C", "#12B5A5"], rail: "#FF9F1C",
    banners: [["STEPS OF EXECUTION", "#FF5A4E", "#FFF8EF"], ["BROWSER AGENT ARENA", "#1B1530", "#FFD23F"], ["VERIFIED FINISH CODES", "#12B5A5", "#0A0820"], ["BRING YOUR OWN KEYS", "#4D8BFF", "#FFF8EF"]] },
  kelp: { bg: "#021A24", ground: "sand", stands: "reef", neon: ["#2EE6A6", "#7CF5E4", "#FF7F6E", "#FFD23F", "#4DB8FF", "#B48CFF"], hemi: ["#3FD0C9", "#02141C"], points: ["#2EE6A6", "#4DB8FF"], rail: "#2EE6A6",
    banners: [["KELP FOREST CIRCUIT", "#0A4A3A", "#7CF5E4"], ["NEW SEED EVERY ATTEMPT", "#FF7F6E", "#021A24"], ["NO HARDCODED SELECTORS", "#021A24", "#FFD23F"], ["SURFACE FOR THE CODE", "#2EE6A6", "#021A24"]] },
};
export const xsFor = n => Array.from({ length: n }, (_, i) => -12 + (24 * i) / (n - 1));

// Procedural PBR maps (no downloads): mowed turf, wood grain, twisted rope, concrete.
function canvasTex(w, h, draw, repeat) {
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const speckle = (g, w, h, n, colors) => { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
let TEX;
const tex = () => (TEX ||= {
  turf: canvasTex(512, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#1C5A3A" : "#17492F"; g.fillRect((i * w) / 8, 0, w / 8, h); } speckle(g, w, h, 9000, ["#226B45", "#123D28", "#2A7A50"]); }, [6, 1.6]),
  wood: canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#C27B3E"; g.fillRect(0, 0, w, h); for (let i = 0; i < 46; i++) { g.strokeStyle = `rgba(90,45,15,${0.12 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 4); g.stroke(); } }, [1, 1]),
  rope: canvasTex(64, 256, (g, w, h) => { g.fillStyle = "#D2AA6E"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(110,72,30,.55)"; g.lineWidth = 6; for (let y = -w; y < h + w; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); } }, [1, 6]),
  concrete: canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#2A2350"; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, ["#352D63", "#221C42", "#3D3570"]); }, [10, 1]),
  sand: canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#C9B27C"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 14) { g.strokeStyle = "rgba(120,96,50,.25)"; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 40 + y) * 4); g.stroke(); } speckle(g, w, h, 7000, ["#B89F68", "#DCC896", "#A88E5A"]); }, [6, 1.6]),
  reef: canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#0E3B45"; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, ["#145A63", "#0A2C34", "#1D6B5A", "#FF7F6E"]); }, [10, 1]),
});

const Mat = ({ c = "#FFFFFF", e = 0, map, metal = 0.1, rough = 0.45 }) => (
  <meshStandardMaterial color={c} map={map} emissive={e ? c : "#000000"} emissiveIntensity={e} roughness={rough} metalness={metal} toneMapped={!e} />
);
const Box = ({ p, s, ...m }) => <mesh position={p} castShadow receiveShadow><boxGeometry args={s} /><Mat {...m} /></mesh>;
const METAL = { c: "#C9CCD6", metal: 0.85, rough: 0.28 };

function Arch({ r, c, e = 1.4, n = 1, gap = 0 }) {
  return [...Array(n)].map((_, k) => (
    <mesh key={k} position={[(k - (n - 1) / 2) * gap, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[r, 0.09, 8, 24, Math.PI]} /><Mat c={c} e={e} />
    </mesh>
  ));
}

function Kelp({ p, h = 2.4, c = "#2E8B57" }) {
  const ref = useRef(), ph = useMemo(() => Math.random() * 6, []);
  useFrame(({ clock }) => { if (ref.current && !REDUCED_MOTION) ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.2 + ph) * 0.12; });
  return (
    <group ref={ref} position={p}>
      <mesh position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[0.04, 0.07, h, 6]} /><Mat c={c} rough={0.6} /></mesh>
      {[0.35, 0.6, 0.85].map((k, i) => <mesh key={k} position={[i % 2 ? 0.12 : -0.12, h * k, 0]} rotation={[0, 0, i % 2 ? -0.7 : 0.7]}><sphereGeometry args={[0.16, 8, 6]} /><Mat c={c} rough={0.6} /></mesh>)}
    </group>
  );
}

function KelpObstacle({ id }) {
  const t = tex();
  if (id === "entry") return <group><Kelp p={[0, 0, -1]} /><Kelp p={[0, 0, 1]} /><Box p={[0.1, 1.1, 0]} s={[0.08, 0.9, 1.3]} c="#FFD23F" e={0.8} /><Box p={[0.15, 0.85, 0.3]} s={[0.04, 0.22, 0.5]} c="#FF3DA5" e={1.4} /></group>;
  if (id === "current") return <group>{[-0.7, 0, 0.7].map((z, k) => <mesh key={z} position={[0, 0.06 + k * 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.6, 0.32]} /><meshBasicMaterial color="#4DB8FF" transparent opacity={0.55} toneMapped={false} /></mesh>)}<mesh position={[0.6, 0.35, 0.2]}><sphereGeometry args={[0.22, 14, 10]} /><Mat c="#FF7F6E" rough={0.3} /></mesh></group>;
  if (id === "maze") return <group>{[[-0.6, -0.8], [0, -0.3], [0.6, -0.8], [-0.6, 0.4], [0.6, 0.4], [0, 0.9]].map(([x, z], k) => <Kelp key={k} p={[x, 0, z]} h={1.6 + (k % 3) * 0.4} c={k % 2 ? "#2E8B57" : "#3FA36B"} />)}</group>;
  if (id === "crates") return <group>{[[0, 0.25, -0.4], [0, 0.25, 0.4], [0, 0.75, 0], [0, 1.25, 0]].map((p, k) => <Box key={k} p={p} s={[0.5, 0.48, 0.5]} c="#FFFFFF" map={t.wood} rough={0.7} />)}</group>;
  if (id === "tide") return <group><Box p={[0, 1.6, 0]} s={[0.16, 0.16, 2.2]} {...METAL} />{[-0.8, -0.4, 0, 0.4, 0.8].map(z => <Box key={z} p={[0, 0.8, z]} s={[0.06, 1.6, 0.06]} {...METAL} />)}<mesh position={[-0.3, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.6, 2.2]} /><meshBasicMaterial color="#7CF5E4" transparent opacity={0.4} toneMapped={false} /></mesh></group>;
  if (id === "cave") return <group><mesh position={[0, 0, 0]} castShadow><sphereGeometry args={[1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><Mat c="#4A4F55" rough={0.95} /></mesh><mesh position={[0.95, 0.45, 0]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.42, 16]} /><meshBasicMaterial color="#FFD23F" toneMapped={false} /></mesh></group>;
  if (id === "lookalike") return <group>{[-0.7, 0, 0.7].map((z, k) => <Box key={z} p={[0, 0.7, z]} s={[0.06, 1.2, 0.5]} c={k === 1 ? "#7CF5E4" : "#B9E6F0"} metal={0.9} rough={0.08} e={k === 1 ? 0.6 : 0} />)}</group>;
  return <group><Box p={[0, 0.9, 0]} s={[0.08, 1.8, 0.08]} {...METAL} /><mesh position={[0, 1.95, 0]} castShadow><sphereGeometry args={[0.36, 16, 12]} /><Mat c="#FF7F6E" e={0.9} /></mesh><mesh position={[0, 1.95, 0]}><torusGeometry args={[0.37, 0.05, 6, 20]} /><Mat c="#FFFFFF" e={0.6} /></mesh></group>;
}

function Bubbles() {
  const ref = useRef(), dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useMemo(() => Array.from({ length: 140 }, () => ({ x: (Math.random() - 0.5) * 34, z: (Math.random() - 0.5) * 12 - 1, v: 0.4 + Math.random() * 0.8, p: Math.random() * 10, s: 0.04 + Math.random() * 0.08 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    bits.forEach((b, i) => {
      dummy.position.set(b.x + Math.sin(t + b.p) * 0.2, ((t * b.v + b.p) % 9), b.z);
      dummy.scale.setScalar(REDUCED_MOTION ? 0 : b.s * 10);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[null, null, bits.length]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#BFF7FF" transparent opacity={0.45} roughness={0.1} /></instancedMesh>;
}

function Obstacle({ id, theme }) {
  if (theme === "kelp") return <KelpObstacle id={id} />;
  const t = tex();
  if (id === "start") return <group><Box p={[0, 0.8, -1]} s={[0.15, 1.6, 0.15]} {...METAL} /><Box p={[0, 0.8, 1]} s={[0.15, 1.6, 0.15]} {...METAL} /><Box p={[0, 1.6, 0]} s={[0.2, 0.2, 2.1]} c="#12B5A5" e={1.6} /></group>;
  if (id === "wall") return <group><Box p={[0, 0.7, 0]} s={[0.4, 1.4, 2]} c="#FFFFFF" map={t.wood} rough={0.7} />{[...Array(6)].map((_, k) => <mesh key={k} castShadow position={[0.22, 0.3 + (k % 3) * 0.4, -0.55 + Math.floor(k / 3) * 1.1]}><sphereGeometry args={[0.08, 12, 8]} /><Mat c={NEON[k]} rough={0.3} /></mesh>)}</group>;
  if (id === "doors") return <group><Box p={[0, 1.36, 0]} s={[0.14, 0.1, 2.1]} {...METAL} />{[-0.68, 0, 0.68].map((z, k) => <Box key={z} p={[0, 0.65, z]} s={[0.12, 1.3, 0.55]} c={k === 1 ? "#12B5A5" : "#FF5A4E"} e={k === 1 ? 1.8 : 0.5} />)}</group>;
  if (id === "rope") return <group><Box p={[0, 1.5, -1]} s={[0.12, 3, 0.12]} {...METAL} /><Box p={[0, 3, 0]} s={[0.12, 0.12, 2.1]} {...METAL} /><mesh position={[0, 1.7, 0]} castShadow><cylinderGeometry args={[0.05, 0.05, 2.6, 12]} /><Mat c="#FFFFFF" map={t.rope} rough={0.9} /></mesh></group>;
  if (id === "beam") return <group><Box p={[0, 0.5, 0]} s={[3, 0.14, 0.26]} c="#FFFFFF" map={t.wood} rough={0.6} /><Box p={[-1.3, 0.22, 0]} s={[0.12, 0.44, 0.12]} {...METAL} /><Box p={[1.3, 0.22, 0]} s={[0.12, 0.44, 0.12]} {...METAL} /></group>;
  if (id === "tunnel") return <Arch r={0.8} c="#4D8BFF" e={1.2} n={5} gap={0.45} />;
  return <group><Arch r={1.15} c="#FF3DA5" e={2.4} /><Box p={[0.3, 0.012, 0]} s={[0.6, 0.02, 2.2]} c="#FFFFFF" e={0.5} /></group>;
}

function bannerTexture(text, bg, fg) {
  const c = Object.assign(document.createElement("canvas"), { width: 1024, height: 128 });
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg; g.font = "700 62px Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Banner({ text, bg, fg, x }) {
  const map = useMemo(() => bannerTexture(text, bg, fg), [text, bg, fg]);
  return <mesh position={[x, 0.5, -3.7]}><planeGeometry args={[7.8, 0.98]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>;
}

function useReactionClock(reaction) {
  const st = useRef({ id: null, start: -99, kind: null, color: "#FFD23F" });
  useFrame(({ clock }) => { if (reaction && reaction.id !== st.current.id) st.current = { ...reaction, start: clock.elapsedTime }; });
  return st;
}

const SKIN = ["#F2C9A0", "#D9A273", "#A8704A", "#7A4B2E", "#FFDFC4"];

function Crowd({ reaction, count = 720, heads = false }) {
  const ref = useRef(), headRef = useRef();
  const st = useReactionClock(reaction);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seats = useMemo(() => {
    const cols = count / 6, gap = 34 / cols;
    return Array.from({ length: count }, (_, i) => {
      const row = i % 6;
      return { x: -17 + Math.floor(i / 6) * gap + (row % 2) * gap * 0.5, y: (row + 1) * 0.55 + 0.17, z: -5.2 - row * 0.7, p: Math.random() * 6 };
    });
  }, [count]);
  useLayoutEffect(() => {
    seats.forEach((_, i) => ref.current.setColorAt(i, new THREE.Color(NEON[i % 6]).multiplyScalar(0.55 + Math.random() * 0.45)));
    ref.current.instanceColor.needsUpdate = true;
    if (headRef.current) {
      seats.forEach((_, i) => headRef.current.setColorAt(i, new THREE.Color(SKIN[i % SKIN.length])));
      headRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, heads]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, r = st.current, age = t - r.start, calm = REDUCED_MOTION ? 0.3 : 1;
    seats.forEach((s, i) => {
      let y = s.y + Math.max(0, Math.sin(t * 3 + s.p)) * 0.1 * calm, sy = 1, lean = 0;
      if (r.kind === "cheer" && age < 3.2) { const front = age * 22 - 2 - (s.x + 17); y += Math.exp(-(front * front) / 6) * 0.55 * calm + 0.04; }
      if (r.kind === "groan" && age < 2.6) { const k = Math.min(1, age * 4) * Math.min(1, Math.max(0, 2.6 - age) * 1.5); y -= 0.1 * k; sy = 1 - 0.35 * k; lean = 0.5 * k; }
      if (r.kind === "finish" && age < 8) y += Math.abs(Math.sin(t * 9 + s.p)) * 0.4 * calm * (1 - age / 8);
      dummy.position.set(s.x, y, s.z);
      dummy.scale.set(1, sy, 1);
      dummy.rotation.set(lean, 0, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      if (headRef.current) {
        dummy.position.set(s.x, y + 0.24 * sy, s.z + lean * 0.12);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        headRef.current.setMatrixAt(i, dummy.matrix);
      }
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (headRef.current) headRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[null, null, seats.length]}><capsuleGeometry args={[0.09, 0.16, 2, 6]} /><meshStandardMaterial roughness={0.7} /></instancedMesh>
      {heads && <instancedMesh ref={headRef} args={[null, null, seats.length]}><sphereGeometry args={[0.075, 8, 6]} /><meshStandardMaterial roughness={0.6} /></instancedMesh>}
    </group>
  );
}

// Confetti + camera flashes in the stands; both instanced and skipped for reduced motion.
function Celebration({ reaction }) {
  const confetti = useRef(), flashes = useRef();
  const st = useReactionClock(reaction);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useMemo(() => Array.from({ length: 360 }, () => ({ x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 8 - 1, y0: 8 + Math.random() * 6, v: 1.4 + Math.random() * 2, spin: Math.random() * 6, p: Math.random() * 6 })), []);
  const bulbs = useMemo(() => Array.from({ length: 60 }, () => { const row = Math.floor(Math.random() * 6); return { x: (Math.random() - 0.5) * 33, y: (row + 1) * 0.55 + 0.45, z: -5.1 - row * 0.7, p: Math.random() * 100 }; }), []);
  useLayoutEffect(() => {
    bits.forEach((_, i) => confetti.current.setColorAt(i, new THREE.Color(NEON[i % 6])));
    confetti.current.instanceColor.needsUpdate = true;
  }, [bits]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, r = st.current, age = t - r.start;
    const party = r.kind === "finish" && age < 7 && !REDUCED_MOTION;
    const popping = !REDUCED_MOTION && ((r.kind === "finish" && age < 8) || (r.kind === "cheer" && age < 2.5));
    bits.forEach((b, i) => {
      dummy.position.set(b.x + Math.sin(t * 2 + b.p) * 0.4, b.y0 - age * b.v, b.z);
      dummy.rotation.set(t * b.spin, t * b.spin * 0.7, 0);
      dummy.scale.setScalar(party ? 1 : 0);
      dummy.updateMatrix();
      confetti.current.setMatrixAt(i, dummy.matrix);
    });
    bulbs.forEach((f, i) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(popping && Math.sin(t * 23 + f.p) > 0.97 ? 1 : 0);
      dummy.updateMatrix();
      flashes.current.setMatrixAt(i, dummy.matrix);
    });
    confetti.current.instanceMatrix.needsUpdate = true;
    flashes.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={confetti} args={[null, null, bits.length]}><planeGeometry args={[0.2, 0.11]} /><meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} /></instancedMesh>
      <instancedMesh ref={flashes} args={[null, null, bulbs.length]}><sphereGeometry args={[0.13, 6, 4]} /><meshBasicMaterial color="#FFFFFF" toneMapped={false} /></instancedMesh>
    </group>
  );
}

const TOWERS = [[-16, -6.5], [16, -6.5], [-16, 4.8], [16, 4.8]];

function FloodLights({ reaction }) {
  const st = useReactionClock(reaction);
  const heads = useRef([]), spots = useRef([]);
  const base = useMemo(() => new THREE.Color("#FFF4DA"), []);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, r = st.current, win = r.kind === "finish" && t - r.start < 6;
    const pulse = win && !REDUCED_MOTION ? (Math.sin(t * 18) > 0 ? 1.4 : 0.2) : 1;
    tint.set(win ? r.color || "#FFD23F" : "#FFF4DA");
    heads.current.forEach(m => { if (m) { m.color.copy(tint); m.emissive.copy(tint); m.emissiveIntensity = 2.5 * pulse; } });
    spots.current.forEach(s => { if (s) { s.color.copy(win ? tint : base); s.intensity = 2.2 * pulse; } });
  });
  return (
    <group>
      {TOWERS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 4.5, 0]} s={[0.25, 9, 0.25]} c="#3A3360" />
          <mesh position={[0, 9.2, 0]}><boxGeometry args={[1.8, 0.8, 0.3]} /><meshStandardMaterial ref={el => { heads.current[i] = el; }} color="#FFF4DA" emissive="#FFF4DA" emissiveIntensity={2.5} /></mesh>
        </group>
      ))}
      <spotLight ref={el => { spots.current[0] = el; }} position={[-16, 10, 4.8]} angle={0.55} penumbra={0.7} intensity={2.2} decay={0} color="#FFE9C7" />
      <spotLight ref={el => { spots.current[1] = el; }} position={[16, 10, -6.5]} angle={0.55} penumbra={0.7} intensity={2.2} decay={0} color="#C7E9FF" />
    </group>
  );
}

function Venue({ th, stations, xs }) {
  const ring = Math.min(2.05, (xs[1] - xs[0]) / 2 - 0.05);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[36, 9.6]} /><meshStandardMaterial map={tex()[th.ground]} roughness={0.95} /></mesh>
      {[-2.8, 0, 2.8].map(z => <Box key={z} p={[0, 0.01, z]} s={[34, 0.02, 0.06]} c="#EDE6FF" e={0.4} />)}
      <Box p={[0, 0.12, 4.6]} s={[36, 0.24, 0.12]} c={th.rail} e={1.6} />
      {[0, 1, 2, 3, 4, 5].map(r => <Box key={r} p={[0, (r + 1) * 0.275, -5.2 - r * 0.7]} s={[35, (r + 1) * 0.55, 0.7]} c="#FFFFFF" map={tex()[th.stands]} rough={0.85} />)}
      <Box p={[0, 0.5, -3.8]} s={[34, 1.1, 0.1]} c={th.bg} />
      {th.banners.map(([t, bg, fg], i) => <Banner key={t} text={t} bg={bg} fg={fg} x={-12.3 + i * 8.2} />)}
      {th === THEMES.kelp && [-17, -15.5, 15.5, 17].flatMap(x => [-3, 0, 3].map(z => <Kelp key={`${x}${z}`} p={[x, 0, z]} h={3 + Math.abs(z) * 0.4} />))}
      {stations.map((id, i) => (
        <group key={id} position={[xs[i], 0, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[ring - 0.15, ring, 40]} /><meshBasicMaterial color={th.neon[i % 6]} toneMapped={false} /></mesh>
          {LANES.map(z => <group key={z} position={[0, 0, z]}><Obstacle id={id} theme={th === THEMES.kelp ? "kelp" : "tidepool"} /></group>)}
        </group>
      ))}
    </group>
  );
}

function Racer({ lane, at, mood, look, relay, leg, xs }) {
  const g = useRef(), baton = useRef(), passAt = useRef(-99), lastLeg = useRef(leg);
  const [moving, setMoving] = useState(false);
  useEffect(() => { g.current?.traverse(o => { if (o.isMesh) o.castShadow = true; }); }, []);
  useEffect(() => { setMoving(true); const t = setTimeout(() => setMoving(false), 1500); return () => clearTimeout(t); }, [at]);
  useFrame(({ clock }, dt) => {
    if (g.current) g.current.position.x = THREE.MathUtils.damp(g.current.position.x, xs[at] - 1.1, 2.2, dt);
    if (leg !== lastLeg.current) { lastLeg.current = leg; passAt.current = clock.elapsedTime; }
    if (baton.current) {
      const a = clock.elapsedTime - passAt.current;
      baton.current.scale.setScalar(a < 1.2 ? 1 + Math.sin((a * Math.PI) / 1.2) * 1.6 : 1);
      baton.current.rotation.z = clock.elapsedTime * 2 + (a < 1.2 ? a * 12 : 0);
    }
  });
  return (
    <group ref={g} position={[xs[at] - 1.1, 0.56, LANES[lane] + 0.9]} scale={0.95}>
      <CrabModel color={look.color} accent={look.accent} accessory={look.accessory} mood={moving && mood !== "stumble" ? "walk" : mood} />
      {relay && <mesh ref={baton} position={[0.95, 1.35, 0.2]}><cylinderGeometry args={[0.07, 0.07, 0.6, 10]} /><meshStandardMaterial color="#FFD23F" emissive="#FF9F1C" emissiveIntensity={1.6} /></mesh>}
    </group>
  );
}

function CameraRig({ racers, mode, xs }) {
  const pos = useMemo(() => new THREE.Vector3(9, 12.5, 23), []);
  const look = useMemo(() => new THREE.Vector3(0, 0.5, -0.5), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, dt) => {
    if (mode !== "cinematic") return;
    const lead = Math.max(...racers.map(r => r.at)), x = xs[lead] ?? 0, fin = racers.some(r => r.finished);
    goal.set(fin ? x - 3.5 : x * 0.7 + 6, fin ? 4.2 : 10.5, fin ? 9.5 : 19);
    pos.lerp(goal, 1 - Math.exp(-1.4 * dt));
    goal.set(fin ? x - 1 : x * 0.8, fin ? 1.2 : 0.5, fin ? 1 : -0.5);
    look.lerp(goal, 1 - Math.exp(-2 * dt));
    camera.position.copy(pos);
    camera.lookAt(look);
  });
  return null;
}

function Effects({ preset, focus }) {
  if (!preset.post) return null;
  const full = preset.post === "full";
  const fx = [
    full && <N8AO key="ao" aoRadius={1.5} intensity={1.3} distanceFalloff={1} halfRes />,
    <Bloom key="bloom" mipmapBlur intensity={0.9} luminanceThreshold={0.85} luminanceSmoothing={0.2} />,
    full && focus && <DepthOfField key="dof" target={focus} focalLength={0.25} bokehScale={0.9} />,
    <Vignette key="vig" offset={0.25} darkness={0.7} />,
  ].filter(Boolean);
  return <EffectComposer multisampling={full ? 4 : 0}>{fx}</EffectComposer>;
}

export default function Stadium3D({ racers, reaction, quality, camMode = "cinematic", replay, course }) {
  const p = quality.preset;
  const th = THEMES[course?.theme] || THEMES.tidepool;
  const stations = course?.stations || ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"];
  const xs = useMemo(() => xsFor(stations.length), [stations.length]);
  const lead = Math.max(...racers.map(r => r.at));
  return (
    <Canvas key={quality.level} className="stadium-canvas" data-testid="stadium-canvas" shadows={p.shadows ? "soft" : false} dpr={p.dpr}
      camera={{ position: [9, 12.5, 23], fov: 38 }} gl={{ antialias: p.aa, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}>
      <PerformanceMonitor bounds={() => [45, 240]} flipflops={3} onDecline={quality.degrade}>
        <color attach="background" args={[th.bg]} />
        <fog attach="fog" args={[th.bg, th === THEMES.kelp ? 24 : 32, th === THEMES.kelp ? 52 : 64]} />
        <ambientLight intensity={p.env ? 0.25 : 0.45} />
        <hemisphereLight args={[th.hemi[0], th.hemi[1], 0.7]} />
        <directionalLight position={[8, 14, 12]} intensity={1.6} color="#FFF1DA" castShadow={p.shadows} shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0004} />
        {p.env && (
          <Environment resolution={64}>
            <Lightformer form="rect" intensity={2} color="#FFE9C7" position={[0, 8, 6]} scale={[24, 4, 1]} />
            <Lightformer form="rect" intensity={1.4} color="#7C8CFF" position={[-12, 5, -6]} scale={[10, 3, 1]} />
            <Lightformer form="rect" intensity={1.4} color="#FF9F1C" position={[12, 5, -6]} scale={[10, 3, 1]} />
          </Environment>
        )}
        <FloodLights reaction={reaction} />
        <pointLight position={[-10, 3, 3]} color={th.points[0]} intensity={3} distance={16} decay={1} />
        <pointLight position={[10, 3, 3]} color={th.points[1]} intensity={3} distance={16} decay={1} />
        <Venue th={th} stations={stations} xs={xs} />
        {th === THEMES.kelp && <Bubbles />}
        <Crowd reaction={reaction} count={p.crowd} heads={p.heads} />
        <Celebration reaction={reaction} />
        {racers.map((r, i) => <Racer key={r.id} lane={i} at={r.at} mood={r.mood} look={r.look} relay={r.relay} leg={r.leg} xs={xs} />)}
        <CameraRig racers={racers} mode={camMode} xs={xs} />
        {camMode === "free" && <OrbitControls target={[0, 0.5, -0.5]} enablePan={false} minDistance={10} maxDistance={36} minPolarAngle={0.5} maxPolarAngle={1.25} />}
        <Effects preset={p} focus={replay ? [xs[lead] - 1.1, 0.8, 0.5] : null} />
      </PerformanceMonitor>
    </Canvas>
  );
}
