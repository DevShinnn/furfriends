import { breedFor } from "./breeds";
import { APPT, shiftISO } from "./care";
import { byDateDesc, fmtDate, todayISO, vaxStatus } from "./utils";

/* The pet health check: what FurFriends can tell from one pet's own records (vaccinations, medical history, diet
   and profile), shown as the health indicator on the pet's page and card, and sent to the AI with the pet's details
   (prompt.js), so its answers can be about this pet.

   It checks the records, not the pet: FurFriends only knows what the owner recorded, and this is not a vet exam.
   The UI says so. Each rule comes from a source already in FurFriends' checked library (shown as `why`), except
   the yearly checkup for adult pets, which follows the AAHA canine and AAHA/AAFP feline life-stage guidelines. */

export const RECENT_DAYS = 30;                     // an illness, injury or surgery this recent: still recovering
const CHECKUP_DAYS = { adult: 365, senior: 182 };  // seniors every 6 months (2023 AAHA Senior Care Guidelines)
const PARASITE_DAYS = { young: 30, adult: 92 };    // CAPC: monthly for the young, about 4 times a year for adults
const SOON = 30;                                   // a vaccine due within a month is "due soon", as in utils.vaxStatus

const DAY = 86400000;
const daysSince = (iso, today) => Math.round((new Date(today + "T00:00:00") - new Date(iso + "T00:00:00")) / DAY);
export const monthsOld = (pet) => (Number(pet?.ageYears) || 0) * 12 + (Number(pet?.ageMonths) || 0);

/* "today", "3 days ago", "2 months ago", "1 year ago". */
export function agoText(days) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  if (days < 548) { const m = Math.round(days / 30.44); return `${m} month${m === 1 ? "" : "s"} ago`; }
  const y = Math.round(days / 365.25);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}
const inText = (days) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

/* ---------------------------------------------------------------- life stage
   Cats: senior from 10 years (AAHA/AAFP feline life-stage guidelines, as in the checked answer "My cat is 11...").
   Dogs: senior in the last quarter of the breed's expected lifespan, so from 3/4 of the breed guide's shortest
   lifespan; about 7 years when the breed isn't known ("At what age is my dog considered a senior?"). */
export function seniorFrom(pet) {
  if (pet.species === "Cat") return 10;
  const life = breedFor(pet)?.life;
  return life ? Math.floor(life[0] * 0.75 * 2) / 2 : 7;
}
export function lifeStage(pet) {
  const months = monthsOld(pet);
  if (!months) return null;
  if (months < 12) return { key: "young", label: pet.species === "Cat" ? "Kitten" : "Puppy", months };
  const from = seniorFrom(pet);
  return months >= from * 12 ? { key: "senior", label: "Senior", months, from } : { key: "adult", label: "Adult", months, from };
}

/* ---------------------------------------------------------------- food allergies
   An allergy record's title names what the pet reacts to ("Chicken protein sensitivity"); a food's name says what's
   in it. Only the title counts, not the notes ("Switched to salmon-based diet" is what the pet eats now). */
const ALLERGENS = [
  ["chicken", /chicken|poultry/i, /\b(chicken|poultry)\b/i],
  ["beef", /beef|bovine/i, /\bbeef\b/i],
  ["pork", /pork/i, /\bpork\b/i],
  ["lamb", /lamb|mutton/i, /\b(lamb|mutton)\b/i],
  ["fish", /fish|salmon|tuna|seafood/i, /\b(fish|salmon|tuna|sardines?|whitefish|seafood|mackerel|cod)\b/i],
  ["egg", /\beggs?\b/i, /\beggs?\b/i],
  ["dairy", /dairy|milk|lactose|cheese/i, /\b(milk|dairy|cheese|yogh?urt)\b/i],
  ["wheat", /wheat|gluten/i, /\b(wheat|gluten)\b/i],
  ["grain", /grains?\b|cereal/i, /\b(grains?|wheat|corn|barley|oats?)\b/i],
  ["corn", /corn|maize/i, /\b(corn|maize)\b/i],
  ["soy", /\bsoy/i, /\bsoy\w*/i],
];
// "Grain-free chicken (dry)" has no grain: drop "x-free", "no x" and "without x" before looking.
const withoutFree = (food) => food.replace(/\b[\w&]+[- ]free\b/gi, " ").replace(/\b(no|without|zero)\s+\w+/gi, " ");
export const allergensIn = (titles) => ALLERGENS.filter(([, inTitle]) => titles.some((t) => inTitle.test(t)));
/* Foods that may contain something in an allergy record: [{ food, allergen }]. */
export function foodConflicts(allergyTitles, foods) {
  const out = [];
  for (const [name, , inFood] of allergensIn(allergyTitles || [])) {
    for (const food of foods || []) if (inFood.test(withoutFree(food))) out.push({ food, allergen: name });
  }
  return out;
}

