/* The selected pet in the assistant: its name in the search, and questions about its own records.

   petAsSpecies   "How do I keep Mochi cool?" is searched as "How do I keep my cat cool?": the library knows cats,
                  not Mochi, and the name alone pushed the right checked answer below the evidence limit
                  (0.61 against 1.01 with "my cat", 2026-11-20 on the preview). The model still gets the owner's words.
   recordsReply   "What is Mochi's condition?", "Is Bori allergic to anything?", "Is Mochi up to date on vaccines?" are
                  about the pet's records, which the library can't answer: they get the pet's health check
                  (health.js), word for word, with no model and no diagnosis. Symptoms still go to the library.
   matchPronouns  "he"/"she" in an answer, switched to the pet's sex (the sources use either for any pet). */
import { STATUS_TEXT, healthCheck } from "./health";
import { SYMPTOM, withEnglish } from "./knowledge";
import { petContext } from "./prompt";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SPECIES = /\b(dogs?|pupp(y|ies)|cats?|kittens?|kitty|aso|tuta|pusa|kuting)\b/i;

/* The owner's message with the pet's name (the first time it comes) as "my cat" / "my dog", for the search only. */
export function petAsSpecies(text, pet) {
  const name = (pet?.name || "").trim();
  if (name.length < 2 || !text) return text;
  const re = new RegExp(`\\b(?:si\\s+)?${esc(name)}(?![\\w-])(['’]s)?`, "gi");
  const hits = text.match(re) || [];
  // A pet named after a food ("Peanut", "Ginger"): said once in a question that already says "my dog", it's the food.
  if (!hits.length || (hits.length === 1 && SPECIES.test(text))) return text;
  const kind = pet.species === "Cat" ? "my cat" : pet.species === "Dog" ? "my dog" : "my pet";
  let first = true;
  return text.replace(re, (m, own) => {
    if (!first) return m;
    first = false;
    return own ? `${kind}'s` : kind;
  });
}

/* What a question asks about the selected pet's own records: "overall", "vaccines", "checkup", "parasites",
   "weight", "diet", "age", "allergies", "medicines", or null when it isn't about its records. */
export function recordsTopic(text, pet) {
  const name = (pet?.name || "").trim();
  if (!name || !text || SYMPTOM.test(withEnglish(text))) return null;
  const t = text.replace(/[’ʼ]/g, "'");
  const me = `(?:${esc(name)}|he|she|him|her|his|siya|niya|my (?:pet|cat|dog|kitten|puppy))`;
  if (!new RegExp(`\\b${me}\\b`, "i").test(t)) return null;
  const not = "(?!\\s+(?:if|when|to|for|after|with|eating)\\b)";   // "is my dog okay to eat mango?" is about mango
  const own = `${me}(?:'s)?`;
  const topics = [
    ["allergies", `\\b(?:what is ${me} allergic to|is ${me} allergic to (?:anything|something)|${own} allergies|does ${me} have (?:any )?allergies)\\b`],
    ["vaccines", `\\b(?:is ${me} (?:up to date|updated|due|overdue)|${own} (?:vaccines?|shots?|vaccinations?|bakuna)\\b.*\\b(?:up to date|overdue|status|due|next|last)|when (?:is|was) ${own} (?:next|last) (?:vaccines?|shots?|vaccinations?)|what (?:vaccines?|shots?) (?:has|did) ${me} (?:had|have|get|got))\\b`],
    ["checkup", `\\b(?:when (?:is|was) ${own} (?:next|last) (?:vet visit|visit to the vet|checkup|check-up|vet appointment)|when did ${me} (?:last )?(?:see|visit|go to) the vet|last time ${me} (?:saw|visited|went to) the vet)\\b`],
    ["parasites", `\\b(?:when (?:is|was) ${own} (?:next|last) (?:deworming|dewormer|flea|tick|heartworm)|is ${me} due for (?:deworming|a dewormer|flea|tick|heartworm))\\b`],
    ["weight", `\\b(?:how (?:much|heavy) (?:does|is) ${me}(?: weigh)?|${own} (?:current )?weight)\\b`],
    ["diet", `\\b(?:what (?:does|do I feed|food does) ${me} (?:eat|get|have)|what do I feed ${me}|${own} (?:diet|food|meals|feeding (?:schedule|plan)))\\b`],
    ["age", `\\bhow old is ${me}\\b|\\b${own} age\\b`],
    ["medicines", `\\b(?:what (?:medicines?|medications?|meds) (?:is|does) ${me}|${own} (?:medicines?|medications?|meds))\\b`],
    ["overall", "\\b(?:condition|kalagayan|lagay|kalusugan|health (?:status|check|records?)|medical (?:records?|history)|records)\\b"],
    ["overall", `\\bhow(?:'s| is) ${me}(?: doing| now| lately| today)?\\s*[?.!]*$`],
    ["overall", `\\bis ${me} (?:healthy|okay|ok|fine|well|alright|in good (?:health|shape))\\b${not}`],
    ["overall", "\\b(?:kumusta|kamusta)\\b"],
  ];
  return topics.find(([, re]) => new RegExp(re, "i").test(t))?.[0] || null;
}
export const isRecordsQuestion = (text, pet) => recordsTopic(text, pet) !== null;

