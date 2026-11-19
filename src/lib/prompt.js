import { GUIDES } from "./emergency";
import { ageText, byDateDesc, todayISO, vaxStatus } from "./utils";
import { agoText, foodsOf, healthCheck, lastCheckup, mealsPerDay, missingVaccines, recentIllness, weightTrend } from "./health";
import { breedFor } from "./breeds";

const ILLNESS = ["Illness", "Injury", "Surgery"];
import PROMPT from "./aiPrompt.json";

/* What the FurFriends AI is sent: the conversation, the pet's details and the checked passages, built exactly
   like ai-server/prompting.py builds them in training. Kept apart from assistant.js (which talks to Supabase and
   the browser) so the evaluation script (scripts/eval-retrieval.mjs) builds the very same prompt in Node. */

export const HISTORY = 10;                    // earlier messages sent along as context
export const SOURCES = 2, SOURCE_WORDS = 160; // the same as ai-server/answer_rag.py

/* The conversation: no error notes, only the last few, only role and text. `history` picks what of it the
   model sees: "full" (everything, also the app's own earlier answers), "owner" (only the owner's messages) or
   "question" (only the latest question).
   The model sees the owner's messages only (MODEL_HISTORY). Played through the app on 28 labelled conversations
   (scripts/eval-conversation.mjs, real model), "full" let the app's own earlier answers leak into new ones as if
   they were facts (3 answers took 47-78% of their words from them) and the model declined more often: last
   answer right 75% and AI answers 36%, against 79% and 64% for "owner", with no leaks. The owner's own words
   ("tatlong araw na po") still give context, and the checked passages carry the facts. */
export const MODEL_HISTORY = "owner";
export function conversation(messages, history = "full") {
  const convo = messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));
  if (history === "question") return convo.filter((m) => m.role === "user").slice(-1);
  if (history === "owner") return convo.filter((m) => m.role === "user");
  return convo;
}

/* A short summary of the pet's records, so answers can be about this pet (the "pre-context" the model is
   trained with: ai-server/add_pet_profiles.py). Everything is worked out here, so ai-server/prompting.py only
   has to print it, the same way describePet() does. The health check (health.js) adds the pet's life stage,
   diet, last checkup, what it's recovering from and real concerns (flags). */
export function petContext(pet) {
  if (!pet) return null;
  const med = [...(pet.medical || [])].sort(byDateDesc);
  const titles = (types, n = 6) => med.filter((m) => types.includes(m.type)).slice(0, n).map((m) => m.title);
  const health = healthCheck(pet);
  const last = lastCheckup(pet);
  const foods = foodsOf(pet);
  const today = todayISO();
  const ago = (iso) => Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
  // The pet's medical history with when it happened (illnesses, injuries, surgery, medicines started, dental care),
  // newest first. `days` is for the symptom rules; the model reads `when`.
  const history = med.filter((m) => ILLNESS.includes(m.type) || m.type === "Medication" || (m.type === "Checkup" && /dental|teeth|tooth/i.test(m.title)))
    .filter((m) => m.date && m.date <= today).slice(0, 6).map((m) => ({ type: m.type, title: m.title, when: agoText(ago(m.date)), days: ago(m.date) }));
  const overdueCare = (pet.care || []).filter((t) => t.kind === "Deworming" && !t.done && t.nextDue && t.nextDue < today)
    .map((t) => ({ title: t.title, days: ago(t.nextDue) }));
  const breed = breedFor(pet), w = Number(pet.weight);
  const weightVsBreed = !breed || !w || health.stage?.key === "young" ? null : w > breed.weight[1] ? "above" : w < breed.weight[0] ? "below" : "within";
  return {
    name: pet.name, species: pet.species, breed: pet.breed || null, gender: pet.gender || null,
    age: ageText(pet) === "—" ? null : ageText(pet), weightKg: pet.weight ? Number(pet.weight) : null,
    lifeStage: health.stage ? health.stage.label.toLowerCase() : null,   // puppy, kitten, adult or senior
    allergies: titles(["Allergy"]), medications: titles(["Medication"]),
    recentConditions: titles(["Illness", "Injury", "Surgery"], 4),
    recovering: recentIllness(pet),
    vaccines: (pet.vaccinations || []).map((v) => ({ name: v.name, status: vaxStatus(v).label })),
    missingVaccines: missingVaccines(pet),
    diet: foods.length ? { foods: foods.slice(0, 3), mealsPerDay: Math.round(mealsPerDay(pet)) } : null,
    checkupDaysAgo: last ? ago(last) : null,
    health: { status: health.label, flags: health.flags },
    // For the notes on symptoms (symptomNotes.js); history is also printed, the rest is in the lines above.
    years: Number(pet.ageYears) || 0, history, overdueCare, weightVsBreed,
    weightTrend: weightTrend(pet),   // from the saved weights (weight_log), or null
  };
}

