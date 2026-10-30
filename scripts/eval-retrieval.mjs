/* Measures the assistant's search and evidence check on labelled questions, the way the app runs them.

     npm run eval:retrieval                          → metrics for the old behaviour (baseline) and the evidence check
     npm run eval:retrieval -- --calibrate           → also searches for the best limits on the dev half
     npm run eval:retrieval -- --prompts out.jsonl   → the exact prompts the app would send the model, per policy,
                                                       for ai-server/answer_prompts.py to answer with the real model
     npm run eval:retrieval -- --answers in.jsonl    → scores those answers: abstaining, unsupported claims, credits
         --label v4                                  → writes answer-eval-v4.json, to compare models side by side
         --skip m03,f02                              → leaves those questions out of the answer scores (e.g. ones a
                                                       model was trained on)

   Questions: ai-server/data/retrieval_eval.jsonl. Each has the passage ids (from public/knowledge/index.json) that
   truly answer it, or none when the library has no answer and the assistant should say so. The labels were made
   by reading each question's top search results; they are relevance judgements, not veterinary review. The
   limits are tuned on the "dev" half and reported on the "test" half, so the score isn't tuned to itself.

   It uses the app's own code (knowledge.js, evidence.js, prompt.js, emergency.js), run with vite-node so the
   imports resolve exactly as in the app. Writes ai-server/results/retrieval-eval.json and
   tests/fixtures/retrieval-queries.json (the questions' vectors, so the unit tests can search without the model). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { EMBED_MODEL, EMBED_OPTIONS, chatReply, compose, decodeIndex, queryText, safetyReply, search, withVetAdvice } from "../src/lib/knowledge.js";
import { ANSWER, EVIDENCE, checkAnswer, planAnswer } from "../src/lib/evidence.js";
import { chatMessages, sourcesFor, SOURCES } from "../src/lib/prompt.js";
import { urgentGuides } from "../src/lib/emergency.js";
import PROMPT from "../src/lib/aiPrompt.json";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const CALIBRATE = args.includes("--calibrate");

const raw = JSON.parse(readFileSync(join(ROOT, "public", "knowledge", "index.json"), "utf8"));
const index = decodeIndex(raw);
const cases = readFileSync(join(ROOT, "ai-server", "data", "retrieval_eval.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/* ---------------------------------------------------------------- the app's steps, per question */
console.log(`Loading ${EMBED_MODEL} ...`);
const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });   // as in embedWorker.js
const prepared = [];
for (const c of cases) {
  const messages = c.turns.map((content) => ({ role: "user", content }));
  const q = queryText(messages);
  const last = c.turns.at(-1);
  const vector = Array.from((await extractor(q, EMBED_OPTIONS)).data);
  const results = search(index, vector, q, { species: c.species || "" });
  const pinned = urgentGuides(last).map((g) => index.entries.find((e) => e.id === `guide-${g.slug}`)).filter(Boolean);
  prepared.push({ ...c, messages, q, vector, results, pinned, rule: !!(chatReply(last) || safetyReply(q)) });
}

/* What each policy sends to the model, and what the search-only reply shows. */
const POLICIES = {
  // Before: the emergency guide first, then the top results, whatever their score (withUrgent in assistant.js).
  baseline: (p) => {
    const ids = new Set(p.pinned.map((e) => e.id));
    return { sent: [...p.pinned, ...p.results.filter((e) => !ids.has(e.of || e.id))].slice(0, SOURCES), shown: compose(p.results, p.q) };
  },
  // Now: planAnswer() in evidence.js, exactly as askKnowledge() calls it.
  evidence: (p, rule = EVIDENCE) => {
    const { evidence, fallback } = planAnswer(index, p.results, p.q, p.turns.at(-1), rule);
    return { sent: evidence, shown: fallback };
  },
};
const idOf = (e) => e.of || e.id;

