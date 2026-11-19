/* The AI's training pets, stored in Supabase in a private FurFriends training account, so the team can open them in
   the app and correct them, and the training data is made from what's stored there.

     npm run training-pets:setup                 all in one go: makes the training account's login (a private random
                                                 password) in .env.local if there isn't one, creates the account and
                                                 saves the training pets (= seed)
     npm run training-pets -- check              which symptom rules the training pets cover (no internet needed)
     npm run training-pets -- seed [--replace]   saves the training pets (scripts/simPets.mjs) in the training account
     npm run training-pets -- export             writes the pets stored there to ai-server/data/training_pets.json

   Then: python add_pet_profiles.py --db-pets data/training_pets.json (in ai-server/).

   The account: TRAINING_EMAIL and TRAINING_PASSWORD in .env.local (never committed), next to VITE_SUPABASE_URL and
   VITE_SUPABASE_PUBLISHABLE_KEY. Its password is private, unlike the demo and sample accounts, so only the team can
   change the training pets. Seed signs it up if it doesn't exist yet (needs "Confirm email" off, as for npm run seed).
   It refuses the demo and sample accounts, and won't replace pets already in the account unless given --replace
   (that throws away the team's corrections).

   All the pets are made up (SIMULATED). Real owners' pets are never read: export only reads the training account.
   1 pet in 5 is kept for evaluation (splitOf in simPets.mjs, from the pet's id), also for pets the team adds by hand.
   A pet's dates are read as of the day it was added (asOf), so it looks the same whenever the data is built. */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEMO_EMAIL } from "../src/lib/demoData.js";
import { PET_SELECT, petFromRow, petWeights } from "../src/lib/petRows.js";
import { addPets, clearPets } from "../src/lib/seedDemo.js";
import { petContext } from "../src/lib/prompt.js";
import { RULES } from "../src/lib/symptomNotes.js";
import { asOfToday, splitOf, topicSpecies, trainingCohort } from "./simPets.mjs";

const OUT = "ai-server/data/training_pets.json";
const [command = "check", ...flags] = process.argv.slice(2).filter((a) => a !== "--");

/* Which rules apply to how many training and evaluation pets. */
function coverage(pets) {
  const rows = RULES.map((r) => {
    const n = { train: 0, eval: 0 };
    for (const p of pets) if ((!topicSpecies(r) || topicSpecies(r) === p.species) && (!r.species || r.species === p.species) && r.when(petContext(asOfToday(p)))) n[p.split]++;
    return { rule: r.id, ...n };
  });
  console.log(`${pets.length} pets: ${pets.filter((p) => p.split === "train").length} for training, ${pets.filter((p) => p.split === "eval").length} kept for evaluation.`);
  console.log("Symptom rule                        training  evaluation");
  for (const x of rows) console.log(`  ${x.rule.padEnd(34)}${String(x.train).padStart(6)}${String(x.eval).padStart(11)}${x.train < 2 || !x.eval ? "   <- too few" : ""}`);
  return rows;
}

if (command === "check") {
  // --snapshot <file>: also write the pets as an export would (to try the training data before seeding).
  const today = new Date().toISOString().slice(0, 10);
  const pets = trainingCohort().map(({ keepId, cohort, ...p }) => ({ split: splitOf(p.id), asOf: today, ...p }));
  coverage(pets);
  const at = flags.indexOf("--snapshot");
  if (at >= 0) writeFileSync(flags[at + 1], JSON.stringify({ _about: "NOT from the database: the training pets as seed would save them (check --snapshot).", exportedOn: today, pets }, null, 1) + "\n");
  process.exit(0);
}

