/* Creates the demo and sample accounts in the live Supabase project and fills them with the demo
   pets, so the app can be shown on the real backend: log in on two devices, see changes sync, get
   reminders. All are made-up owners. The sample accounts use @example.com (a domain reserved for
   examples). The details are in docs/sample-accounts.md.

     node scripts/seed-sample-accounts.mjs

   Re-running it deletes each account's pets and files and adds them again, so the dates (due
   vaccines, upcoming appointments, the last 2 weeks of meals) are current again. The demo account
   can also do this itself from Profile → Reset demo data.
   Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env.local. It signs up through
   the normal sign-up, so it needs "Confirm email" switched off (Supabase → Authentication →
   Sign In / Providers), as it is now. Never writes to the usability survey table. */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- setup */
const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) throw new Error(".env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");

// The pets and the code that saves them come from the app (src/lib/seedDemo.js), so the
// demo account's Reset button and this script build exactly the same data.
const tmp = mkdtempSync(join(tmpdir(), "ff-seed-"));
const entry = join(tmp, "entry.js");
const lib = (m) => JSON.stringify(join(ROOT, "src/lib", m).replace(/\\/g, "/"));
await import("node:fs").then((fs) => fs.writeFileSync(entry, `export * from ${lib("seedDemo.js")};\nexport * from ${lib("demoData.js")};\n`));
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: join(tmp, "seed.mjs"), logLevel: "error" });
const { addDemoPets, clearPets, DEMO_EMAIL, DEMO_PASS, DEMO_PROFILE } = await import(pathToFileURL(join(tmp, "seed.mjs")).href);

const SAMPLE_PASSWORD = "FurFriends2026";
const ACCOUNTS = [
  { email: DEMO_EMAIL, password: DEMO_PASS, ...DEMO_PROFILE, pets: [] /* all four */ },
  { email: "sample.maria@example.com", password: SAMPLE_PASSWORD, name: "Maria Santos", phone: "0917 555 0101", city: "Quezon City", pets: ["Mochi", "Ginger"] },
  { email: "sample.juan@example.com", password: SAMPLE_PASSWORD, name: "Juan Dela Cruz", phone: "0918 555 0102", city: "Pasig City", pets: ["Bori", "Kong"] },
  { email: "sample.ana@example.com", password: SAMPLE_PASSWORD, name: "Ana Reyes", phone: "0919 555 0103", city: "Makati City", pets: null /* none */ },
];

/* Storage only takes JPEG, PNG, WebP and PDF, so the sample documents (SVG) are drawn to PNG with Chrome. */
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
const files = {
  photo: async (src) => readFileSync(join(ROOT, "public", src)),
  doc: async (src) => {
    const svg = join(ROOT, "public", src);
    const [, w, h] = readFileSync(svg, "utf8").match(/width="(\d+)" height="(\d+)"/) || [0, 850, 1100];
    const png = join(tmp, `${randomUUID()}.png`);
    if (CHROME) spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(tmp, "c")}`,
      `--window-size=${w},${h}`, `--screenshot=${png}`, pathToFileURL(svg).href], { stdio: "ignore", timeout: 60000 });
    if (existsSync(png)) return readFileSync(png);
    console.warn(`  (skipped ${src}: Chrome not found to draw it)`);
    return null;
  },
};

/* ---------------------------------------------------------------- one account */
async function seed(a) {
  const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let { data, error } = await db.auth.signInWithPassword({ email: a.email, password: a.password });
  if (error) {
    ({ data, error } = await db.auth.signUp({ email: a.email, password: a.password, options: { data: { name: a.name } } }));
    if (error) throw new Error(`${a.email}: sign-up failed: ${error.message}. If the account exists with another password, delete it in Supabase → Authentication → Users and run this again.`);
    if (!data.session) throw new Error(`${a.email}: sign-up needs email confirmation. Switch off "Confirm email" in Supabase first.`);
  }
  const uid = data.user.id;
  const prof = await db.from("profiles").update({ name: a.name, phone: a.phone, city: a.city, notifications_enabled: true }).eq("id", uid);
  if (prof.error) throw new Error(`profile: ${prof.error.message}`);
  await clearPets(db, uid);
  if (a.pets) await addDemoPets(db, uid, files, a.pets);

  // Read it back the way the app does, to confirm it all landed.
  const back = await db.from("pets").select("name, photo_path, medical_records(id), vaccinations(id), documents(id), feeding_schedules(id), care_tasks(id), feeding_log(fed_on)").order("created_at");
  if (back.error) throw new Error(`read back: ${back.error.message}`);
  await db.auth.signOut();
  return back.data;
}

for (const a of ACCOUNTS) {
  const pets = await seed(a);
  console.log(`${a.email} / ${a.password}  (${a.name}, ${pets.length} pets)`);
  for (const p of pets) {
    console.log(`  ${p.name.padEnd(7)} photo ${p.photo_path ? "yes" : "no "} · ${p.medical_records.length} medical · ${p.vaccinations.length} vaccines · ${p.documents.length} documents · ${p.feeding_schedules.length} meals · ${p.care_tasks.length} care tasks · ${p.feeding_log.length} meals logged`);
  }
}
