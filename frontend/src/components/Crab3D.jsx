import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, View } from "@react-three/drei";
import * as THREE from "three";

const INK = "#1B1530";
const L = THREE.MathUtils.lerp;
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const GLOSS = `#include <dithering_fragment>
  vec3 soeN = normalize(normal);
  vec3 soeV = normalize(vViewPosition);
  float soeRim = pow(1.0 - clamp(dot(soeN, soeV), 0.0, 1.0), 2.6);
  gl_FragColor.rgb += uRim * smoothstep(0.3, 0.8, soeRim) * 0.5;
  float soeS = max(dot(soeN, normalize(normalize(vec3(0.45, 0.85, 0.6)) + soeV)), 0.0);
  gl_FragColor.rgb += uGloss * (smoothstep(0.955, 0.98, soeS) * 0.6 + pow(soeS, 36.0) * 0.14);`;

// Toon ramp + fresnel rim light + stylised specular so the shell reads chunky but glossy.
function shell(color, rim, gloss) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP });
  m.onBeforeCompile = s => {
    s.uniforms.uRim = { value: new THREE.Color(rim) };
    s.uniforms.uGloss = { value: gloss };
    s.fragmentShader = "uniform vec3 uRim;\nuniform float uGloss;\n" + s.fragmentShader.replace("#include <dithering_fragment>", GLOSS);
  };
  m.customProgramCacheKey = () => "soe-shell";
  return m;
}
const useShell = (color, rim = "#FFE9D6", gloss = 1) => useMemo(() => shell(color, rim, gloss), [color, rim, gloss]);

function Accessory({ kind, accent }) {
  const m = useShell(accent, "#FFFFFF", 0.8);
  const dark = useShell(INK, "#8A7CFF", 0.6);
  if (kind === "cap") return <group position={[0, 0.5, 0.05]}><mesh material={m}><sphereGeometry args={[0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh><mesh material={m} position={[0, 0, 0.35]} rotation={[0.1, 0, 0]}><cylinderGeometry args={[0.3, 0.3, 0.04, 20]} /></mesh></group>;
  if (kind === "crown") return <group position={[0, 0.52, 0]}><mesh material={m}><cylinderGeometry args={[0.32, 0.32, 0.16, 16, 1, true]} /></mesh>{[0, 1, 2, 3, 4].map(i => <mesh key={i} material={m} position={[Math.sin(i * 1.256) * 0.3, 0.16, Math.cos(i * 1.256) * 0.3]}><coneGeometry args={[0.07, 0.18, 6]} /></mesh>)}</group>;
  if (kind === "helmet") return <mesh material={m} position={[0, 0.4, 0]}><sphereGeometry args={[0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2]} /></mesh>;
  if (kind === "bow") return <group position={[0, 0.56, 0.1]}>{[-1, 1].map(s => <mesh key={s} material={m} position={[s * 0.14, 0, 0]} rotation={[0, 0, s * -Math.PI / 2]}><coneGeometry args={[0.12, 0.26, 8]} /></mesh>)}<mesh material={m}><sphereGeometry args={[0.06, 10, 10]} /></mesh></group>;
  if (kind === "headset") return <group position={[0, 0.3, 0]}><mesh material={dark} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.72, 0.035, 8, 30, Math.PI]} /></mesh>{[-1, 1].map(s => <mesh key={s} material={m} position={[0, -0.02, s * 0.72]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.1, 16]} /></mesh>)}</group>;
  if (kind === "goggles") return <group position={[0, 0.68, 0.42]}>{[-0.25, 0.25].map(x => <mesh key={x} material={m} position={[x, 0, 0]}><torusGeometry args={[0.12, 0.035, 8, 20]} /></mesh>)}</group>;
  return null;
}

function Claw({ side, shell: mat, jawRef, armRef }) {
  return (
    <group ref={armRef} position={[side * 0.6, 0.02, 0.3]}>
      <mesh material={mat} rotation={[0, 0, side * 1.1]} position={[side * 0.2, 0.02, 0]}><capsuleGeometry args={[0.075, 0.32, 4, 10]} /></mesh>
      <group position={[side * 0.42, 0.24, 0.12]}>
        <mesh material={mat} scale={[1, 0.82, 1.1]}><sphereGeometry args={[0.25, 20, 14]} /></mesh>
        <group ref={jawRef} position={[0, 0.12, 0.12]}>
          <mesh material={mat} position={[0, 0.05, 0.14]} rotation={[0.6, 0, 0]}><coneGeometry args={[0.1, 0.34, 10]} /></mesh>
        </group>
        <mesh material={mat} position={[0, -0.06, 0.26]} rotation={[1.3, 0, 0]}><coneGeometry args={[0.09, 0.3, 10]} /></mesh>
      </group>
    </group>
  );
}

