import { urgentGuides } from "./emergency";
import { SYMPTOM, queryText, withEnglish } from "./knowledge";
import { agoText, allergensIn, foodConflicts } from "./health";
import { symptomNotes } from "./symptomNotes";

/* Notes from the selected pet's own records, added under an answer when they're about the question:
   "From Bori's records:
    - Bori has an allergy record: Chicken protein sensitivity. Check food and treat labels for it, ..."

   The rule works only on the pet details the AI is sent (petContext in prompt.js), so the app, the training data
   (ai-server/add_pet_profiles.py, through scripts/pet-profiles.mjs) and the evaluation all add exactly the same
   notes. The model is trained to write them; the app still replaces whatever notes it wrote with the rule's own
   (withPetNotes), so an owner never sees a wrong fact about their pet. When a first-aid guide comes up, only the
   notes on what the pet's history means for that symptom are added (symptomNotes.js), nothing else. Every note repeats a fact from the records and gives only advice the checked library also
   gives (check with the vet, follow after-care); no dose, no diagnosis. */

const TOPICS = {
  vaccine: /\b(vaccin\w*|shots?|boosters?|rabies|dhl?pp|fvrcp|felv|lepto\w*|bakuna|anti-?rabies|[3-8]-in-1)\b/i,
  food: /\b(foods?|feed\w*|eat|eats|eating|diet|treats?|kibble|meals?|snacks?|fruits?|vegetables?|pagkain|kain|kumain|ipakain|pakain)\b/i,
  medicine: /\b(medicines?|medications?|meds|pills?|tablets?|drugs?|supplements?|vitamins?|deworm\w*|antibiotics?|paracetamol|ibuprofen|aspirin|painkillers?|fleas?|ticks?|gamot)\b/i,
  skin: /\b(itch\w*|scratch\w*|rash\w*|skin|allerg\w*|hair loss|kati|kamot)\b/i,
  activity: /\b(bath\w*|walk\w*|exercis\w*|swim\w*|play\w*|groom\w*|run|running|ligo|paligo)\b/i,
  checkup: /\b(check-?ups?|wellness|vet visits?|annual exam|see (a|the) vet|how often\b.*\bvet)\b/i,
};

/* What a question is about, as far as the pet's records go: ["food", "symptom", ...]. */
export function noteTopics(question) {
  const q = `${question}\n${withEnglish(question)}`;
  const t = Object.keys(TOPICS).filter((k) => TOPICS[k].test(q));
  if (SYMPTOM.test(q)) t.push("symptom");
  return t;
}

/* The text the notes are chosen by: the owner's last message and the search text of the conversation, so a
   follow-up ("tatlong araw na po") keeps the earlier topic. The app and the training data both use this. */
export function noteQuery(messages) {
  const owner = messages.filter((m) => m.role === "user" && !m.error);
  return `${owner.at(-1)?.content || ""}\n${queryText(messages)}`;
}

const spell = (status) => {
  const s = String(status || "");
  let m;
  if ((m = s.match(/^Overdue (\d+)d$/))) return `overdue by ${m[1]} day${m[1] === "1" ? "" : "s"}`;
  if ((m = s.match(/^Due in (\d+)d$/))) return `due in ${m[1]} day${m[1] === "1" ? "" : "s"}`;
  if (s === "No booster") return "with no booster date";
  return s.toLowerCase();
};
const lower = (s) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/* The notes for this question and pet: [{ topic, text }], at most 3, most important first. What the pet's history
   means for a symptom comes first (symptomNotes.js: only rules two teammates approved, unless options.unreviewed). */
