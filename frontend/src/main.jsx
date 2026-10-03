import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthCallback, AuthProvider, oauthSessionId, useAuth } from "./auth";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Arena from "./pages/Arena";
import CoursePage from "./pages/Course";
import Builder from "./pages/Builder";
import WorkflowLab from "./pages/WorkflowLab";
import Studio from "./pages/Studio";
import Leaderboard from "./pages/Leaderboard";
import Tutorials from "./pages/Tutorials";
import ExportPage from "./pages/Export";
import Keys from "./pages/Keys";
import Pricing, { PaymentSuccess } from "./pages/Pricing";
import Login from "./pages/Login";
import PublicTournament from "./pages/PublicTournament";
import Invite from "./pages/Invite";
import Profile from "./pages/Profile";
import Hall from "./pages/Hall";
import Admin from "./pages/Admin";
import "./styles.css";

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) return <div className="page"><div className="card shimmer">Checking your session…</div></div>;
  return user ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

function GuestOnly({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/arena" replace /> : children;
}

function AppRoutes() {
  const location = useLocation();
  if (oauthSessionId(location)) return <AuthCallback />;
  const guard = el => <Protected>{el}</Protected>;
  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/arena" element={<Arena />} />
          <Route path="/course" element={<CoursePage />} />
          <Route path="/builder" element={guard(<Builder />)} />
          <Route path="/workflow" element={guard(<WorkflowLab />)} />
          <Route path="/studio" element={guard(<Studio />)} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/tutorials" element={<Tutorials />} />
          <Route path="/export" element={guard(<ExportPage />)} />
          <Route path="/keys" element={guard(<Keys />)} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/payment/success" element={guard(<PaymentSuccess />)} />
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/t/:slug" element={<PublicTournament />} />
          <Route path="/c/:slug" element={<Invite />} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/hall" element={<Hall />} />
          <Route path="/admin" element={guard(<Admin />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>
);
