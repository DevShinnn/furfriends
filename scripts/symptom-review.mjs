/* The team's accuracy check of the symptom rules (src/lib/symptomNotes.js): what a pet's history means for a symptom.

     npm run symptom-review

   1. Writes docs/symptom-review/symptom-notes-review.csv: one row per rule, with the note owners would see, when it
      applies, and the exact words of the checked answer it relies on (and that answer's own sources).
   2. Two teammates each check every row against the source (open the link in `checked_answer_sources`), and fill in
      reviewer_1 / ok_1 and reviewer_2 / ok_2 (yes or no) and a comment. Save it as CSV in the same place.
   3. Run this again: it keeps what the reviewers wrote and saves the rules both said yes to (two different names) in
      src/lib/symptomReview.json. Only those are used by the app and in the AI's training data.
   A rule whose condition, note or quote changed since it was checked starts again with empty reviews. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readCsv, toCsv } from "./csv.mjs";
import { RULES, TOPICS, ruleHash, sourceOf } from "../src/lib/symptomNotes.js";

const DIR = "docs/symptom-review", CSV = `${DIR}/symptom-notes-review.csv`, JSON_OUT = "src/lib/symptomReview.json";
const library = new Map();
for (const l of readFileSync("ai-server/data/train.jsonl", "utf8").split("\n")) {
  if (!l.trim()) continue;
  const ex = JSON.parse(l);
  if (!library.has(ex.id)) library.set(ex.id, ex);
}
const yes = (v) => /^\s*(y|yes|ok|oo|approved?)\s*$/i.test(v || "");
const old = existsSync(CSV) ? new Map(readCsv(CSV).map((r) => [r.rule_id, r])) : new Map();

const COLUMNS = ["rule_id", "symptom", "species", "applies_when", "note_owners_see", "checked_answer_says", "checked_answer",
  "checked_answer_sources", "reviewer_1", "ok_1", "reviewer_2", "ok_2", "comment", "fingerprint"];
const rows = RULES.map((r) => {
  const species = r.species ? [r.species] : TOPICS.find((t) => t.id === r.topic).species ? [TOPICS.find((t) => t.id === r.topic).species] : ["Dog", "Cat"];
  const ids = [...new Set(species.map((s) => sourceOf(r, s)))];
  const says = typeof r.quote === "string" ? r.quote : species.map((s) => `${s}: ${r.quote[s]}`).join("\n");
  const fingerprint = ruleHash(r);
  const before = old.get(r.id);
  const kept = before && before.fingerprint === fingerprint ? before : {};
  return {
    rule_id: r.id, symptom: r.topic, species: species.join(" / "), applies_when: r.applies, note_owners_see: r.note, checked_answer_says: says,
    checked_answer: ids.map((id) => `${id}: ${library.get(id)?.messages[0].content || "(missing!)"}`).join("\n"),
    checked_answer_sources: ids.map((id) => library.get(id)?.source || "").join("\n"),
    reviewer_1: kept.reviewer_1 || "", ok_1: kept.ok_1 || "", reviewer_2: kept.reviewer_2 || "", ok_2: kept.ok_2 || "", comment: kept.comment || "", fingerprint,
  };
});
const missing = rows.filter((r) => r.checked_answer.includes("(missing!)"));
if (missing.length) throw new Error(`Rules whose checked answer isn't in the library: ${missing.map((r) => r.rule_id).join(", ")}`);

mkdirSync(DIR, { recursive: true });
writeFileSync(CSV, toCsv(COLUMNS, rows));
const approved = Object.fromEntries(rows.filter((r) => yes(r.ok_1) && yes(r.ok_2) && r.reviewer_1.trim() && r.reviewer_2.trim()
  && r.reviewer_1.trim().toLowerCase() !== r.reviewer_2.trim().toLowerCase()).map((r) => [r.rule_id, r.fingerprint]));
writeFileSync(JSON_OUT, JSON.stringify({ _about: "Written by npm run symptom-review from docs/symptom-review/symptom-notes-review.csv. Only rules two teammates approved (rule id -> fingerprint). Don't edit by hand.", approved }, null, 2) + "\n");
const reset = [...old.values()].filter((o) => (o.ok_1 || o.ok_2) && rows.find((r) => r.rule_id === o.rule_id)?.fingerprint !== o.fingerprint);
const said = (r) => [r.ok_1, r.ok_2].filter((x) => x.trim() && !yes(x)).length;
console.log(`${CSV}: ${rows.length} rules. Approved by two reviewers: ${Object.keys(approved).length}. `
  + `Marked "no" by someone: ${rows.filter(said).length}. Not fully reviewed: ${rows.length - Object.keys(approved).length - rows.filter(said).length}.`);
if (reset.length) console.log(`Changed since they were checked (reviews cleared): ${reset.map((r) => r.rule_id).join(", ")}`);
console.log(`Saved the approved rules to ${JSON_OUT}.`);
