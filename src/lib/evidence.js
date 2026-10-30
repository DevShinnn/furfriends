import { compose, speciesOf, tokens, withEnglish } from "./knowledge";
import { urgentGuides } from "./emergency";
import { SOURCES, sourcesFor } from "./prompt";

/* Which checked passages count as evidence for a question, and whether an AI answer stays within them.

   The search always returns its closest passages, even when nothing in the library is about the question
   ("Is that the best dog breed for a tropical country?" finds laws that mention the Philippines). Sending
   those to the model as "checked sources" invites an answer built on the wrong text, credited to it.

   So a passage is only evidence when it is close enough AND covers what the question is about: the rare,
   specific words of the question (breed, tropical), not the words every pet question shares (dog, cat,
   Philippines). The limits are set from the labelled questions in ai-server/data/retrieval_eval.jsonl by
   scripts/eval-retrieval.mjs --calibrate, not guessed.

   After the model answers, checkAnswer() makes sure the answer leans on the passages it was given, and that
   every law, organisation and number in it appears in them, so the AI can't invent a citation or a figure.
   Only the passages the answer actually uses are credited under it. */

/* Calibrated by `npm run eval:retrieval -- --calibrate` on the labelled questions (policy: decline at least 85% of
   questions the library can't answer, model gets only wrong passages for at most 5%; cross-validated, then tuned
   on all of them). A passage is evidence when its search score reaches `strong`, or reaches `min` and it covers
   at least `cover` of the subject (a close one still `floor`); for a follow-up it must also cover `focus` of what
   the new message asks. Recalibrated 2026-10-30 for the checked-sources-only index (550 passages, no Stack Exchange):
   the scores of a smaller library run lower. */
export const EVIDENCE = { strong: 0.7, min: 0.6, cover: 0.55, focus: 0.01, floor: 0 };

// Words that say nothing about the subject of a question: the animals, places, and words owners ask with.
const GENERIC = new Set(`dog dogs puppy puppies pup aso tuta cat cats kitten kittens kitty pusa kuting pet pets animal animals
  philippines philippine filipino pinoy manila here country our someone something really best good okay normal right
  know tell need want make take give keep help thing things way time much many often long still also like one
  usually ever always every there thank thanks please
  dangerous serious worry worried ago one two three four five six seven day days week weeks hour hours`
  .split(/\s+/).flatMap((w) => tokens(w)).map((w) => root(w)));

// A rough word root, so "overheating" meets "overheat" and "dewormed" meets "deworm".
function root(w) { return w.length > 5 ? w.replace(/(ing|ed|ly)$/, "") : w; }

/* Losing appetite is one idea, not the word "eating": "not" is a stop word, so "my dog is not eating" otherwise
   matched "my dog ate macadamia nuts" and a feeding schedule. Every way of saying it becomes one word, NOTEAT,
   in questions and passages alike; no passage is indexed under it, so it counts as the rarest word there is. */
export const NOT_EATING = /\b(not|isn'?t|is not|won'?t|will not|doesn'?t|does not|didn'?t|hasn'?t|has not|haven'?t|stop(s|ped)?|refus(es|ed|ing)?)\s+(eat|eating|eaten|ate)\b|\b(no|lost|losing|loss of|poor|decreased|reduced) appetite\b|\boff (his|her|its|their) food\b|\bwithout food\b|\bayaw kumain\b|\bhindi kumakain\b|\bwalang gana\b/gi;
const concepts = (text) => text.replace(NOT_EATING, " noteat ");

/* The question's subject words, each with how rare it is in the library (rare words say more). */
export function subject(question, idf) {
  const words = new Map();
  for (const w of tokens(concepts(question))) {
    const r = root(w);
    if (!GENERIC.has(r)) words.set(r, Math.max(words.get(r) || 0, idf(w)));
  }
  return words;
}

const passageText = (e) => `${e.ask || ""} ${e.q} ${e.keys || ""} ${e.a}`;
const passageWords = new Map();   // entry id -> its words; a passage's words never change
function wordsOf(entry) {
  const key = entry.id && `${entry.id}\u0000${entry.ask || ""}`;
  if (key && passageWords.has(key)) return passageWords.get(key);
  const set = new Set(tokens(concepts(withEnglish(passageText(entry)))).map(root));
  if (key) passageWords.set(key, set);
  return set;
}

/* How much of the question's subject a passage covers, 0–1, weighted by how rare each word is.
   1 when the question has no subject words of its own. */
export function coverage(question, entry, idf) {
  const words = subject(question, idf);
  if (!words.size) return 1;
  const text = wordsOf(entry);
  let have = 0, all = 0;
  for (const [w, weight] of words) { all += weight; if (text.has(w)) have += weight; }
  return have / all;
}

