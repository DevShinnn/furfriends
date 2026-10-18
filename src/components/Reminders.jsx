import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { Modal, useUI } from "./UIContext";
import { useCompleteCare } from "./CareForms";
import { PetThumb } from "./PetBits";
import Icon from "./Icon";
import { KindIcon } from "../pages/Care";
import { dueReminders, loadSeen, saveSeen, notifySupport, showSystemNotification } from "../lib/reminders";
import { todayISO } from "../lib/utils";

/* Re-checks every minute, so a mealtime that arrives while the app is open shows up. */
export function useReminders() {
  const { user, pets } = useStore();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  return user?.notificationsEnabled ? dueReminders(pets, now) : [];
}

/* Announces reminders that become due while the app is running: a system notification when
   allowed, otherwise a toast. Ones already due when the app opens only show on the bell. */
export function ReminderWatcher() {
  const { user } = useStore();
  const { toast } = useUI();
  const due = useReminders();
  const started = useRef(false);
  const keys = due.map((r) => r.key).join("|");

  useEffect(() => {
    if (!user) return;
    const seen = loadSeen(user);
    const fresh = due.filter((r) => !seen[r.key]);
    if (!fresh.length) return;
    for (const r of fresh) seen[r.key] = todayISO();
    saveSeen(user, seen);
    if (!started.current) return;                 // app just opened: the bell shows these
    for (const r of fresh.slice(0, 3)) {
      if (notifySupport() === "granted") showSystemNotification(r).catch(() => toast(r.title));
      else toast(r.title);
    }
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { started.current = true; }, []);
  return null;
}

export function BellButton({ className = "icon-btn" }) {
  const { openModal } = useUI();
  const n = useReminders().length;
  return (
    <button className={`${className} bell-btn`} onClick={() => openModal(<RemindersPanel />)} aria-label={n ? `Reminders, ${n} need attention` : "Reminders"}>
      <Icon name="bell" size={21} />
      {n > 0 && <span className="bell-count">{n > 9 ? "9+" : n}</span>}
    </button>
  );
}

function RemindersPanel() {
  const { user, toggleFed } = useStore();
  const { closeModal } = useUI();
  const complete = useCompleteCare();
  const due = useReminders();
  const off = !user.notificationsEnabled;

  return (
    <Modal title="Reminders" onSubmit={closeModal}
      footer={<><Link className="btn btn-ghost" to="/app/profile" onClick={closeModal}>Notification settings</Link><button className="btn btn-primary" type="submit">Close</button></>}>
      {off ? (
        <div className="empty small"><Icon name="bell" size={22} /><p>Reminders are turned off. Turn them on in your profile to get reminders for feeding, grooming, deworming, vaccines and vet visits.</p></div>
      ) : !due.length ? (
        <div className="empty small"><Icon name="check" size={20} /> Nothing needs attention right now.</div>
      ) : (
        <div className="upcoming rem-list">
          {due.map((r) => (
            <div key={r.key} className={`up-item ${r.overdue ? "is-overdue" : ""}`}>
              <KindIcon kind={r.kind} />
              <Link className="grow" to={r.to} onClick={closeModal}>
                <b>{r.title}</b>
                <small>{r.body}</small>
              </Link>
              <PetThumb pet={r.pet} size={32} />
              {r.feeding ? (
                <button type="button" className="check-btn" onClick={() => toggleFed(r.pet.id, r.feeding.id)}><Icon name="check" size={14} /> Mark fed</button>
              ) : r.task.fromRecord ? (
                <Link className="check-btn" to={r.to} onClick={closeModal}>View</Link>
              ) : (
                <button type="button" className="check-btn" onClick={() => complete(r.pet, r.task)}><Icon name="check" size={14} /> Done</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
