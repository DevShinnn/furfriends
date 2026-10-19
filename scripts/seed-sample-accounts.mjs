/* Creates the sample accounts in the live Supabase project and fills them with the demo pets, so the
   app can be shown on the real backend: log in on two devices, see changes sync, get reminders.
   Every account is a made-up owner with an @example.com address (a domain reserved for examples,
   so no real person gets mail). The details are in docs/sample-accounts.md.

     node scripts/seed-sample-accounts.mjs

   Re-running it deletes each sample account's pets and files and adds them again, so the dates
   (due vaccines, upcoming appointments, the last 2 weeks of meals) are current again.
   Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local. It signs up through
   the normal sign-up, so it needs "Confirm email" switched off (Supabase → Authentication →
   Sign In / Providers), as it is now. Never writes to the usability survey table. */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PASSWORD = "FurFriends2026";
export const ACCOUNTS = [
  { email: "sample.maria@example.com", name: "Maria Santos", phone: "0917 555 0101", city: "Quezon City", pets: ["Mochi", "Ginger"], about: "Cat owner with full records" },
  { email: "sample.juan@example.com", name: "Juan Dela Cruz", phone: "0918 555 0102", city: "Pasig City", pets: ["Bori", "Kong"], about: "Dog owner with full records" },
  { email: "sample.ana@example.com", name: "Ana Reyes", phone: "0919 555 0103", city: "Makati City", pets: [], about: "New owner, no pets yet (for trying “Add a pet”)" },
];

/* ---------------------------------------------------------------- setup */
const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) throw new Error(".env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");

// The demo pets come from the app itself (src/lib/demoData.js), so both stay the same.
const tmp = mkdtempSync(join(tmpdir(), "ff-seed-"));
await build({ entryPoints: [join(ROOT, "src/lib/demoData.js")], bundle: true, format: "esm", platform: "node", outfile: join(tmp, "demo.mjs"), logLevel: "error" });
const { demoPets } = await import(pathToFileURL(join(tmp, "demo.mjs")).href);