function Eye({ x, shell: mat, white, dark, eyeRef, stalkRef, pupilRef }) {
  return (
    <group ref={stalkRef} position={[x, 0.36, 0.3]}>
      <mesh material={mat} position={[0, 0.1, 0]}><cylinderGeometry args={[0.04, 0.055, 0.3, 10]} /></mesh>
      <group ref={eyeRef} position={[0, 0.32, 0]}>
        <mesh material={white}><sphereGeometry args={[0.14, 20, 14]} /></mesh>
        <group ref={pupilRef}>
          <mesh material={dark} position={[0, 0.01, 0.1]}><sphereGeometry args={[0.058, 14, 10]} /></mesh>
          <mesh position={[0.02, 0.04, 0.155]}><sphereGeometry args={[0.016, 8, 6]} /><meshBasicMaterial color="#FFFFFF" /></mesh>
        </group>
      </group>
    </group>
  );
}

function useCrabMotion(refs, mood, still) {
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    const { root, body, mouth, legs, jaws, arms, eyes, stalks, pupils } = refs;
    if (still || !root.current) return;
    const t = clock.elapsedTime + seed, r = root.current;
    const walking = mood === "walk", party = mood === "celebrate", snapping = mood === "snap", fallen = mood === "stumble";
    let y = Math.sin(t * 2) * 0.04, rz = 0, sx = 1, sy = 1 + Math.sin(t * 2) * 0.02;
    if (walking) { y = Math.abs(Math.sin(t * 10)) * 0.07; rz = Math.sin(t * 10) * 0.07; }
    if (party) { const hop = Math.abs(Math.sin(t * 4.2)); y = hop * 0.6; sy = 1 + (hop - 0.5) * 0.2; sx = 1 - (hop - 0.5) * 0.1; }
    if (snapping) rz = Math.sin(t * 14) * 0.025;
    if (fallen) { y = -0.14; rz = 1.15 + Math.sin(t * 3.2) * 0.08; }
    r.position.y = L(r.position.y, y, 0.25);
    r.rotation.z = L(r.rotation.z, rz, fallen ? 0.06 : 0.15);
    if (party) r.rotation.y += 0.05;
    else r.rotation.y = L(THREE.MathUtils.euclideanModulo(r.rotation.y + Math.PI, Math.PI * 2) - Math.PI, Math.sin(t * 0.6) * 0.3, 0.06);
    body.current.scale.x = L(body.current.scale.x, sx, 0.3);
    body.current.scale.y = L(body.current.scale.y, sy, 0.3);
    mouth.current.rotation.z = L(mouth.current.rotation.z, fallen ? 0 : Math.PI, 0.2);
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const side = i < 3 ? 1 : -1, k = i % 3, phase = (k + (side > 0 ? 0 : 1)) % 2 ? Math.PI : 0;
      let lift = Math.sin(t * 2 + k) * 0.04, stride = 0;
      if (walking) { lift = Math.max(0, Math.sin(t * 10 + phase)) * 0.5; stride = Math.cos(t * 10 + phase) * 0.35; }
      if (fallen) { lift = Math.sin(t * 9 + k * 1.7) * 0.5; stride = Math.cos(t * 7 + k) * 0.3; }
      if (party) lift = 0.25 + Math.sin(t * 8 + k) * 0.15;
      leg.rotation.z = L(leg.rotation.z, side * lift, 0.3);
      leg.rotation.y = L(leg.rotation.y, stride, 0.3);
    });
    let jaw = 0.12 + Math.sin(t * 1.5) * 0.06, lift = 0.05, punch = 0;
    if (snapping) { const c = Math.sin(t * 7); jaw = c > 0 ? 0.75 * Math.pow(c, 0.35) : 0; punch = Math.max(0, -c) * 0.3; lift = 0.2; }
    if (party) { jaw = Math.sin(t * 12) > 0 ? 0.7 : 0.1; lift = 0.95 + Math.sin(t * 6) * 0.2; }
    if (walking) { jaw = 0.2; lift = 0.1 + Math.sin(t * 10) * 0.08; }
    if (fallen) { jaw = 0.5 + Math.sin(t * 5) * 0.2; lift = 0.4; }
    jaws.forEach(j => { if (j.current) j.current.rotation.x = L(j.current.rotation.x, -jaw, 0.45); });
    arms.forEach((a, i) => {
      if (!a.current) return;
      a.current.rotation.z = L(a.current.rotation.z, (i ? 1 : -1) * lift, 0.18);
      a.current.rotation.y = L(a.current.rotation.y, (i ? -1 : 1) * punch, 0.3);
    });
    const blink = (t % 4.3) < 0.13 ? 0.08 : 1;
    eyes.forEach(e => { if (e.current) e.current.scale.y = L(e.current.scale.y, fallen ? 0.5 : blink, 0.55); });
    stalks.forEach((s, i) => { if (s.current) s.current.rotation.z = L(s.current.rotation.z, Math.sin(t * 2.3 + i * 1.3) * (party ? 0.25 : 0.08), 0.2); });
    pupils.forEach(p => {
      if (!p.current) return;
      p.current.position.x = fallen ? Math.cos(t * 8) * 0.03 : Math.sin(t * 0.7) * 0.025;
      p.current.position.y = fallen ? Math.sin(t * 8) * 0.03 : 0;
    });
  });
}

