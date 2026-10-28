/* Tries the clinic search (supabase/functions/find-clinics/clinics.js) against TomTom, without Supabase.

     node scripts/test-clinics.mjs                     → a few Philippine places
     node scripts/test-clinics.mjs "Lipa, Batangas"    → one address

   Needs TOMTOM_API_KEY in .env.local. Each place uses 1 or 2 of the 5,000 free monthly searches. */
import { readFileSync } from "node:fs";
import { findClinics, geocode, memoryCache } from "../supabase/functions/find-clinics/clinics.js";

const key = (readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^TOMTOM_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^"|"$/g, "");
if (!key) { console.error("Add TOMTOM_API_KEY=... to .env.local first."); process.exit(1); }
const cache = memoryCache();

const places = process.argv[2] ? [process.argv[2]] : ["Batangas City", "Lipa, Batangas", "Bauan, Batangas", "Quezon City"];
for (const place of places) {
  const at = await geocode(place, { key, cache });
  if (at.notFound) { console.log(`${place}: address not found`); continue; }
  const r = await findClinics(at, { key, cache });
  const hours = r.clinics.filter((c) => c.hours).length, phone = r.clinics.filter((c) => c.phone).length;
  console.log(`\n${place} → ${at.label} (${at.lat}, ${at.lon}): ${r.clinics.length} clinics within ${r.radius / 1000} km, ${hours} with hours, ${phone} with phone`);
  for (const c of r.clinics.slice(0, 6)) console.log(`  ${c.name} | ${c.address} | ${c.phone || "no phone"} | ${c.hours ? c.hours.map((d) => d.map((x) => x.join("-")).join(",") || "closed").join(" / ") : "hours not listed"}`);
}