export function petNotes(question, ctx, options = {}) {
  if (!ctx?.name || !question?.trim()) return [];
  const t = new Set(noteTopics(question));
  const n = ctx.name;
  const out = symptomNotes(question, ctx, options);
  // When a first-aid guide comes up, only what the history means for the symptom (a puppy with diarrhea: go now).
  if (urgentGuides(question).length) return out.slice(0, 3).map(({ covers, ...x }) => x);
  const covered = new Set(out.flatMap((x) => x.covers));
  const vaccines = ctx.vaccines || [], missing = ctx.missingVaccines || [];

  if (t.has("vaccine") && (vaccines.length || missing.length)) {
    const miss = missing.length ? ` There's no record of a ${list(missing)} vaccine yet.` : "";
    out.push({ topic: "vaccine", text: vaccines.length
      ? `${n}'s vaccines: ${vaccines.slice(0, 4).map((v) => `${v.name} ${spell(v.status)}`).join(", ")}.${miss}`
      : `No vaccines are recorded for ${n} yet.` });
  }
  if ((t.has("food") || t.has("medicine") || t.has("skin")) && ctx.allergies?.length && !covered.has("allergy")) {
    const all = ctx.allergies.join(", ");
    // For food, only allergies to something a food can contain ("Chicken protein sensitivity", not "Flea allergy").
    const food = ctx.allergies.filter((a) => allergensIn([a]).length);
    const c = t.has("food") ? foodConflicts(ctx.allergies, ctx.diet?.foods)[0] : null;
    const text = c ? `${n}'s current food (${c.food}) may contain ${c.allergen}, which is in ${n}'s allergy records (${all}). Ask your vet whether to change it.`
      : t.has("food") && food.length ? `${n} has an allergy record: ${food.join(", ")}. Check food and treat labels for it, and ask your vet before trying a new food.`
        : t.has("medicine") ? `${n} has an allergy record: ${all}. Tell your vet about it before giving any new medicine.`
          : t.has("skin") ? `${n} has an allergy record: ${all}. Mention it to your vet when you ask about this.` : null;
    if (text) out.push({ topic: "allergy", text });
  }
  if (t.has("medicine") && ctx.medications?.length && !covered.has("medication")) {
    const meds = ctx.medications.slice(0, 3);
    out.push({ topic: "medication", text: `${n}'s records list ${list(meds)}. Tell your vet about ${meds.length > 1 ? "these" : "it"} before giving any other medicine or supplement.` });
  }
  if ((t.has("symptom") || t.has("activity")) && ctx.recovering?.length) {
    const r = ctx.recovering[0];
    out.push({ topic: "recovering", text: `${n}'s records show ${lower(r.title)} ${agoText(r.daysAgo)}. Mention it to your vet, and follow their after-care advice.` });
  }
  if (t.has("checkup") && "checkupDaysAgo" in ctx) {
    const when = ctx.checkupDaysAgo == null ? `No checkup is recorded for ${n} yet.` : `${n}'s last recorded checkup was ${agoText(ctx.checkupDaysAgo)}.`;
    const every = ctx.lifeStage === "senior" ? ` As a senior, ${n} should see the vet every 6 months.`
      : ctx.lifeStage === "adult" ? " Adult pets should have a checkup at least once a year." : "";
    out.push({ topic: "checkup", text: when + every });
  }
  if ((t.has("food") || t.has("activity")) && ctx.lifeStage === "senior") {
    out.push({ topic: "senior", text: `${n} is a senior. Older pets often need changes in food and exercise, so ask your vet about it at the next checkup.` });
  }
  return out.slice(0, 3).map(({ covers, ...x }) => x);
}

export const NOTES_HEAD = (name) => `From ${name}'s records:`;
/* The notes as they appear under an answer, or "". */
export function petNoteText(question, ctx, options) {
  const notes = petNotes(question, ctx, options);
  return notes.length ? `${NOTES_HEAD(ctx.name)}\n${notes.map((x) => `- ${x.text}`).join("\n")}` : "";
}
/* The answer without any notes the model wrote (they start with "From <name>'s records:", also with a curly
   apostrophe, or with the first note on the same line). */
export const stripPetNotes = (answer) => answer.replace(/\s*\n\s*From [^\n]{1,60}['’ʼ]s records:[\s\S]*$/, "").trimEnd();
/* The answer with the rule's notes at the end, in place of any the model wrote. */
export function withPetNotes(question, answer, ctx, options) {
  const core = stripPetNotes(answer);
  const notes = petNoteText(question, ctx, options);
  return notes ? `${core}\n\n${notes}` : core;
}
