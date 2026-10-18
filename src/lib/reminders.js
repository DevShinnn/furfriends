import { APPT, allCareTasks, feedingsOn, fmtTime, isFed, shiftISO } from "./care";
import { todayISO } from "./utils";

/* Reminders: what needs attention right now, worked out on the device from each pet's schedules.
   They cover feeding, grooming, deworming, vaccinations and vet appointments.
   They show while the app is open (or running in the background). When the app is closed,
   supabase/functions/send-reminders sends them by web push using the same rules and keys. */

const EARLY_MIN = 15;   // feeding reminders start this many minutes before mealtime

const minutes = (hhmm) => { const [h, m] = (hhmm || "0:0").split(":").map(Number); return h * 60 + m; };

export function dueReminders(pets, now = new Date()) {
  const today = todayISO();
  const tomorrow = shiftISO(today, 1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];

  for (const pet of pets) {
    for (const f of feedingsOn(pet, today)) {
      if (isFed(pet, f.id, today) || minutes(f.time) > nowMin + EARLY_MIN) continue;
      out.push({
        key: `feed-${pet.id}-${f.id}-${today}`, kind: "Feeding", pet, feeding: f, time: f.time, rank: 1,
        title: `Time to feed ${pet.name}`, body: [f.food, f.amount, fmtTime(f.time)].filter(Boolean).join(" · "),
        to: `/app/pets/${pet.id}?tab=care`,
      });
    }

    for (const t of allCareTasks(pet)) {
      if (t.done || !t.nextDue) continue;
      const appt = t.kind === APPT;
      const overdue = t.nextDue < today;
      const isToday = t.nextDue === today;
      // Vet visits also remind the day before, so there's time to plan.
      if (!overdue && !isToday && !(appt && t.nextDue === tomorrow)) continue;
      const when = overdue ? "overdue" : isToday ? "today" : "tomorrow";
      const what = appt ? "Vet visit" : t.kind;
      out.push({
        key: `care-${pet.id}-${t.id}-${t.nextDue}-${when}`, kind: t.kind, pet, task: t, time: t.dueTime || "", rank: overdue ? 0 : isToday ? 2 : 3,
        title: `${what} ${when} for ${pet.name}`, overdue, when,
        body: [t.title, fmtTime(t.dueTime), appt && t.notes].filter(Boolean).join(" · "),
        to: appt ? "/app/appointments" : `/app/pets/${pet.id}?tab=${t.fromRecord ? "vaccines" : "care"}`,
      });
    }
  }
  // Overdue first, then feedings due now, then today's tasks, then tomorrow's visits.
  return out.sort((a, b) => a.rank - b.rank || (a.time || "99").localeCompare(b.time || "99"));
}

/* Which reminders have already been announced, per user and browser, so each one notifies once. */
const seenKey = (user) => `ff-notified:${user.id}`;
export function loadSeen(user) {
  try { return JSON.parse(localStorage.getItem(seenKey(user))) || {}; } catch { return {}; }
}
export function saveSeen(user, seen) {
  const cutoff = shiftISO(todayISO(), -3);
  const kept = Object.fromEntries(Object.entries(seen).filter(([, d]) => d >= cutoff));
  try { localStorage.setItem(seenKey(user), JSON.stringify(kept)); } catch { /* ignore */ }
}

/* System notification permission: "granted" | "denied" | "default" | "unsupported". */
export const notifySupport = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/* Show one system notification, through the service worker when there is one (needed on Android). */
export async function showSystemNotification(r) {
  const opts = { body: r.body, tag: r.key, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "#" + r.to } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(r.title, opts);
  } catch { /* fall back below */ }
  const n = new Notification(r.title, opts);
  n.onclick = () => { window.focus(); window.location.hash = r.to; n.close(); };
}
