import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI, Modal } from "./UIContext";
import Icon from "./Icon";
import { DEMO_ACCOUNTS } from "../lib/demoData";

/* Lists every practice account with a one-click log in. All made-up data; the passwords are public. */
export function DemoAccountsModal() {
  const { login } = useStore();
  const { toast, closeModal } = useUI();
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const enter = async (a) => {
    setBusy(a.email); setError("");
    const err = await login(a.email, a.password);
    setBusy("");
    if (err) return setError(err);
    closeModal(); toast(`Welcome! You're exploring ${a.name}'s account`); navigate("/app");
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Couldn't copy. Select it and copy by hand.", "error"); }
  };

  return (
    <Modal title="Demo accounts" error={error} footer={<button type="button" className="btn btn-ghost" onClick={closeModal}>Close</button>}>
      <p style={{ color: "var(--ink-2)", marginBottom: 14 }}>Made-up owners with made-up pets, for trying the app. Anyone can use them, so don't enter real details. They can't change their password or rate the assistant.</p>
      <ul className="demo-list">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email} className={a.main ? "main" : ""}>
            <div className="faces">{a.pets.length ? a.pets.map((p) => <img key={p} src={`/assets/pets/${p}.jpg`} alt="" />) : <span className="demo-nopets"><Icon name="plus" size={16} /></span>}</div>
            <div className="demo-info">
              <b>{a.name}{a.main && <span className="demo-badge">MAIN DEMO</span>}</b>
              <small>{a.city} · {a.about}</small>
              <small className="demo-cred">
                <button type="button" onClick={() => copy(a.email)} title="Copy email"><code>{a.email}</code></button>
                <button type="button" onClick={() => copy(a.password)} title="Copy password"><code>{a.password}</code></button>
              </small>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => enter(a)}>{busy === a.email ? "Logging in…" : "Log in"}</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function useDemoAccounts() {
  const { openModal } = useUI();
  return () => openModal(<DemoAccountsModal />);
}
