import type { MindId } from "../types";

const palette: Record<MindId, { dark: string; light: string; glow: string }> = {
  scout: { dark: "#9A3412", light: "#FDBA74", glow: "#FFEDD5" },
  extractor: { dark: "#5B21B6", light: "#C4B5FD", glow: "#EDE9FE" },
  gatekeeper: { dark: "#047857", light: "#6EE7B7", glow: "#D1FAE5" },
  settlement: { dark: "#BE123C", light: "#FDA4AF", glow: "#FFE4E6" },
};

/** Original geometric squad portraits. No third-party art or assets are used. */
export default function PersonaPortrait({ mind, active = false }: { mind: MindId; active?: boolean }) {
  const p = palette[mind];
  const gid = `portrait-${mind}`;
  return <svg viewBox="0 0 360 260" role="img" aria-label={`${mind} character illustration`} className={active ? "nr-portrait nr-portrait-active" : "nr-portrait"}>
    <defs><linearGradient id={gid} x1="0" x2="1" y1="0" y2="1"><stop stopColor={p.light} /><stop offset="1" stopColor={p.dark} /></linearGradient><filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="12" floodColor={p.dark} floodOpacity=".25" /></filter></defs>
    <circle cx="180" cy="128" r="112" fill={p.glow} /><circle cx="180" cy="128" r="96" fill="none" stroke={p.light} strokeWidth="1" strokeDasharray="3 8" />
    <path d="M48 205 Q180 229 312 205" fill="none" stroke={p.dark} strokeWidth="2" opacity=".22" />
    <ellipse cx="180" cy="229" rx="88" ry="11" fill={p.dark} opacity=".15" />
    <g filter={`url(#${gid}-shadow)`}>
      <path d="M134 168 Q180 150 226 168 L239 216 Q181 239 121 216 Z" fill={p.dark} />
      <path d="M140 177 Q180 164 220 177 L224 210 Q180 225 136 210 Z" fill={p.light} opacity=".65" />
      <path d="M130 183 L94 209 M230 183 L266 209" stroke={p.dark} strokeWidth="15" strokeLinecap="round" />
      <path d="M148 218 L145 232 M211 218 L215 232" stroke={p.dark} strokeWidth="17" strokeLinecap="round" />
      {mind === "scout" && <><path d="M85 120 Q80 65 138 51 L198 35 Q262 51 272 99 L252 160 Q179 184 106 154 Z" fill={`url(#${gid})`} /><path d="M106 93 Q180 37 255 92" fill="none" stroke="#FFF7ED" strokeWidth="8" opacity=".65" /><circle cx="278" cy="69" r="25" fill="#FFF7ED" stroke={p.dark} strokeWidth="8" /><path d="M278 48 V90 M257 69 H299" stroke={p.dark} strokeWidth="3" /></>}
      {mind === "extractor" && <><path d="M180 32 L262 74 L262 151 L180 188 L98 151 L98 74 Z" fill={`url(#${gid})`} /><path d="M180 32 V67 M98 74 L129 95 M262 74 L231 95" stroke="#F5F3FF" strokeWidth="5" opacity=".7" /><path d="M278 111 l30 -21 15 21 -15 21z" fill="#F5F3FF" stroke={p.dark} strokeWidth="5" /></>}
      {mind === "gatekeeper" && <><path d="M180 25 Q223 48 267 44 V119 Q263 168 180 193 Q97 168 93 119 V44 Q137 48 180 25Z" fill={`url(#${gid})`} /><path d="M180 42 Q216 61 249 59 V119 Q245 152 180 174 Q115 152 111 119 V59 Q144 61 180 42Z" fill="none" stroke="#ECFDF5" strokeWidth="6" opacity=".7" /><circle cx="270" cy="167" r="24" fill="#ECFDF5" stroke={p.dark} strokeWidth="5" /><path d="m259 167 8 8 16-19" fill="none" stroke={p.dark} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></>}
      {mind === "settlement" && <><path d="M180 29 Q251 55 255 114 Q252 166 180 188 Q108 166 105 114 Q109 55 180 29Z" fill={`url(#${gid})`} /><path d="M180 29 V188" stroke="#FFF1F2" strokeWidth="4" opacity=".7" /><path d="M258 135 l49 27 -49 27z" fill="#FFF1F2" stroke={p.dark} strokeWidth="5" /><path d="M274 162 h28" stroke={p.dark} strokeWidth="4" /></>}
      <rect x="119" y="98" width="122" height="56" rx="25" fill="#18181B" opacity=".9" />
      <rect x="137" y="113" width="26" height="18" rx="9" fill="#FFF" /><rect x="197" y="113" width="26" height="18" rx="9" fill="#FFF" />
      <circle cx="152" cy="122" r="5" fill={p.dark} /><circle cx="212" cy="122" r="5" fill={p.dark} />
      <path d="M168 143 Q180 149 192 143" fill="none" stroke={p.light} strokeWidth="3" strokeLinecap="round" />
    </g>
    <circle cx="62" cy="77" r="5" fill={p.dark} /><circle cx="305" cy="42" r="4" fill={p.dark} /><path d="m51 139 8 -7 8 7 -8 7z" fill={p.light} />
  </svg>;
}
