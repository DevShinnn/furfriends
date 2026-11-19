/* The selected pet in the assistant: its name in the search, and questions about its own records.

   petAsSpecies   "How do I keep Mochi cool?" is searched as "How do I keep my cat cool?": the library knows cats,
                  not Mochi, and the name alone pushed the right checked answer below the evidence limit
                  (0.61 against 1.01 with "my cat", 2026-11-20 on the preview). The model still gets the owner's words.
   recordsReply   "What is Mochi's condition?", "Is Bori allergic to anything?", "Is Mochi up to date on vaccines?" are
                  about the pet's records, which the library can't answer: they get the pet's health check
                  (health.js), word for word, with no model and no diagnosis. Symptoms still go to the library. */
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

/* Is this a question about the selected pet's own records (condition, allergies, vaccines due, medicines)? */
export function isRecordsQuestion(text, pet) {
  const name = (pet?.name || "").trim();
  if (!name || !text || SYMPTOM.test(withEnglish(text))) return false;
  const t = text.replace(/[’ʼ]/g, "'");
  const me = `(?:${esc(name)}|he|she|him|her|his|siya|niya|my (?:pet|cat|dog|kitten|puppy))`;
  if (!new RegExp(`\\b${me}\\b`, "i").test(t)) return false;
  const not = "(?!\\s+(?:if|when|to|for|after|with|eating)\\b)";   // "is my dog okay to eat mango?" is about mango
  return [
    /\b(condition|kalagayan|lagay|kalusugan|health (status|check|records?)|medical (records?|history)|records)\b/i,
    new RegExp(`\\bhow(?:'s| is) ${me}(?: doing| now| lately| today)?\\s*[?.!]*$`, "i"),
    new RegExp(`\\bis ${me} (?:healthy|okay|ok|fine|well|alright|in good (?:health|shape))\\b${not}`, "i"),
    /\b(kumusta|kamusta)\b/i,
    new RegExp(`\\b(?:what is ${me} allergic to|is ${me} allergic to (?:anything|something)|${me}(?:'s)? allergies|does ${me} have (?:any )?allergies)\\b`, "i"),
    new RegExp(`\\b(?:is ${me} (?:up to date|updated|due|overdue)|${me}(?:'s)? (?:vaccines?|shots?|vaccinations?|bakuna)\\b.*\\b(?:up to date|overdue|status|due|next)|when is ${me}(?:'s)? next (?:vaccine|shot|vaccination|checkup|deworming))\\b`, "i"),
    new RegExp(`\\b(?:what (?:medicines?|medications?|meds) (?:is|does) ${me}|${me}(?:'s)? (?:medicines?|medications?|meds))\\b`, "i"),
  ].some((r) => r.test(t));
}

/* The pet's health check as a reply, or null when the question isn't about its records. */
export function recordsReply(text, pet, today) {
  if (!isRecordsQuestion(text, pet)) return null;
  const h = healthCheck(pet, today), ctx = petContext(pet), name = pet.name;
  const lines = h.checks.filter((c) => c.detail).map((c) =>
    `- ${c.label}${c.status === "danger" || c.status === "warn" ? ` (${STATUS_TEXT[c.status].toLowerCase()})` : ""}: ${c.detail}`);
  const extra = [
    ctx.allergies?.length ? `Allergies on record: ${ctx.allergies.join(", ")}.` : "",
    ctx.medications?.length ? `Medicines on record: ${ctx.medications.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  return {
    reply: [
      `Here's how ${name} is doing, from ${name}'s records in FurFriends. Health check: ${h.label}, ${h.onTrack} of ${h.total} on track.`,
      lines.join("\n"),
      extra,
      `This is what's saved in the app, not an exam. If ${name} seems unwell, see your vet.`,
    ].filter(Boolean).join("\n\n"),
    sure: true, related: [],
    match: { q: `${name}'s health check`, source: `${name}'s records`, url: `#/app/pets/${pet.id}`, kind: "records", score: 1 },
  };
}
