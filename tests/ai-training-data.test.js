import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeIndex, queryText } from "../src/lib/knowledge";
import { coverage } from "../src/lib/evidence";
import { HISTORY } from "../src/lib/prompt";
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
