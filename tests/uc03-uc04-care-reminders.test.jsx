import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../src/lib/supabase";
import { appointments, careStatus, feedsOn, isFed, occurrences, repeatLabel, upcomingActivities, vaccineReminders } from "../src/lib/care";
import { dueReminders, loadSeen, saveSeen } from "../src/lib/reminders";
import { petVaxSummary, vaxStatus } from "../src/lib/utils";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

/* The test clock: Thursday 29 October 2026, 10:00 AM on this computer. */
const NOW = new Date(2026, 9, 29, 10, 0);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); supabase.reset(); });
afterEach(() => vi.useRealTimers());

const task = (o) => ({ id: "t1", kind: "Grooming", title: "Bath", nextDue: "2026-10-29", dueTime: "", repeatDays: 14, done: false, lastDone: null, ...o });
const petWith = (o = {}) => ({ id: "p1", name: "Mochi", feeding: [], care: [], vaccinations: [], fedLog: {}, ...o });

describe("UC3 Set Care Reminders", () => {
  it("[FR3.1] A meal set for weekdays is on Thursday's list but not Sunday's; a meal with no days is every day", () => {
    const weekdays = { id: "f1", time: "07:00", food: "Kibble", days: [1, 2, 3, 4, 5] };
    expect(feedsOn(weekdays, "2026-10-29")).toBe(true);
    expect(feedsOn(weekdays, "2026-11-01")).toBe(false);
    expect(feedsOn({ ...weekdays, days: [] }, "2026-11-01")).toBe(true);
  });

  it("[FR3.1] Ticking a meal as fed records it for today; ticking again un-ticks it", async () => {
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    const id = await run(() => s.current.addPet({ name: "Mochi", species: "Cat", feeding: [{ id: "f1", time: "07:00", food: "Kibble", days: [] }] }));
    await run(() => s.current.toggleFed(id, "f1"));
    expect(isFed(s.current.getPet(id), "f1", "2026-10-29")).toBe(true);
    expect(calls("feeding_log", "upsert")[0].payload).toEqual({ feeding_id: "f1", pet_id: id, fed_on: "2026-10-29" });
    await run(() => s.current.toggleFed(id, "f1"));
    expect(isFed(s.current.getPet(id), "f1", "2026-10-29")).toBe(false);
    expect(calls("feeding_log", "delete")).toHaveLength(1);
  });

  it("[FR3.2] A weekly task due 1 Oct falls on 29 Oct, 5 Nov and 12 Nov in the next two weeks", () => {
    expect(occurrences(task({ nextDue: "2026-10-01", repeatDays: 7 }), "2026-10-29", "2026-11-12")).toEqual(["2026-10-29", "2026-11-05", "2026-11-12"]);
  });

  it("[FR3.2] A one-time task occurs once, and repeat choices have readable labels", () => {
    expect(occurrences(task({ nextDue: "2026-11-02", repeatDays: 0 }), "2026-10-29", "2026-12-31")).toEqual(["2026-11-02"]);
    expect(repeatLabel(0)).toBe("Does not repeat");
    expect(repeatLabel(90)).toBe("Every 3 months");
    expect(repeatLabel(365)).toBe("Every year");
  });

  it("[FR3.3] Task status: 2 days late is 'Overdue 2d', today is 'Due today', in 5 days is 'In 5d', done is 'Completed'", () => {
    expect(careStatus(task({ nextDue: "2026-10-27" }))).toMatchObject({ key: "danger", label: "Overdue 2d" });
    expect(careStatus(task({ nextDue: "2026-10-29" }))).toMatchObject({ key: "warn", label: "Due today" });
    expect(careStatus(task({ nextDue: "2026-11-03" }))).toMatchObject({ key: "warn", label: "In 5d" });
    expect(careStatus(task({ nextDue: "2026-11-20" }))).toMatchObject({ key: "neutral", label: "In 22d" });
    expect(careStatus(task({ done: true }))).toMatchObject({ key: "ok", label: "Completed" });
  });

  it("[FR3.3] The care list shows overdue items first, then today's feedings and tasks by time", () => {
    const pet = petWith({
      feeding: [{ id: "f1", time: "07:00", food: "Kibble", days: [] }],
      care: [task({ id: "late", title: "Deworm", kind: "Deworming", nextDue: "2026-10-20", repeatDays: 90 }), task({ id: "next", nextDue: "2026-11-02" })],
    });
    const list = upcomingActivities([pet]);
    expect(list.map((x) => [x.title, x.date, !!x.overdue])).toEqual([
      ["Deworm", "2026-10-20", true], ["Kibble", "2026-10-29", false], ["Bath", "2026-11-02", false],
    ]);
  });

  it("[FR3.3] Marking a repeating task done moves it to its next date; a one-time task is closed", async () => {
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    const id = await run(() => s.current.addPet({ name: "Mochi", species: "Cat", care: [task({ id: "rep", repeatDays: 14 }), task({ id: "once", repeatDays: 0 })] }));
    await run(() => s.current.completeCare(id, "rep"));
    await run(() => s.current.completeCare(id, "once"));
    const care = Object.fromEntries(s.current.getPet(id).care.map((t) => [t.id, t]));
    expect(care.rep).toMatchObject({ lastDone: "2026-10-29", nextDue: "2026-11-12", done: false });
    expect(care.once).toMatchObject({ lastDone: "2026-10-29", done: true });
    expect(calls("care_tasks", "update")[0].payload).toMatchObject({ next_due: "2026-11-12", last_done: "2026-10-29" });
  });

  it("[FR3.3] Vet appointments are split into upcoming (soonest first) and past", () => {
    const pet = petWith({ care: [
      task({ id: "a", kind: "Vet appointment", title: "Checkup", nextDue: "2026-11-10", repeatDays: 0 }),
      task({ id: "b", kind: "Vet appointment", title: "Dental", nextDue: "2026-11-01", repeatDays: 0 }),
      task({ id: "c", kind: "Vet appointment", title: "Spay", nextDue: "2026-10-01", repeatDays: 0 }),
    ] });
    const a = appointments([pet]);
    expect(a.upcoming.map((x) => x.t.title)).toEqual(["Dental", "Checkup"]);
    expect(a.past.map((x) => x.t.title)).toEqual(["Spay"]);
  });

  it("[FR3.4] A vaccination with a next due date becomes a read-only vaccine reminder", () => {
    const pet = petWith({ vaccinations: [{ id: "v1", name: "Rabies", dateGiven: "2025-11-05", nextDue: "2026-11-05" }, { id: "v2", name: "FVRCP", dateGiven: "2025-01-01", nextDue: "" }] });
    expect(vaccineReminders(pet)).toEqual([{ id: "vax-v1", recordId: "v1", kind: "Vaccination", title: "Rabies", nextDue: "2026-11-05", repeatDays: 0, fromRecord: true }]);
  });

  it("[FR3.4] Vaccine status: overdue, due within 30 days, up to date, or no booster", () => {
    expect(vaxStatus({ nextDue: "2026-10-25" })).toMatchObject({ key: "danger", label: "Overdue 4d" });
    expect(vaxStatus({ nextDue: "2026-11-05" })).toMatchObject({ key: "warn", label: "Due in 7d" });
    expect(vaxStatus({ nextDue: "2027-10-29" })).toMatchObject({ key: "ok", label: "Up to date" });
    expect(vaxStatus({ nextDue: "" })).toMatchObject({ key: "neutral", label: "No booster" });
    expect(petVaxSummary({ vaccinations: [{ nextDue: "2027-10-29" }, { nextDue: "2026-10-25" }] }).label).toBe("Vaccine overdue");
  });
});

