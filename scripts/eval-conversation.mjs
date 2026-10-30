/* Plays the labelled follow-up conversations through the app's own code, turn by turn, with the real model,
   to choose what of the conversation the model should see (MODEL_HISTORY in src/lib/prompt.js).

     cd ai-server && python answer_prompts.py --serve 8790        (the real model, on this computer)
     npm run eval:conversation                                     (in another terminal)

   For each conversation in ai-server/data/retrieval_eval.jsonl with more than one message, and each history
   setting ("full": everything, also the app's earlier answers; "owner": the owner's messages only; "question":
   the latest question only), every turn goes through queryText, search, planAnswer, the model, and
   reviewAnswer, and what the app would show becomes part of the conversation. The last turn is scored:
     - right:         an AI answer written from a right passage, or the checked answer showing one; for questions
                      the library can't answer, no AI answer and no wrong passage shown
     - aiAnswered:    the AI's answer is shown
     - contamination: share of the AI's raw answer made of words found in the app's earlier answers but not in
                      its passages or the owner's messages (earlier answers treated as facts)
   Writes ai-server/results/conversation-eval.json. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { EMBED_MODEL, EMBED_OPTIONS, decodeIndex, queryText, search, tokens } from "../src/lib/knowledge.js";
import { planAnswer, reviewAnswer } from "../src/lib/evidence.js";
import { chatMessages } from "../src/lib/prompt.js";
import PROMPT from "../src/lib/aiPrompt.json";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_URL = process.env.EVAL_MODEL_URL || "http://127.0.0.1:8790/";
const SETTINGS = (process.argv.find((a) => a.startsWith("--history="))?.split("=")[1] || "full,owner,question").split(",");

const index = decodeIndex(JSON.parse(readFileSync(join(ROOT, "public", "knowledge", "index.json"), "utf8")));
const cases = readFileSync(join(ROOT, "ai-server", "data", "retrieval_eval.jsonl"), "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).filter((c) => c.turns.length > 1);
const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
const vectors = new Map();
const embed = async (q) => { if (!vectors.has(q)) vectors.set(q, Array.from((await extractor(q, EMBED_OPTIONS)).data)); return vectors.get(q); };
const ask = async (messages) => {
  const res = await fetch(MODEL_URL, { method: "POST", body: JSON.stringify({ messages }), headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`model server ${res.status}`);
  return (await res.json()).answer.trim();
};
const idOf = (e) => e.of || e.id;
const notFound = (t) => t.startsWith(PROMPT.notFound.slice(0, 40));
const words = (t) => new Set(tokens(t));

/* One turn of askKnowledge() (assistant.js), with the history setting under test. */
async function turn(history, history_setting, species) {
  const last = history.at(-1).content;
  const q = queryText(history);
  const results = search(index, await embed(q), q, { species });
  const { evidence, fallback } = planAnswer(index, results, q, last);
  const out = { q, evidence: evidence.map(idOf), shown: fallback.match?.id || null, reply: fallback.reply, generated: false, raw: null };
  if (!evidence.length) return out;
  const raw = await ask(chatMessages(history, null, evidence, history_setting));
  out.raw = raw;
  if (notFound(raw)) return out;
  const context = history.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const review = reviewAnswer(raw, evidence, { context });
  if (!review.ok) return { ...out, problems: review.problems };
  return { ...out, reply: raw, generated: true, credited: review.used.map(idOf), shown: null };
}

const rows = [];
for (const setting of SETTINGS) {
  for (const c of cases) {
    const history = [];
    let t = null;
    for (const content of c.turns) {
      history.push({ role: "user", content });
      t = await turn(history, setting, c.species || "");
      history.push({ role: "assistant", content: t.reply });
    }
    const rel = new Set(c.relevant);
    const earlier = history.slice(0, -2).filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
    let contamination = 0;
    if (t.raw && !notFound(t.raw)) {
      const allowed = words(`${t.evidence.map((id) => { const e = index.entries.find((x) => x.id === id); return `${e.q} ${e.a} ${e.keys || ""}`; }).join(" ")} ${c.turns.join(" ")}`);
      const before = words(earlier), answer = [...words(t.raw)];
      contamination = answer.length ? answer.filter((w) => before.has(w) && !allowed.has(w)).length / answer.length : 0;
    }
    const right = rel.size
      ? (t.generated ? t.evidence.some((id) => rel.has(id)) : !!t.shown && rel.has(t.shown))
      : !t.generated && !t.shown;
    rows.push({ setting, id: c.id, category: c.category, answerable: rel.size > 0, right, generated: t.generated, contamination,
      wrongCredits: (t.credited || []).filter((id) => !rel.has(id)).length, q: t.q, answer: t.reply });
    process.stdout.write(`\r${setting} ${c.id}   `);
  }
}
process.stdout.write("\n");

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const summary = {};
for (const setting of SETTINGS) {
  const r = rows.filter((x) => x.setting === setting), gen = r.filter((x) => x.generated);
  summary[setting] = {
    conversations: r.length,
    right: pct(r.filter((x) => x.right).length, r.length),
    rightAnswerable: pct(r.filter((x) => x.answerable && x.right).length, r.filter((x) => x.answerable).length),
    rightUnanswerable: pct(r.filter((x) => !x.answerable && x.right).length, r.filter((x) => !x.answerable).length),
    aiAnswered: pct(gen.length, r.length),
    wrongCredits: r.reduce((n, x) => n + x.wrongCredits, 0),
    contaminated: r.filter((x) => x.contamination > 0.1).length,          // raw answers with >10% words only from earlier answers
    meanContamination: Math.round(1000 * (r.reduce((n, x) => n + x.contamination, 0) / r.length)) / 1000,
  };
}
console.table(summary);
writeFileSync(join(ROOT, "ai-server", "results", "conversation-eval.json"), JSON.stringify({ summary, rows }, null, 1));