function measure(policy, split, rule) {
  const rows = prepared.filter((p) => !split || p.split === split).map((p) => {
    const { sent, shown } = POLICIES[policy](p, rule);
    const rel = new Set(p.relevant);
    const good = sent.filter((e) => rel.has(idOf(e))).length;
    return { id: p.id, category: p.category, answerable: rel.size > 0, sent: sent.map(idOf), good, bad: sent.length - good,
      shown: shown.match?.id || null, shownOk: !shown.match || rel.has(shown.match.id), shownSure: shown.sure };
  });
  const A = rows.filter((r) => r.answerable), U = rows.filter((r) => !r.answerable);
  const sent = rows.reduce((n, r) => n + r.sent.length, 0), good = rows.reduce((n, r) => n + r.good, 0);
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const m = {
    cases: rows.length,
    precision: pct(good, sent),                                        // of the passages sent to the model, % that answer the question
    recall: pct(A.filter((r) => r.good > 0).length, A.length),        // answerable questions with at least one right passage sent
    falseAbstain: pct(A.filter((r) => !r.sent.length).length, A.length),
    correctAbstain: pct(U.filter((r) => !r.sent.length).length, U.length),   // no-answer questions where the model isn't asked
    wrongOnly: pct(rows.filter((r) => r.sent.length && !r.good).length, rows.length),   // model gets only wrong passages
    shownWrong: pct(rows.filter((r) => !r.shownOk).length, rows.length),               // search-only reply shows a wrong passage
    shownWrongSure: pct(rows.filter((r) => !r.shownOk && r.shownSure).length, rows.length),   // ... as the answer, without "I'm not sure"
    shownRight: pct(A.filter((r) => r.shown && r.shownOk).length, A.length),            // answerable: search-only reply shows a right passage
  };
  m.balanced = Math.round(((m.recall ?? 0) + (m.correctAbstain ?? 0)) * 5) / 10;
  return { m, rows };
}

/* ---------------------------------------------------------------- calibration */
/* The operating policy the limits are chosen by: decline at least MIN_ABSTAIN % of the questions the library
   can't answer, give the model only wrong passages for at most MAX_WRONG_ONLY % of questions, and within that
   answer as many answerable questions as possible. Declining everything would be "safe" but useless; the model's
   own "couldn't find it" and checkAnswer() are the second line of defence.
   With ~55 questions per half one split is noisy, so it is cross-validated: tune on dev and score on test, tune
   on test and score on dev; the held-out scores are what to report. The app's limits are tuned on all questions. */
const MIN_ABSTAIN = 85, MAX_WRONG_ONLY = 5;
const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
const range = (a, b, s) => Array.from({ length: Math.round((b - a) / s) + 1 }, (_, i) => Math.round((a + i * s) * 1000) / 1000);
// A follow-up's passage must cover at least something the new message asks: a safety rule, not traded for recall.
// (With only checked sources, focus 0 answered one more follow-up, f11, but also gave "how much do kitten vaccines
// cost?" the vaccine schedule, m09, and sent more wrong passages: 4.5% against 3.6% of questions.)
const FOCUS = [0.01, 0.3];
function tune(split) {
  let best = null;
  for (const strong of range(0.7, 0.96, 0.02)) for (const min of range(0.5, 0.8, 0.02)) for (const cover of range(0, 0.9, 0.05)) for (const focus of FOCUS) for (const floor of [0, 0.2, 0.3, 0.4, 0.5]) {
    if (min > strong) continue;
    const r = { strong, min, cover, focus, floor };
    const { m } = measure("evidence", split, r);
    if (m.correctAbstain < MIN_ABSTAIN || m.wrongOnly > MAX_WRONG_ONLY) continue;
    // Most answerable questions with a right passage; then cleaner passages; then more declines; then looser limits.
    const key = [m.recall, m.precision, m.correctAbstain, -strong, -min, -cover, -focus, -floor];
    if (!best || better(key, best.key)) best = { key, rule: r, m };
  }
  if (!best) throw new Error(`No limits meet the policy (abstain >= ${MIN_ABSTAIN}%, wrong-only <= ${MAX_WRONG_ONLY}%) on ${split || "all"}`);
  return best.rule;
}
let rule = EVIDENCE, heldOut = null;
if (CALIBRATE) {
  const folds = [["dev", "test"], ["test", "dev"]].map(([on, off]) => ({ on, off, rule: tune(on), m: null }));
  for (const f of folds) f.m = measure("evidence", f.off, f.rule).m;
  const keys = Object.keys(folds[0].m).filter((k) => typeof folds[0].m[k] === "number");
  heldOut = Object.fromEntries(keys.map((k) => [k, Math.round(((folds[0].m[k] ?? 0) + (folds[1].m[k] ?? 0)) * 5) / 10]));
  heldOut.cases = folds[0].m.cases + folds[1].m.cases;
  console.log(`
Cross-validation (policy: abstain >= ${MIN_ABSTAIN}%, wrong-only <= ${MAX_WRONG_ONLY}%):`);
  for (const f of folds) console.log(`  tuned on ${f.on.padEnd(4)} ${JSON.stringify(f.rule)} -> on ${f.off}: ${JSON.stringify(f.m)}`);
  console.log(`  held-out average: ${JSON.stringify(heldOut)}`);
  rule = tune(null);
  console.log(`Limits tuned on all ${cases.length} questions: ${JSON.stringify(rule)}`);
  if (JSON.stringify(rule) !== JSON.stringify(EVIDENCE)) console.log(`  → set EVIDENCE in src/lib/evidence.js to ${JSON.stringify(rule)}`);
}

