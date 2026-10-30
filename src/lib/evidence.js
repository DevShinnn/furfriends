import { compose, tokens, withEnglish } from "./knowledge";
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
   at least `cover` of the subject; for a follow-up it must also cover `focus` of what the new message asks. */
export const EVIDENCE = { strong: 0.76, min: 0.7, cover: 0.6, focus: 0.01 };

// Words that say nothing about the subject of a question: the animals, places, and words owners ask with.
const GENERIC = new Set(`dog dogs puppy puppies pup aso tuta cat cats kitten kittens kitty pusa kuting pet pets animal animals
  philippines philippine filipino pinoy manila here country our someone something really best good okay normal right
  know tell need want make take give keep help thing things way time much many often long still also like one
  usually ever always every there thank thanks please`
  .split(/\s+/).flatMap((w) => tokens(w)).map((w) => root(w)));

// A rough word root, so "overheating" meets "overheat" and "dewormed" meets "deworm".
function root(w) { return w.length > 5 ? w.replace(/(ing|ed|ly)$/, "") : w; }

/* The question's subject words, each with how rare it is in the library (rare words say more). */
function subject(question, idf) {
  const words = new Map();
  for (const w of tokens(question)) {
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
  const set = new Set(tokens(withEnglish(passageText(entry))).map(root));
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
  const answers = (r) => own.get(r.id) >= rule.focus && (r.score >= rule.strong || (r.score >= rule.min && cover.get(r.id) >= rule.cover));
  const shows = (r) => own.get(r.id) >= rule.focus && (r.score >= rule.strong || cover.get(r.id) >= rule.cover);
  const near = (r) => shows(r) || cover.get(r.id) > 0;
  const ids = new Set(pinned.map((e) => e.id));
  const evidence = [...pinned, ...results.filter((r) => answers(r) && !ids.has(r.of || r.id))].slice(0, limit);
  return { evidence, answers, shows, near, cover };
}

/* The search half of askKnowledge() in assistant.js. An emergency the app recognises (the red box) puts its
   first-aid guide first, so the model always has the right guide (ai-server/answer_rag.py does the same); then
   the search results that are evidence. `fallback` is the search-only reply, shown when the model isn't asked,
   fails, or writes something its passages don't back. */
export function planAnswer(index, results, question, lastMessage, rule = EVIDENCE) {
  const pinned = urgentGuides(lastMessage).map((g) => index.entries.find((e) => e.id === `guide-${g.slug}`)).filter(Boolean);
  const own = withEnglish(lastMessage);
  const focus = own.trim() === question.trim() ? "" : own;   // only a follow-up has a separate focus
  const { evidence, answers, shows, near } = selectEvidence(results, question, index.keywords.idf, { pinned, limit: SOURCES, rule, focus });
  return { evidence, fallback: compose(results, question, { fits: shows, sure: answers, near }) };
}

/* ------------------------------------------------------------------ checking the AI's answer */
const LAW = /\b(?:R\.?\s?A\.?|Republic Act(?:\s+No\.?)?)\s*(\d{3,5})\b|\b(?:Executive|Administrative)\s+Order(?:\s+No\.?)?\s*(\d+)\b|\bSec(?:tion|\.)\s*(\d+)\b/gi;
const BODIES = ["CDC", "FDA", "ASPCA", "WSAVA", "AAFP", "AAHA", "AVMA", "CAPC", "Merck", "WHO", "RSPCA", "PAWS", "BAI", "Bureau of Animal Industry",
  "Department of Agriculture", "Department of Health", "DOH", "PNP", "LGU", "Animal Welfare Act", "Anti-Rabies Act", "Stack Exchange"];
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const ALWAYS_OK = new Set(["24"]);   // "a 24-hour clinic" is FurFriends' own advice, as in the first-aid guides
/* Share of the answer's words a passage must hold to count as used (and be credited). Calibrated with the real
   model's answers (scripts/eval-retrieval.mjs --calibrate --answers): the passage an answer is written from holds
   0.7 or more of its words, the other passage at most 0.59, so 0.6 credits exactly the passage it came from. */
export const ANSWER = { uses: 0.6 };

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
  const have = new Set(numbersIn(all));
  for (const n of new Set(numbersIn(answer))) if (!have.has(n) && !ALWAYS_OK.has(n)) problems.push(`number not in the sources: ${n}`);
  const use = sources.map((s) => overlap(answer, s.text));
  const used = use.map((u, i) => (u >= limits.uses ? i : -1)).filter((i) => i >= 0);
  if (!used.length) problems.push(`not based on the sources (best overlap ${Math.max(0, ...use).toFixed(2)})`);
  return { ok: !problems.length, used, use, problems };
}

/* checkAnswer() for the passages (index entries) the answer was written from: `used` are the entries it uses. */
export function reviewAnswer(answer, evidence, options) {
  const check = checkAnswer(answer, sourcesFor(evidence), options);
  return { ...check, used: check.used.map((i) => evidence[i]) };
}
