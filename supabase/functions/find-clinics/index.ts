// Nearby vet clinics for the app's Clinics page (src/pages/Clinics.jsx), from TomTom (see clinics.js).
//
//   POST { lat, lon }     the phone's location
//   POST { address }      the address saved in Profile, when location is off
//   200 → { center, radius, clinics: [...], source, searchedAt, cached, place? }
//
// Only logged-in FurFriends users get answers. Searches are saved for a week per ~1 km area in
// public.clinic_search_cache (migrations/20261029000000_clinic_finder.sql), which only this function
// can read or write, so the 5,000 free TomTom searches a month go a long way.
//
// Secret: TOMTOM_API_KEY. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import { findClinics, geocode } from "./clinics.js";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const cache = {
  async get(key: string, days: number) {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data } = await db.from("clinic_search_cache").select("value").eq("key", key).gt("saved_at", since).maybeSingle();
    return data?.value ?? null;
  },
  async set(key: string, value: unknown) {
    await db.from("clinic_search_cache").upsert({ key, value, saved_at: new Date().toISOString() });
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return reply({ error: "Please log in to find clinics." }, 401);

  const key = env("TOMTOM_API_KEY");
  if (!key) return reply({ error: "The clinic search isn't set up yet (no TomTom key)." }, 503);

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  try {
    let point = { lat: Number(body.lat), lon: Number(body.lon) }, place: string | undefined;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
      const address = String(body.address ?? "").slice(0, 200).trim();
      if (!address) return reply({ error: "Send a location or an address." }, 400);
      const found = await geocode(address, { key, cache });
      if (found.notFound) return reply({ error: "We couldn't find that address. Try adding the barangay and city." }, 404);
      point = { lat: found.lat, lon: found.lon };
      place = found.label;
    }
    if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return reply({ error: "That location isn't valid." }, 400);
    const result = await findClinics(point, { key, cache });
    return reply({ ...result, place, from: place ? point : undefined });
  } catch (e) {
    console.error(e);
    return reply({ error: "The clinic search isn't answering right now. Try again in a minute." }, 502);
  }
});