/* ---------------------------------------------------------------- report */
const report = {};
console.log(`\nIndex ${raw.version} (${raw.count} entries, built ${raw.built}); ${cases.length} questions; evidence limits ${JSON.stringify(rule)}`);
console.log("policy    split  cases precision recall falseAbstain correctAbstain wrongOnly shownWrong (asAnswer) balanced");
for (const policy of Object.keys(POLICIES)) for (const split of ["dev", "test", null]) {
  const { m, rows } = measure(policy, split, rule);
  report[`${policy}/${split || "all"}`] = m;
  if (!split) report[`${policy}/rows`] = rows;
  const f = (v) => String(v ?? "-").padStart(6);
  console.log(`${policy.padEnd(9)} ${(split || "all").padEnd(5)} ${f(m.cases)} ${f(m.precision)}    ${f(m.recall)} ${f(m.falseAbstain)}       ${f(m.correctAbstain)}         ${f(m.wrongOnly)}    ${f(m.shownWrong)} (${f(m.shownWrongSure)})  ${f(m.balanced)}`);
}
const byCat = {};
for (const r of report["evidence/rows"]) {
  const b = report["baseline/rows"].find((x) => x.id === r.id);
  (byCat[r.category] ??= []).push(`${r.id}${r.sent.length ? (r.good ? "" : "✗") : "∅"}${b.sent.length && !b.good ? "(was ✗)" : ""}`);
}
console.log("\nEvidence check per question (✗ = only wrong passages sent, ∅ = model not asked):");
for (const [c, list] of Object.entries(byCat)) console.log(`  ${c.padEnd(13)} ${list.join(" ")}`);

mkdirSync(join(ROOT, "ai-server", "results"), { recursive: true });
writeFileSync(join(ROOT, "ai-server", "results", "retrieval-eval.json"), JSON.stringify({ index: { version: raw.version, built: raw.built }, rule, heldOut, report }, null, 1));
// The questions' vectors, so tests/ai-evidence.test.js can run the real search without downloading the model.
mkdirSync(join(ROOT, "tests", "fixtures"), { recursive: true });
writeFileSync(join(ROOT, "tests", "fixtures", "retrieval-queries.json"), JSON.stringify({
  model: EMBED_MODEL, indexBuilt: raw.built,
  queries: Object.fromEntries(prepared.map((p) => [p.id, { q: p.q, vector: p.vector.map((x) => Math.round(x * 1e5) / 1e5) }])),
}));

/* ---------------------------------------------------------------- prompts for the real model */
const promptsOut = opt("--prompts");
if (promptsOut) {
  const lines = [];
  for (const p of prepared.filter((x) => !x.rule)) for (const policy of Object.keys(POLICIES)) {
    const { sent } = POLICIES[policy](p, rule);
    if (!sent.length) continue;   // the app doesn't ask the model
    lines.push({ id: p.id, policy, messages: chatMessages(p.messages, null, sent), sources: sourcesFor(sent), sent: sent.map(idOf) });
  }
  writeFileSync(promptsOut, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`\n${lines.length} prompts → ${promptsOut}. Next: cd ai-server && python answer_prompts.py --prompts ${promptsOut} --out <answers.jsonl>`);
}

