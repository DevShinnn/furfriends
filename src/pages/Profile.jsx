import { useState } from "react";
import { Link } from "react-router-dom";
import { notifySupport } from "../lib/reminders";
import { getPushSubscription, dropPushSubscription, pushConfigured } from "../lib/push";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon from "../components/Icon";
import { initials } from "../lib/utils";

export default function Profile() {
  const { user, pets, updateUser, changePassword, resetDemo, setNotifications, savePushSubscription, removePushSubscription } = useStore();
  const { toast, confirm } = useUI();
  const [info, setInfo] = useState({ name: user.name, email: user.email, phone: user.phone || "", city: user.city || "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [infoErr, setInfoErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const banner = pets.map((p) => p.photo).find(Boolean);
  const docCount = pets.reduce((n, p) => n + p.documents.length, 0);

  const saveInfo = async (e) => {
    e.preventDefault();
    const { error: err, notice } = await updateUser(info);
    setInfoErr(err || "");
    if (!err) toast(notice || "Profile updated");
  };
  const savePw = async (e) => {
    e.preventDefault();
    const err = await changePassword(pw);
    setPwErr(err || "");
    if (!err) { setPw({ current: "", next: "", confirm: "" }); toast("Password updated"); }
  };
  const bindI = (k) => ({ value: info[k], onChange: (e) => setInfo({ ...info, [k]: e.target.value }) });
  const bindP = (k) => ({ value: pw[k], onChange: (e) => setPw({ ...pw, [k]: e.target.value }) });

  return (
    <>
      <div className="topbar"><div><h1>My Profile</h1><p>Manage your account details, password and reminders.</p></div></div>
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
          <section className="card survey-invite">
            <div><h3>Help test FurFriends</h3><p>Took part in our usability test? Tell us how it went in a 5-minute survey.</p></div>
            <Link className="btn btn-soft" to="/app/survey"><Icon name="clip" size={16} /> Take the survey</Link>
          </section>
          <NotificationSettings user={user} on={user.notificationsEnabled}
            setOn={async (on) => {
              setNotifications(on);
              toast(on ? "Reminders turned on" : "Reminders turned off");
              if (user.isDemo) return;
              if (on) { const s = await getPushSubscription().catch(() => null); if (s) savePushSubscription(s); }
              else removePushSubscription(await dropPushSubscription().catch(() => null));
            }}
            onAllowed={async () => {
              if (user.isDemo) return null;
              const s = await getPushSubscription().catch(() => null);
              return s ? savePushSubscription(s) : "unavailable";
            }} />
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

const REMINDS = ["Feeding times", "Grooming", "Deworming", "Vaccinations", "Vet appointments (the day before and on the day)"];

function NotificationSettings({ user, on, setOn, onAllowed }) {
  const [perm, setPerm] = useState(notifySupport);
  const [pushErr, setPushErr] = useState(null);
  const ask = async () => {
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") setPushErr(await onAllowed());
  };
  const closedApp = user.isDemo
    ? "With a real account, alerts also arrive when FurFriends is closed."
    : !pushConfigured() || pushErr === "unavailable"
      ? "This device can only get alerts while FurFriends is open or running in the background. On iPhone, add FurFriends to your Home Screen first."
      : pushErr
        ? `Alerts when FurFriends is closed couldn't be set up: ${pushErr}`
        : perm === "granted"
          ? "Alerts also arrive when FurFriends is closed."
          : "Once you allow notifications, alerts also arrive when FurFriends is closed.";
  return (
    <section className="card">
      <div className="card-head"><h3>Reminders &amp; notifications</h3><span style={{ color: "var(--ink-3)" }}><Icon name="bell" /></span></div>
      <label className="switch-row">
        <span><b>Reminders</b><small>Shows what's due on the bell and alerts you when something becomes due.</small></span>
        <input type="checkbox" className="switch" checked={on} onChange={(e) => setOn(e.target.checked)} />
      </label>
      {on && (
        <>
          <ul className="em-kit notif-kinds">{REMINDS.map((x) => <li key={x}><Icon name="check" size={13} />{x}</li>)}</ul>
          <div className="notif-perm">
            {perm === "granted" && <p><Icon name="check" size={14} /> Notifications are allowed on this device.</p>}
            {perm === "default" && <><p>Allow notifications to get alerts on this device even when you're in another app.</p><button type="button" className="btn btn-ghost btn-sm" onClick={ask}><Icon name="bell" size={15} /> Allow notifications</button></>}
            {perm === "denied" && <p>Notifications are blocked for this site. To allow them, change the site's notification setting in your browser, then reload.</p>}
            {perm === "unsupported" && <p>This browser can't show notifications. On iPhone, add FurFriends to your Home Screen first.</p>}
          </div>
          <p className="care-hint" style={{ margin: "12px 0 0" }}>{closedApp}</p>
        </>
      )}
    </section>
  );
}
