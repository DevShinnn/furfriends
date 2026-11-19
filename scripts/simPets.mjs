/* Made-up pets with made-up records, for the AI's training data. SIMULATED: no real owner's pet is used.

   - makePet: one pet with a full history (illnesses, medicines, vaccines, checkups, feeding, deworming, weights),
     shaped like the app's pets. A `hint` makes it fit a symptom rule (sim in src/lib/symptomNotes.js).
   - trainingCohort: the fixed set of training pets that scripts/training-pets.mjs saves in the FurFriends training
     account in Supabase, where the team can open and correct them in the app. Every symptom rule has pets it
     applies to, some kept for evaluation only.
   - splitOf: training or evaluation, from the pet's id, so pets the team adds by hand are split the same way.
   - shiftPet / asOfToday: moves a pet's dates, so a pet exported from the database looks today the way it did on the
     day it was added (a pet "recovering from surgery 5 days ago" stays so). */
import { BREED_DB } from "../src/lib/breeds.js";
import { petContext } from "../src/lib/prompt.js";
import { RULES, TOPICS } from "../src/lib/symptomNotes.js";
import { shiftISO } from "../src/lib/care.js";
import { addDays, todayISO } from "../src/lib/utils.js";

const NAMES = {
  Dog: ["Bantay", "Brownie", "Choco", "Max", "Bella", "Peanut", "Rocky", "Lucky", "Buddy", "Princess", "Tisoy", "Biscuit", "Daisy", "Kobe", "Summer",
    "Whitey", "Blackie", "Coco", "Toffee", "Shadow", "Bruno", "Lucy", "Mocha", "Pepper", "Charlie", "Thor", "Kiko", "Ganda", "Bingo", "Snowy"],
  Cat: ["Mingming", "Muning", "Luna", "Tiger", "Simba", "Kitkat", "Oreo", "Snow", "Nala", "Garfield", "Mimi", "Pepper", "Kuting", "Milo", "Sushi",
    "Mochi", "Kuro", "Ginger", "Bubbles", "Tofu", "Puti", "Smokey", "Cleo", "Momo", "Chloe", "Pancake", "Cookie", "Mittens", "Bianca", "Tigger"],
};
const ALLERGIES = ["Chicken protein sensitivity", "Beef allergy", "Fish allergy", "Flea allergy dermatitis", "Grain sensitivity", "Dairy intolerance", "Egg allergy", "Dust mite allergy"];
const MEDS = {
  Dog: ["Heartworm prevention", "Joint supplement", "Thyroid medicine", "Ear drops", "Antibiotics for skin infection", "Monthly flea and tick chewable"],
  Cat: ["Thyroid medicine", "Kidney support supplement", "Antibiotics for cat flu", "Hairball gel", "Ear drops", "Monthly flea spot-on"],
};
const ILLNESS = {
  Dog: [["Injury", "Paw pad laceration"], ["Illness", "Ear infection"], ["Surgery", "Spay surgery"], ["Surgery", "Neuter surgery"], ["Illness", "Vomiting and diarrhea"], ["Illness", "Skin infection"], ["Injury", "Bite wound"], ["Illness", "Tick fever (ehrlichia)"]],
  Cat: [["Illness", "Upper respiratory infection"], ["Surgery", "Spay surgery"], ["Surgery", "Neuter surgery"], ["Illness", "Eye infection"], ["Injury", "Bite wound abscess"], ["Illness", "Vomiting"], ["Illness", "Urinary tract infection"]],
};
const FOODS = {
  Dog: ["Adult dog kibble", "Puppy kibble", "Chicken & rice kibble", "Salmon & rice kibble", "Beef wet food", "Lamb & rice kibble", "Home-cooked chicken and rice", "Grain-free salmon kibble"],
  Cat: ["Indoor cat dry food", "Kitten dry food", "Tuna wet food", "Chicken wet food pouch", "Salmon dry food", "Grain-free chicken (dry)", "Fish and rice wet food"],
};
const VACCINES = { Dog: ["DHPP", "Rabies", "Leptospirosis", "Bordetella"], Cat: ["FVRCP", "Rabies", "FeLV"] };
const DEWORM = { Dog: ["Deworming tablet", "Drontal Plus", "Heartworm chewable", "Flea & tick treatment"], Cat: ["Deworming tablet", "Milbemax", "Broadline spot-on", "Flea treatment"] };