/* ---------------------------------------------------------------- the checks
   Each: { key, label, icon, status, detail, why, notes?, action?, flag? }
   status: "ok" | "warn" (worth a look soon) | "danger" (act on it) | "unknown" (not recorded) | "info" (not counted)
   flag: a short phrase for the AI's pet details, only for real concerns (vaccine statuses are listed there anyway). */

const CORE = {
  Dog: [["DHPP", /dhl?pp|da2l?pp|dapp|\b[5-8]\s*-?\s*in\s*-?\s*1\b|distemper|parvo/i, 2], ["Rabies", /rabies/i, 3]],
  Cat: [["FVRCP", /fvrcp|fvrc|\b[34]\s*-?\s*in\s*-?\s*1\b|panleu|feline distemper|tricat/i, 2], ["Rabies", /rabies/i, 3]],
};
const coreOf = (pet) => CORE[pet.species] || CORE.Dog;
const latest = (vax, re) => vax.filter((v) => re.test(v.name)).sort((a, b) => (b.dateGiven || "").localeCompare(a.dateGiven || ""))[0];

/* Core vaccines the records don't show, for a pet old enough to have had them: ["Rabies"]. */
export function missingVaccines(pet) {
  const months = monthsOld(pet);
  return coreOf(pet).filter(([, re, from]) => !latest(pet.vaccinations || [], re) && !(months && months < from)).map(([n]) => n);
}

function vaccineCheck(pet, today) {
  const vax = pet.vaccinations || [];
  const issues = [];   // [rank, text]; rank 0 overdue, 1 missing, 2 old rabies, 3 due soon
  let worst = "ok", flag = null;
  const bump = (s) => { if (s === "danger" || (s === "warn" && worst === "ok")) worst = s; };
  for (const v of vax) {
    const s = vaxStatus(v);
    if (s.key === "danger") { issues.push([0, `${v.name} overdue by ${-s.days} day${s.days === -1 ? "" : "s"}`]); bump("danger"); }
    else if (s.key === "warn") { issues.push([3, `${v.name} due ${inText(s.days)}`]); bump("warn"); }
  }
  const missing = missingVaccines(pet);
  for (const n of missing) { issues.push([1, `no ${n} vaccine recorded`]); bump("warn"); }
  // Rabies every year by law (RA 9482): a rabies shot over a year old with no next date set.
  const rabies = latest(vax, /rabies/i);
  if (rabies && !rabies.nextDue && rabies.dateGiven && daysSince(rabies.dateGiven, today) > 365) {
    issues.push([2, `Rabies last given ${agoText(daysSince(rabies.dateGiven, today))}`]); bump("warn");
    flag = "rabies shot over a year old";
  }
  // (Missing core vaccines go to the AI as their own line, missingVaccines in prompt.js, not as a flag.)
  const core = coreOf(pet).map(([n]) => n);
  const young = monthsOld(pet) && monthsOld(pet) < 2 && !vax.length;
  const detail = issues.length ? cap(issues.sort((a, b) => a[0] - b[0]).slice(0, 2).map((x) => x[1]).join("; "))
    : young ? "First shots usually start at 6 to 8 weeks old" : `${core.join(" and ")} up to date`;
  return {
    key: "vaccines", label: "Vaccines", icon: "syringe", status: young ? "info" : worst, detail, flag,
    why: `Core vaccines for ${pet.species === "Cat" ? "cats are FVRCP and rabies" : "dogs are distemper-parvo (DHPP) and rabies"} (WSAVA 2024 guidelines). Rabies vaccination is required in the Philippines (RA 9482).`,
    action: { tab: "vaccines", label: "Open vaccinations" },
  };
}

