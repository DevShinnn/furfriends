/* Builds the assistant's knowledge index: every checked Q&A and first-aid guide, turned into
   numbers by an open-source sentence model so the app can find the right answer on the
   owner's own device. Run it after changing the Q&A data (ai-server/data) or the guides.

     node scripts/build-knowledge.mjs          → public/knowledge/index.json (served by Vercel)
     node scripts/build-knowledge.mjs --eval   → accuracy test: searches the held-out test questions
                                                 with an index built WITHOUT them, then writes
                                                 ai-server/results/search-answers.jsonl for evaluate.py

   Data: ai-server/data/train.jsonl and test.jsonl, made by `python prepare_data.py`.
   Model: Xenova/all-MiniLM-L6-v2 (Apache 2.0), downloaded once from Hugging Face (about 23 MB). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { GUIDES } from "../src/lib/emergency.js";
import { EMBED_MODEL, EMBED_OPTIONS, compose, decodeIndex, encodeVectors, safetyReply, search, searchText, speciesOf, withEnglish } from "../src/lib/knowledge.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "ai-server", "data");
const args = process.argv.slice(2);
const EVAL = args.includes("--eval");
const VERSION = args.find((a) => a.startsWith("--version="))?.split("=")[1] || "search-v1";

const jsonl = (f) => readFileSync(join(DATA, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const firstUrl = (s = "") => s.match(/https?:\/\/\S+?(?=[\s),;]|$)/)?.[0] || "";

/* ---------------------------------------------------------------- what can be found */
/* Short credit shown under the answer. Stack Exchange's license (CC BY-SA) requires the author and license. */
function credit(source = "") {
  const se = source.match(/^Pets Stack Exchange.*answer by (.+?), (CC BY-SA [\d.]+)/);
  if (se) return `Pets Stack Exchange · answer by ${se[1]} · ${se[2]}`;
  return /written for this project/i.test(source) || !source ? "FurFriends team" : source.split(",")[0];
}

function qaEntries(rows) {
  return rows
    // Answers about one named pet ("Is Mochi's weight healthy?") would mislead other owners.
    .filter((r) => !r.pet?.name)
    .flatMap((r) => {
      const q = r.messages.at(-2).content, a = r.messages.at(-1).content;
      const main = {
        id: r.id, kind: "qa", cat: r.category || "", q, a,
        sp: (r.pet?.species || "").toLowerCase() || speciesOf(q),
        src: credit(r.source), url: firstUrl(r.source),
      };
      // Other ways owners ask the same thing ("my dog has fleas", "may pulgas ang aso ko") find the same answer.
      return [main, ...(r.also || []).map((ask, i) => ({ ...main, id: `${r.id}-${i + 1}`, of: r.id, ask }))];
    });
}

function guideEntries() {
  return GUIDES.flatMap((g) => [guideEntry(g), ...listEntries(g)]);
}

/* Each item of a guide's lists (e.g. each common poison) can also be found on its own,
   so "can dogs eat grapes?" finds the Poisoning guide through "Grapes and raisins". */
function listEntries(g) {
  const main = guideEntry(g);
  return (g.lists || []).flatMap((l) => l.items.map((item, i) => ({
    ...main, id: `${main.id}-${l.title.toLowerCase().replace(/\W+/g, "-")}-${i}`, of: main.id, keys: "",
    q: `${item.split(/[.:]/)[0]} (${l.title.toLowerCase()}, see the ${g.title} guide)`,
  })));
}

function guideEntry(g) {
  return {
    id: `guide-${g.slug}`, kind: "guide", cat: g.category, sp: g.species === "both" ? "" : g.species.toLowerCase(),
    q: `${g.title}: ${g.summary}`,
    // extra words it can be found by: the signs, and lists such as the common poisons
    keys: [...g.signs, ...(g.lists || []).flatMap((l) => l.items)].join(", "),
    a: [g.summary, "What to do now:\n" + g.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        g.urgency === "now" ? "Go to a vet now." : "Call your vet for advice."].join("\n\n"),
    src: "FurFriends first-aid guide", url: `#/app/emergency/${g.slug}`,
  };
}

/* ---------------------------------------------------------------- the model */
console.log(`Loading ${EMBED_MODEL} ...`);
const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const t = await extractor(texts.slice(i, i + 32), EMBED_OPTIONS);
    out.push(...t.tolist());
    process.stdout.write(`\r  ${Math.min(i + 32, texts.length)}/${texts.length}`);
  }
  process.stdout.write("\n");
  return out;
}
const toIndex = async (entries) => {
  const vectors = await embed(entries.map(searchText));
  return {
    version: VERSION, model: EMBED_MODEL, dims: vectors[0].length, built: new Date().toISOString(), count: entries.length,
    // other wordings keep only the wording and the answer they lead to (see decodeIndex)
    entries: entries.map((e) => (e.ask ? { id: e.id, of: e.of, ask: e.ask } : e)), vectors: encodeVectors(vectors),
  };
};
// Same decoding as the app, so search runs on exactly what is shipped.
const asLoaded = (index) => decodeIndex(JSON.parse(JSON.stringify(index)));

/* ---------------------------------------------------------------- build or evaluate */
const train = jsonl("train.jsonl"), test = jsonl("test.jsonl");
if (!EVAL) {
  const entries = [...qaEntries(train), ...qaEntries(test), ...guideEntries()];
  const index = await toIndex(entries);
  const out = join(ROOT, "public", "knowledge", "index.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(index));
  const n = (kind) => entries.filter((e) => e.kind === kind && !e.ask).length;
  console.log(`${entries.length} entries (${n("qa")} Q&As, ${entries.filter((e) => e.ask).length} other wordings, ${n("guide")} from ${GUIDES.length} guides) → ${out} (${(JSON.stringify(index).length / 1024).toFixed(0)} KB)`);
} else {
  // The test questions are NOT in this index, so the score is honest.
  const index = asLoaded(await toIndex([...qaEntries(train), ...guideEntries()]));
  const queries = await embed(test.map((t) => withEnglish(t.messages.at(-2).content)));
  const lines = test.map((t, i) => {
    const t0 = performance.now();
    const question = withEnglish(t.messages.at(-2).content);
    const results = search(index, queries[i], question, { species: (t.pet?.species || "").toLowerCase() || speciesOf(question) });
    const r = safetyReply(question) || compose(results, question);
    const seconds = Math.round((performance.now() - t0) / 100) / 10;
    const shown = r.match || { q: "(no answer)", score: results[0].score };
    console.log(`${t.id} ${shown.score.toFixed(2)} ${r.sure ? "SURE " : r.match ? "maybe" : "none "} ${question.slice(0, 44).padEnd(44)} -> ${shown.q.replace(/\s+/g, " ").slice(0, 70)}`);
    return JSON.stringify({ id: t.id, answer: r.reply, seconds, match_score: shown.score, matched: shown.q, source: r.match?.source || "" });
  });
  const out = join(ROOT, "ai-server", "results", "search-answers.jsonl");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\nAnswers → ${out}\nNext:  cd ai-server && python evaluate.py run --answers results/search-answers.jsonl --version ${VERSION}`);
}
