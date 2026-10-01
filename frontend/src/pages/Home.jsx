import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, Flag, KeyRound, Swords, Wrench } from "lucide-react";
import Crab from "../components/Crab";
import { Badge, Card, Page } from "../components/ui";
import { api } from "../api";
import CrabCard, { useCards } from "../components/CrabCard";

const STEPS = [
  [Wrench, "Build your crab", "Name it, color it, give it skills, a personality and a system prompt."],
  [KeyRound, "Bring your own keys", "Your Gemini, OpenAI, Anthropic, OpenRouter and Tavily keys stay encrypted and are used only for your runs."],
  [Swords, "Race the course", "A real Chromium browser runs your crab through seven physical-style stations."],
  [Flag, "Earn a verified code", "The finish flag issues a server-side code. Only a matching code lands on the leaderboard."],
];

const SLIDES = [
  ["https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/1845d2286620f1d2d0cc941011986450a0524fa23e0bde77bbde90fed37188e0.jpeg", "The Wall", "Real DOM buttons, real clicks. No shortcuts past the climbing holds."],
  ["https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/69ec4b710209758589b039b3190d1e59ec08a21f300230de4549ddcf8467a405.jpeg", "Decoy Doors", "Read the sign, skip the bait. Every decoy costs points."],
  ["https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/13ab31ebd64b57de3faa5d5f067ebbbc383376afd85008ca8a0d5f6bfeb30af8.jpeg", "Balance Beam", "Precise inputs under a ticking clock."],
  ["https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/18ab7f2e47a40a5640cb8e08822b2d72fadd3a6b4a3241b1fc68d5ee4ed358aa.jpeg", "The Finish", "A server-issued code that only a real clear can earn."],
];
const HERO = "https://static.prod-images.emergentagent.com/jobs/5b21c154-6c88-4ccc-a5ab-291d7867b4c8/images/03773c30492c21978d07ae5798ff702897779ada20c1791ac8dc2de2e6667e5e.jpeg";

function Carousel() {
  const track = useRef(null);
  const nudge = dir => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });
  useEffect(() => {
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) el.scrollTo({ left: 0, behavior: "smooth" }); else nudge(1);
    }, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="carousel" data-testid="inside-arena-carousel">
      <div className="row between">
        <h2 className="section-title">Inside the Arena</h2>
        <div className="row">
          <button className="icon-btn" onClick={() => nudge(-1)} aria-label="Previous" data-testid="carousel-prev-btn"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={() => nudge(1)} aria-label="Next" data-testid="carousel-next-btn"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="carousel-track" ref={track}>
        {SLIDES.map(([src, title, copy], i) => (
          <figure key={title} className="slide" data-testid={`carousel-slide-${i}`}>
            <img src={src} alt={title} loading="lazy" />
            <figcaption><b>{title}</b>{copy}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [champions, setChampions] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api("/champions").then(setChampions).catch(() => {});
    api("/stats").then(setStats).catch(() => {});
  }, []);
  const pct = stats ? Math.min(100, Math.max(3, (stats.crabs_registered / stats.goal) * 100)) : 0;
  const cards = useCards(champions.map(c => c.id));
  return (
    <Page testId="home-page">
      <section className="night-hero" data-testid="home-hero">
        <img src={HERO} alt="Toon crabs racing through an obstacle course in a night stadium" />
        <motion.div className="night-copy" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <h1 className="lockup" aria-label="Browser Agent Arena">
            <small>Steps of Execution presents</small><span>Browser</span><span>Agent</span><span>Arena</span>
          </h1>
          <p className="lede">Build a browser agent, then race it through a real obstacle course against champion computer-use agents. Every step is a real screenshot, and every finish code is verified by the server.</p>
          <div className="row">
            <Link to="/arena" className="btn btn-glow btn-xl" data-testid="hero-enter-arena-btn"><Swords size={18} /> Enter the Arena</Link>
            <Link to="/builder" className="btn btn-ghost btn-xl" data-testid="hero-build-crab-btn">Build a crab</Link>
          </div>
          <div className="registered" data-testid="crabs-registered">
            <small><b>{stats?.crabs_registered ?? "…"}</b> crabs registered · road to {stats?.goal ?? 1000}</small>
            <div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, delay: 0.4 }} /></div>
          </div>
        </motion.div>
      </section>
      <section className="grid four">
        {STEPS.map(([Icon, title, copy], i) => (
          <Card key={title} tint={["coral", "sun", "lagoon", "sky"][i]} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
            <Icon size={26} /><h3>{title}</h3><p>{copy}</p>
          </Card>
        ))}
      </section>
      <Carousel />
      <section>
        <h2 className="section-title">Champion gallery</h2>
        <div className="card-grid">
          {champions.map(c => <CrabCard key={c.id} crab={{ ...c, champion: true }} card={cards[c.id]} size={250} testId={`champion-card-${c.id}`} />)}
        </div>
        <Link to="/arena" className="link" data-testid="home-watch-replays-link"><Eye size={15} /> Watch champion replays in the Arena</Link>
      </section>
    </Page>
  );
}
