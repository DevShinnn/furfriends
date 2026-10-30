/* Builds the assistant's knowledge index: every checked Q&A and first-aid guide, turned into
   numbers by an open-source sentence model so the app can find the right answer on the
   owner's own device. Run it after changing the Q&A data (ai-server/data) or the guides.

     node scripts/build-knowledge.mjs          → public/knowledge/index.json (served by Vercel)
     node scripts/build-knowledge.mjs --with-community   → also the Pets Stack Exchange answers (owners' opinions, which
                                                 nobody checked; left out since 2026-10-30, see qaEntries)
     node scripts/build-knowledge.mjs --eval   → accuracy test: searches the held-out test questions
                                                 with an index built WITHOUT them, then writes
                                                 ai-server/results/search-answers.jsonl for evaluate.py

   Data: ai-server/data/train.jsonl and test.jsonl, made by `python prepare_data.py`, and the CDC/FDA passages in
   ai-server/data/passages/gov_guides.csv, made by `python fetch_gov_guides.py`.
   Model: Xenova/all-MiniLM-L6-v2 (Apache 2.0), downloaded once from Hugging Face (about 23 MB). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { GUIDES } from "../src/lib/emergency.js";
import { BREED_DB } from "../src/lib/breeds.js";
import { readCsv } from "./csv.mjs";
import { EMBED_MODEL, EMBED_OPTIONS, compose, decodeIndex, encodeVectors, safetyReply, search, searchText, speciesOf, withEnglish } from "../src/lib/knowledge.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "ai-server", "data");
const args = process.argv.slice(2);
const EVAL = args.includes("--eval");
const COMMUNITY = args.includes("--with-community");
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
    // Only checked sources: Pets Stack Exchange answers are pet owners' opinions that nobody on the team checked.
    // On the 112 labelled questions (npm run eval:retrieval) leaving them out cost 8 of 83 answerable everyday
    // questions (cat milk, introducing cats...), which now say there's no checked answer until the team writes one
    // (docs/ai-knowledge-gaps.md). They are still used to train the model's answering style (build_rag_data.py).
    .filter((r) => COMMUNITY || !/^Pets Stack Exchange/.test(r.source || ""))
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

/* Public-domain CDC and FDA passages. src is the label the trained model saw in training (build_rag_data.py). */
function govEntries() {
  return readCsv(join(DATA, "passages", "gov_guides.csv")).map((r, i) => ({
    id: `gov-${i}`, kind: "gov", cat: r.category || "", q: r.title + (r.section ? ` — ${r.section}` : ""), a: r.text,
    sp: r.species === "Both" ? "" : (r.species || "").toLowerCase(), src: r.source.split(", http")[0], url: r.url,
  }));
}

/* The app's breed guide (breeds.js, breedCare.js), one passage per breed, so "is a husky okay in the Philippines?"
   finds what the guide says about that breed and the heat instead of whatever mentions the Philippines. Heat comes
   first: it's what most breed questions here are about, and the search reads only the start of each answer. */
const HEAT = ["", "handles hot, humid weather poorly and is at high risk of heatstroke", "struggles in hot, humid weather",
  "copes with hot weather if kept cool", "handles hot weather fairly well", "handles hot, humid weather well"];
function breedEntries() {
  return BREED_DB.map((b) => {
    const main = {
      id: `breed-${b.slug}`, kind: "breed", cat: "breeds", sp: b.species.toLowerCase(),
      q: `${b.name} (${b.species.toLowerCase()} breed): ${b.summary}`,
      keys: [...b.aka, b.coat, b.origin].join(", "),
      a: [`In a hot, humid climate like the Philippines, the ${b.name} ${HEAT[b.traits.heat]} (heat tolerance ${b.traits.heat} of 5). ${b.summary}`,
          `Care tips: ${b.tips.join(" ")}`,
          b.care && `Exercise: ${b.care.exercise}`, b.care && `Grooming: ${b.care.grooming}`,
          `Health problems to watch for: ${b.health.join("; ")}.`,
          `Typical adult weight ${b.weight[0]}–${b.weight[1]} kg; energy ${b.traits.energy} of 5.`].filter(Boolean).join("\n"),
      src: "FurFriends breed guide", url: `#/app/breeds/${b.slug}`,
    };
    return [main, { ...main, id: `${main.id}-1`, of: main.id, ask: `Is the ${b.name} a good ${b.species.toLowerCase()} for a hot, humid country?` }];
  }).flat().concat(["Dog", "Cat"].map(heatEntry));
}

/* Which breeds in the guide cope with the heat, for "what dog breed is best for a tropical country?". */
function heatEntry(species) {
  const list = BREED_DB.filter((b) => b.species === species);
  const names = (test) => list.filter((b) => test(b.traits.heat)).map((b) => `${b.name} (${b.traits.heat} of 5)`).join(", ");
  const sp = species.toLowerCase();
  return {
    id: `breed-heat-${sp}`, kind: "breed", cat: "breeds", sp,
    q: `Which ${sp} breeds handle hot, humid tropical weather best?`, keys: "climate, heat tolerance, tropical, Philippines",
    a: [`${species} breeds in the FurFriends guide that handle hot, humid weather best: ${names((h) => h >= 4) || "none rated 4 or 5"}.`,
        `Breeds that struggle in the heat and are at higher risk of heatstroke: ${names((h) => h <= 2)}.`,
        "Flat-faced and thick-coated breeds overheat most easily. Whatever the breed, give shade, fresh water and a cool room on hot days, "
        + "exercise at dawn or after sunset, and watch for heavy panting.",
        `Heat tolerance in between (3 of 5): ${names((h) => h === 3) || "none"}.`].join("\n"),
    src: "FurFriends breed guide", url: "#/app/breeds",
  };
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
  const entries = [...qaEntries(train), ...qaEntries(test), ...govEntries(), ...guideEntries(), ...breedEntries()];
  const index = await toIndex(entries);
  const out = join(ROOT, "public", "knowledge", "index.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(index));
  const n = (kind) => entries.filter((e) => e.kind === kind && !e.ask).length;
  console.log(`${entries.length} entries (${n("qa")} Q&As, ${entries.filter((e) => e.ask).length} other wordings, ${n("gov")} CDC/FDA passages, ${n("guide")} from ${GUIDES.length} guides, ${n("breed")} breeds) → ${out} (${(JSON.stringify(index).length / 1024).toFixed(0)} KB)`);
} else {
  // The test questions are NOT in this index, so the score is honest.
  const index = asLoaded(await toIndex([...qaEntries(train), ...govEntries(), ...guideEntries(), ...breedEntries()]));
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
