import { lazy, Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink, useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import Crab, { WEBGL } from "./Crab";

const SharedCanvas = lazy(() => import("./SharedCanvas"));
import { useAuth } from "../auth";

export const TABS = [
  ["/", "Home"], ["/arena", "Arena"], ["/course", "Obstacle Course"], ["/builder", "Crab Builder"], ["/workflow", "Workflow Lab"],
  ["/studio", "Challenge Studio"], ["/leaderboard", "Leaderboard"], ["/hall", "Hall of Champions"], ["/training", "Training Grounds"], ["/tutorials", "Tutorials"], ["/export", "Export"], ["/pricing", "Pricing"],
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const links = TABS.map(([to, label]) => (
    <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</NavLink>
  ));
  return (
    <div className="app">
      <div className="blob blob-a" /><div className="blob blob-b" /><div className="blob blob-c" />
      <nav className="topbar">
        <NavLink to="/" className="brand" data-testid="brand-home-link">
          <Crab size={38} mood="idle" color="#FF5A4E" accessory="cap" accent="#FFD23F" />
          <span><b>Steps of Execution</b><small>Browser Agent Arena</small></span>
        </NavLink>
        <div className="tabs">{links}</div>
        <div className="account">
          {user ? (
            <>
              <NavLink to="/keys" className="tab" data-testid="nav-my-keys"><KeyRound size={15} /> My Keys</NavLink>
              <NavLink to="/profile" className="tab" data-testid="nav-profile">Profile</NavLink>
              {user.role === "admin" && <NavLink to="/admin" className="tab" data-testid="nav-admin"><ShieldCheck size={15} /> Admin</NavLink>}
              <span className={`plan plan-${user.plan}`} data-testid="user-plan-badge">{user.plan}</span>
              <button className="icon-btn" onClick={() => { logout(); navigate("/"); }} aria-label="Log out" data-testid="logout-btn"><LogOut size={17} /></button>
            </>
          ) : user === false && <NavLink to="/login" className="btn btn-primary btn-sm" data-testid="nav-login">Sign in</NavLink>}
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" data-testid="mobile-menu-btn">{open ? <X /> : <Menu />}</button>
        </div>
      </nav>
      <AnimatePresence>
        {open && <motion.div className="mobile-nav" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
          {links}{user && <NavLink to="/keys" className="tab" onClick={() => setOpen(false)}>My Keys</NavLink>}
        </motion.div>}
      </AnimatePresence>
      {children}
      {WEBGL && <Suspense fallback={null}><SharedCanvas /></Suspense>}
      <footer className="footer"><span>Steps of Execution · Browser Agent Arena</span><span>Bring your own keys. Real browsers. No faked results.</span></footer>
    </div>
  );
}
