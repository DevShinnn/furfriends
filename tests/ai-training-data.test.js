import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeIndex, queryText } from "../src/lib/knowledge";
import { checkAnswer, coverage } from "../src/lib/evidence";
import { HISTORY, describePet } from "../src/lib/prompt";
import PROMPT from "../src/lib/aiPrompt.json";

/* The v4 training set (ai-server/data/rag_train_v4.jsonl, made by build_rag_data.py with --near-miss-share,
   --multi-turn-share and --out-of-scope). These check what the model is taught, with the app's own rules. */

const jsonl = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rows = jsonl("ai-server/data/rag_train_v4.jsonl");
const index = decodeIndex(JSON.parse(readFileSync("public/knowledge/index.json", "utf8")));
const answer = (r) => r.messages.at(-1).content;
const asked = (r) => r.messages.filter((m) => m.role === "user").map((m) => m.content);

describe("AI training data (v4)", () => {
  it("[FR10.8] No evaluation question is trained on, not even as an earlier message in a conversation", () => {
    const evals = new Set([
      ...jsonl("ai-server/data/retrieval_eval.jsonl").flatMap((c) => c.turns),
      ...JSON.parse(readFileSync("ai-server/data/safety_eval.json", "utf8")).cases.map((c) => c.q),
      ...jsonl("ai-server/data/test.jsonl").map((r) => r.messages.at(-2).content),
    ].map((q) => q.trim().toLowerCase()));
    expect(rows.flatMap(asked).filter((q) => evals.has(q.trim().toLowerCase()))).toEqual([]);
  });

  it("[FR10.8] Every \"couldn't find\" answer is word for word the one the app recognises", () => {
    const declines = rows.filter((r) => /^I couldn't find/.test(answer(r)));
    expect(declines.length).toBeGreaterThan(150);
    expect(declines.every((r) => answer(r) === PROMPT.notFound)).toBe(true);
  });

  it("[FR10.8] Conversations are in the form the app sends them: the owner's messages only, then the answer", () => {
    const convos = rows.filter((r) => r.messages.length > 2);
    expect(convos.length).toBeGreaterThan(100);
    for (const r of convos) {
      expect(r.messages.slice(0, -1).every((m) => m.role === "user")).toBe(true);
      expect(r.messages.at(-1).role).toBe("assistant");
      expect(r.messages.length - 1).toBeLessThanOrEqual(HISTORY);
    }
  });

  it("[FR10.8] A near-miss example's passages cover none of what its question asks, by the evidence check's own measure", () => {
    const near = rows.filter((r) => r.id.endsWith("-near"));
    expect(near.length).toBeGreaterThan(50);
    for (const r of near) {
      expect(answer(r)).toBe(PROMPT.notFound);
      const q = queryText([{ role: "user", content: asked(r)[0] }]);
      for (const s of r.sources) expect(coverage(q, { q: "", a: s.text }, index.keywords.idf), `${r.id}: ${s.text.slice(0, 60)}`).toBe(0);
    }
  });

  it("[FR10.8] Emergencies and poisons are never taught as \"couldn't find\"", () => {
    expect(rows.filter((r) => ["emergency", "poison"].includes(r.category) && answer(r) === PROMPT.notFound)).toEqual([]);
  });
});

/* The v7 training set (ai-server/data/rag_train_v7.jsonl): an answer written for each question from its passage
   (written_answers.py), instead of the whole checked answer that v6 learned to paste. */
describe("AI training data (v7, written answers)", () => {
  const v7 = jsonl("ai-server/data/rag_train_v7.jsonl");
  const written = v7.filter((r) => r.written_answer);
  const NOTES = /\n\nFrom [^\n]+'s records:\n[\s\S]*$/;   // the pet notes the app adds; checked by ai-pet-context.test.js
  const own = (r) => answer(r).replace(NOTES, "");
  const runs = (t) => { const w = t.toLowerCase().match(/[a-z0-9']+/g) || []; return w.slice(0, Math.max(0, w.length - 4)).map((_, i) => w.slice(i, i + 5).join(" ")); };
  const copied = (a, text) => { const have = new Set(runs(text)), r = runs(a); return r.length ? r.filter((x) => have.has(x)).length / r.length : 0; };

  it("[FR10.8] Every written answer passes the app's own evidence check, with the passages, question and pet of each example", () => {
    expect(written.length).toBeGreaterThan(850);
    const bad = written.map((r) => {
      const c = checkAnswer(own(r), r.sources, { context: [describePet(r.pet), ...asked(r)].filter(Boolean).join("\n") });
      return c.ok ? null : `${r.id}: ${c.problems.join("; ")}`;
    }).filter(Boolean);
    expect(bad).toEqual([]);
  });

  it("[FR10.8] The answers are written for their question, not a passage pasted whole", () => {
    const pasted = written.filter((r) => Math.max(...r.sources.map((s) => copied(own(r), s.text))) >= 0.9);
    expect(pasted.length / written.length).toBeLessThan(0.15);
  });

  it("[FR10.8] \"couldn't find\" is taught rarely, word for word, and never with a first-aid guide or for an emergency", () => {
    const declines = v7.filter((r) => /^I couldn't find/.test(answer(r)));
    expect(declines.every((r) => answer(r) === PROMPT.notFound)).toBe(true);
    expect(declines.length / v7.length).toBeLessThan(0.12);   // v5: 1 in 5
    expect(declines.filter((r) => r.sources.some((s) => s.label.startsWith("FurFriends first-aid guide")))).toEqual([]);
    expect(declines.filter((r) => ["emergency", "poison"].includes(r.category))).toEqual([]);
  });

  it("[FR10.8] A cat's example never gets the dogs' part, nor a dog's the cats'", () => {
    const part = { Cat: /^\s*(?:[-*]\s*)?(?:for\s+)?(dogs?|pupp(?:y|ies))\s*:/im, Dog: /^\s*(?:[-*]\s*)?(?:for\s+)?(cats?|kittens?)\s*:/im };
    expect(written.filter((r) => r.pet?.species && part[r.pet.species].test(own(r))).map((r) => r.id)).toEqual([]);
  });

  it("[FR10.8] No evaluation question is trained on, and no text is garbled", () => {
    const evals = new Set([
      ...jsonl("ai-server/data/retrieval_eval.jsonl").flatMap((c) => c.turns),
      ...JSON.parse(readFileSync("ai-server/data/safety_eval.json", "utf8")).cases.map((c) => c.q),
      ...jsonl("ai-server/data/test.jsonl").map((r) => r.messages.at(-2).content),
    ].map((q) => q.trim().toLowerCase()));
    expect(v7.flatMap(asked).filter((q) => evals.has(q.trim().toLowerCase()))).toEqual([]);
    expect(v7.filter((r) => JSON.stringify(r).includes("â€")).map((r) => r.id)).toEqual([]);   // "100â€“120": UTF-8 read as cp1252 (v2-v6)
  });
});