/* Laws are evidence for questions about the law, not for care questions that happen to share a word with one
   ("Is a husky suitable for the Philippines?" found laws that mention the Philippines). A law passage is evidence
   only when the question asks about rules, rights or penalties, or matches it very closely ("do I need to register
   my dog?"). Written from the legal questions in ai-server/data/retrieval_eval.jsonl. */
const LAW_SOURCE = /^(Republic Act|IRR of RA|Executive Order|BAI NVQSD)/;
const LAW_ASK = /\b(laws?|legal(ly)?|illegal|liab(le|ility)|penalt(y|ies)|fines?d?|jail|report(ing)?|regist(er|ered|ration)|requir(e|ed|ement)|rules?|allowed|permit(ted)?|leash|roam|pound|impound(ed)?|papers?|documents?|bring|travel|plane|ferry|boat|province|island|cruelty|abuse|abandon(ed)?|neglect|ordinance|rights?|responsibilit(y|ies)|government|barangay|free|bit|bites?|bitten|meat)\b/i;
export const isLaw = (e) => LAW_SOURCE.test(e.src || "");
const OTHER_PET = /\b(turtles?|tortoises?|rabbits?|bunn(y|ies)|hamsters?|guinea pigs?|gerbils?|mice|rats?|ferrets?|birds?|parrots?|lovebirds?|chickens?|ducks?|fish|goldfish|koi|bettas?|snakes?|lizards?|geckos?|iguanas?|bearded dragons?|frogs?|hedgehogs?|sugar gliders?|monkeys?|horses?|cows?|goats?|pigs?)\b/i;
const PRICE = /\b(prices?|priced|costs?|costing|expensive|cheap(est)?|pesos?|php|magkano|presyo|buy|bili|breeders?|for sale)\b|₱|\bhow much (is|are|does|do) (a|an|the|one|it)\b(?!.*\b(eat|feed|food|water|sleep|exercise|weigh)\b)/i;

/* What a passage must say, whatever its score, for some questions. A loss of appetite must be about not eating
   (a close match on "cat" and "days" found a feeding schedule for "my cat hasn't eaten for three days"). Dog food
   for a cat (or cat food for a dog) must be about that pairing: the library has no such passage, so these questions
   are declined instead of being answered with whatever mentions pet food. */
const CAT = /\b(cats?|kittens?|kitty)\b/i, DOG = /\b(dogs?|pupp(y|ies))\b/i;
function requirements(question) {
  const needs = [];
  if (new RegExp(NOT_EATING.source, "i").test(question)) needs.push((t) => new RegExp(NOT_EATING.source, "i").test(t));
  const DOG_FOOD = /\b(dog'?s?|pupp(y|ies)'?s?) (food|kibble)\b|\bfood (for|of) (the )?dogs?\b/i;
  const CAT_FOOD = /\b(cat'?s?|kitten'?s?) (food|kibble)\b|\bfood (for|of) (the )?cats?\b/i;
  const other = (re) => new RegExp(re.source, "gi");
  // The passage must name the food itself ("dog food"), not just "food for dogs and cats" in general.
  if (DOG_FOOD.test(question) && CAT.test(question.replace(other(DOG_FOOD), ""))) needs.push((t) => /\b(dog|puppy) food\b/i.test(t) && CAT.test(t));
  if (CAT_FOOD.test(question) && DOG.test(question.replace(other(CAT_FOOD), ""))) needs.push((t) => /\b(cat|kitten) food\b/i.test(t) && DOG.test(t));
  return needs;
}

/* The passages the model may answer from: first-aid guides the emergency check picked (pinned), then
   search results that pass the limits, at most `limit`. Also, for the search-only reply (compose() in
   knowledge.js): which results may be shown as a checked answer (shows: about the question, though maybe less
   close; compose() still applies its own score limits and says when it isn't sure), and which may be offered
   as similar questions (near: shares at least one subject word). */
