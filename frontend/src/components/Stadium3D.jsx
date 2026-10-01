import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { CrabModel } from "./Crab3D";
import { REDUCED_MOTION } from "./Crab";

export const STATIONS = ["start", "wall", "doors", "rope", "beam", "tunnel", "finish"];
export const STATION_X = [-12, -8, -4, 0, 4, 8, 12];
const LANES = [-1.4, 1.4];
const NEON = ["#FF5A4E", "#12B5A5", "#4D8BFF", "#FFD23F", "#FF9F1C", "#8B5CF6"];
const BANNERS = [["STEPS OF EXECUTION", "#FF5A4E", "#FFF8EF"], ["BROWSER AGENT ARENA", "#1B1530", "#FFD23F"],
  ["VERIFIED FINISH CODES", "#12B5A5", "#0A0820"], ["BRING YOUR OWN KEYS", "#4D8BFF", "#FFF8EF"]];

const Mat = ({ c, e = 0 }) => <meshStandardMaterial color={c} emissive={c} emissiveIntensity={e} roughness={0.45} metalness={0.1} />;
const Box = ({ p, s, c, e }) => <mesh position={p}><boxGeometry args={s} /><Mat c={c} e={e} /></mesh>;

function Arch({ r, c, e = 1.4, n = 1, gap = 0 }) {
  return [...Array(n)].map((_, k) => (
    <mesh key={k} position={[(k - (n - 1) / 2) * gap, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[r, 0.09, 8, 24, Math.PI]} /><Mat c={c} e={e} />
    </mesh>
  ));
}

function Obstacle({ id }) {
  if (id === "start") return <group><Box p={[0, 0.8, -1]} s={[0.15, 1.6, 0.15]} c="#EDE6FF" /><Box p={[0, 0.8, 1]} s={[0.15, 1.6, 0.15]} c="#EDE6FF" /><Box p={[0, 1.6, 0]} s={[0.2, 0.2, 2.1]} c="#12B5A5" e={0.9} /></group>;
  if (id === "wall") return <group><Box p={[0, 0.7, 0]} s={[0.4, 1.4, 2]} c="#FF9F1C" />{[...Array(6)].map((_, k) => <mesh key={k} position={[0.22, 0.3 + (k % 3) * 0.4, -0.55 + Math.floor(k / 3) * 1.1]}><sphereGeometry args={[0.08, 8, 6]} /><Mat c={NEON[k]} e={0.6} /></mesh>)}</group>;
  if (id === "doors") return <group>{[-0.68, 0, 0.68].map((z, k) => <Box key={z} p={[0, 0.65, z]} s={[0.12, 1.3, 0.55]} c={k === 1 ? "#12B5A5" : "#FF5A4E"} e={k === 1 ? 1.3 : 0.35} />)}</group>;
  if (id === "rope") return <group><Box p={[0, 1.5, -1]} s={[0.12, 3, 0.12]} c="#EDE6FF" /><Box p={[0, 3, 0]} s={[0.12, 0.12, 2.1]} c="#EDE6FF" /><mesh position={[0, 1.7, 0]}><cylinderGeometry args={[0.04, 0.04, 2.6]} /><Mat c="#D9A45B" /></mesh></group>;
  if (id === "beam") return <group><Box p={[0, 0.5, 0]} s={[3, 0.14, 0.26]} c="#8B5CF6" e={0.5} /><Box p={[-1.3, 0.22, 0]} s={[0.12, 0.44, 0.12]} c="#EDE6FF" /><Box p={[1.3, 0.22, 0]} s={[0.12, 0.44, 0.12]} c="#EDE6FF" /></group>;
  if (id === "tunnel") return <Arch r={0.8} c="#4D8BFF" e={0.8} n={5} gap={0.45} />;
  return <group><Arch r={1.15} c="#FF3DA5" e={2} /><Box p={[0.3, 0.012, 0]} s={[0.6, 0.02, 2.2]} c="#FFFFFF" e={0.4} /></group>;
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

function Crowd({ reaction }) {
  const ref = useRef();
  const st = useReactionClock(reaction);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seats = useMemo(() => Array.from({ length: 720 }, (_, i) => {
    const row = i % 6;
    return { x: -17 + Math.floor(i / 6) * 0.285 + (row % 2) * 0.14, y: (row + 1) * 0.55 + 0.17, z: -5.2 - row * 0.7, p: Math.random() * 6 };
  }), []);
  useLayoutEffect(() => {
    seats.forEach((_, i) => ref.current.setColorAt(i, new THREE.Color(NEON[i % 6]).multiplyScalar(0.55 + Math.random() * 0.45)));
    ref.current.instanceColor.needsUpdate = true;
  }, [seats]);
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
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[null, null, seats.length]}><capsuleGeometry args={[0.09, 0.16, 2, 6]} /><meshStandardMaterial /></instancedMesh>;
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

function Venue() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[36, 9.6]} /><meshStandardMaterial color="#123B2A" roughness={0.9} /></mesh>
      {[-2.8, 0, 2.8].map(z => <Box key={z} p={[0, 0.01, z]} s={[34, 0.02, 0.06]} c="#EDE6FF" e={0.3} />)}
      <Box p={[0, 0.12, 4.6]} s={[36, 0.24, 0.12]} c="#FF9F1C" e={1.2} />
      {[0, 1, 2, 3, 4, 5].map(r => <Box key={r} p={[0, (r + 1) * 0.275, -5.2 - r * 0.7]} s={[35, (r + 1) * 0.55, 0.7]} c="#231C45" />)}
      <Box p={[0, 0.5, -3.8]} s={[34, 1.1, 0.1]} c="#0E0B24" />
      {BANNERS.map(([t, bg, fg], i) => <Banner key={t} text={t} bg={bg} fg={fg} x={-12.3 + i * 8.2} />)}
      {STATIONS.map((id, i) => (
        <group key={id} position={[STATION_X[i], 0, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><ringGeometry args={[1.9, 2.05, 40]} /><meshBasicMaterial color={NEON[i % 6]} toneMapped={false} /></mesh>
          {LANES.map(z => <group key={z} position={[0, 0, z]}><Obstacle id={id} /></group>)}
        </group>
      ))}
    </group>
  );
}

function Racer({ lane, at, mood, look, relay, leg }) {
  const g = useRef(), baton = useRef(), passAt = useRef(-99), lastLeg = useRef(leg);
  const [moving, setMoving] = useState(false);
  useEffect(() => { setMoving(true); const t = setTimeout(() => setMoving(false), 1500); return () => clearTimeout(t); }, [at]);
  useFrame(({ clock }, dt) => {
    if (g.current) g.current.position.x = THREE.MathUtils.damp(g.current.position.x, STATION_X[at] - 1.1, 2.2, dt);
    if (leg !== lastLeg.current) { lastLeg.current = leg; passAt.current = clock.elapsedTime; }
    if (baton.current) {
      const a = clock.elapsedTime - passAt.current;
      baton.current.scale.setScalar(a < 1.2 ? 1 + Math.sin((a * Math.PI) / 1.2) * 1.6 : 1);
      baton.current.rotation.z = clock.elapsedTime * 2 + (a < 1.2 ? a * 12 : 0);
    }
  });
  return (
    <group ref={g} position={[STATION_X[at] - 1.1, 0.56, LANES[lane] + 0.9]} scale={0.95}>
      <CrabModel color={look.color} accent={look.accent} accessory={look.accessory} mood={moving && mood !== "stumble" ? "walk" : mood} />
      {relay && <mesh ref={baton} position={[0.95, 1.35, 0.2]}><cylinderGeometry args={[0.07, 0.07, 0.6, 10]} /><meshStandardMaterial color="#FFD23F" emissive="#FF9F1C" emissiveIntensity={1.6} /></mesh>}
    </group>
  );
}

export default function Stadium3D({ racers, reaction }) {
  return (
    <Canvas className="stadium-canvas" data-testid="stadium-canvas" dpr={[1, 1.5]} camera={{ position: [9, 12.5, 23], fov: 38 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}>
      <color attach="background" args={["#0A0820"]} />
      <fog attach="fog" args={["#0A0820", 32, 64]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#6C7CFF", "#1A0F2E", 0.7]} />
      <directionalLight position={[8, 14, 12]} intensity={1.6} color="#FFF1DA" />
      <FloodLights reaction={reaction} />
      <pointLight position={[-10, 3, 3]} color="#FF9F1C" intensity={3} distance={16} decay={1} />
      <pointLight position={[10, 3, 3]} color="#12B5A5" intensity={3} distance={16} decay={1} />
      <Venue />
      <Crowd reaction={reaction} />
      <Celebration reaction={reaction} />
      {racers.map((r, i) => <Racer key={r.id} lane={i} at={r.at} mood={r.mood} look={r.look} relay={r.relay} leg={r.leg} />)}
      <OrbitControls target={[0, 0.5, -0.5]} enablePan={false} minDistance={14} maxDistance={36} minPolarAngle={0.5} maxPolarAngle={1.25} />
    </Canvas>
  );
}
