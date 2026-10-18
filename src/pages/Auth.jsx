import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon, { Stars } from "../components/Icon";
import { Brand } from "../components/AppShell";
import { DEMO_EMAIL, DEMO_PASS } from "../lib/demoData";

const PET = (f) => `/assets/pets/${f}.jpg`;

function AuthShell({ img, quote, by, children }) {
  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <img src={img} alt="" />
        <Brand to="/login" />
        <div><blockquote>{quote}</blockquote><div className="by"><Stars size={14} /> {by}</div></div>
      </aside>
      <main className="auth-main"><div className="auth-card">
        <div className="auth-brand"><Brand to="/login" /></div>
        {children}
      </div></main>
    </div>
  );
}

export function Login() {
  const { user, login, demoLogin } = useStore();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;

  const demo = () => { demoLogin(); toast("Welcome! You're exploring the demo account"); navigate("/app"); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(f.email, f.password);
    setBusy(false);
    if (err) return setError(err);
    toast("Welcome back!"); navigate("/app");
  };
  return (
    <AuthShell img="/assets/site/cat-dog-cuddle.jpg" quote="“Every vaccine date and vet document for both of my pets, right where I need them.”" by="Hana, cat & dog parent">
      <h1>Welcome back</h1>
      <p className="sub">Log in to see your pets' records.</p>
      <div className="demo-box">
        <div className="row-top">
          <div className="faces">{["mochi-1", "bori-1", "ginger-1", "kong-1"].map((p) => <img key={p} src={PET(p)} alt="" />)}</div>
          <div><b>Just exploring?</b><small>Meet Mochi, Bori, Ginger & Kong</small></div>
        </div>
        <button type="button" className="btn btn-coral btn-block" onClick={demo}>Log in with demo account <Icon name="arrowR" className="arrow" /></button>
        <small style={{ display: "block", marginTop: 10, textAlign: "center" }}><code>{DEMO_EMAIL}</code> / <code>{DEMO_PASS}</code></small>
      </div>
      <div className="divider">or log in with email</div>
      <form onSubmit={submit} noValidate>
        {error && <div className="error-msg">{error}</div>}
        <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <p className="auth-switch">New to FurFriends? <Link to="/register">Create an account</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const { user, register } = useStore();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  if (user) return <Navigate to="/app" replace />;
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error: err, confirmEmail } = await register(f);
    setBusy(false);
    if (err) return setError(err);
    if (confirmEmail) return setSentTo(f.email.trim());
    toast("Account created — welcome to FurFriends!"); navigate("/app");
  };
  if (sentTo) {
    return (
      <AuthShell img="/assets/site/two-dogs.jpg" quote="“Setting up both dogs took five minutes. Now every vaccine date is exactly where I need it.”" by="Sam, two-dog household">
        <h1>Check your email</h1>
        <p className="sub">We sent a confirmation link to <b>{sentTo}</b>. Click it to activate your account, then log in.</p>
        <Link className="btn btn-primary btn-block btn-lg" to="/login">Go to log in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell img="/assets/site/two-dogs.jpg" quote="“Setting up both dogs took five minutes. Now every vaccine date is exactly where I need it.”" by="Sam, two-dog household">
      <h1>Create your account</h1>
      <p className="sub">Free forever for up to 2 pets. No credit card needed.</p>
      <form onSubmit={submit} noValidate>
        {error && <div className="error-msg">{error}</div>}
        <div className="field"><label htmlFor="name">Full name</label><input className="input" id="name" autoComplete="name" placeholder="Alex Rivera" {...bind("name")} /></div>
        <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" type="email" autoComplete="email" placeholder="you@example.com" {...bind("email")} /></div>
        <div className="row">
          <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" type="password" autoComplete="new-password" {...bind("password")} /><div className="hint">At least 8 characters</div></div>
          <div className="field"><label htmlFor="confirm">Confirm</label><input className="input" id="confirm" type="password" autoComplete="new-password" {...bind("confirm")} /></div>
        </div>
        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? "Creating account…" : <>Create account <Icon name="arrowR" className="arrow" /></>}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthShell>
  );
}

/* Shareable one-click demo link: #/demo or #/demo?next=/app/pets */
export function DemoLink() {
  const { demoLogin, user } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => { demoLogin(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const next = params.get("next") || "";
    navigate(next.startsWith("/app") ? next : "/app", { replace: true });
  }, [user, params, navigate]);
  return null;
}
