import { motion } from "framer-motion";

const moods = {
  idle: { y: [0, -4, 0], rotate: 0, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  walk: { y: [0, -3, 0, -3, 0], rotate: [-3, 3, -3], transition: { duration: 0.6, repeat: Infinity } },
  snap: { y: [0, -6, 0], transition: { duration: 0.5, repeat: Infinity, repeatDelay: 0.8 } },
  celebrate: { y: [0, -18, 0], rotate: [0, -8, 8, 0], transition: { duration: 0.8, repeat: Infinity, repeatDelay: 0.3 } },
  stumble: { rotate: [0, 18, 12, 18], y: [0, 4, 2, 4], transition: { duration: 1.2, repeat: Infinity, repeatDelay: 0.6 } },
};

function Accessory({ kind, accent }) {
  if (kind === "cap") return <path d="M34 30 Q50 14 66 30 L78 32 L34 32 Z" fill={accent} stroke="#1B1530" strokeWidth="2" />;
  if (kind === "crown") return <path d="M36 30 L38 16 L45 24 L50 12 L55 24 L62 16 L64 30 Z" fill={accent} stroke="#1B1530" strokeWidth="2" />;
  if (kind === "helmet") return <path d="M32 34 Q50 8 68 34 Z" fill={accent} stroke="#1B1530" strokeWidth="2" />;
  if (kind === "bow") return <g fill={accent} stroke="#1B1530" strokeWidth="2"><path d="M50 30 L38 22 L38 38 Z" /><path d="M50 30 L62 22 L62 38 Z" /><circle cx="50" cy="30" r="3" /></g>;
  if (kind === "headset") return <g fill="none" stroke="#1B1530" strokeWidth="3"><path d="M30 44 Q50 10 70 44" /><rect x="25" y="40" width="8" height="12" rx="3" fill={accent} /><rect x="67" y="40" width="8" height="12" rx="3" fill={accent} /></g>;
  if (kind === "goggles") return <g stroke="#1B1530" strokeWidth="2.5" fill={accent}><circle cx="41" cy="30" r="7" /><circle cx="59" cy="30" r="7" /><path d="M48 30 L52 30" /></g>;
  return null;
}

export default function Crab2D({ color = "#FF5A4E", accent = "#FFD23F", accessory = "none", mood = "idle", size = 120, label, testId }) {
  const snapping = mood === "snap" || mood === "celebrate";
  const walking = mood === "walk";
  const claw = side => ({
    animate: snapping ? { rotate: side === "l" ? [0, -22, 0] : [0, 22, 0] } : { rotate: 0 },
    transition: { duration: 0.35, repeat: snapping ? Infinity : 0, repeatDelay: 0.5 },
  });
  const leg = (i, side) => ({
    animate: walking ? { rotate: side === "l" ? [0, 14, 0] : [0, -14, 0] } : { rotate: 0 },
    transition: { duration: 0.3, repeat: walking ? Infinity : 0, delay: i * 0.08 },
  });
  return (
    <motion.svg viewBox="0 0 100 100" width={size} height={size} animate={moods[mood] || moods.idle} role="img"
      aria-label={label || "crab"} data-testid={testId} style={{ overflow: "visible" }}>
      <ellipse cx="50" cy="92" rx="26" ry="4" fill="rgba(27,21,48,.15)" />
      {[0, 1, 2].map(i => (
        <g key={`l${i}`}>
          <motion.path d={`M30 ${64 + i * 5} L${16 - i * 2} ${74 + i * 6}`} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ originX: "30px", originY: `${64 + i * 5}px` }} {...leg(i, "l")} />
          <motion.path d={`M70 ${64 + i * 5} L${84 + i * 2} ${74 + i * 6}`} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ originX: "70px", originY: `${64 + i * 5}px` }} {...leg(i, "r")} />
        </g>
      ))}
      <motion.g style={{ originX: "28px", originY: "52px" }} {...claw("l")}>
        <path d="M28 54 L16 40" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <path d="M16 40 Q4 30 12 20 Q16 30 22 32 Q20 24 26 20 Q30 34 16 40 Z" fill={color} stroke="#1B1530" strokeWidth="2" />
      </motion.g>
      <motion.g style={{ originX: "72px", originY: "52px" }} {...claw("r")}>
        <path d="M72 54 L84 40" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <path d="M84 40 Q96 30 88 20 Q84 30 78 32 Q80 24 74 20 Q70 34 84 40 Z" fill={color} stroke="#1B1530" strokeWidth="2" />
      </motion.g>
      <path d="M42 44 L40 32 M58 44 L60 32" stroke="#1B1530" strokeWidth="2.5" />
      <ellipse cx="50" cy="62" rx="26" ry="18" fill={color} stroke="#1B1530" strokeWidth="2.5" />
      <ellipse cx="42" cy="56" rx="8" ry="4" fill="rgba(255,255,255,.35)" />
      <circle cx="40" cy="30" r="6" fill="#fff" stroke="#1B1530" strokeWidth="2" />
      <circle cx="60" cy="30" r="6" fill="#fff" stroke="#1B1530" strokeWidth="2" />
      <motion.circle cx="41" cy="31" r="2.6" fill="#1B1530" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3, repeat: Infinity, times: [0, 0.9, 0.95, 1] }} />
      <motion.circle cx="61" cy="31" r="2.6" fill="#1B1530" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3, repeat: Infinity, times: [0, 0.9, 0.95, 1] }} />
      {mood === "stumble"
        ? <path d="M42 70 Q50 64 58 70" stroke="#1B1530" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        : <path d="M42 66 Q50 74 58 66" stroke="#1B1530" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      <circle cx="34" cy="66" r="3" fill={accent} opacity=".7" />
      <circle cx="66" cy="66" r="3" fill={accent} opacity=".7" />
      <Accessory kind={accessory} accent={accent} />
    </motion.svg>
  );
}