// A small seeded random generator (mulberry32), so the same seed always makes the same pet.
export function random(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* focus: topics the records should be about (allergy, medication, recovering, checkup, vaccine, food, senior).
   hint: what a symptom rule needs: gender, stage, allergy, history, meds, newMed, noVaccine, overdue, weight, weightLoss. */
export function makePet(species, seed, focus = new Set(), hint = {}) {
  const r = random(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const chance = (p) => r() < p;
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const id = () => `sim-${seed}-${Math.floor(r() * 1e9)}`;
  const breeds = BREED_DB.filter((b) => b.species === species);
  const breed = !hint.weight && chance(0.15) ? null : chance(0.3) ? breeds[0] : pick(breeds);   // breeds[0] is the Aspin / Puspin
  const seniorAt = species === "Cat" ? 10 : breed ? Math.floor(breed.life[0] * 0.75 * 2) / 2 : 7;
  const stage = hint.stage || (focus.has("senior") ? "senior" : r() < 0.18 ? "young" : r() < 0.7 ? "adult" : "senior");
  const months = stage === "young" ? int(2, 11) : stage === "adult" ? int(12, Math.max(13, Math.floor(seniorAt * 12) - 1)) : int(Math.ceil(seniorAt * 12), Math.ceil(seniorAt * 12) + 72);
  let weight = "";
  if (hint.weight || hint.weightLoss || chance(0.85)) {
    const [lo, hi] = breed ? breed.weight : species === "Cat" ? [3, 6] : [5, 25];
    const w = hint.weight === "above" ? hi * (1.08 + r() * 0.3) : r() < 0.7 ? lo + r() * (hi - lo) : r() < 0.5 ? hi * (1.08 + r() * 0.3) : lo * (0.65 + r() * 0.25);
    weight = Math.round((stage === "young" ? w * 0.5 : w) * 10) / 10;
  }
  const gender = hint.gender || pick(["Female", "Male"]);
  const illness = () => pick(ILLNESS[species].filter(([, t]) => !(gender === "Male" ? /^Spay/ : /^Neuter/).test(t)));
  const young = /^(Puppy|Kitten)/;
  const food = () => pick(FOODS[species].filter((f) => (stage === "young") === young.test(f) || (stage === "young" && r() < 0.3)));
  const lived = Math.max(1, months * 30 - 14);   // days: no record is older than the pet
  const med = (days, type, title) => ({ id: id(), date: addDays(-Math.min(days, lived)), type, title, vet: "", notes: "" });
  const medical = [];
  if (hint.allergy || focus.has("allergy") || chance(0.22)) medical.push(med(int(40, 700), "Allergy", pick(ALLERGIES)));
  if (focus.has("allergy") && chance(0.25)) medical.push(med(int(40, 700), "Allergy", pick(ALLERGIES)));
  if (typeof hint.meds === "string") medical.push(med(int(30, 400), "Medication", hint.meds));
  else if (hint.meds || focus.has("medication") || chance(0.22)) medical.push(med(int(5, 300), "Medication", pick(MEDS[species])));
  if (hint.newMed) medical.push(med(int(1, 28), "Medication", pick(MEDS[species])));   // started in the last 30 days
  if (hint.history) medical.push(med(int(40, 500), hint.history[0], hint.history[1]));
  if (focus.has("recovering") || chance(0.15)) { const [type, title] = illness(); medical.push(med(int(1, 30), type, title)); }
  if (chance(0.3)) { const [type, title] = illness(); medical.push(med(int(60, 700), type, title)); }
  const checkup = focus.has("checkup") ? r() : chance(0.75) ? r() : -1;   // -1: no checkup recorded
  if (checkup >= 0) {
    const every = stage === "senior" ? 182 : 365;
    medical.push(med(checkup < 0.25 ? int(every + 20, every * 2) : int(3, every - 5), "Checkup", pick(["Annual wellness exam", "Checkup", "Physical exam", "Wellness checkup"])));
  }
  const vaccinations = [];
  const vaxCount = focus.has("vaccine") ? int(1, VACCINES[species].length) : chance(0.85) ? int(1, VACCINES[species].length) : 0;
  for (const name of VACCINES[species].slice(0, vaxCount)) {
    const missing = hint.noVaccine === name;
    if (missing && chance(0.5)) continue;   // the rule's vaccine: not recorded, or (below) overdue
    if (!missing && chance(0.15)) continue;   // sometimes a core vaccine isn't recorded
    const s = missing ? 0.9 : r();
    const due = s < 0.6 ? int(31, 340) : s < 0.8 ? int(0, 30) : -int(1, 120);
    const given = Math.max(due - 365, -lived);   // not before the pet was born; the next date comes after it (a database rule)
    vaccinations.push({ id: id(), name, dateGiven: addDays(given), nextDue: addDays(Math.max(due, given + 21)), vet: "", lot: "" });
  }
  const feeding = [];
  if (focus.has("food") || chance(0.8)) {
    const allergy = medical.find((m) => m.type === "Allergy");
    const usual = allergy && focus.has("food") && chance(0.35) ? pick(FOODS[species].filter((f) => f.toLowerCase().includes(allergy.title.split(" ")[0].toLowerCase()))) || food() : food();
    const meals = stage === "young" ? int(2, 4) : int(1, 3);
    const times = ["07:00", "12:30", "18:30", "21:00"];
    for (let i = 0; i < meals; i++) feeding.push({ id: id(), time: times[i], food: i === 1 && chance(0.3) ? food() : usual, amount: "", days: [], notes: "" });
  }
  const care = [];
  if (hint.overdue) { const due = -int(3, 60); care.push({ id: id(), kind: "Deworming", title: hint.overdue, nextDue: addDays(due), repeatDays: 30, lastDone: addDays(due - 30), done: false, notes: "" }); }
  else if (chance(0.7)) { const due = r() < 0.75 ? int(1, 80) : -int(1, 45); care.push({ id: id(), kind: "Deworming", title: pick(DEWORM[species]), nextDue: addDays(due), repeatDays: 90, lastDone: addDays(due - 90), done: false, notes: "" }); }
  // Weight history: today's weight, and 1–4 earlier ones from the last year (growing for the young; for `weightLoss`,
  // 7–20% heavier at first and going down; otherwise within 3%).
  const weights = [];
  if (weight) {
    const lossFrom = 1.07 + r() * 0.13;
    const days = [...new Set(Array.from({ length: int(1, 4) }, () => int(20, Math.min(360, lived))))].filter((d) => d < lived).sort((a, b) => b - a);
    days.forEach((d, i) => {
      const kg = hint.weightLoss ? weight * (lossFrom - (lossFrom - 1) * (i / days.length))
        : stage === "young" ? weight * (0.45 + 0.5 * (1 - d / (months * 30))) : weight * (1 + (r() - 0.5) * 0.06);
      weights.push({ id: id(), date: addDays(-d), kg: Math.round(kg * 10) / 10 });
    });
    weights.push({ id: id(), date: todayISO(), kg: weight });
  }
  return {
    id: `sim-${seed}`, name: pick(NAMES[species]), species, breed: breed ? (chance(0.2) && breed.aka.length ? breed.aka[0] : breed.name) : "",
    ageYears: Math.floor(months / 12), ageMonths: months % 12, gender, weight,
    medical, vaccinations, feeding, care, weights, documents: [], fedLog: {},
  };
}

/* ---------------------------------------------------------------- training and evaluation split */
const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
/* 1 pet in 5 is kept for evaluation (never trained on), decided by its id. */
export const splitOf = (id) => (djb2(String(id)) % 5 === 0 ? "eval" : "train");
/* A UUID (v4 form) made from the seed, whose split is `split`. */
export function uuidFor(seed, split) {
  const r = random(seed * 7919 + 13);
  for (;;) {
    const hex = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
    hex[12] = "4"; hex[16] = "89ab"[Math.floor(r() * 4)];
    const id = `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
    if (splitOf(id) === split) return id;
  }
}

/* ---------------------------------------------------------------- the training cohort
   For every symptom rule, `perRule` pets it applies to (the first `evalPerRule` kept for evaluation; a rule for both
   species alternates them), plus `general` pets with any history (1 in 4 for evaluation). Each rule pet is checked:
   the rule must really apply to it. */
export const topicSpecies = (rule) => rule.species || TOPICS.find((t) => t.id === rule.topic).species || null;
export function trainingCohort({ perRule = 4, evalPerRule = 1, general = 40 } = {}) {
  const pets = [];
  RULES.forEach((rule, i) => {
    for (let k = 0; k < perRule; k++) {
      const species = topicSpecies(rule) || (k % 2 ? "Cat" : "Dog");
      const split = k < evalPerRule ? "eval" : "train";
      let seed = 100000 + i * 1000 + k * 37, pet;
      for (let tries = 0; ; tries++, seed++) {
        pet = makePet(species, seed, new Set(), rule.sim);
        if (rule.when(petContext(pet))) break;
        if (tries > 50) throw new Error(`no pet fits rule ${rule.id}`);
      }
      pets.push({ ...pet, id: uuidFor(seed, split), keepId: true, cohort: `rule ${rule.id}` });
    }
  });
  for (let k = 0; k < general; k++) {
    const seed = 900000 + k * 41;
    pets.push({ ...makePet(k % 2 ? "Cat" : "Dog", seed), id: uuidFor(seed, k % 4 === 0 ? "eval" : "train"), keepId: true, cohort: "general" });
  }
  return pets;
}

/* ---------------------------------------------------------------- dates */
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
/* The pet with every date moved by `days`. */
export function shiftPet(pet, days) {
  if (!days) return pet;
  const sh = (iso) => (iso ? shiftISO(iso, days) : iso);
  return {
    ...pet,
    medical: (pet.medical || []).map((m) => ({ ...m, date: sh(m.date) })),
    vaccinations: (pet.vaccinations || []).map((v) => ({ ...v, dateGiven: sh(v.dateGiven), nextDue: sh(v.nextDue) })),
    care: (pet.care || []).map((t) => ({ ...t, nextDue: sh(t.nextDue), lastDone: sh(t.lastDone) })),
    weights: (pet.weights || []).map((w) => ({ ...w, date: sh(w.date) })),
    fedLog: Object.fromEntries(Object.entries(pet.fedLog || {}).map(([d, ids]) => [sh(d), ids])),
  };
}
/* An exported pet ({ asOf, ...pet }) as it looked on its asOf day, moved to today. */
export const asOfToday = (pet, today = todayISO()) => shiftPet(pet, pet.asOf ? daysBetween(pet.asOf, today) : 0);
