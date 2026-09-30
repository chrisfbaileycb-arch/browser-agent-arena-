import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";

// One WebGL context for every crab on the page; each crab is a drei <View> tracked to its DOM box.
export default function SharedCanvas() {
  return (
    <Canvas className="shared-canvas" eventSource={document.getElementById("root")} eventPrefix="client" dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 25 }}>
      <View.Port />
    </Canvas>
  );
}
