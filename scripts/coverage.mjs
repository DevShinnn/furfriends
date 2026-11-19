/* How much of a question's subject each passage covers, by the app's own rule (coverage() in src/lib/evidence.js,
   with the word weights of the app's index), the question read as the app's search reads it (queryText: Tagalog gets
   its English words). ai-server/build_rag_data.py uses it to pick look-alike passages that don't answer a question
   (near misses), so training and the evidence check agree on what "about the question" means.

     npx vite-node scripts/coverage.mjs -- pairs.json     pairs.json: [{"q": "...", "text": "..."}]
       → stdout: [{"cover": 0.4, "stems": 1}, ...]   cover: coverage(); stems: how many of the question's subject words
         the passage has even loosely (the same first 5 letters, so "dewormer" counts for "deworm") */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeIndex, queryText, tokens, withEnglish } from "../src/lib/knowledge.js";
import { coverage, subject } from "../src/lib/evidence.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = decodeIndex(JSON.parse(readFileSync(join(ROOT, "public", "knowledge", "index.json"), "utf8")));
const idf = index.keywords.idf;
const pairs = JSON.parse(readFileSync(process.argv.slice(2).find((a) => a !== "--"), "utf8"));
// A subject word is there loosely when a passage word starts with its first 5 letters (all of it, if shorter):
// "dewormer" for "deworm", "peeing" for "pee".
const starts = (t) => [3, 4, 5].map((n) => t.slice(0, n));
process.stdout.write(JSON.stringify(pairs.map((p) => {
  const q = queryText([{ role: "user", content: p.q }]);
  const have = new Set(tokens(withEnglish(p.text)).flatMap(starts));
  return { cover: Math.round(coverage(q, { q: "", a: p.text }, idf) * 1000) / 1000, stems: [...subject(q, idf).keys()].filter((w) => have.has(w.slice(0, 5))).length };
})));
