/* Turns the usability survey answers into the tables for the thesis Results chapter. Same numbers
   as the SQL queries in supabase/migrations/20261019030000_usability_survey.sql, without needing
   the SQL editor.

     1. Supabase → Table Editor → usability_responses → Export → Export as CSV
     2. node scripts/survey-results.mjs <the downloaded file>.csv   → prints the tables and saves <file>-summary.md

   Rows whose participant code starts with SIM- are practice data from scripts/simulate-practice-data.mjs,
   and the summary is then marked SIMULATED. */
import { writeFileSync } from "node:fs";
import { readCsv } from "./csv.mjs";
import { SUS_ITEMS, TASKS, TASK_RESULTS, susScore } from "../src/lib/survey.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/survey-results.mjs <usability_responses export>.csv");
  process.exit(1);
}

// Supabase exports arrays as {4,2,5,...} and JSON columns as JSON text.
const rows = readCsv(file).map((r) => {
  const sus = String(r.sus || "").replace(/[{}[\]\s]/g, "").split(",").filter(Boolean).map(Number);
  let tasks = {};
  try { tasks = JSON.parse(r.tasks || "{}"); } catch { /* left empty */ }
  return { ...r, sus, tasks, score: sus.length === 10 ? susScore(sus) : null };
}).filter((r) => r.score !== null);

if (!rows.length) {
  console.error(`${file} has no rows with 10 SUS answers. Export the usability_responses table as CSV.`);
  process.exit(1);
}

const simulated = rows.some((r) => /^SIM-/i.test(r.participant_code || ""));
const n = rows.length;
const scores = rows.map((r) => r.score).sort((a, b) => a - b);
const mean = scores.reduce((s, x) => s + x, 0) / n;
const sd = n > 1 ? Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
const median = n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
const f1 = (x) => x.toFixed(1);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");

/* Where the mean falls on the usual SUS benchmarks (Sauro, 2011; Bangor et al., 2009). */
const benchmark = mean >= 80.3 ? "excellent (top 10%)" : mean >= 68 ? "above average" : mean >= 51 ? "below average" : "poor";

const out = [];
if (simulated) out.push("> **SIMULATED PRACTICE DATA.** Made up by scripts/simulate-practice-data.mjs to show the format. Not real results; do not report these numbers.", "");
out.push(`## System Usability Scale (SUS)`, "",
  "| Testers | Mean | SD | Median | Min | Max | Benchmark |", "|---|---|---|---|---|---|---|",
  `| ${n} | ${f1(mean)} | ${f1(sd)} | ${f1(median)} | ${f1(scores[0])} | ${f1(scores.at(-1))} | ${benchmark} |`, "",
  "68 is the average SUS score for software in general; 80.3 and above is the top 10%.", "");

out.push("## Task completion", "", `| Task | ${TASK_RESULTS.map(([, label]) => label).join(" | ")} | Success rate |`,
  `|---|${TASK_RESULTS.map(() => "---|").join("")}---|`);
for (const t of TASKS) {
  const answers = rows.map((r) => r.tasks[t.id]).filter(Boolean);
  const counts = TASK_RESULTS.map(([key]) => answers.filter((a) => a === key).length);
  out.push(`| ${t.text} | ${counts.join(" | ")} | ${pct(counts[0], answers.length)} |`);
}
out.push("", "Success rate = did it on their own, out of the testers who answered for that task.", "");

out.push("## Average answer per SUS statement", "", "1 = strongly disagree … 5 = strongly agree. Odd statements are positive (higher is better), even statements are negative (lower is better).", "",
  "| # | Statement | Mean |", "|---|---|---|");
SUS_ITEMS.forEach((text, i) => {
  const m = rows.reduce((s, r) => s + r.sus[i], 0) / n;
  out.push(`| ${i + 1} | ${text} | ${m.toFixed(2)} |`);
});

const devices = Object.entries(rows.reduce((m, r) => ({ ...m, [r.device || "not given"]: (m[r.device || "not given"] || 0) + 1 }), {}));
out.push("", `Devices: ${devices.map(([d, c]) => `${d} ${c}`).join(", ")}.`, "", "## Comments", "",
  "| Tester | Device | SUS | Liked | Would improve |", "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.participant_code || "-"} | ${r.device || "-"} | ${f1(r.score)} | ${(r.liked || "").replace(/\|/g, "/").replace(/\s+/g, " ")} | ${(r.improve || "").replace(/\|/g, "/").replace(/\s+/g, " ")} |`), "");

const text = out.join("\n");
console.log(text);
const summary = file.replace(/\.csv$/i, "") + "-summary.md";
writeFileSync(summary, text);
console.log(`(saved to ${summary})`);