const CHECKUP = /check-?up|wellness|annual|physical|\bexams?\b/i;
export function lastCheckup(pet, today = todayISO()) {
  const dates = [
    ...(pet.medical || []).filter((m) => m.type === "Checkup" && m.date && m.date <= today).map((m) => m.date),
    ...(pet.care || []).filter((t) => t.kind === APPT && t.done && CHECKUP.test(t.title || "")).map((t) => t.lastDone || t.nextDue),
  ].filter((d) => d && d <= today).sort();
  return dates.at(-1) || null;
}
const bookedCheckup = (pet, today) => (pet.care || [])
  .filter((t) => t.kind === APPT && !t.done && t.nextDue >= today && CHECKUP.test(t.title || "")).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];

function checkupCheck(pet, today, stage) {
  const senior = stage?.key === "senior";
  const every = senior ? CHECKUP_DAYS.senior : CHECKUP_DAYS.adult;
  const last = lastCheckup(pet, today);
  const booked = bookedCheckup(pet, today);
  const base = {
    key: "checkup", label: "Vet checkup", icon: "stetho",
    why: "Adult pets: a checkup at least once a year (AAHA and AAFP life-stage guidelines). Seniors: every 6 months (2023 AAHA Senior Care Guidelines).",
    action: booked ? { tab: "care", label: "Open feeding & care" } : { appointment: true, label: "Book a checkup" },
  };
  if (!last) return { ...base, status: booked ? "ok" : "unknown", detail: booked ? `Checkup booked for ${fmtDate(booked.nextDue)}` : "No checkup recorded" };
  const ago = daysSince(last, today);
  if (ago > every) {
    if (booked) return { ...base, status: "ok", detail: `Due, and booked for ${fmtDate(booked.nextDue)}` };
    return { ...base, status: "warn", detail: `Last checkup ${agoText(ago)}${senior ? " (seniors: every 6 months)" : ""}`, flag: `checkup overdue (last one ${agoText(ago)})` };
  }
  return { ...base, status: "ok", detail: `Last checkup ${agoText(ago)}` };
}

const ILL = ["Illness", "Injury", "Surgery"];
export function recentIllness(pet, today = todayISO()) {
  return [...(pet.medical || [])].filter((m) => ILL.includes(m.type) && m.date && m.date <= today && daysSince(m.date, today) <= RECENT_DAYS)
    .sort(byDateDesc).map((m) => ({ title: m.title, daysAgo: daysSince(m.date, today) }));
}
function illnessCheck(pet, today) {
  const med = [...(pet.medical || [])].sort(byDateDesc);
  const recent = recentIllness(pet, today);
  const notes = [
    ...med.filter((m) => m.type === "Allergy").map((m) => `Allergy: ${m.title}`),
    ...med.filter((m) => m.type === "Medication").slice(0, 3).map((m) => `Medication: ${m.title}`),
  ];
  const base = {
    key: "illness", label: "Recent illness", icon: "clip", notes,
    why: `An illness, injury or surgery in the last ${RECENT_DAYS} days. Follow your vet's after-care plan and go back for any re-check they asked for.`,
    action: { tab: "medical", label: "Open medical history" },
  };
  if (recent.length) {
    const r = recent[0];
    const recheck = (pet.care || []).find((t) => t.kind === APPT && !t.done && t.nextDue >= today);
    return { ...base, status: "warn", detail: `Recovering from ${lower(r.title)} (${agoText(r.daysAgo)})${recheck ? `; vet visit booked ${fmtDate(recheck.nextDue)}` : ""}`,
      flag: recent.map((x) => `recovering from ${lower(x.title)} (${agoText(x.daysAgo)})`).join("; ") };
  }
  const prev = med.find((m) => ILL.includes(m.type) && m.date <= today);
  return { ...base, status: "ok", detail: prev ? `None in the last ${RECENT_DAYS} days (last: ${lower(prev.title)}, ${agoText(daysSince(prev.date, today))})` : "No illness or injury recorded" };
}

