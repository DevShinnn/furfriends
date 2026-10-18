// Sends reminder notifications to devices, including when the app is closed.
// Called every 5 minutes by pg_cron (see migrations/20261019020000_push_notifications.sql).
// The rules match src/lib/reminders.js, and so do the keys: the app and this function never
// announce the same reminder twice, and a notification shown by both replaces itself (same tag).
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const WINDOW = 10;            // minutes: a reminder is due if its time fell within the last 10 minutes
const MORNING = 8 * 60;       // undated tasks and overdue nudges go out at 8:00 AM
const EVENING = 18 * 60;      // the day-before vet visit reminder goes out at 6:00 PM
const APPT_LEAD = 120;        // vet visits with a time are reminded 2 hours before
const KEEP_LOG_DAYS = 8;

const env = (k: string) => Deno.env.get(k) ?? "";
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

type Reminder = { key: string; title: string; body: string; url: string };

/* ---------------------------------------------------------------- local time */
function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: new Date(date + "T00:00:00Z").getUTCDay() };
}
const shift = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mins = (t: string | null) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtTime = (t: string | null) => {
  const m = mins(t); if (m === null) return "";
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, "0");
  return `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
};

/* ---------------------------------------------------------------- what's due */
// deno-lint-ignore no-explicit-any
function dueFor(pets: any[], tz: string): Reminder[] {
  const { date: today, minutes: now, weekday } = localNow(tz);
  const tomorrow = shift(today, 1);
  const inWindow = (target: number) => target <= now && target > now - WINDOW;
  const out: Reminder[] = [];

  for (const pet of pets) {
    const fed = new Set(pet.feeding_log.filter((l: { fed_on: string }) => l.fed_on === today).map((l: { feeding_id: string }) => l.feeding_id));
    for (const f of pet.feeding_schedules) {
      if (f.days?.length && !f.days.includes(weekday)) continue;
      if (fed.has(f.id) || !inWindow(mins(f.time)!)) continue;
      out.push({
        key: `feed-${pet.id}-${f.id}-${today}`, title: `Time to feed ${pet.name}`,
        body: [f.food, f.amount, fmtTime(f.time)].filter(Boolean).join(" · "), url: `#/app/pets/${pet.id}?tab=care`,
      });
    }

    const tasks = [
      ...pet.care_tasks.filter((t: { done: boolean }) => !t.done),
      ...pet.vaccinations.filter((v: { next_due: string | null }) => v.next_due)
        .map((v: { id: string; name: string; next_due: string }) => ({ id: "vax-" + v.id, kind: "Vaccination", title: v.name, next_due: v.next_due, due_time: null, notes: "", fromRecord: true })),
    ];
    for (const t of tasks) {
      const appt = t.kind === "Vet appointment";
      const time = mins(t.due_time);
      let when: string | null = null;
      if (t.next_due === today && inWindow(time === null ? MORNING : Math.max(0, time - (appt ? APPT_LEAD : 0)))) when = "today";
      else if (appt && t.next_due === tomorrow && inWindow(EVENING)) when = "tomorrow";
      else if (t.next_due < today && inWindow(MORNING)) when = "overdue";
      if (!when) continue;
      out.push({
        key: `care-${pet.id}-${t.id}-${t.next_due}-${when}`,
        title: `${appt ? "Vet visit" : t.kind} ${when} for ${pet.name}`,
        body: [t.title, fmtTime(t.due_time), appt && t.notes].filter(Boolean).join(" · "),
        url: appt ? "#/app/appointments" : `#/app/pets/${pet.id}?tab=${t.fromRecord ? "vaccines" : "care"}`,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- handler */
Deno.serve(async (req) => {
  if (!env("CRON_SECRET") || req.headers.get("Authorization") !== `Bearer ${env("CRON_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: subs, error: subErr } = await db.from("push_subscriptions").select("*");
  if (subErr) return Response.json({ error: subErr.message }, { status: 500 });
  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  // Only people with reminders switched on.
  const { data: profiles } = await db.from("profiles").select("id").eq("notifications_enabled", true).in("id", [...byUser.keys()]);
  const users = (profiles ?? []).map((p) => p.id);
  let sent = 0, gone = 0;

  if (users.length) {
    const { data: pets, error } = await db.from("pets")
      .select("id, name, owner_id, feeding_schedules(id, time, food, amount, days), feeding_log(feeding_id, fed_on), care_tasks(id, kind, title, next_due, due_time, done, notes), vaccinations(id, name, next_due)")
      .in("owner_id", users)
      .gte("feeding_log.fed_on", shift(new Date().toISOString().slice(0, 10), -2));
    if (error) return Response.json({ error: error.message }, { status: 500 });

    for (const userId of users) {
      const devices = byUser.get(userId)!;
      const due = dueFor((pets ?? []).filter((p) => p.owner_id === userId), devices[0].timezone || "Asia/Manila");
      if (!due.length) continue;

      // Claim the keys; only ones not sent before come back.
      const { data: fresh } = await db.from("push_log")
        .upsert(due.map((r) => ({ user_id: userId, key: r.key })), { onConflict: "user_id,key", ignoreDuplicates: true })
        .select("key");
      const send = due.filter((r) => fresh?.some((f) => f.key === r.key));

      for (const r of send) {
        const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.key, url: r.url });
        for (const d of devices) {
          try {
            await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600 });
            sent++;
          } catch (e) {
            // 404/410: the device unsubscribed or the app was uninstalled.
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) { await db.from("push_subscriptions").delete().eq("endpoint", d.endpoint); gone++; }
            else console.error("push failed", code, (e as Error).message);
          }
        }
      }
      if (send.length) await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("user_id", userId);
    }
  }

  await db.from("push_log").delete().lt("sent_at", new Date(Date.now() - KEEP_LOG_DAYS * 86400000).toISOString());
  return Response.json({ users: users.length, sent, removedDevices: gone });
});
