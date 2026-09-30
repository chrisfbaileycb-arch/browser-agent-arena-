import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { api, post } from "../api";
import { useAuth } from "../auth";
import Crab from "../components/Crab";
import { Btn, Card, Head, Notice, Page } from "../components/ui";

const FREE = ["1 run with your own keys", "Watch every champion replay", "Crab Builder, Challenge Studio", "Self-reported leaderboard entries"];
const PRO = ["Unlimited runs with your keys", "Champion (computer-use) agent runs", "Skill + workflow exports", "Everything in Free"];

export default function Pricing() {
  const { user } = useAuth();
  const [msg, setMsg] = useState("");
  const upgrade = async () => {
    try { window.location.href = (await post("/payments/checkout", { lookup_key: "arena_pro_monthly", origin_url: window.location.origin })).checkout_url; }
    catch (e) { setMsg(e.message); }
  };
  const plan = (name, price, items, tint, cta) => (
    <Card tint={tint} className="plan-card" testId={`plan-${name.toLowerCase()}`}>
      <h3>{name}</h3><p className="price">{price}</p>
      <ul className="ticks">{items.map(i => <li key={i}><Check size={15} /> {i}</li>)}</ul>{cta}
    </Card>
  );
  return (
    <Page testId="pricing-page">
      <Head eyebrow="Pricing" title="Platform access, your keys">You always pay model providers directly with your own keys. The subscription unlocks the platform.</Head>
      <Notice kind="error" testId="pricing-error">{msg}</Notice>
      <div className="grid two">
        {plan("Free", "$0", FREE, "sun", !user && <Link className="btn btn-ghost" to="/login">Create account</Link>)}
        {plan("Pro", "$12 / month", PRO, "coral", user
          ? (user.plan === "pro" ? <p data-testid="pro-active">Pro is active.</p> : <Btn onClick={upgrade} testId="upgrade-pro-btn">Upgrade with Stripe</Btn>)
          : <Link className="btn btn-primary" to="/login" data-testid="pricing-login-btn">Sign in to upgrade</Link>)}
      </div>
    </Page>
  );
}

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState("checking");
  useEffect(() => {
    let tries = 0, timer;
    const poll = () => api(`/payments/status/${params.get("session_id")}`).then(s => {
      if (s.payment_status === "paid") { setState("paid"); refresh(); }
      else if (++tries < 10) timer = setTimeout(poll, 2000); else setState("pending");
    }).catch(() => setState("error"));
    poll();
    return () => clearTimeout(timer);
  }, [params, refresh]);
  return (
    <Page testId="payment-success-page">
      <Card className="center">
        <Crab size={140} mood={state === "paid" ? "celebrate" : "walk"} accessory="crown" />
        <h2 data-testid="payment-state">{state === "paid" ? "Welcome to Pro" : state === "checking" ? "Confirming your payment…" : "Payment not confirmed yet"}</h2>
        <Link to="/arena" className="btn btn-primary">Go to the Arena</Link>
      </Card>
    </Page>
  );
}