export function selectEvidence(results, question, idf, { pinned = [], limit = 2, rule = EVIDENCE, focus = "" } = {}) {
  const cover = new Map(results.map((r) => [r.id, coverage(question, r, idf)]));
  // A follow-up is searched together with what it refers to ("my dog has ticks" + "can they make him sick?").
  // The passage must also cover what the new message itself asks (sick), not only the earlier topic (ticks).
  const own = new Map(results.map((r) => [r.id, focus ? coverage(focus, r, idf) : 1]));
  const needs = requirements(question);
  const lawOk = (r) => (!isLaw(r) || LAW_ASK.test(question) || r.score >= rule.strong) && needs.every((n) => n(withEnglish(passageText(r))));
  const answers = (r) => own.get(r.id) >= rule.focus && lawOk(r)
    && ((r.score >= rule.strong && cover.get(r.id) >= (rule.floor || 0)) || (r.score >= rule.min && cover.get(r.id) >= rule.cover));
  const shows = (r) => own.get(r.id) >= rule.focus && lawOk(r) && ((r.score >= rule.strong && cover.get(r.id) >= (rule.floor || 0)) || cover.get(r.id) >= rule.cover);
  const near = (r) => shows(r) || cover.get(r.id) > 0;
  const ids = new Set(pinned.map((e) => e.id));
  let found = results.filter((r) => answers(r) && !ids.has(r.of || r.id));
  // A breed's own guide, found before the heat summary of all breeds, makes the summary redundant: given both, the
  // model copied the list and the breed's lines went uncredited. ("Which breeds handle heat best?" finds the summary first.)
  const isHeat = (r) => /^breed-heat-/.test(r.of || r.id);
  const firstBreed = found.findIndex((r) => r.kind === "breed");
  if (firstBreed >= 0 && !isHeat(found[firstBreed])) found = found.filter((r) => !isHeat(r));
  const evidence = [...pinned, ...found].slice(0, limit);
  return { evidence, answers, shows, near, cover };
}

/* The search half of askKnowledge() in assistant.js. An emergency the app recognises (the red box) puts its
   first-aid guide first, so the model always has the right guide (ai-server/answer_rag.py does the same); then
   the search results that are evidence. `fallback` is the search-only reply, shown when the model isn't asked,
   fails, or writes something its passages don't back. */
export function planAnswer(index, results, question, lastMessage, rule = EVIDENCE) {
  const pinned = urgentGuides(lastMessage).map((g) => index.entries.find((e) => e.id === `guide-${g.slug}`)).filter(Boolean);
  // The library has no prices or sellers: "How much is a Shih Tzu puppy?" finds the Shih Tzu's breed guide, which
  // is about the breed, not what it costs. Emergencies still get their first-aid guide.
  if (PRICE.test(withEnglish(lastMessage)) && !pinned.length) results = [];
  // FurFriends is for cats and dogs. The CDC pages on other animals are in the library for owners' own health
  // ("can I get sick from my dog?"), not as care advice for a turtle or a rabbit.
  if (OTHER_PET.test(question) && !speciesOf(question) && !/\b(dogs?|cats?|pupp\w+|kittens?)\b/i.test(question) && !pinned.length) results = [];
  const own = withEnglish(lastMessage);
  const focus = own.trim() === question.trim() ? "" : own;   // only a follow-up has a separate focus
  const { evidence, answers, shows, near } = selectEvidence(results, question, index.keywords.idf, { pinned, limit: SOURCES, rule, focus });
  return { evidence, fallback: compose(results, question, { fits: shows, sure: answers, near }) };
}

/* An emergency the app recognises (trouble breathing, poisoning, hit by a car...) whose guide says to go now: the
   reply always says so too, whatever the model or the closest checked answer wrote. */
export const EMERGENCY_NOTE = "This can be an emergency: go to a vet or the nearest 24-hour clinic now. Call ahead while on the way if you can.";
export function withEmergency(lastMessage, answer) {
  if (!urgentGuides(lastMessage).some((g) => g.urgency === "now")) return answer;
  if (/\b(vet|veterinarian|clinic)\b/i.test(answer) && /\b(now|immediately|right away|straight away)\b/i.test(answer)) return answer;
  return `${answer}\n\n${EMERGENCY_NOTE}`;
}

/* ------------------------------------------------------------------ checking the AI's answer */
const LAW = /\b(?:R\.?\s?A\.?|Republic Act(?:\s+No\.?)?)\s*(\d{3,5})\b|\b(?:Executive|Administrative)\s+Order(?:\s+No\.?)?\s*(\d+)\b|\bSec(?:tion|\.)\s*(\d+)\b/gi;
const BODIES = ["CDC", "FDA", "ASPCA", "WSAVA", "AAFP", "AAHA", "AVMA", "CAPC", "Merck", "WHO", "RSPCA", "PAWS", "BAI", "Bureau of Animal Industry",
  "Department of Agriculture", "Department of Health", "DOH", "PNP", "LGU", "Animal Welfare Act", "Anti-Rabies Act", "Stack Exchange"];