/* The pet's health check as a reply, the part asked about first, or null when the question isn't about its records. */
export function recordsReply(text, pet, today) {
  const topic = recordsTopic(text, pet);
  if (!topic) return null;
  const h = healthCheck(pet, today), ctx = petContext(pet), name = pet.name;
  const line = (c) => `- ${c.label}${c.status === "danger" || c.status === "warn" ? ` (${STATUS_TEXT[c.status].toLowerCase()})` : ""}: ${c.detail}`;
  const asked = h.checks.find((c) => c.key === topic && c.detail);
  const lines = h.checks.filter((c) => c.detail && c !== asked).map(line);
  const facts = {
    allergies: ctx.allergies?.length ? `Allergies on record: ${ctx.allergies.join(", ")}.` : `${name} has no allergy on record.`,
    medicines: ctx.medications?.length ? `Medicines on record: ${ctx.medications.join(", ")}.` : `${name} has no medicine on record.`,
    age: `${name} is ${ageText(pet)} old${h.stage ? ` (${h.stage.label.toLowerCase()})` : ""}.`,
  };
  const first = asked ? `From ${name}'s records:\n${line(asked)}` : facts[topic] ? `From ${name}'s records: ${facts[topic]}` : "";
  const extra = [
    topic !== "allergies" && ctx.allergies?.length ? facts.allergies : "",
    topic !== "medicines" && ctx.medications?.length ? facts.medicines : "",
  ].filter(Boolean).join("\n");
  return {
    reply: [
      first,
      `${first ? `The rest of ${name}'s health check` : `Here's how ${name} is doing, from ${name}'s records in FurFriends. Health check`}: ${h.label}, ${h.onTrack} of ${h.total} on track.`,
      lines.join("\n"),
      extra,
      `This is what's saved in the app, not an exam. If ${name} seems unwell, see your vet.`,
    ].filter(Boolean).join("\n\n"),
    sure: true, related: [],
    match: { q: `${name}'s health check`, source: `${name}'s records`, url: `#/app/pets/${pet.id}`, kind: "records", score: 1 },
  };
}

function ageText(pet) {
  const y = Number(pet.ageYears) || 0, m = Number(pet.ageMonths) || 0;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ") || "less than a month";
}

/* ------------------------------------------------------------------ he/she for the pet
   The checked sources say "he" or "her" about any pet, and the model copies them: in the pet test (68 questions about
   simulated pets, ai-server/results/pets) 17 v6 answers and 15 v2 answers called the pet by the other sex, like
   "Gently wipe her nose" to the owner of a male cat. In a pet's own chat, he/she is that pet, so the answer is switched
   to its sex. "her" becomes "him" or "his" depending on the words around it. Nothing changes when the owner's own
   question says he/she the other way: then it's probably about another animal. */
