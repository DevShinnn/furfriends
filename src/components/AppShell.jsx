import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "./UIContext";
import Icon from "./Icon";
import { initials } from "../lib/utils";

/* Captures the browser's PWA install prompt so we can offer our own button. */
function useInstallPrompt() {
  const [evt, setEvt] = useState(() => window.__furfriendsInstall || null);
  useEffect(() => {
    const on = (e) => { e.preventDefault(); window.__furfriendsInstall = e; setEvt(e); };
    const done = () => { window.__furfriendsInstall = null; setEvt(null); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); };
  }, []);
  if (!evt) return null;
  return async () => { evt.prompt(); await evt.userChoice; window.__furfriendsInstall = null; setEvt(null); };
}

export const Brand = ({ to = "/app", size }) => (
  <Link className="brand" to={to} style={size ? { fontSize: size } : undefined}>
    <span className="brand-mark"><Icon name="paw" size={size ? 18 : 20} /></span>FurFriends
  </Link>
);

export default function AppShell() {
  const { user, pets, logout } = useStore();
  const { toast } = useUI();
  const install = useInstallPrompt();
  const location = useLocation();
  const petMatch = useMatch("/app/pets/:id");
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const links = [
    { to: "/app", end: true, icon: "home", label: "Dashboard" },
    { to: "/app/pets", end: !!petMatch, icon: "paw", label: "My Pets", count: pets.length },
    { to: "/app/profile", icon: "user", label: "Profile" },
  ];
  const onLogout = () => { logout(); toast("You've been logged out"); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">Menu</div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}><Icon name={l.icon} />{l.label}{l.count != null && <span className="count">{l.count}</span>}</NavLink>
          ))}
        </nav>
        {pets.length > 0 && (
          <div className="side-pets">
            <div className="nav-label">Your pets</div>
            {pets.map((p) => (
              <NavLink key={p.id} to={`/app/pets/${p.id}`}><span className="dot">{p.photo && <img src={p.photo} alt="" />}</span>{p.name}</NavLink>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
          {install && <button className="install-btn" onClick={install}><Icon name="phone" /> Install FurFriends app</button>}
          <div className="user-chip">
            <div className="avatar">{initials(user.name)}</div>
            <div className="who"><b>{user.name}</b><small>{user.isDemo ? "Demo account" : user.email}</small></div>
            <button className="icon-btn" onClick={onLogout} title="Log out" aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar">
          <Brand to="/app" size={19} />
          <div style={{ display: "flex", gap: 4 }}>
            {install && <button className="icon-btn" onClick={install} aria-label="Install app"><Icon name="download" size={20} /></button>}
            <button className="icon-btn" onClick={onLogout} aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </div>
        <main className="main"><Outlet /></main>
      </div>
      <nav className="bottom-nav">
        {links.map((l) => <NavLink key={l.to} to={l.to} end={l.to === "/app"}><Icon name={l.icon} />{l.label}</NavLink>)}
      </nav>
    </div>
  );
}