/* ---------------------------------------------------------------- scoring the real model's answers */
const answersIn = opt("--answers");
if (answersIn) {
  const answers = readFileSync(answersIn, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const notFound = (t) => t.startsWith(PROMPT.notFound.slice(0, 40));
  const skip = new Set((opt("--skip") || "").split(",").filter(Boolean));
  const scoreAnswers = (policy, split, limits) => {
    const rows = prepared.filter((p) => !p.rule && !skip.has(p.id) && (!split || p.split === split)).map((p) => {
      const { sent, shown } = POLICIES[policy](p, rule);
      const rel = new Set(p.relevant);
      const a = sent.length && answers.find((x) => x.id === p.id && x.policy === policy);
      if (sent.length && !a) throw new Error(`No answer for ${p.id} (${policy}): run answer_prompts.py on the latest prompts`);
      const shownBad = shown.match && !rel.has(shown.match.id);
      const needsVet = withVetAdvice(p.q, "x") !== "x";   // a symptom, or something the pet ate (knowledge.js)
      const vetOk = (text) => withVetAdvice(p.q, text) === text;
      if (!a) return { id: p.id, answerable: rel.size > 0, outcome: "checked", generated: false, wrongCredit: shownBad ? 1 : 0, credits: shown.match ? 1 : 0, needsVet, vetShown: vetOk(shown.reply) };
      // The same check as the app (askKnowledge), with the owner's words as context.
      const check = checkAnswer(a.answer, sourcesFor(sent), { context: p.turns.join("\n"), limits });
      const declined = notFound(a.answer);
      // Before, every passage sent was credited under any generated answer; now only the ones it uses, and only if it passes the check.
      const kept = policy === "baseline" ? !declined : !declined && check.ok;
      const credited = !kept ? [] : policy === "baseline" ? sent : check.used.map((i) => sent[i]);
      const rightSent = sent.some((e) => rel.has(idOf(e)));
      // An answer's claims are judged against the passages it got, whichever policy: a law, organisation, link or
      // number they don't contain is unsupported; barely using them at all is "ungrounded".
      const claims = checkAnswer(a.answer, sourcesFor(sent), { context: p.turns.join("\n") }).problems;
      return {
        id: p.id, answerable: rel.size > 0, generated: kept, declined, rightSent, answer: a.answer, problems: check.problems,
        unsupported: claims.filter((x) => !x.startsWith("not based")), ungrounded: claims.some((x) => x.startsWith("not based")),
        needsVet, vetShown: kept ? vetOk(policy === "baseline" ? a.answer : withVetAdvice(p.q, a.answer)) : vetOk(shown.reply),
        credits: kept ? credited.length : shown.match ? 1 : 0,
        wrongCredit: kept ? credited.filter((e) => !rel.has(idOf(e))).length : shownBad ? 1 : 0,
      };
    });
    const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
    const A = rows.filter((r) => r.answerable), U = rows.filter((r) => !r.answerable);
    const gen = rows.filter((r) => r.generated);
    return { rows, m: {
      questions: rows.length,
      aiAnswered: pct(gen.length, rows.length),
      aiOnUnanswerable: pct(U.filter((r) => r.generated).length, U.length),          // the AI's answer shown where the library has none (should be 0)
      aiOnAnswerable: pct(A.filter((r) => r.generated && r.rightSent).length, A.length),   // the AI's answer shown, written with a right passage
      aiFromWrongOnly: gen.filter((r) => !r.rightSent).length,                      // AI answers shown that were written from wrong passages only
      unsupported: pct(gen.filter((r) => r.unsupported.length).length, gen.length),  // of shown AI answers: a law, body, link or number its passages lack
      ungrounded: pct(gen.filter((r) => r.ungrounded).length, gen.length),           // of shown AI answers: barely uses its passages
      creditPrecision: pct(rows.reduce((n, r) => n + r.credits - r.wrongCredit, 0), rows.reduce((n, r) => n + r.credits, 0)),
      wrongCredits: rows.reduce((n, r) => n + r.wrongCredit, 0),
      vetAdviceShown: pct(rows.filter((r) => r.needsVet && r.vetShown).length, rows.filter((r) => r.needsVet).length),   // symptom / swallowed questions whose reply says to see a vet soon
    } };
  };

  /* The answer limits, tuned on the dev half: keep as many AI answers written from a right passage as possible,
     with none written from wrong passages only; then fewer wrong credits; then the loosest limits. */
  let limits = ANSWER;
  if (CALIBRATE) {
    let best = null;
    const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    for (let uses = 0.1; uses <= 0.901; uses += 0.05) {
      const l = { uses: Math.round(uses * 100) / 100 };
      const { rows, m } = scoreAnswers("evidence", "dev", l);
      const good = rows.filter((r) => r.generated && r.rightSent).length;
      const key = [-m.aiFromWrongOnly, good, -m.wrongCredits, -l.uses];
      if (!best || better(key, best.key)) best = { key, limits: l, m };
    }
    limits = best.limits;
    console.log(`\nAnswer limits calibrated on dev: ${JSON.stringify(limits)} (dev: ${JSON.stringify(best.m)})`);
    if (JSON.stringify(limits) !== JSON.stringify(ANSWER)) console.log(`  → set ANSWER in src/lib/evidence.js to ${JSON.stringify(limits)}`);
  }
  const out = {}, details = {};
  for (const policy of Object.keys(POLICIES)) for (const split of ["dev", "test", null]) {
    const { rows, m } = scoreAnswers(policy, split, limits);
    out[`${policy}/${split || "all"}`] = m;
    if (!split) details[policy] = rows;
  }
  console.log(`\nWith the real model's answers (answer limits ${JSON.stringify(limits)}; questions answered by a rule are left out):`);
  console.table(out);
  const label = opt("--label");
  writeFileSync(join(ROOT, "ai-server", "results", `answer-eval${label ? `-${label}` : ""}.json`),
    JSON.stringify({ answers: answersIn, skipped: [...skip], limits, metrics: out, details }, null, 1));
}
