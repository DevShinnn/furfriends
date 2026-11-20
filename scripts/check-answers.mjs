/* The app's own check of an AI answer (checkAnswer() in src/lib/evidence.js), for answers written outside the app.
   ai-server/written_answers.py uses it so every written training answer passes the check the app applies to the
   model's answers: no law, organisation, medicine, dose, number or link that isn't in its passages, and built on a
   passage's words.

     npx vite-node scripts/check-answers.mjs -- items.json     items.json: [{"answer": "...", "sources": [{label, text}], "context": "..."}]
       → stdout: [{"ok": true, "use": [0.82, 0.31], "problems": []}, ...] */
import { readFileSync } from "node:fs";
import { checkAnswer } from "../src/lib/evidence.js";

const items = JSON.parse(readFileSync(process.argv.slice(2).find((a) => a !== "--"), "utf8"));
process.stdout.write(JSON.stringify(items.map((it) => {
  const { ok, use, problems } = checkAnswer(it.answer, it.sources, { context: it.context || "" });
  return { ok, use: use.map((u) => Math.round(u * 100) / 100), problems };
})));
