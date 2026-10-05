import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { REDUCED_MOTION } from "../components/Crab";
import CrabRig, { LEDGE } from "./CrabRig";

const NOTCH_Y = [0.35, 0.7, 1.05, 1.4];
const damp = (a, b, dt, k = 8) => THREE.MathUtils.damp(a, b, k, dt);

function Floor({ color = "#141B3D", edge = "#2EE6D6", emissive, y = -0.06, h = 0.12 }) {
  return (
    <mesh position={[0, y, 0]} receiveShadow>
      <boxGeometry args={[0.96, h, 0.96]} />
      <meshStandardMaterial color={color} emissive={emissive || "#000"} emissiveIntensity={emissive ? 1.4 : 0} roughness={0.6} />
      <Edges color={edge} />
    </mesh>
  );
}

function Gate({ open }) {
  const g = useRef();
  useFrame((_, dt) => { if (g.current) g.current.position.y = REDUCED_MOTION ? (open ? -0.95 : 0) : damp(g.current.position.y, open ? -0.95 : 0, dt, 5); });
  return (
    <group><Floor />
      <group ref={g}>{[-0.3, 0, 0.3].map(x => (
        <mesh key={x} position={[x, 0.45, 0]}><cylinderGeometry args={[0.05, 0.05, 0.9, 10]} /><meshStandardMaterial color="#FF9F1C" emissive="#FF7A00" emissiveIntensity={1.2} /></mesh>
      ))}</group>
    </group>
  );
}

function Lever({ on }) {
  const s = useRef();
  useFrame((_, dt) => { if (s.current) s.current.rotation.z = REDUCED_MOTION ? (on ? -0.7 : 0.7) : damp(s.current.rotation.z, on ? -0.7 : 0.7, dt, 6); });
  return (
    <group><Floor />
      <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.5, 0.24, 0.4]} /><meshStandardMaterial color="#2A2F55" /></mesh>
      <group ref={s} position={[0, 0.24, 0]}>
        <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6, 8]} /><meshStandardMaterial color="#C9D2FF" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, 0.62, 0]}><sphereGeometry args={[0.09, 14, 14]} /><meshStandardMaterial color="#39FF88" emissive="#39FF88" emissiveIntensity={on ? 2.2 : 0.6} /></mesh>
      </group>
    </group>
  );
}

function Key(props) {
  return (
    <group {...props}>
      <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.07, 0.025, 8, 16]} /><meshStandardMaterial color="#FFD23F" emissive="#FFB300" emissiveIntensity={1.6} metalness={0.8} /></mesh>
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[0.03, 0.16, 0.03]} /><meshStandardMaterial color="#FFD23F" emissive="#FFB300" emissiveIntensity={1.6} /></mesh>
    </group>
  );
}

function Pole({ keyNotch, held }) {
  return (
    <group><Floor />
      <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.08, 0.1, 1.7, 14]} /><meshStandardMaterial color="#8A6BFF" roughness={0.4} /></mesh>
      {NOTCH_Y.map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.13, 0.025, 8, 20]} />
          <meshStandardMaterial color="#7CF3FF" emissive="#2EE6D6" emissiveIntensity={i + 1 === keyNotch ? 1.4 : 0.5} /></mesh>
      ))}
      {!held && keyNotch && <Key position={[0, NOTCH_Y[keyNotch - 1] - 0.05, 0.2]} />}
    </group>
  );
}

function Rope({ alongX }) {
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.96, 0.05, 0.96]} /><meshStandardMaterial color="#03040B" /></mesh>
      {[-0.5, 0.5].map(x => <mesh key={x} position={[x, 0.6, 0]}><cylinderGeometry args={[0.04, 0.04, 1.2, 8]} /><meshStandardMaterial color="#6B4A2B" /></mesh>)}
      <mesh position={[0, 1.08, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.025, 0.025, 1.0, 8]} /><meshStandardMaterial color="#E8C07A" emissive="#FFB347" emissiveIntensity={0.5} /></mesh>
    </group>
  );
}

function Flag({ glow }) {
  const cloth = useRef();
  useFrame(({ clock }) => { if (cloth.current && !REDUCED_MOTION) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 3) * 0.25; });
  return (
    <group><Floor edge="#FFD23F" />
      <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.03, 0.03, 1.2, 8]} /><meshStandardMaterial color="#E9ECFF" /></mesh>
      <group ref={cloth} position={[0, 1.02, 0]}>
        <mesh position={[0.22, 0, 0]}><planeGeometry args={[0.44, 0.28]} /><meshStandardMaterial color="#FFD23F" emissive="#FFB300" emissiveIntensity={glow ? 3 : 1.1} side={THREE.DoubleSide} /></mesh>
      </group>
    </group>
  );
}

