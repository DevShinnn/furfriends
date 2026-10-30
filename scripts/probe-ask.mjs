/* Shows what the assistant does with a question, step by step: npm run probe -- "question" ["follow-up" ...] */
import { readFileSync } from "node:fs";
import { pipeline } from "@huggingface/transformers";
import { EMBED_MODEL, EMBED_OPTIONS, decodeIndex, queryText, search } from "../src/lib/knowledge.js";
import { coverage, planAnswer } from "../src/lib/evidence.js";

const index = decodeIndex(JSON.parse(readFileSync("public/knowledge/index.json", "utf8")));
const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
const turns = process.argv.slice(2);
const q = queryText(turns.map((content) => ({ role: "user", content })));
const results = search(index, Array.from((await extractor(q, EMBED_OPTIONS)).data), q, { limit: 8 });
const { evidence, fallback } = planAnswer(index, results, q, turns.at(-1));
console.log("query:", q);
for (const r of results) console.log(`  ${r.score.toFixed(3)} cov ${coverage(q, r, index.keywords.idf).toFixed(2)} ${r.kind || "alt"} ${(r.of || r.id).padEnd(10)} ${r.q.slice(0, 80)}`);
console.log("evidence:", evidence.map((e) => e.of || e.id), "| fallback sure:", fallback.sure, "match:", fallback.match?.q);
