/* Finds vet clinics near a point with TomTom's Places Search API (free: 5,000 searches a month, no card).
   Plain JavaScript with only fetch and crypto, so the same file runs in the Supabase edge function
   (index.ts) and in Node for testing (scripts/test-clinics.mjs).

   TomTom lists some places that aren't vet clinics under "Veterinarian": human animal-bite centers,
   agri-vet supply stores, trading companies, farms. These are left out. Hours are turned into a
   week (Sunday first), so a saved search stays right after its dates have passed. */

const DISCOVER = "https://api.tomtom.com/maps/orbis/places/discover";
const GEOCODE = "https://api.tomtom.com/search/2/geocode/";
export const RADII = [10000, 25000];   // metres: widen when fewer than MIN_FOUND clinics are near
const MIN_FOUND = 5;
const KEEP_DAYS = 7;                     // a saved search is reused for a week
const GEO_KEEP_DAYS = 30;

// Not a clinic: always left out (animal-bite centers treat people for rabies).
const NOT_VET = /animal bite|bite (treatment|center|centre)|\babtc\b|health cent(er|re)|\bnpc\b/i;
// Usually a shop or company, kept only when the name also says it's a clinic.
const SHOP = /suppl(y|ies)|trading|enterprises?\b|\bfarms?\b|\bboar\b|poultry|\bfeeds?\b|agri|propert(y|ies)|building|\bcorp\b|corporation|incorporated|\binc\b|\.org\b|company/i;
const CARE = /clinic|hospital|medic|wellness|doctor|\bdoc\b|\bdr\b|animal care|pet care|veterinarian\b|vets? (center|centre|services?)/i;

export const isClinic = (name) => !NOT_VET.test(name) && (!SHOP.test(name) || CARE.test(name));

/* Rounded to about 1 km, so owners near each other share one saved search (and their exact spot isn't kept). */
export const cellOf = (lat, lon) => ({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });

const WEEKDAY = (date) => new Date(date + "T00:00:00Z").getUTCDay();

/* TomTom's dated hours for the coming days → 7 weekdays of [start, end] pairs; null when not listed. */
export function weekHours(openingHours) {
  if (!Array.isArray(openingHours) || !openingHours.length) return null;
  const week = Array.from({ length: 7 }, () => []);
  const seen = new Set();
  for (const day of openingHours) {
    if (!day?.date) continue;
    const wd = WEEKDAY(day.date);
    if (seen.has(wd)) continue;   // the same weekday again, a week later
    seen.add(wd);
    week[wd] = (day.timeRanges || []).map((r) => [r.start, r.end]);
  }
  return seen.size ? week : null;
}

const distance = (a, b) => {   // metres, haversine
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function toClinic(r) {
  const [lon, lat] = r.position?.coordinates || [];
  const contacts = r.contacts || [];
  const phone = contacts.flatMap((c) => c.phones || []).map((p) => p.number || p.value || p).find((p) => typeof p === "string") || "";
  const website = contacts.flatMap((c) => c.websites || []).map((w) => w.url || w.value || w).find((w) => typeof w === "string") || "";
  const a = r.address || {};
  const street = [a.houseNumber, a.street || a.streetName].filter(Boolean).join(" ");
  const address = [street, a.municipalitySubdivision, a.municipality].filter(Boolean).join(", ");
  const utcOffset = r.openingHours?.find((d) => d.timeRanges?.length)?.timeRanges[0].utcOffsetSeconds ?? 8 * 3600;
  return { id: r.id, name: (r.title || "").trim(), address, lat, lon, phone, website, hours: weekHours(r.openingHours), utcOffset };
}

/* The same clinic listed twice (same name within 200 m): keep the one with more details. */
function dedupe(list) {
  const out = [];
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const score = (c) => (c.hours ? 2 : 0) + (c.phone ? 1 : 0);
  for (const c of list) {
    const i = out.findIndex((o) => key(o.name) === key(c.name) && distance(o, c) < 200);
    if (i < 0) out.push(c);
    else if (score(c) > score(out[i])) out[i] = c;
  }
  return out;
}

async function discover(key, center, radius) {
  const point = [center.lon, center.lat];
  const res = await fetch(DISCOVER, {
    method: "POST",
    headers: {
      "TomTom-Api-Key": key, "TomTom-Api-Version": "3", "Content-Type": "application/json",
      // Only these fields, so each search stays a single billed request.
      Attributes: "results(id,title,position,address,contacts,openingHours)",
    },
    body: JSON.stringify({
      query: "veterinarian", maxResults: 100,
      filters: { types: ["poi"], poiTypes: ["veterinary"], geometry: { type: "circle", center: point, radiusInMeters: radius } },
      preferences: { geometry: { type: "point", coordinates: point } },
    }),
  });
  if (!res.ok) throw new Error(`TomTom search failed (${res.status})`);
  const data = await res.json();
  return dedupe((data.results || []).map(toClinic).filter((c) => c.name && Number.isFinite(c.lat) && isClinic(c.name)));
}

const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

/* An address typed in Profile → a point. Only the address's hash is saved, never the address. */
export async function geocode(address, { key, cache }) {
  const q = address.trim().replace(/\s+/g, " ");
  if (!/philippines|\bph\b/i.test(q)) address = `${q}, Philippines`;
  const cacheKey = `geo:${await sha256(q.toLowerCase())}`;
  const hit = await cache.get(cacheKey, GEO_KEEP_DAYS);
  if (hit) return hit;
  const url = `${GEOCODE}${encodeURIComponent(address)}.json?countrySet=PH&limit=1&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom address search failed (${res.status})`);
  const r = (await res.json()).results?.[0];
  const found = r ? { lat: r.position.lat, lon: r.position.lon, label: r.address?.freeformAddress || q } : { notFound: true };
  await cache.set(cacheKey, found);
  return found;
}

/* Clinics around a point: from the week's saved search for its ~1 km cell, or a new TomTom search. */
export async function findClinics(point, { key, cache }) {
  const center = cellOf(point.lat, point.lon);
  const cacheKey = `clinics:v1:${center.lat.toFixed(2)},${center.lon.toFixed(2)}`;
  const hit = await cache.get(cacheKey, KEEP_DAYS);
  if (hit) return { ...hit, cached: true };
  let clinics = [], radius = RADII[0];
  for (radius of RADII) {
    clinics = await discover(key, center, radius);
    if (clinics.length >= MIN_FOUND) break;
  }
  const result = { center, radius, clinics, source: "TomTom", searchedAt: new Date().toISOString() };
  await cache.set(cacheKey, result);
  return { ...result, cached: false };
}

/* For testing in Node, and the local dev server: a cache that lives in memory. */
export function memoryCache() {
  const m = new Map();
  return {
    async get(k, days) { const e = m.get(k); return e && Date.now() - e.at < days * 864e5 ? e.value : null; },
    async set(k, value) { m.set(k, { value, at: Date.now() }); },
  };
}