const PARASITE = /deworm|worm|drontal|milbemax|broadline|heartworm|flea|tick|bravecto|nexgard|simparica|revolution|frontline|parasite/i;
function parasiteCheck(pet, today, stage) {
  const tasks = (pet.care || []).filter((t) => t.kind === "Deworming");
  const open = tasks.filter((t) => !t.done && t.nextDue).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const base = {
    key: "parasites", label: "Deworming", icon: "pill",
    why: "Adults: year-round parasite prevention, or deworming about 4 times a year (CAPC guidelines). Puppies and kittens need it more often.",
    action: { tab: "care", label: "Open feeding & care" },
  };
  if (open.length) {
    const t = open[0], d = -daysSince(t.nextDue, today);
    if (d < 0) return { ...base, status: "warn", detail: `${t.title} overdue by ${-d} day${d === -1 ? "" : "s"}`, flag: `deworming overdue (${lower(t.title)})` };
    return { ...base, status: "ok", detail: `Next: ${t.title} ${inText(d)}` };
  }
  const done = [
    ...tasks.filter((t) => t.lastDone).map((t) => ({ date: t.lastDone, title: t.title })),
    ...(pet.medical || []).filter((m) => PARASITE.test(`${m.title} ${m.notes || ""}`)).map((m) => ({ date: m.date, title: m.title })),
  ].filter((x) => x.date && x.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!done) return { ...base, status: "unknown", detail: "No deworming schedule" };
  const ago = daysSince(done.date, today), every = stage?.key === "young" ? PARASITE_DAYS.young : PARASITE_DAYS.adult;
  return ago > every
    ? { ...base, status: "warn", detail: `Last: ${lower(done.title)}, ${agoText(ago)}`, flag: `last deworming ${agoText(ago)}` }
    : { ...base, status: "ok", detail: `Last: ${lower(done.title)}, ${agoText(ago)}` };
}

/* How the weight changed over the last 12 months, from the saved weights (weight_log): { from, to, since, change, pct },
   or null with fewer than 2. */
export function weightTrend(pet, today = todayISO()) {
  const w = (pet.weights || []).filter((x) => x.date <= today && daysSince(x.date, today) <= 365).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 2) return null;
  const first = w[0], last = w.at(-1);
  const change = Math.round((last.kg - first.kg) * 10) / 10;
  return { from: first.kg, to: last.kg, since: agoText(daysSince(first.date, today)), change, pct: Math.round((100 * (last.kg - first.kg)) / first.kg) };
}
const trendText = (t) => (t && t.change ? `; ${t.change < 0 ? "down" : "up"} ${Math.abs(t.change)} kg (${Math.abs(t.pct)}%) since ${t.since}` : "");

function weightCheck(pet, stage, today) {
  const breed = breedFor(pet);
  const base = {
    key: "weight", label: "Weight", icon: "heart",
    why: "The typical adult range for the breed, from FurFriends' breed guide. Body shape matters as much as the number: you should be able to feel the ribs easily, with a visible waist.",
    action: breed ? { breed: breed.slug, label: `${breed.name} guide` } : { edit: true, label: "Edit profile" },
  };
  const w = Number(pet.weight);
  const trend = trendText(weightTrend(pet, today));
  if (stage?.key === "young") return { ...base, status: "info", detail: `Still growing, so adult breed ranges don't apply yet${trend}` };
  if (!w) return { ...base, status: "unknown", detail: "No weight recorded", action: { edit: true, label: "Add weight" } };
  if (!breed) return { ...base, status: "info", detail: `${w} kg (no breed range to compare with)${trend}` };
  const [lo, hi] = breed.weight;
  if (w > hi) return { ...base, status: "warn", detail: `${w} kg, above the typical ${lo}–${hi} kg${trend}`, flag: `weight above the typical ${lo}–${hi} kg for the breed` };
  if (w < lo) return { ...base, status: "warn", detail: `${w} kg, below the typical ${lo}–${hi} kg${trend}`, flag: `weight below the typical ${lo}–${hi} kg for the breed` };
  return { ...base, status: "ok", detail: `${w} kg, within the typical ${lo}–${hi} kg${trend}` };
}