const words = (s) => new Set(s.trim().split(/\s+/));
// "her" is the object ("him") before these words, or at the end of a sentence: "give her a treat", "with her."
const OBJECT_NEXT = words(`a an the some any this that these those each every it yourself
  to for with at on in into onto from of off out up down over under away around through by near inside outside indoors outdoors alone
  and or but if when while until as so because before after unless than
  gently slowly closely carefully regularly often again now too once twice quietly immediately straight soon today`);
// ... before these, "have her seen by a vet", "get her vaccinated".
const PARTICIPLE = words("vaccinated checked spayed neutered examined seen treated groomed dewormed microchipped tested weighed boarded fixed sterilized sterilised castrated");
// ... after these verbs: "let her rest", "help her eat", "stop her smelling food", "give her water", unless what follows
// is hers: "feed her usual food".
const VERB_OBJECT = words("let lets letting help helps helping helped make makes making made give gives giving gave offer offers offering offered feed feeds feeding fed stop stops stopping stopped prevent prevents preventing prevented");
const POSSESSED = words("own usual regular normal favorite favourite daily prescribed current next first last full whole entire");
// ... and "keep her calm", "keep her company" (but "keep her nails short").
const COMPLEMENT_VERB = words("keep keeps keeping kept leave leaves leaving left get gets getting got find finds found make makes making made");
const COMPLEMENT = words("calm warm cool comfortable comfy quiet safe still dry clean hydrated busy relaxed occupied confined rested content happy active entertained company close");

const prevWord = (text, at) => (text.slice(0, at).match(/([A-Za-z][\w'’-]*)[ \t]+$/)?.[1] || "").toLowerCase();
const nextWord = (text, end) => (text.slice(end).match(/^[ \t]+([A-Za-z][\w'’-]*)/)?.[1] || "").toLowerCase();
function herAs(prev, next) {
  if (!next || OBJECT_NEXT.has(next) || PARTICIPLE.has(next)) return "him";
  if (COMPLEMENT_VERB.has(prev) && COMPLEMENT.has(next)) return "him";
  if (VERB_OBJECT.has(prev) && !POSSESSED.has(next)) return "him";
  return "his";
}
const likeCase = (w, to) => (w.length > 1 && w === w.toUpperCase() ? to.toUpperCase() : w[0] === w[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
const TO_FEMALE = { he: "she", him: "her", himself: "herself" };
const TO_MALE = { she: "he", hers: "his", herself: "himself" };

/* The answer with he/she for the pet's sex (pet.gender "Female" or "Male"; anything else is left as it is).
   partial: the text is still streaming in, so its last word may still grow ("he" → "heat"), and "her"/"his" wait
   for the word after them. asked: the owner's question. */
export function matchPronouns(text, pet, { partial = false, asked = "" } = {}) {
  const sex = pet?.gender === "Female" ? "female" : pet?.gender === "Male" ? "male" : null;
  if (!sex || !text) return text;
  if (asked && (sex === "female" ? /\b(he|him|his|himself)\b/i : /\b(she|her|hers|herself)\b/i).test(asked)) return text;
  if (partial) {
    const cut = text.search(/(?:\b(?:her|his)\s+)?\S*$/i);
    return matchPronouns(text.slice(0, cut), pet) + text.slice(cut);
  }
  return text.replace(/\b(he|him|his|himself|she|her|hers|herself)\b/gi, (w, _, at) => {
    const lw = w.toLowerCase();
    const to = sex === "female"
      ? (lw === "his" ? (nextWord(text, at + w.length) ? "her" : "hers") : TO_FEMALE[lw])
      : (lw === "her" ? herAs(prevWord(text, at), nextWord(text, at + w.length)) : TO_MALE[lw]);
    return to ? likeCase(w, to) : w;
  });
}
