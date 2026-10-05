import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { REDUCED_MOTION } from "../components/Crab";

export const LEDGE = 0.45;
const ANG = { up: Math.PI, right: Math.PI / 2, down: 0, left: -Math.PI / 2 };
const SPEED = 4.2;
const LEGS = [-0.16, 0, 0.16].flatMap(z => [[-1, z], [1, z]]);

const shell = <meshStandardMaterial color="#FF5A4E" roughness={0.35} metalness={0.1} />;
const dark = <meshStandardMaterial color="#1A1033" />;

function Claw({ side, arm, top, bottom }) {
  return (
    <group ref={arm} position={[side * 0.27, 0.02, 0.22]}>
      <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.045, 0.055, 0.28, 10]} />{shell}</mesh>
      <group position={[0, 0, 0.3]}>
        <group ref={top}><mesh position={[0, 0.03, 0.09]}><boxGeometry args={[0.12, 0.05, 0.2]} />{shell}</mesh></group>
        <group ref={bottom}><mesh position={[0, -0.03, 0.08]}><boxGeometry args={[0.1, 0.04, 0.17]} />{shell}</mesh></group>
      </group>
    </group>
  );
}

function shortAngle(from, to) {
  return from + ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
}

export default function CrabRig({ pose, fx }) {
  const root = useRef(), body = useRef(), legs = useRef([]);
  const arms = [useRef(), useRef()], tops = [useRef(), useRef()], bottoms = [useRef(), useRef()];
  const m = useRef({ cur: null, target: new THREE.Vector3(), from: new THREE.Vector3(), total: 0, seq: -1, t0: 0 });
  useFrame(({ clock }, dt) => {
    const s = m.current, now = clock.elapsedTime;
    const tgt = new THREE.Vector3(pose.x, pose.h * LEDGE, pose.y);
    if (!s.cur) { s.cur = tgt.clone(); s.target.copy(tgt); }
    if (!tgt.equals(s.target)) { s.from.copy(s.cur); s.target.copy(tgt); s.total = s.from.distanceTo(tgt); }
    if (fx.seq !== s.seq) { s.seq = fx.seq; s.t0 = now; }
    const delta = tgt.clone().sub(s.cur), left = delta.length();
    if (REDUCED_MOTION || left < 0.001) s.cur.copy(tgt); else s.cur.add(delta.multiplyScalar(Math.min(1, (SPEED * dt) / left)));
    const remain = s.cur.distanceTo(tgt), prog = s.total ? 1 - remain / s.total : 1;
    const big = s.total > 1.2 || Math.abs(s.target.y - s.from.y) > 0.1;
    const age = now - s.t0;
    let lift = REDUCED_MOTION ? 0 : Math.sin(prog * Math.PI) * (big ? 0.75 : 0.06);
    if (fx.kind === "success" && !REDUCED_MOTION) lift += Math.abs(Math.sin(age * 8)) * 0.35 * Math.max(0, 1 - age / 1.6);
    const sink = fx.kind === "fail" ? Math.min(age * 0.8, 0.35) : 0;
    root.current.position.set(s.cur.x, s.cur.y + 0.3 + lift - sink, s.cur.z);
    root.current.rotation.y = REDUCED_MOTION ? ANG[pose.dir] : THREE.MathUtils.damp(root.current.rotation.y, shortAngle(root.current.rotation.y, ANG[pose.dir]), 10, dt);
    root.current.rotation.z = fx.kind === "fail" ? Math.min(age * 3, 1.3) : 0;
    body.current.rotation.z = fx.kind === "stumble" && !REDUCED_MOTION ? Math.sin(age * 38) * 0.3 * Math.max(0, 1 - age / 0.5) : 0;
    const walking = remain > 0.02 && !REDUCED_MOTION;
    legs.current.forEach((leg, i) => { if (leg) leg.rotation.x = walking ? Math.sin(now * 18 + i * 1.7) * 0.55 : 0; });
    arms.forEach((a, i) => {
      a.current.rotation.x = THREE.MathUtils.damp(a.current.rotation.x, pose.claw_up ? -0.95 : 0.12, 9, dt);
      const open = pose.claw_open ? 0.55 : 0.04;
      tops[i].current.rotation.x = THREE.MathUtils.damp(tops[i].current.rotation.x, -open, 12, dt);
      bottoms[i].current.rotation.x = THREE.MathUtils.damp(bottoms[i].current.rotation.x, open, 12, dt);
    });
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh scale={[0.42, 0.24, 0.34]} castShadow><sphereGeometry args={[1, 28, 20]} />{shell}</mesh>
        {[-1, 1].map(sx => (
          <group key={sx} position={[sx * 0.12, 0.2, 0.18]}>
            <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.02, 0.02, 0.14, 6]} />{shell}</mesh>
            <mesh position={[0, 0.16, 0]}><sphereGeometry args={[0.065, 14, 14]} /><meshStandardMaterial color="#FFFFFF" emissive="#CFE9FF" emissiveIntensity={0.4} /></mesh>
            <mesh position={[0, 0.17, 0.05]}><sphereGeometry args={[0.03, 10, 10]} />{dark}</mesh>
          </group>
        ))}
        {LEGS.map(([sx, z], i) => (
          <group key={i} ref={el => (legs.current[i] = el)} position={[sx * 0.32, -0.06, z]} rotation={[0, 0, sx * 0.9]}>
            <mesh position={[sx * 0.12, -0.04, 0]} rotation={[0, 0, sx * Math.PI / 2.6]}><cylinderGeometry args={[0.022, 0.016, 0.3, 6]} />{shell}</mesh>
          </group>
        ))}
        {[-1, 1].map((side, i) => <Claw key={side} side={side} arm={arms[i]} top={tops[i]} bottom={bottoms[i]} />)}
        {pose.holding === "key" && (
          <mesh position={[0.27, 0.05, 0.62]}><torusGeometry args={[0.06, 0.022, 8, 14]} /><meshStandardMaterial color="#FFD23F" emissive="#FFB300" emissiveIntensity={1.8} /></mesh>
        )}
      </group>
    </group>
  );
}