/* Meals on an ordinary day (a meal on 3 days of the week counts as 3/7). */
export const mealsPerDay = (pet) => (pet.feeding || []).reduce((n, f) => n + (f.days?.length ? f.days.length : 7), 0) / 7;
export const foodsOf = (pet) => [...new Set((pet.feeding || []).map((f) => (f.food || "").trim()).filter(Boolean))];
const allergyTitles = (pet) => (pet.medical || []).filter((m) => m.type === "Allergy").map((m) => m.title);

function dietCheck(pet, today, stage) {
  const foods = foodsOf(pet);
  const base = {
    key: "diet", label: "Diet", icon: "bowl",
    why: "Food names are compared with the allergy records. Puppies: 4 meals a day until 3 months old, then 3 until 6 months (Merck Veterinary Manual).",
    action: { tab: "care", label: "Open feeding & care" },
  };
  if (!(pet.feeding || []).length) return { ...base, status: "unknown", detail: "No feeding schedule" };
  const meals = mealsPerDay(pet), n = Math.round(meals);
  const per = `${n} meal${n === 1 ? "" : "s"} a day`;
  const notes = [];
  const days = [1, 2, 3, 4, 5, 6, 7].map((i) => shiftISO(today, -i));
  if (days.some((d) => pet.fedLog?.[d]?.length)) {
    const ticked = days.reduce((s, d) => s + (pet.fedLog?.[d]?.length || 0), 0);
    notes.push(`Meals ticked as fed in the last 7 days: ${ticked} of about ${Math.round(meals * 7)}`);
  }
  const conflict = foodConflicts(allergyTitles(pet), foods)[0];
  if (conflict) {
    return { ...base, status: "danger", notes, detail: `${conflict.food} may contain ${conflict.allergen}, which is in the allergy records`,
      flag: `current food (${conflict.food}) may contain ${conflict.allergen}, which is in the allergy records` };
  }
  const months = monthsOld(pet);
  if (pet.species === "Dog" && months && months < 6) {
    const need = months < 3 ? 4 : 3;
    if (meals < need - 0.5) return { ...base, status: "warn", notes, detail: `${per}; puppies this age usually get ${need}`, flag: `${per}, fewer than the usual ${need} for a puppy this age` };
  }
  const avoids = allergensIn(allergyTitles(pet)).map(([a]) => a);
  return { ...base, status: "ok", notes, detail: `${per}: ${foods.slice(0, 2).join(", ")}${foods.length > 2 ? "…" : ""}${avoids.length ? ` (avoids ${avoids.join(", ")})` : ""}` };
}

/* ---------------------------------------------------------------- the indicator */
const ORDER = { danger: 0, warn: 1, unknown: 2, ok: 3, info: 4 };
const LABEL = { danger: "Needs attention", warn: "Check soon", unknown: "Add records", ok: "On track" };
export const STATUS_TEXT = { danger: "Act now", warn: "Check soon", unknown: "Not recorded", ok: "On track", info: "For info" };

/* The health check for one pet: { status, key (a pill class), label, onTrack, total, score 0–100, stage, checks, flags, top }. */
export function healthCheck(pet, today = todayISO()) {
  const stage = lifeStage(pet);
  const checks = [vaccineCheck(pet, today), checkupCheck(pet, today, stage), illnessCheck(pet, today), parasiteCheck(pet, today, stage),
    weightCheck(pet, stage, today), dietCheck(pet, today, stage)];
  const counted = checks.filter((c) => c.status !== "info");
  const onTrack = counted.filter((c) => c.status === "ok").length;
  const status = ["danger", "warn", "unknown"].find((s) => counted.some((c) => c.status === s)) || "ok";
  const sorted = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return {
    status, key: status === "unknown" ? "neutral" : status, label: LABEL[status],
    onTrack, total: counted.length, score: counted.length ? Math.round((100 * onTrack) / counted.length) : 0,
    stage, checks: sorted, flags: checks.map((c) => c.flag).filter(Boolean),
    top: sorted.find((c) => c.status === "danger" || c.status === "warn") || null,
  };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// "Paw pad laceration" → "paw pad laceration", but keep names and abbreviations ("FeLV test", "Drontal Plus").
function lower(s) { return /^[A-Z][a-z]/.test(s || "") && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s || ""; }
