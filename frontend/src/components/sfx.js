import { useCallback, useRef, useState } from "react";

// Synthesized crowd sounds (no audio files). Muted by default; the choice persists.
export function useSfx() {
  const [muted, setMuted] = useState(() => localStorage.getItem("soe_sfx") !== "on");
  const ctx = useRef(null);
  const toggle = () => setMuted(m => { localStorage.setItem("soe_sfx", m ? "on" : "off"); return !m; });
  const play = useCallback(kind => {
    if (muted) return;
    const ac = (ctx.current ||= new AudioContext());
    const now = ac.currentTime;
    const noise = (dur, freq, gain) => {
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(gain, now + 0.15); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(f).connect(g).connect(ac.destination); src.start(now);
    };
    const tone = (f0, f1, dur, type, gain, at = 0) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, now + at); o.frequency.exponentialRampToValueAtTime(f1, now + at + dur);
      g.gain.setValueAtTime(gain, now + at); g.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
      o.connect(g).connect(ac.destination); o.start(now + at); o.stop(now + at + dur);
    };
    if (kind === "cheer") noise(1.2, 1400, 0.25);
    if (kind === "groan") { tone(240, 120, 0.9, "sawtooth", 0.06); noise(0.8, 500, 0.12); }
    if (kind === "finish") { noise(2.2, 1600, 0.3); [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.35, "triangle", 0.12, i * 0.12)); }
  }, [muted]);
  return { muted, toggle, play };
}
