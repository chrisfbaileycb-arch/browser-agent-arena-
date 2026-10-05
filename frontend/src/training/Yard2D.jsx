import { Box, DoorClosed, DoorOpen, Flag, KeyRound, Mountain, Spline, ToggleLeft, ToggleRight, TriangleAlert } from "lucide-react";

const ROT = { up: 0, right: 90, down: 180, left: 270 };

function Glyph({ t, pose, keyNotch }) {
  switch (t) {
    case "R": return <TriangleAlert size={16} />;
    case "^": return <Mountain size={16} />;
    case "C": return <Box size={18} />;
    case "G": return pose.gates ? <DoorOpen size={18} /> : <DoorClosed size={18} />;
    case "L": return pose.gates ? <ToggleRight size={18} /> : <ToggleLeft size={18} />;
    case "P": return <span className="t2-pole">{pose.holding ? "" : <KeyRound size={13} />}<small>{keyNotch ? `n${keyNotch}` : ""}</small></span>;
    case "Y": return <Spline size={18} />;
    case "F": return <Flag size={18} />;
    default: return null;
  }
}

export default function Yard2D({ ch, pose, fx }) {
  const w = ch.grid[0].length;
  return (
    <div className="yard2d" style={{ "--cols": w }} data-testid="training-yard-2d">
      {ch.grid.flatMap((row, y) => [...row].map((t, x) => (
        <div key={`${x}-${y}`} className={`t2 t2-${t === "^" ? "ledge" : t === "#" ? "wall" : t}`} data-testid={`yard2d-tile-${x}-${y}`}>
          <Glyph t={t} pose={pose} keyNotch={ch.key_notch} />
        </div>
      )))}
      <div className={`crab2d fx-${fx.kind} ${pose.claw_up ? "claw-up" : ""} ${pose.claw_open ? "claw-open" : ""}`} data-testid="training-crab-2d"
        style={{ transform: `translate(calc(${pose.x} * var(--cell)), calc(${pose.y} * var(--cell))) rotate(${ROT[pose.dir]}deg)` }}>
        <span className="c2-body" /><span className="c2-claw l" /><span className="c2-claw r" />
        {pose.holding && <span className="c2-key" />}
      </div>
    </div>
  );
}
