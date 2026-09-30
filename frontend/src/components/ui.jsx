import { motion } from "framer-motion";

export const Page = ({ children, testId }) => (
  <motion.main className="page" data-testid={testId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
    {children}
  </motion.main>
);

export const Head = ({ eyebrow, title, children }) => (
  <header className="page-head">
    <p className="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
    {children && <p className="lede">{children}</p>}
  </header>
);

export const Card = ({ children, className = "", tint, testId, ...rest }) => (
  <motion.section className={`card ${tint ? `tint-${tint}` : ""} ${className}`} data-testid={testId} whileHover={{ y: -2 }} {...rest}>
    {children}
  </motion.section>
);

export const Btn = ({ children, kind = "primary", testId, ...rest }) => (
  <motion.button className={`btn btn-${kind}`} data-testid={testId} whileHover={{ scale: rest.disabled ? 1 : 1.03 }} whileTap={{ scale: 0.97 }} type="button" {...rest}>
    {children}
  </motion.button>
);

export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;

export const Badge = ({ kind = "neutral", children, testId }) => <span className={`badge badge-${kind}`} data-testid={testId}>{children}</span>;

export const Notice = ({ kind = "info", children, testId }) => children ? <p className={`notice notice-${kind}`} data-testid={testId} role="status">{children}</p> : null;

export const SignInModal = ({ open, onClose, why }) => !open ? null : (
  <div className="modal-back" onClick={onClose} data-testid="signin-modal">
    <motion.div className="modal card" role="dialog" aria-modal="true" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}>
      <h3>Sign in to race</h3>
      <p className="muted">{why || "Guests can watch everything; starting runs needs an account."}</p>
      <div className="row">
        <a className="btn btn-primary" href="/login" data-testid="signin-modal-login-btn">Sign in or create account</a>
        <button className="btn btn-ghost" onClick={onClose} data-testid="signin-modal-close-btn">Keep watching</button>
      </div>
    </motion.div>
  </div>
);