// setup: the training account's login, in .env.local (never committed). A random password nobody has to make up;
// the email is @example.com (a domain reserved for examples, like the sample accounts), or --email <address>.
const ENV_FILE = process.env.TRAINING_ENV_FILE || ".env.local";   // (another file only for testing this script)
if (command === "setup") {
  if (!existsSync(ENV_FILE)) throw new Error(".env.local is missing: it needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY first");
  const text = readFileSync(ENV_FILE, "utf8");
  if (!/^\s*TRAINING_EMAIL\s*=/m.test(text)) {
    const at = flags.indexOf("--email");
    const email = at >= 0 ? flags[at + 1] : "training.pets@example.com";
    const password = randomBytes(18).toString("base64url");
    const lines = ["# FurFriends training account (scripts/training-pets.mjs). Private: share it only with the team.",
      `TRAINING_EMAIL=${email}`, `TRAINING_PASSWORD=${password}`];
    appendFileSync(ENV_FILE, (text && !text.endsWith("\n") ? "\n" : "") + lines.join("\n") + "\n");
    console.log(`Added the training account's login to .env.local (TRAINING_EMAIL=${email}, a new random TRAINING_PASSWORD).`);
  } else {
    console.log("Using the training account login already in .env.local.");
  }
}

const env = existsSync(ENV_FILE) ? Object.fromEntries(readFileSync(ENV_FILE, "utf8").split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])) : {};
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = (env.TRAINING_EMAIL || "").trim().toLowerCase(), PASSWORD = env.TRAINING_PASSWORD || "";
if (!URL || !KEY) throw new Error(".env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
if (!EMAIL || PASSWORD.length < 12) throw new Error(".env.local needs TRAINING_EMAIL and TRAINING_PASSWORD (12 characters or more) for the training account");
if (EMAIL === DEMO_EMAIL || /^sample\..+@example\.com$/.test(EMAIL)) throw new Error("TRAINING_EMAIL must be its own account, not the demo or a sample account");

const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let { data, error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const seeding = command === "seed" || command === "setup";
if (error && seeding && /invalid/i.test(error.message)) {
  ({ data, error } = await db.auth.signUp({ email: EMAIL, password: PASSWORD, options: { data: { name: "FurFriends training pets" } } }));
  if (!error && !data.session) throw new Error("Supabase wants the sign-up confirmed by email: confirm it from the inbox, or switch Confirm email off, then run seed again");
}
if (error) throw new Error(`Couldn't log into the training account: ${error.message}`);
const uid = data.user.id;

if (seeding) {
  const { data: old, error: e } = await db.from("pets").select("id");
  if (e) throw e;
  if (old.length && !flags.includes("--replace")) {
    throw new Error(`The training account already has ${old.length} pets (maybe corrected by the team). Run export to use them, or seed --replace to start over.`);
  }
  if (old.length) await clearPets(db, uid);
  const pets = trainingCohort();
  console.log(`Saving ${pets.length} training pets to the training account...`);
  await addPets(db, uid, pets, null);
  console.log(`Done. To look through and correct them, log in to the app as ${EMAIL} with TRAINING_PASSWORD from .env.local`
    + " (share it with the team privately). Then run: npm run training-pets -- export");
} else if (command === "export") {
  const { data: rows, error: e } = await db.from("pets").select(PET_SELECT).order("created_at");
  if (e) throw e;
  const pets = rows.map(petFromRow);
  const weights = await petWeights(db, pets);
  if (!weights) console.warn("The database has no weight_log table yet (migration 20261112000000_weight_log.sql): pets are exported without weight history.");
  const manila = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const out = pets.map(({ ownerId, photo, photoPath, documents, createdAt, ...p }) => ({ split: splitOf(p.id), asOf: manila(createdAt), ...p }));
  writeFileSync(OUT, JSON.stringify({
    _about: "The AI's training pets, exported from the FurFriends training account (scripts/training-pets.mjs). Made up (simulated), not real owners' pets. split: train or eval (kept out of training). asOf: the day the pet was added; its dates are read as of then.",
    exportedOn: manila(Date.now()), pets: out,
  }, null, 1) + "\n");
  console.log(`Wrote ${OUT}.`);
  coverage(out);
} else {
  throw new Error(`Unknown command "${command}": use setup, check, seed or export`);
}
await db.auth.signOut();