describe("UC4 Receive Notifications", () => {
  it("[FR4.1] A meal reminder starts 15 minutes before mealtime, and stops once the meal is ticked as fed", () => {
    const meal = (time) => ({ id: time, time, food: "Kibble", amount: "1/4 cup", days: [] });
    const pet = petWith({ feeding: [meal("10:10"), meal("10:20")] });
    const r = dueReminders([pet], NOW);
    expect(r.map((x) => x.title)).toEqual(["Time to feed Mochi"]);
    expect(r[0]).toMatchObject({ key: "feed-p1-10:10-2026-10-29", body: "Kibble · 1/4 cup · 10:10 AM" });
    expect(dueReminders([{ ...pet, fedLog: { "2026-10-29": ["10:10"] } }], NOW)).toEqual([]);
  });

  it("[FR4.1] Tasks remind when due today or overdue (overdue first); vet visits also remind the day before", () => {
    const pet = petWith({ care: [
      task({ id: "g", title: "Bath", nextDue: "2026-10-29" }),
      task({ id: "d", kind: "Deworming", title: "Tablet", nextDue: "2026-10-27", repeatDays: 90 }),
      task({ id: "v", kind: "Vet appointment", title: "Checkup", nextDue: "2026-10-30", dueTime: "09:00", repeatDays: 0, notes: "Pet Clinic" }),
      task({ id: "later", title: "Nail trim", nextDue: "2026-10-30" }),
    ] });
    expect(dueReminders([pet], NOW).map((x) => x.title)).toEqual([
      "Deworming overdue for Mochi", "Grooming today for Mochi", "Vet visit tomorrow for Mochi",
    ]);
  });

  it("[FR4.1] A vaccine due today from the vaccination records reminds, and opens the pet's vaccines tab", () => {
    const pet = petWith({ vaccinations: [{ id: "v1", name: "Rabies", dateGiven: "2025-10-29", nextDue: "2026-10-29" }] });
    expect(dueReminders([pet], NOW)[0]).toMatchObject({ title: "Vaccination today for Mochi", to: "/app/pets/p1?tab=vaccines" });
  });

  it("[FR4.2] Each reminder has its own key, and announced reminders are remembered per user (kept 3 days)", () => {
    const user = { id: "user-1" };
    saveSeen(user, { "feed-p1-f1-2026-10-29": "2026-10-29", "care-old": "2026-10-20" });
    expect(loadSeen(user)).toEqual({ "feed-p1-f1-2026-10-29": "2026-10-29" });
    expect(loadSeen({ id: "someone-else" })).toEqual({});
  });

  it("[FR4.3] Turning reminders off saves the choice to the owner's profile", async () => {
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    await run(() => s.current.setNotifications(false));
    expect(s.current.user.notificationsEnabled).toBe(false);
    expect(calls("profiles", "update").at(-1)).toMatchObject({ payload: { notifications_enabled: false }, filters: [["id", "user-1"]] });
  });
});