const clipWords = (text, n) => { const w = text.split(/\s+/).filter(Boolean); return w.length <= n ? text : w.slice(0, n).join(" ") + " …"; };
function sourceOf(e) {
  if (e.kind === "guide") {
    const g = GUIDES.find((x) => `guide-${x.slug}` === (e.of || e.id));
    // The same as guide_text() in ai-server/build_rag_data.py: the signs let the model tell which guide fits.
    const text = `${g.title}. ${g.summary}\nSigns: ${g.signs.join("; ")}${(g.lists || []).map((l) => `\n${l.title}: ${l.items.join("; ")}`).join("")}\nWhat to do now:\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      + (g.avoid?.length ? `\nDon't: ${g.avoid.join(" ")}` : "")
      + `\n${g.urgency === "now" ? "Go to a vet now." : "Call your vet for advice."}`;
    return { label: `FurFriends first-aid guide: ${g.title}`, text };
  }
  if (e.kind === "gov") return { label: e.src, text: `${e.q}\n${e.a}` };
  if (e.kind === "breed") return { label: `FurFriends breed guide: ${e.q.includes(" (") ? e.q.split(" (")[0] : "breeds and the heat"}`, text: e.a };
  return { label: /^Pets Stack Exchange/.test(e.src || "") ? "Pets Stack Exchange answer" : "FurFriends checked answer", text: `Q: ${clipWords(e.q, 40)}\nA: ${e.a}` };
}
/* The pet details as the model reads them. ai-server/prompting.py describe_pet() must print exactly the same
   (add_pet_profiles.py checks it for every training profile). Lines a context doesn't have are left out, so
   older contexts (saved with ratings) still print as before. */
export function describePet(c) {
  if (!c) return null;
  const facts = [c.species, c.breed, c.gender, c.age, c.weightKg ? `${c.weightKg} kg` : null, c.lifeStage].filter(Boolean);
  const lines = [`The owner is asking about ${c.name || "their pet"}: ${facts.join(", ")}.`];
  for (const [k, label] of [["allergies", "Allergies"], ["medications", "Medications"], ["recentConditions", "Recent illnesses or surgery"]]) {
    // A context with the history (with dates) prints that instead of the undated list.
    if (k === "recentConditions" && "history" in c) {
      if (c.history.length) lines.push(`Medical history: ${c.history.map((h) => `${h.title} (${h.when})`).join(", ")}.`);
      continue;
    }
    if (c[k]?.length) lines.push(`${label}: ${c[k].join(", ")}.`);
  }
  if (c.weightTrend) lines.push(`Weight trend: ${c.weightTrend.from} kg ${c.weightTrend.since}, ${c.weightTrend.to} kg now.`);
  if (c.vaccines?.length) lines.push(`Vaccines: ${c.vaccines.map((v) => `${v.name} (${v.status})`).join(", ")}.`);
  if (c.missingVaccines?.length) lines.push(`No record of: ${c.missingVaccines.join(", ")} vaccine.`);
  if (c.diet?.foods?.length) lines.push(`Diet: ${c.diet.foods.join(", ")}, ${c.diet.mealsPerDay} meal${c.diet.mealsPerDay === 1 ? "" : "s"} a day.`);
  if ("checkupDaysAgo" in c) lines.push(`Last checkup: ${c.checkupDaysAgo == null ? "none recorded" : `${c.checkupDaysAgo} days ago`}.`);
  if (c.health?.flags?.length) lines.push(`Health check: ${c.health.flags.join("; ")}.`);
  return lines.join(" ");
}
/* Pet details only a model trained with whole pet profiles (v6 on) is given; earlier models get the details they
   were trained with. The same as PROFILE_KEYS / knows_profiles() in ai-server/prompting.py: on 2026-11-11, given the
   extra lines, rag-v2 wrote things the records don't say. The server picks for its own model (api/ask.py). */
export const PROFILE_KEYS = ["lifeStage", "recovering", "missingVaccines", "diet", "checkupDaysAgo", "health", "years", "history", "overdueCare", "weightVsBreed", "weightTrend"];
export const basicPet = (c) => (c ? Object.fromEntries(Object.entries(c).filter(([k]) => !PROFILE_KEYS.includes(k))) : c);
export const knowsProfiles = (model) => { const m = /rag-v(\d+)/.exec(model || ""); return !!m && Number(m[1]) >= 6; };

// First-aid guides are short and checked: never cut, so all the steps are always there.
export const sourcesFor = (results) => results.map((e) => { const s = sourceOf(e); return e.kind === "guide" ? s : { ...s, text: clipWords(s.text, SOURCE_WORDS) }; });
export function chatMessages(messages, pet, results, history = MODEL_HISTORY, fullPet = true) {
  let system = PROMPT.system;
  const ctx = petContext(pet);
  const about = describePet(fullPet ? ctx : basicPet(ctx));
  if (about) system += `\n\n${about}`;
  if (results.length) {
    const sources = sourcesFor(results);
    system += `\n\n${PROMPT.sourcesIntro}\n${sources.map((s, i) => `[${i + 1}] ${s.label}\n${s.text}`).join("\n\n")}`;
  }
  return [{ role: "system", content: system }, ...conversation(messages, history)];
}
