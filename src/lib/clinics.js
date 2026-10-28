import { supabase } from "./supabase";

/* Nearby vet clinics for the Clinics page. The search runs in the find-clinics edge function
   (supabase/functions/find-clinics), which keeps the TomTom key secret and saves searches for a week.
   VITE_CLINICS_URL can point the app at another server with the same contract (the dev server's
   /__clinics, see vite.config.js), to try the page before the function is deployed. */

const LOCAL_URL = import.meta.env.VITE_CLINICS_URL || "";

async function errorText(error) {
  try { return (await error.context.json()).error || error.message; } catch { return error.message; }
}

/* { lat, lon } or { address } → { center, radius, clinics, place?, from? }. Throws with a message to show. */
export async function searchClinics(where) {
  if (!navigator.onLine) throw new Error("You're offline. Connect to the internet to find clinics.");
  if (LOCAL_URL) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(LOCAL_URL, {
      method: "POST", body: JSON.stringify(where),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The clinic search isn't answering right now.");
    return data;
  }
  const { data, error } = await supabase.functions.invoke("find-clinics", { body: where });
  if (error) throw new Error(await errorText(error) || "The clinic search isn't answering right now.");
  return data;
}

/* The phone's location, once. Throws with a message to show. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share your location. Use your address instead."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1
        ? "Location is blocked for FurFriends. Allow it in your browser's site settings, or use your address."
        : "Couldn't get your location. Turn on location (GPS) and try again, or use your address.")),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/* Whether the browser already lets FurFriends read the location, so the page can use it without asking. */
export async function locationAllowed() {
  try { return (await navigator.permissions.query({ name: "geolocation" })).state === "granted"; } catch { return false; }
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const kmText = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

/* ---------------------------------------------------------------- opening hours
   hours: 7 weekdays (Sunday first) of [["08:00", "17:00"], ...]; [] is closed; null is not listed. */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const timeText = (t) => {
  const m = toMin(t), h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const allDay = (r) => r[0] === "00:00" && toMin(r[1]) >= 23 * 60 + 59;
export const is24h = (c) => !!c.hours && c.hours.every((d) => d.length && d.some(allDay));

export const dayText = (ranges) => !ranges?.length ? "Closed"
  : ranges.some(allDay) ? "Open 24 hours"
    : ranges.map(([a, b]) => `${timeText(a)} – ${timeText(b)}`).join(", ");

/* The clinic's own clock (its UTC offset, +8 in the Philippines). */
function clinicNow(c, now) {
  const t = new Date(now.getTime() + (c.utcOffset ?? 28800) * 1000);
  return { day: t.getUTCDay(), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/* { open: true|false|null, text } for the list: "Open · closes 5:00 PM", "Closed · opens 8:00 AM tomorrow". */
export function openState(c, now = new Date()) {
  if (!c.hours) return { open: null, text: "Hours not listed" };
  if (is24h(c)) return { open: true, text: "Open 24 hours" };
  const { day, min } = clinicNow(c, now);
  for (const [a, b] of c.hours[day]) {
    const s = toMin(a), e = toMin(b) <= s ? 24 * 60 : toMin(b);
    if (min >= s && min < e) return { open: true, text: allDay([a, b]) ? "Open all day" : `Open · closes ${timeText(b)}` };
  }
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const next = c.hours[d].map((r) => r[0]).filter((a) => i > 0 || toMin(a) > min).sort()[0];
    if (next) return { open: false, text: `Closed · opens ${timeText(next)}${i === 0 ? "" : i === 1 ? " tomorrow" : ` ${WEEKDAYS[d].slice(0, 3)}`}` };
  }
  return { open: false, text: "Closed" };
}
export const todayIndex = (c, now = new Date()) => clinicNow(c, now).day;

/* ---------------------------------------------------------------- links */
// Opens Google Maps (the app on phones) with the route. Without an origin it starts from where the phone is.
export const directionsUrl = (c, from) =>
  `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}${from ? `&origin=${from.lat},${from.lon}` : ""}`;
export const telUrl = (phone) => `tel:${phone.replace(/[^\d+]/g, "")}`;
