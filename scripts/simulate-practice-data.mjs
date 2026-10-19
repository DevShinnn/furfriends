/* Makes SIMULATED practice data so the team can try the results tools and see the tables before the
   real usability sessions and grading are done. Nothing here is a real result: every file name,
   tester code (SIM-01…) and grader note says SIMULATED, and the summaries carry a warning.
   It never writes to Supabase, so the real survey table stays clean.

     node scripts/simulate-practice-data.mjs
       → docs/simulated/SIMULATED-survey-export.csv   (same columns as the Supabase export)
       → docs/simulated/SIMULATED-ai-grader1.csv, SIMULATED-ai-grader2.csv  (from the real grading sheet)
     then:
       node scripts/survey-results.mjs docs/simulated/SIMULATED-survey-export.csv
       cd ai-server && python evaluate.py score ../docs/simulated/SIMULATED-ai-grader1.csv ../docs/simulated/SIMULATED-ai-grader2.csv

   Fixed seed, so a re-run gives the same files. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv, toCsv } from "./csv.mjs";
import { TASKS, susScore } from "../src/lib/survey.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "simulated");
const SHEET = join(ROOT, "ai-server", "results", "answers-search-v2.csv");
const NOTE = "SIMULATED practice grade, not a real judgement.";

/* Small seeded random generator (mulberry32). */
let seed = 20261019;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- survey: 12 testers */
const DEVICES = ["Android phone", "Android phone", "Android phone", "iPhone", "iPhone", "Computer"];
// Chance a task needed help: the harder flows (notifications, uploads) more often.
const HELP = { reminders: 0.3, upload_doc: 0.25, appointment: 0.15, assistant: 0.15 };
const LIKED = ["All my pet's records in one place.", "The vaccine reminders.", "The emergency guide is easy to find.",
  "Clean design, easy to read.", "The AI answers were quick.", "Feeding schedule is simple to set up."];
const IMPROVE = ["Notifications were hard to turn on.", "Uploading a PDF took a few tries.", "Wanted a dark mode.",
  "Booking an appointment could use fewer steps.", "Some AI answers were too long.", "Nothing major."];

const survey = Array.from({ length: 12 }, (_, i) => {
  const attitude = rand() * 1.6 - 0.6;   // how much this tester liked the app, about -0.6 to +1
  const sus = Array.from({ length: 10 }, (_, k) =>
    clamp(Math.round((k % 2 === 0 ? 3.9 + attitude : 2.1 - attitude) + (rand() - 0.5) * 1.4), 1, 5));
  const tasks = Object.fromEntries(TASKS.map((t) => {
    const r = rand();
    return [t.id, r < 0.03 ? "failed" : r < 0.03 + (HELP[t.id] ?? 0.08) ? "help" : "done"];
  }));
  const day = String(20 + Math.floor(i / 4)).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, user_id: "00000000-0000-4000-8000-000000000000",
    participant_code: `SIM-${String(i + 1).padStart(2, "0")}`, device: pick(DEVICES),
    tasks: JSON.stringify(tasks), sus: `{${sus.join(",")}}`, sus_score: susScore(sus).toFixed(1),
    liked: `[SIMULATED] ${pick(LIKED)}`, improve: `[SIMULATED] ${pick(IMPROVE)}`,
    created_at: `2026-10-${day} ${String(9 + (i % 4) * 2).padStart(2, "0")}:00:00+08`,
  };
});
const SURVEY_COLS = ["id", "user_id", "participant_code", "device", "tasks", "sus", "sus_score", "liked", "improve", "created_at"];
writeFileSync(join(OUT, "SIMULATED-survey-export.csv"), toCsv(SURVEY_COLS, survey));

/* ---------------------------------------------------------------- AI test: two graders */
// A rough stand-in for a human grade, from the sheet's automatic columns. Real graders read the answers.
const sheet = readCsv(SHEET);
const COLS = Object.keys(sheet[0]);
const first = sheet.map((r) => {
  const overlap = Number(r.word_overlap) || 0;
  const unsure = /^I'm not sure I have an answer/.test(r.model_answer);
  const correct = unsure ? (overlap >= 25 ? 1 : 0) : overlap >= 35 ? 2 : overlap >= 18 ? (rand() < 0.6 ? 2 : 1) : 1;
  const safe = /no urgent vet advice|mentions a dose/.test(r.auto_flags) ? "N" : "Y";
  return { ...r, grade_correct: correct, grade_safe: safe, grader_notes: NOTE };
});
// The second grader mostly agrees, as two careful graders would.
const second = first.map((r) => {
  const shift = rand() < 0.2 ? (rand() < 0.5 ? -1 : 1) : 0;
  const safe = rand() < 0.05 ? (r.grade_safe === "Y" ? "N" : "Y") : r.grade_safe;
  return { ...r, grade_correct: clamp(r.grade_correct + shift, 0, 2), grade_safe: safe };
});
writeFileSync(join(OUT, "SIMULATED-ai-grader1.csv"), toCsv(COLS, first));
writeFileSync(join(OUT, "SIMULATED-ai-grader2.csv"), toCsv(COLS, second));

console.log(`SIMULATED practice data → ${OUT}
  12 survey responses, and 2 × ${sheet.length} AI grades. Not real results; do not report them.`);
