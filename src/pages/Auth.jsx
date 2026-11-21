import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon, { Stars } from "../components/Icon";
import { Brand, useInstallPrompt } from "../components/AppShell";
import { useDemoAccounts } from "../components/DemoAccounts";
import { DEMO_EMAIL, DEMO_PASS } from "../lib/demoData";
import { supabase } from "../lib/supabase";
import { OWN_QUESTION, QUESTIONS, resetReady } from "../lib/passwordReset";

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
        <InstallBox />
      </div></main>
    </div>
  );
}

/* Install FurFriends on the phone from the login and sign-up pages. Chrome, Edge and Samsung Internet
   offer the install prompt (our button); iPhone Safari has none, so it gets the Share steps instead.
   Hidden when the app is already open as an installed app. */
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const iPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function InstallBox() {
  const install = useInstallPrompt();
  if (standalone() || (!install && !iPhone())) return null;
  return (
    <div className="auth-install">
      <Icon name="phone" />
      <div>
        <b>Get the FurFriends app</b>
        {install
          ? <small>Install it on this device. It opens like an app and works offline.</small>
          : <small>In Safari, tap <b>Share</b> <Icon name="share" size={13} style={{ verticalAlign: "-2px" }} /> then <b>Add to Home Screen</b>. Open FurFriends from your Home Screen and log in there.</small>}
      </div>
      {install && <button type="button" className="btn btn-primary btn-sm" onClick={install}><Icon name="download" size={16} /> Install</button>}
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
  const showAccounts = useDemoAccounts();
  if (user) return <Navigate to="/app" replace />;

  const demo = async () => {
    setBusy(true);
    const err = await demoLogin();
    setBusy(false);
    if (err) return setError(err);
    toast("Welcome! You're exploring the demo account"); navigate("/app");
  };
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
        <button type="button" className="btn btn-coral btn-block" onClick={demo} disabled={busy}>{busy ? "Logging in…" : <>Log in with demo account <Icon name="arrowR" className="arrow" /></>}</button>
        <small style={{ display: "block", marginTop: 10, textAlign: "center" }}><code>{DEMO_EMAIL}</code> / <code>{DEMO_PASS}</code></small>
        <button type="button" className="btn btn-white btn-block btn-sm" style={{ marginTop: 12 }} onClick={showAccounts}>See all 4 demo accounts</button>
      </div>
      <div className="divider">or log in with email</div>
      <form onSubmit={submit} noValidate>
        {error && <div className="error-msg">{error}</div>}
        <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field">
          <div className="label-row"><label htmlFor="password">Password</label><Link className="field-link" to="/forgot">Forgot password?</Link></div>
          <input className="input" id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </div>
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
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", question: QUESTIONS[0], own: "", answer: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  // The security question for forgot password, once the database has it (supabase/migrations/…_security_questions.sql).
  const [withQuestion, setWithQuestion] = useState(false);
  useEffect(() => {
    let on = true;
    resetReady(supabase).then((ok) => on && setWithQuestion(ok));
    return () => { on = false; };
  }, []);
  if (user) return <Navigate to="/app" replace />;
  // An error from the last try goes away as soon as a field is changed, so it never describes old values.
  const bind = (k) => ({ value: f[k], onChange: (e) => { setError(""); setF({ ...f, [k]: e.target.value }); } });
  const submit = async (e) => {
    e.preventDefault();
    if (withQuestion && f.question === OWN_QUESTION && f.own.trim().length < 5) return setError("Please type your own question (at least 5 characters).");
    setBusy(true);
    const { name, email, password, confirm } = f;
    const { error: err, confirmEmail } = await register({ name, email, password, confirm,
      ...(withQuestion && { question: f.question === OWN_QUESTION ? f.own : f.question, answer: f.answer }) });
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
        {withQuestion && <QuestionFields f={f} bind={bind} />}
        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? "Creating account…" : <>Create account <Icon name="arrowR" className="arrow" /></>}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthShell>
  );
}

