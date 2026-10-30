/* Scores the assistant's evidence step on three question sets, apart from the 112-question benchmark
   (eval-retrieval.mjs), with the app's own code and no language model:

     dev         ai-server/data/sprint_eval.jsonl      30 everyday questions, used while developing (2026-10-30 sprint)
     regression  ai-server/data/regression_eval.jsonl  the failures found in the release check, English and Tagalog
     heldout     ai-server/data/heldout_eval.jsonl     30 questions written and labelled after the code was frozen,
                                                       for reporting only: don't change code or labels to fit them

     npm run eval:sets                                 → all three
     npm run eval:sets -- --set heldout                → one
     npm run eval:sets -- --lib <dir> --index <file>   → another copy of src/lib and index.json, to compare
     npm run eval:sets -- --fixture <file>             → also writes the questions' vectors (tests/ai-regression.test.js)
     npm run eval:sets -- --citations <file>           → citation accuracy, from a real-model run ({ id: { generated, credited } })

   Each question lists the passages that answer it (`accept`; empty = the library can't, so nothing may be sent;
   `orNone`: declining is fine too). Optional: `rule: "dose"` (the no-doses reply), `urgent` (that first-aid guide is
   pinned and the reply says go now), `reject` (passages that must never be sent or shown), `exact` (exactly these
   are sent), `appetite` (the reply says to see a vet today), `duration` (the reply opens with how long the owner
   said, e.g. "Three days without eating"), `noDuration` (no such opening when no duration was given). Labels were written by reading the passages; they are
   relevance judgements, not veterinary review.

   Reported per set: accuracy (answerable questions sent a right passage), correct abstention, wrong-passage
   retrieval (any passage outside `accept` sent; and questions sent only wrong ones), citation accuracy (AI answers
   crediting only right passages) and emergency handling. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "@huggingface/transformers";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SETS = { dev: "sprint_eval.jsonl", regression: "regression_eval.jsonl", heldout: "heldout_eval.jsonl" };
const chosen = opt("--set") ? [opt("--set")] : Object.keys(SETS);

const LIB = resolve(opt("--lib") || join(ROOT, "src", "lib"));
const lib = (f) => import(pathToFileURL(join(LIB, f)).href);
const knowledge = await lib("knowledge.js"), evidenceLib = await lib("evidence.js");
const { EMBED_MODEL, EMBED_OPTIONS, chatReply, decodeIndex, queryText, safetyReply, search } = knowledge;
const { planAnswer } = evidenceLib;
const withEmergency = evidenceLib.withEmergency || ((_, reply) => reply);          // older code had none
const withAppetiteAdvice = knowledge.withAppetiteAdvice || ((_, reply) => reply);
const { urgentGuides } = await lib("emergency.js");

const raw = JSON.parse(readFileSync(resolve(opt("--index") || join(ROOT, "public", "knowledge", "index.json")), "utf8"));
const index = decodeIndex(raw);
const citations = opt("--citations") ? JSON.parse(readFileSync(resolve(opt("--citations")), "utf8")) : null;
const LAW = /^(Republic Act|IRR of RA|Executive Order|BAI NVQSD)/;
const SAYS_NOW = (t) => /\b(vet|veterinarian|clinic)\b/i.test(t) && /\b(now|immediately|right away|straight away)\b/i.test(t);
const SAYS_TODAY = (t) => /\bvet\b[^.]*\b(today|now)\b/i.test(t);
const idOf = (e) => e.of || e.id;
const pct = (a, b) => (b ? `${Math.round((1000 * a) / b) / 10}% (${a}/${b})` : "–");

const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
const fixture = { indexBuilt: raw.built, queries: {} };
const report = {};
for (const set of chosen) {
  const cases = readFileSync(join(ROOT, "ai-server", "data", SETS[set]), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rows = [];
  for (const c of cases) {
    const messages = c.turns.map((content) => ({ role: "user", content }));
    const q = queryText(messages), last = c.turns.at(-1);
    const vector = Array.from((await extractor(q, EMBED_OPTIONS)).data);
    fixture.queries[c.id] = { q, vector };
    const rule = chatReply(last) || safetyReply(q);
    const { evidence, fallback } = planAnswer(index, search(index, vector, q, {}), q, last);
    const sent = rule ? [] : evidence.map(idOf);
    const reply = withEmergency(last, withAppetiteAdvice(q, fallback.reply, "", c.turns.join("\n")));
    const accept = new Set(c.accept || []);
    const right = sent.filter((id) => accept.has(id)), wrong = sent.filter((id) => !accept.has(id));
    const problems = [];
    const answerable = !c.rule && accept.size > 0;
    if (c.rule === "dose") { if (rule?.match?.q !== "Medicine doses") problems.push("no dose safety reply"); }
    else if (answerable) { if (!right.length && !(c.orNone && !sent.length)) problems.push(sent.length ? "only wrong passages" : "declined"); }
    else if (sent.length) problems.push("should decline");
    const laws = rule ? [] : evidence.filter((e) => LAW.test(e.src || "") && !accept.has(idOf(e))).map(idOf);
    if (laws.length) problems.push(`law passages for a care question: ${laws.join(" ")}`);
    for (const id of c.reject || []) {
      if (sent.includes(id)) problems.push(`sent ${id}`);
      if (fallback.match?.id === id) problems.push(`shows ${id} as the answer`);
    }
    if (c.exact && sent.join() !== c.exact.join()) problems.push(`sent ${sent.join(",") || "nothing"}, not exactly ${c.exact.join(",")}`);
    if (c.appetite && !SAYS_TODAY(reply)) problems.push("doesn't say to see a vet today");
    if (c.duration && !reply.startsWith(`${c.duration} without eating`)) problems.push(`doesn't open with "${c.duration} without eating"`);
    if (c.noDuration && /without eating is serious/.test(reply)) problems.push("adds a duration note though no duration was given");
    let urgentOk = null;
    if (c.urgent) {
      urgentOk = urgentGuides(last).some((g) => g.slug === c.urgent) && SAYS_NOW(reply);
      if (!urgentOk) problems.push("emergency not handled (guide not pinned or no 'go now')");
    }
    const cite = citations?.[`${set}:${c.id}`] || citations?.[c.id];
    const citeOk = cite?.generated ? cite.credited.length > 0 && cite.credited.every((id) => accept.has(id)) : null;
    rows.push({ id: c.id, category: c.category, answerable, orNone: !!c.orNone, rule: !!c.rule, sent, right: right.length, wrong: wrong.length, urgentOk, citeOk, ok: !problems.length, problems });
  }
  const A = rows.filter((r) => r.answerable), U = rows.filter((r) => !r.answerable && !r.rule && !r.orNone), E = rows.filter((r) => r.urgentOk !== null);
  const C = rows.filter((r) => r.citeOk !== null);
  const m = {
    questions: rows.length, passed: rows.filter((r) => r.ok).length,
    accuracy: pct(A.filter((r) => r.right > 0).length, A.length),
    correctAbstention: pct(U.filter((r) => !r.sent.length).length, U.length),
    anyWrongPassage: pct(rows.filter((r) => r.wrong > 0).length, rows.length),
    onlyWrongPassages: pct(rows.filter((r) => r.wrong > 0 && !r.right).length, rows.length),
    citationAccuracy: citations ? pct(C.filter((r) => r.citeOk).length, C.length) : "not measured (no --citations)",
    emergencyHandled: pct(E.filter((r) => r.urgentOk).length, E.length),
  };
  report[set] = { ...m, rows };
  console.log(`\n=== ${set} (${SETS[set]})`);
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(4)} ${r.category.padEnd(18)} ${r.sent.join(" ") || "(none)"}${r.problems.length ? "  ← " + r.problems.join("; ") : ""}`);
  console.log(Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(" · "));
}
if (opt("--fixture")) writeFileSync(resolve(opt("--fixture")), JSON.stringify(fixture));
if (opt("--out")) writeFileSync(resolve(opt("--out")), JSON.stringify({ index: index.version, entries: index.entries.length, built: raw.built, report }, null, 1));