// FurFriends never gives medicine doses (safetyReply in knowledge.js), whatever a passage says.
const DOSE = /\b\d+(\.\d+)?\s*(mg|mcg|ml|cc|milligrams?|millilit(er|re)s?|tablets?|tabs?|capsules?|drops?)\b|\b(mg|ml)\/kg\b/i;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
// Medicines an answer may only name when its passages do ("never give paracetamol" is in them; "try Benadryl" isn't).
const MEDICINES = /\b(paracetamol|acetaminophen|biogesic|tylenol|ibuprofen|advil|aspirin|naproxen|mefenamic|benadryl|diphenhydramine|cetirizine|loratadine|antihistamines?|amoxicillin|antibiotics?|metronidazole|doxycycline|ivermectin|prednisone|prednisolone|steroids?|loperamide|imodium|omeprazole|hydrogen peroxide|activated charcoal|dewormers?|pyrantel|praziquantel|fipronil|permethrin|sedatives?|tramadol|insulin)\b/gi;
const ALWAYS_OK = new Set(["24"]);   // "a 24-hour clinic" is FurFriends' own advice, as in the first-aid guides
/* Share of the answer's words a passage must hold to count as used (and be credited). Calibrated with the real
   model's answers (scripts/eval-retrieval.mjs --calibrate --answers): the passage an answer is written from holds
   0.7 or more of its words, the other passage at most 0.59, so 0.6 credits exactly the passage it came from. */
export const ANSWER = { uses: 0.6, line: 0.8, lineWords: 4 };

const words = (t) => new Set(tokens(t).map(root));
const numbersIn = (t) => t.replace(/^\s*\d+[.)]\s/gm, "").match(/\d+(?:[.,]\d+)*/g) || [];

/* How much of the answer is made of a passage's words (0–1). */
export function overlap(answer, text) {
  const a = [...words(answer)];
  if (!a.length) return 0;
  const t = words(text);
  return a.filter((w) => t.has(w)).length / a.length;
}

/* Is the answer backed by the passages it was written from? `sources` are the { label, text } the model got;
   `context` is other text it may repeat (the pet's details, the owner's own words). Returns the indexes of the
   passages the answer uses (only these are credited) and what isn't backed, if anything.
   (Whether the passages are about the question is decided before the model is asked, by selectEvidence. A check
   that the answer repeats the question's words was tried and dropped: it rejected right answers that put things
   in the passage's words, such as "potty train" for "house train", and caught nothing else.) */
export function checkAnswer(answer, sources, { context = "", limits = ANSWER } = {}) {
  const all = `${sources.map((s) => `${s.label}\n${s.text}`).join("\n")}\n${context}`;
  const lower = all.toLowerCase();
  const problems = [];
  for (const m of answer.matchAll(LAW)) {
    const n = m[1] || m[2] || m[3];
    const backed = m[3] ? new RegExp(`\\bsec(?:tion|\\.)\\s*${n}\\b`, "i").test(all) : new RegExp(`\\b${n}\\b`).test(all);
    if (!backed) problems.push(`law not in the sources: ${m[0]}`);
  }
  for (const b of BODIES) {
    if (new RegExp(`\\b${b}\\b`, b.length <= 4 ? "" : "i").test(answer) && !lower.includes(b.toLowerCase())) problems.push(`names ${b}, which the sources don't`);
  }
  for (const u of answer.match(URL) || []) if (!all.includes(u.replace(/[.,)]+$/, ""))) problems.push(`link not in the sources: ${u}`);
  if (DOSE.test(answer)) problems.push("gives a medicine dose");
  for (const m of new Set((answer.match(MEDICINES) || []).map((x) => x.toLowerCase()))) {
    if (!lower.includes(m.replace(/s$/, ""))) problems.push(`names a medicine the sources don't: ${m}`);
  }
  const have = new Set(numbersIn(all));
  for (const n of new Set(numbersIn(answer))) if (!have.has(n) && !ALWAYS_OK.has(n)) problems.push(`number not in the sources: ${n}`);
  const use = sources.map((s) => overlap(answer, s.text));
  const used = use.map((u, i) => (u >= limits.uses ? i : -1)).filter((i) => i >= 0);
  if (!used.length) problems.push(`not based on the sources (best overlap ${Math.max(0, ...use).toFixed(2)})`);
  // A line taken from another passage credits that one too ("Typical adult weight 16–27 kg" from the Husky's guide
  // in an answer mostly copied from the heat summary). Only lines of 4+ words, nearly all from that passage and not
  // as well covered by a passage already credited, so a shared "see your vet" credits nothing.
  else for (const line of answer.split(/\n+|(?<=[.!?])\s+/)) {
    if (words(line).size < limits.lineWords) continue;
    const per = sources.map((s) => overlap(line, s.text));
    const best = per.indexOf(Math.max(...per));
    if (per[best] >= limits.line && !used.includes(best) && used.every((i) => per[i] < per[best])) used.push(best);
  }
  used.sort((a, b) => a - b);
  return { ok: !problems.length, used, use, problems };
}

/* checkAnswer() for the passages (index entries) the answer was written from: `used` are the entries it uses. */
export function reviewAnswer(answer, evidence, options) {
  const check = checkAnswer(answer, sourcesFor(evidence), options);
  return { ...check, used: check.used.map((i) => evidence[i]) };
}