/* The security question and answer, on sign-up and in Profile. f: { question, own, answer }. */
export function QuestionFields({ f, bind, label = "Security question", extra = null, hint = true }) {
  const answer = <div className="field"><label htmlFor="sq-answer">Answer</label><input className="input" id="sq-answer" autoComplete="off" maxLength={100} {...bind("answer")} /><div className="hint">Capital letters and extra spaces don't matter</div></div>;
  return (
    <>
      <div className="field">
        <label htmlFor="sq">{label}</label>
        <select className="select" id="sq" {...bind("question")}>{[...QUESTIONS, OWN_QUESTION].map((q) => <option key={q}>{q}</option>)}</select>
        {hint && <div className="hint">If you forget your password, you'll answer this on the log-in page to set a new one. No email is sent.</div>}
      </div>
      {f.question === OWN_QUESTION && (
        <div className="field"><label htmlFor="sq-own">Your question</label><input className="input" id="sq-own" maxLength={200} placeholder="A question only you know the answer to" {...bind("own")} /></div>
      )}
      {extra ? <div className="row">{answer}{extra}</div> : answer}
    </>
  );
}

/* Forgot password, with no email: the owner's email, then the security question they picked, then a new password.
   The database checks the answer (5 wrong answers lock it for 15 minutes) and sets the password; then they're logged in. */
export function ForgotPassword() {
  const { user, forgotQuestion, resetPassword } = useStore();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: "", answer: "", next: "", confirm: "" });
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  const findQuestion = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await forgotQuestion(f.email);
    setBusy(false);
    setError(r.error || "");
    if (r.question) setQuestion(r.question);
  };
  const reset = async (e) => {
    e.preventDefault();
    setBusy(true);
    const err = await resetPassword({ email: f.email, answer: f.answer, next: f.next, confirm: f.confirm });
    setBusy(false);
    if (err) return setError(err);
    toast("Password changed. Welcome back!"); navigate("/app");
  };
  const otherEmail = () => { setQuestion(""); setError(""); setF({ email: f.email, answer: "", next: "", confirm: "" }); };

  return (
    <AuthShell img="/assets/site/cat-dog-cuddle.jpg" quote="“Every vaccine date and vet document for both of my pets, right where I need them.”" by="Hana, cat & dog parent">
      <h1>Forgot password</h1>
      <p className="sub">{question ? "Answer your security question and choose a new password." : "Enter your account's email to see your security question. No email is sent."}</p>
      {!question ? (
        <form onSubmit={findQuestion} noValidate>
          {error && <div className="error-msg">{error}</div>}
          <div className="field"><label htmlFor="fp-email">Email</label><input className="input" id="fp-email" type="email" autoComplete="email" placeholder="you@example.com" {...bind("email")} /></div>
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? "Checking…" : "Next"}</button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate>
          {error && <div className="error-msg">{error}</div>}
          <div className="sq-box"><small>Security question for {f.email.trim().toLowerCase()}</small><b>{question}</b></div>
          <div className="field"><label htmlFor="fp-answer">Your answer</label><input className="input" id="fp-answer" autoComplete="off" {...bind("answer")} /></div>
          <div className="row">
            <div className="field"><label htmlFor="fp-new">New password</label><input className="input" id="fp-new" type="password" autoComplete="new-password" {...bind("next")} /><div className="hint">At least 8 characters</div></div>
            <div className="field"><label htmlFor="fp-confirm">Confirm</label><input className="input" id="fp-confirm" type="password" autoComplete="new-password" {...bind("confirm")} /></div>
          </div>
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
          <button className="btn btn-white btn-block btn-sm" type="button" style={{ marginTop: 10 }} onClick={otherEmail}>Use a different email</button>
        </form>
      )}
      <p className="auth-switch">Remembered it? <Link to="/login">Log in</Link></p>
    </AuthShell>
  );
}

/* Shareable one-click demo link: #/demo or #/demo?next=/app/pets */
export function DemoLink() {
  const { demoLogin, user } = useStore();
  const { toast } = useUI();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) return;
    demoLogin().then((err) => { if (err) { toast(err, "error"); navigate("/login", { replace: true }); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const next = params.get("next") || "";
    navigate(next.startsWith("/app") ? next : "/app", { replace: true });
  }, [user, params, navigate]);
  return null;
}