export function CrabModel({ color = "#FF5A4E", accent = "#FFD23F", accessory = "none", mood, still }) {
  const refs = {
    root: useRef(), body: useRef(), mouth: useRef(), legs: useRef([]),
    jaws: [useRef(), useRef()], arms: [useRef(), useRef()], eyes: [useRef(), useRef()], stalks: [useRef(), useRef()], pupils: [useRef(), useRef()],
  };
  const mat = useShell(color);
  const blush = useShell(accent, "#FFFFFF", 0.4);
  const white = useShell("#FFFFFF", "#CFE9FF", 1.2);
  const dark = useShell(INK, "#6C5CE7", 0.8);
  useCrabMotion(refs, mood, still);
  return (
    <group ref={refs.root}>
      <mesh position={[0, -0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.9, 24]} /><meshBasicMaterial color={INK} transparent opacity={0.12} /></mesh>
      <group ref={refs.body}>
        <mesh material={mat} scale={[1.1, 0.62, 0.85]}><sphereGeometry args={[0.72, 32, 22]} /></mesh>
        <mesh material={blush} position={[-0.42, -0.02, 0.56]} scale={[1, 0.7, 0.4]}><sphereGeometry args={[0.09, 10, 8]} /></mesh>
        <mesh material={blush} position={[0.42, -0.02, 0.56]} scale={[1, 0.7, 0.4]}><sphereGeometry args={[0.09, 10, 8]} /></mesh>
        <mesh ref={refs.mouth} material={dark} position={[0, -0.08, 0.6]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.12, 0.022, 6, 16, Math.PI]} /></mesh>
        {[-0.25, 0.25].map((x, i) => <Eye key={x} x={x} shell={mat} white={white} dark={dark} eyeRef={refs.eyes[i]} stalkRef={refs.stalks[i]} pupilRef={refs.pupils[i]} />)}
        <Accessory kind={accessory} accent={accent} />
      </group>
      {[0, 1, 2, 3, 4, 5].map(i => {
        const side = i < 3 ? 1 : -1, k = i % 3;
        return (
          <group key={i} ref={el => { refs.legs.current[i] = el; }} position={[side * 0.62, -0.22, 0.2 - k * 0.26]}>
            <mesh material={mat} position={[side * 0.2, -0.12, 0]} rotation={[0, 0, side * 1.0]}><capsuleGeometry args={[0.048, 0.32, 4, 8]} /></mesh>
            <mesh material={mat} position={[side * 0.4, -0.32, 0]} rotation={[0, 0, side * 0.35]}><capsuleGeometry args={[0.042, 0.24, 4, 8]} /></mesh>
          </group>
        );
      })}
      <Claw side={-1} shell={mat} jawRef={refs.jaws[0]} armRef={refs.arms[0]} />
      <Claw side={1} shell={mat} jawRef={refs.jaws[1]} armRef={refs.arms[1]} />
    </group>
  );
}

export default function Crab3DView({ size, interactive, still, testId, label, ...model }) {
  return (
    <View className="crab-view" style={{ width: size, height: size }} data-testid={testId} data-mood={model.mood} aria-label={label || "3D crab"} role="img">
      <PerspectiveCamera makeDefault position={[0, 1.3, 4.4]} fov={34} onUpdate={c => c.lookAt(0, 0, 0)} />
      <ambientLight intensity={1.0} />
      <hemisphereLight args={["#FFF4E0", "#3A2E6B", 0.5]} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} />
      <directionalLight position={[-3, 2, -3]} intensity={0.6} color="#BDF2E8" />
      <CrabModel {...model} still={still} />
      {interactive && <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.6} maxPolarAngle={1.8} />}
    </View>
  );
}
