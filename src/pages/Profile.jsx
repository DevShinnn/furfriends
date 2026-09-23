import { useState } from "react";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon from "../components/Icon";
import { initials } from "../lib/utils";

export default function Profile() {
  const { user, pets, updateUser, changePassword, resetDemo } = useStore();
  const { toast, confirm } = useUI();
  const [info, setInfo] = useState({ name: user.name, email: user.email, phone: user.phone || "", city: user.city || "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [infoErr, setInfoErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const banner = pets.map((p) => p.photo).find(Boolean);
  const docCount = pets.reduce((n, p) => n + p.documents.length, 0);

  const saveInfo = (e) => {
    e.preventDefault();
    const err = updateUser(info);
    setInfoErr(err || "");
    if (!err) toast("Profile updated");
  };
  const savePw = (e) => {
    e.preventDefault();
    const err = changePassword(pw);
    setPwErr(err || "");
    if (!err) { setPw({ current: "", next: "", confirm: "" }); toast("Password updated"); }
  };
  const bindI = (k) => ({ value: info[k], onChange: (e) => setInfo({ ...info, [k]: e.target.value }) });
  const bindP = (k) => ({ value: pw[k], onChange: (e) => setPw({ ...pw, [k]: e.target.value }) });

  return (
    <>
      <div className="topbar"><div><h1>My Profile</h1><p>Manage your account details and password.</p></div></div>
      <div className="profile-grid">
        <div className="card profile-card">
          <div className="banner">{banner && <img src={banner} alt="" />}</div>
          <div className="avatar">{initials(user.name)}</div>
          <div className="inner">
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            {user.isDemo && <div style={{ marginTop: 8 }}><span className="demo-badge">DEMO ACCOUNT</span></div>}
            {pets.some((p) => p.photo) && <div className="mini-pets">{pets.filter((p) => p.photo).map((p) => <img key={p.id} src={p.photo} alt={p.name} title={p.name} />)}</div>}
            <div className="kv">
              <div><span>Pets</span><b>{pets.length}</b></div>
              <div><span>Documents</span><b>{docCount}</b></div>
              <div><span>Phone</span><b>{user.phone || "—"}</b></div>
              <div><span>City</span><b>{user.city || "—"}</b></div>
              <div><span>Member since</span><b>{new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</b></div>
            </div>
            {user.isDemo && (
              <button className="btn btn-soft btn-block btn-sm" style={{ marginTop: 16 }} onClick={() => confirm({
                title: "Reset demo data?", confirmLabel: "Reset", text: "Restores the demo account's original pets, records and documents.",
                onConfirm: () => { resetDemo(); toast("Demo data restored"); },
              })}>Reset demo data</button>
            )}
          </div>
        </div>
        <div className="stack">
          <form className="card" onSubmit={saveInfo} noValidate>
            <div className="card-head"><h3>Personal information</h3></div>
            {infoErr && <div className="error-msg">{infoErr}</div>}
            <div className="row">
              <div className="field"><label htmlFor="p-name">Full name</label><input className="input" id="p-name" {...bindI("name")} /></div>
              <div className="field"><label htmlFor="p-email">Email</label><input className="input" id="p-email" type="email" {...bindI("email")} /></div>
            </div>
            <div className="row">
              <div className="field"><label htmlFor="p-phone">Phone</label><input className="input" id="p-phone" placeholder="Optional" {...bindI("phone")} /></div>
              <div className="field"><label htmlFor="p-city">City</label><input className="input" id="p-city" placeholder="Optional" {...bindI("city")} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" type="submit">Save changes</button></div>
          </form>
          <form className="card" onSubmit={savePw} noValidate>
            <div className="card-head"><h3>Change password</h3><span style={{ color: "var(--ink-3)" }}><Icon name="lock" /></span></div>
            {pwErr && <div className="error-msg">{pwErr}</div>}
            <div className="field"><label htmlFor="pw-cur">Current password</label><input className="input" id="pw-cur" type="password" autoComplete="current-password" {...bindP("current")} /></div>
            <div className="row">
              <div className="field"><label htmlFor="pw-new">New password</label><input className="input" id="pw-new" type="password" autoComplete="new-password" {...bindP("next")} /><div className="hint">At least 8 characters</div></div>
              <div className="field"><label htmlFor="pw-conf">Confirm new password</label><input className="input" id="pw-conf" type="password" autoComplete="new-password" {...bindP("confirm")} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" type="submit">Update password</button></div>
          </form>
        </div>
      </div>
    </>
  );
}
