import { todayISO, daysUntil } from "./utils";

/* ---------------------------------------------------------------- dates */
export const shiftISO = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const weekday = (iso) => new Date(iso + "T00:00:00").getDay(); // 0 = Sun
export const mondayOf = (iso) => shiftISO(iso, -((weekday(iso) + 6) % 7));
export const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------------------------------------------------------------- catalogues */
export const KINDS = {
  Feeding: { icon: "bowl", color: "sun" },
  Grooming: { icon: "scissors", color: "lilac" },
  Deworming: { icon: "pill", color: "coral" },
  Vaccination: { icon: "syringe", color: "sky" },
};
export const SUGGESTIONS = {
  Grooming: ["Bath", "Brushing", "Nail trim", "Ear cleaning", "Teeth brushing", "Full groom (salon)"],
  Deworming: ["Deworming tablet", "Drontal Plus", "Milbemax", "Broadline spot-on", "Heartworm chewable", "Flea & tick treatment"],
  Vaccination: ["Rabies booster", "DHPP booster", "FVRCP booster", "Leptospirosis", "Bordetella", "FeLV booster"],
};
export const REPEATS = [
  [0, "Does not repeat"], [1, "Every day"], [7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"],
  [60, "Every 2 months"], [90, "Every 3 months"], [180, "Every 6 months"], [365, "Every year"],
];
export const repeatLabel = (n) => (REPEATS.find(([d]) => d === Number(n)) || [0, `Every ${n} days`])[1];

/* ---------------------------------------------------------------- feeding */
export const feedsOn = (f, iso) => !f.days?.length || f.days.includes(weekday(iso));
export const feedingsOn = (pet, iso) => (pet.feeding || []).filter((f) => feedsOn(f, iso)).sort((a, b) => a.time.localeCompare(b.time));
export const isFed = (pet, feedId, iso = todayISO()) => (pet.fedLog?.[iso] || []).includes(feedId);

/* ---------------------------------------------------------------- care tasks */
// A care task: { id, kind, title, nextDue, repeatDays (0 = once), lastDone, notes, done }
export function careStatus(t) {
  if (t.done) return { key: "ok", label: "Completed", days: null };
  const d = daysUntil(t.nextDue);
  if (d < 0) return { key: "danger", label: `Overdue ${-d}d`, days: d };
  if (d === 0) return { key: "warn", label: "Due today", days: 0 };
  if (d <= 7) return { key: "warn", label: `In ${d}d`, days: d };
  return { key: "neutral", label: `In ${d}d`, days: d };
}

export function occurrences(t, start, end) {
  if (t.done || !t.nextDue) return [];
  const step = Number(t.repeatDays) || 0;
  let d = t.nextDue;
  if (step) while (d < start) d = shiftISO(d, step);
  const out = [];
  while (d <= end) { if (d >= start) out.push(d); if (!step) break; d = shiftISO(d, step); }
  return out;
}

/* Like occurrences, but also projects the recurring pattern BACKWARD from nextDue —
   so past dates land on the calendar as a log/history, not just upcoming ones. */
export function scheduleBetween(t, start, end) {
  if (!t.nextDue) return [];
  const step = Number(t.repeatDays) || 0;
  if (!step) return t.nextDue >= start && t.nextDue <= end ? [t.nextDue] : [];
  let d = t.nextDue;
  while (d > start) d = shiftISO(d, -step);      // walk back to on/just-before the window
  while (d < start) d = shiftISO(d, step);
  const out = [];
  while (d <= end) { out.push(d); d = shiftISO(d, step); }
  return out;
}

/* Status of a single scheduled occurrence on `iso`, for the calendar log. */
export function occurrenceStatus(t, iso, today = todayISO()) {
  if (t.fromRecord) return "record";
  if (t.lastDone && iso <= t.lastDone) return "done";
  if (iso < today) return "missed";
  if (iso === today) return "due";
  return "upcoming";
}

/* Vaccination records with a next-due date become read-only reminders. */
export const vaccineReminders = (pet) =>
  (pet.vaccinations || []).filter((v) => v.nextDue).map((v) => ({
    id: "vax-" + v.id, recordId: v.id, kind: "Vaccination", title: v.name, nextDue: v.nextDue, repeatDays: 0, fromRecord: true,
  }));

export const allCareTasks = (pet) => [...(pet.care || []), ...vaccineReminders(pet)];

/* Everything a pet parent should see coming up, sorted overdue → soonest. */
export function upcomingActivities(pets, horizon = 30) {
  const today = todayISO();
  const end = shiftISO(today, horizon);
  const items = [];
  for (const pet of pets) {
    for (const f of feedingsOn(pet, today)) {
      items.push({ key: `feed-${pet.id}-${f.id}`, kind: "Feeding", pet, date: today, time: f.time, title: f.food, sub: f.amount, feeding: f, fed: isFed(pet, f.id, today) });
    }
    for (const t of allCareTasks(pet)) {
      if (t.done || !t.nextDue) continue;
      const overdue = t.nextDue < today;
      const next = overdue ? t.nextDue : occurrences(t, today, end)[0];
      if (!next) continue;
      items.push({ key: `care-${pet.id}-${t.id}`, kind: t.kind, pet, date: next, title: t.title, sub: t.fromRecord ? "From vaccination records" : repeatLabel(t.repeatDays), task: t, overdue });
    }
  }
  return items.sort((a, b) => (b.overdue - a.overdue) || a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"));
}

export function groupLabel(item) {
  if (item.overdue) return "Overdue";
  const d = daysUntil(item.date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return "This week";
  return "Later this month";
}