/* Storage only takes JPEG, PNG, WebP and PDF, so the sample documents (SVG) are drawn to PNG with Chrome. */
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
function svgToPng(src) {
  const svg = join(ROOT, "public", src);
  const [, w, h] = readFileSync(svg, "utf8").match(/width="(\d+)" height="(\d+)"/) || [0, 850, 1100];
  const png = join(tmp, `${randomUUID()}.png`);
  if (CHROME) spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(tmp, "c")}`,
    `--window-size=${w},${h}`, `--screenshot=${png}`, pathToFileURL(svg).href], { stdio: "ignore", timeout: 60000 });
  return existsSync(png) ? readFileSync(png) : null;
}

const orNull = (v) => (v === "" || v == null ? null : v);
const check = ({ error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

/* ---------------------------------------------------------------- one account */
async function seed(account) {
  const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let { data, error } = await db.auth.signInWithPassword({ email: account.email, password: PASSWORD });
  if (error) {
    ({ data, error } = await db.auth.signUp({ email: account.email, password: PASSWORD, options: { data: { name: account.name } } }));
    if (error) throw new Error(`${account.email}: sign-up failed: ${error.message}`);
    if (!data.session) throw new Error(`${account.email}: sign-up needs email confirmation. Switch off "Confirm email" in Supabase first.`);
  }
  const uid = data.user.id;
  check(await db.from("profiles").update({ name: account.name, phone: account.phone, city: account.city }).eq("id", uid), "profile");

  // Start clean: remove the old sample pets and their files (child rows go with the pet).
  const old = await db.from("pets").select("id"); check(old, "list pets");
  for (const { id } of old.data) {
    for (const bucket of ["pet-photos", "pet-documents"]) {
      const files = await db.storage.from(bucket).list(`${uid}/${id}`);
      if (files.data?.length) await db.storage.from(bucket).remove(files.data.map((f) => `${uid}/${id}/${f.name}`));
    }
  }
  if (old.data.length) check(await db.from("pets").delete().in("id", old.data.map((p) => p.id)), "delete pets");

  const pets = demoPets(uid).filter((p) => account.pets.includes(p.name));
  for (const p of pets) {
    const petId = randomUUID();
    let photo_path = null;
    if (p.photo) {
      photo_path = `${uid}/${petId}/${randomUUID()}.jpg`;
      check(await db.storage.from("pet-photos").upload(photo_path, readFileSync(join(ROOT, "public", p.photo)), { contentType: "image/jpeg" }), "photo");
    }
    check(await db.from("pets").insert({
      id: petId, name: p.name, species: p.species, breed: p.breed, age_years: p.ageYears, age_months: p.ageMonths,
      gender: p.gender || null, weight_kg: orNull(p.weight), photo_path,
    }), `pet ${p.name}`);

    const rows = (table, list) => list.length ? db.from(table).insert(list).then((r) => check(r, table)) : null;
    await rows("medical_records", p.medical.map((x) => ({ pet_id: petId, date: x.date, type: x.type, title: x.title, vet: x.vet || "", notes: x.notes || "" })));
    await rows("vaccinations", p.vaccinations.map((x) => ({ pet_id: petId, name: x.name, date_given: x.dateGiven, next_due: orNull(x.nextDue), vet: x.vet || "", lot: x.lot || "" })));

    const docs = [];
    for (const d of p.documents) {
      const png = svgToPng(d.src);
      if (!png) { console.warn(`  (skipped document "${d.title}": Chrome not found to draw it)`); continue; }
      const file_path = `${uid}/${petId}/${randomUUID()}.png`;
      check(await db.storage.from("pet-documents").upload(file_path, png, { contentType: "image/png" }), "document file");
      docs.push({ pet_id: petId, title: d.title, type: d.type, date: d.date, notes: d.notes || "", file_path, mime_type: "image/png" });
    }
    await rows("documents", docs);

    // Feeding plans get new ids, and the 2-week meal log is moved onto them.
    const mealId = new Map(p.feeding.map((m) => [m.id, randomUUID()]));
    await rows("feeding_schedules", p.feeding.map((m) => ({ id: mealId.get(m.id), pet_id: petId, time: m.time, food: m.food, amount: m.amount || "", days: m.days || [], notes: m.notes || "" })));
    await rows("feeding_log", Object.entries(p.fedLog).flatMap(([day, ids]) => ids.map((id) => ({ feeding_id: mealId.get(id), pet_id: petId, fed_on: day }))));
    await rows("care_tasks", p.care.map((x) => ({ pet_id: petId, kind: x.kind, title: x.title, next_due: x.nextDue, due_time: orNull(x.dueTime),
      repeat_days: Number(x.repeatDays) || 0, last_done: orNull(x.lastDone), done: !!x.done, notes: x.notes || "" })));
  }

  // Read it back the way the app does, to confirm it all landed.
  const back = await db.from("pets").select("name, photo_path, medical_records(id), vaccinations(id), documents(id), feeding_schedules(id), care_tasks(id), feeding_log(fed_on)").order("created_at");
  check(back, "read back");
  await db.auth.signOut();
  return back.data;
}

for (const a of ACCOUNTS) {
  const pets = await seed(a);
  console.log(`${a.email}  (${a.name}, ${pets.length} pets)`);
  for (const p of pets) {
    console.log(`  ${p.name.padEnd(7)} photo ${p.photo_path ? "yes" : "no "} · ${p.medical_records.length} medical · ${p.vaccinations.length} vaccines · ${p.documents.length} documents · ${p.feeding_schedules.length} meals · ${p.care_tasks.length} care tasks · ${p.feeding_log.length} meals logged`);
  }
}
console.log(`\nPassword for all: ${PASSWORD}`);