function Tile({ ch, t, x, y, pose }) {
  switch (t) {
    case "#": return <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[0.96, 0.96, 0.96]} /><meshStandardMaterial color="#232850" /><Edges color="#6C5CE7" /></mesh>;
    case "R": return <Floor color="#3A0610" edge="#FF2E4D" emissive="#FF2E4D" />;
    case "^": return <Floor color="#1E6F8C" edge="#7CF3FF" y={LEDGE / 2 - 0.12} h={LEDGE + 0.12} />;
    case "C": return <group><Floor /><mesh position={[0, 0.36, 0]} castShadow><boxGeometry args={[0.72, 0.72, 0.72]} /><meshStandardMaterial color="#B5773A" roughness={0.8} /><Edges color="#FFD23F" /></mesh></group>;
    case "G": return <Gate open={pose.gates} />;
    case "L": return <Lever on={pose.gates} />;
    case "P": return <Pole keyNotch={ch.key_notch} held={pose.holding === "key"} />;
    case "Y": return <Rope alongX={!"#R".includes(ch.grid[y][x - 1] || "#")} />;
    case "F": return <Flag glow={pose.success} />;
    default: return <Floor edge={t === "S" ? "#FF3CAC" : "#2EE6D6"} />;
  }
}

function Stadium({ w, h }) {
  const pylons = [[-1.5, -1.5], [w + 0.5, -1.5], [-1.5, h + 0.5], [w + 0.5, h + 0.5]];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(w - 1) / 2, -0.13, (h - 1) / 2]} receiveShadow>
        <planeGeometry args={[60, 60]} /><meshStandardMaterial color="#070B1F" roughness={0.9} />
      </mesh>
      <gridHelper args={[40, 40, "#1B2A6B", "#0E1640"]} position={[(w - 1) / 2, -0.12, (h - 1) / 2]} />
      {[[(w - 1) / 2, -0.6, w + 0.2, 0.04], [(w - 1) / 2, h - 0.4, w + 0.2, 0.04]].map(([x, z, sx, sz], i) => (
        <mesh key={`r${i}`} position={[x, 0.02, z]}><boxGeometry args={[sx, 0.04, sz]} /><meshBasicMaterial color="#FF3CAC" toneMapped={false} /></mesh>
      ))}
      {[[-0.6, (h - 1) / 2], [w - 0.4, (h - 1) / 2]].map(([x, z], i) => (
        <mesh key={`c${i}`} position={[x, 0.02, z]}><boxGeometry args={[0.04, 0.04, h + 0.2]} /><meshBasicMaterial color="#2EE6D6" toneMapped={false} /></mesh>
      ))}
      {pylons.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.06, 0.1, 3.2, 8]} /><meshStandardMaterial color="#1A1F45" /></mesh>
          <mesh position={[0, 3.3, 0]}><sphereGeometry args={[0.22, 16, 16]} /><meshBasicMaterial color="#FFF3B0" toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  );
}

export default function Yard3D({ ch, pose, fx, quality }) {
  const p = quality.preset;
  const w = ch.grid[0].length, h = ch.grid.length;
  const cx = (w - 1) / 2, cz = (h - 1) / 2, d = Math.max(w, h) * 0.85 + 2.6;
  const tiles = useMemo(() => ch.grid.flatMap((row, y) => [...row].map((t, x) => ({ t, x, y }))), [ch]);
  const view = { ...pose, success: fx.kind === "success" };
  return (
    <Canvas key={quality.level} className="tg-canvas" data-testid="training-canvas" shadows={p.shadows} dpr={p.dpr} gl={{ antialias: p.aa }}
      camera={{ position: [cx, d * 0.95, cz + d * 0.8], fov: 45 }}>
      <PerformanceMonitor bounds={() => [40, 240]} flipflops={3} onDecline={quality.degrade}>
        <color attach="background" args={["#050817"]} />
        <fog attach="fog" args={["#050817", 12, 34]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[cx + 4, 8, cz + 5]} intensity={1.1} castShadow={p.shadows} />
        <spotLight position={[cx - 6, 7, cz - 4]} angle={0.6} penumbra={0.8} intensity={60} color="#FF3CAC" />
        <spotLight position={[cx + 6, 7, cz + 6]} angle={0.6} penumbra={0.8} intensity={60} color="#2EE6D6" />
        <Stadium w={w} h={h} />
        {tiles.map(({ t, x, y }) => <group key={`${x}-${y}`} position={[x, 0, y]}><Tile ch={ch} t={t} x={x} y={y} pose={view} /></group>)}
        <CrabRig pose={pose} fx={fx} />
        <OrbitControls target={[cx, 0, cz]} enablePan={false} minDistance={3} maxDistance={20} maxPolarAngle={1.25} enableDamping />
        {p.post === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.25} />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>
        )}
      </PerformanceMonitor>
    </Canvas>
  );
}
