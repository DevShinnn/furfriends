/* Pet-profile test: how a model answers about an owner's own pet, on pets and questions it was never trained on.

     npm run eval:pets -- --prompts ai-server/results/pets          → pets-full.jsonl and pets-basic.jsonl there
     cd ai-server && python answer_prompts.py --prompts results/pets/pets-full.jsonl --out results/pets/answers-v6.jsonl --model exports/furfriends-rag-v6
     cd ai-server && python answer_prompts.py --prompts results/pets/pets-basic.jsonl --out results/pets/answers-v2.jsonl --model exports/furfriends-rag-v2
     npm run eval:pets -- --score ai-server/results/pets/answers-v6.jsonl --context full --label v6
     npm run eval:pets -- --score ai-server/results/pets/answers-v2.jsonl --context basic --label v2

   Pets: the "eval" pets in ai-server/data/training_pets.json (1 in 5 of the training account's pets, never trained
   on; made up, SIMULATED). Questions: the single-question cases of the evaluation sets (retrieval_eval, heldout_eval,
   sprint_eval) that aren't in the v6 training data, fitted to the pet's species and age. Each pet gets one question
   its records are about (the app adds notes from them) and one that isn't, if the app would ask the model.
   The prompts are the app's own (search, planAnswer, chatMessages): "full" is the whole profile (rag-v6 on),
   "basic" what earlier models get (knowsProfiles in src/lib/prompt.js).

   Scored as the app does it (assistant.js): the model's own pet notes are stripped, then reviewAnswer checks the
   answer against its passages. Also counted, on the answer text:
     invented   a health word (diabetes, kidney, allergy, ...) that is in neither the prompt (pet details, passages)
                nor the question: the model saying something about the pet that nothing told it
     species    "your dog" to a cat owner, or the other way round
     pronoun    he/him for a female pet, or she/her for a male one, in the model's answer; "shown" is the same check
                on what the owner sees, after the app switches he/she to the pet's sex (matchPronouns, petAnswers.js)
   These are word checks: read the flagged answers before reporting them. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { EMBED_MODEL, EMBED_OPTIONS, chatReply, decodeIndex, queryText, safetyReply, search } from "../src/lib/knowledge.js";
import { checkAnswer, planAnswer } from "../src/lib/evidence.js";
import { MODEL_HISTORY, basicPet, chatMessages, conversation, describePet, petContext, sourcesFor } from "../src/lib/prompt.js";
import { noteQuery, petNotes, stripPetNotes } from "../src/lib/petNotes.js";
import { matchPronouns } from "../src/lib/petAnswers.js";
import PROMPT from "../src/lib/aiPrompt.json";
import { asOfToday } from "./simPets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const lines = (f) => read(f).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const hash = (s) => [...s].reduce((h, c) => ((h * 33) ^ c.charCodeAt(0)) >>> 0, 5381);

const pets = JSON.parse(read("ai-server/data/training_pets.json")).pets.filter((p) => p.split === "eval").map((p) => asOfToday(p));
const CAT = /\b(cats?|kittens?|kitty|pusa|kuting)\b/i, DOG = /\b(dogs?|pupp(y|ies)|tuta|aso)\b/i, YOUNG = /\b(kittens?|kuting|pupp(y|ies)|tuta)\b/i;
const fits = (q, pet) => {
  const cat = CAT.test(q), dog = DOG.test(q);
  if (cat && !dog && pet.species !== "Cat") return false;
  if (dog && !cat && pet.species !== "Dog") return false;
  const young = (petContext(pet).lifeStage || "") === "young" || (pet.ageYears || 0) * 12 + (pet.ageMonths || 0) < 12;
  return YOUNG.test(q) === young || !YOUNG.test(q);
};

/* ---------------------------------------------------------------- prompts */
const promptDir = opt("--prompts");
if (promptDir) {
  const trained = new Set(lines("ai-server/data/rag_train_v6.jsonl").flatMap((r) => r.messages.filter((m) => m.role === "user").map((m) => norm(m.content))));
  const pool = [...lines("ai-server/data/retrieval_eval.jsonl"), ...lines("ai-server/data/heldout_eval.jsonl"), ...lines("ai-server/data/sprint_eval.jsonl")]
    .filter((c) => c.turns.length === 1 && !/breed/.test(c.category || "") && !trained.has(norm(c.turns[0])));
  const raw = JSON.parse(read("public/knowledge/index.json"));
  const index = decodeIndex(raw);
  console.log(`Loading ${EMBED_MODEL} ...`);
  const extractor = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });   // as in embedWorker.js
  const cases = [];
  for (const c of pool) {
    const messages = [{ role: "user", content: c.turns[0] }];
    const q = queryText(messages);
    if (chatReply(c.turns[0]) || safetyReply(q)) continue;   // the app answers these itself
    cases.push({ ...c, messages, q, vector: Array.from((await extractor(q, EMBED_OPTIONS)).data) });
  }
  const evidenceFor = (c, pet) => planAnswer(index, search(index, c.vector, c.q, { species: pet.species.toLowerCase() }), c.q, c.turns[0]).evidence;
  const rows = [];
  for (const pet of pets) {
    const ctx = petContext(pet);
    const order = cases.filter((c) => fits(c.turns[0], pet)).sort((a, b) => hash(pet.id + a.id) - hash(pet.id + b.id));
    for (const related of [true, false]) {
      for (const c of order) {
        const topics = petNotes(noteQuery(c.messages), ctx).map((x) => x.rule || x.topic);
        if (!!topics.length !== related) continue;
        const evidence = evidenceFor(c, pet);
        if (!evidence.length) continue;   // the app doesn't ask the model
        rows.push({ id: `${pet.id.slice(0, 8)}-${c.id}`, pet: pet.id, q: c.id, question: c.turns[0], related, topics, evidence });
        break;
      }
    }
  }
  mkdirSync(join(ROOT, promptDir), { recursive: true });
  for (const [name, full] of [["pets-full", true], ["pets-basic", false]]) {
    const out = rows.map((r) => {
      const pet = pets.find((p) => p.id === r.pet);
      return JSON.stringify({ id: r.id, policy: "evidence", pet: r.pet, q: r.q, related: r.related, topics: r.topics,
        messages: chatMessages([{ role: "user", content: r.question }], pet, r.evidence, MODEL_HISTORY, full),
        sources: sourcesFor(r.evidence), sent: r.evidence.map((e) => e.of || e.id) });
    });
    writeFileSync(join(ROOT, promptDir, `${name}.jsonl`), out.join("\n") + "\n");
  }
  console.log(`${pets.length} evaluation pets, ${cases.length} questions not in the training data: ${rows.length} prompts `
    + `(${rows.filter((r) => r.related).length} about something in the pet's records) → ${promptDir}/pets-full.jsonl, pets-basic.jsonl`);
}

/* ---------------------------------------------------------------- scoring */
const scoreFile = opt("--score");
if (scoreFile) {
  const full = (opt("--context") || "full") === "full";
  const label = opt("--label") || (full ? "full" : "basic");
  const own = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const prompts = new Map(own(join(dirname(resolve(scoreFile)), full ? "pets-full.jsonl" : "pets-basic.jsonl")).map((p) => [p.id, p]));
  const answers = own(resolve(scoreFile));
  const stored = JSON.parse(read("ai-server/data/training_pets.json")).pets;
  const HEALTH = ["diabet", "insulin", "kidney", "arthrit", "allerg", "pregnan", "heart", "seizure", "epilep", "thyroid", "cancer", "tumou?r",
    "overweight", "obes", "underweight", "spay", "neuter", "surgery", "infection", "parvo", "distemper", "senior", "elderly", "diarrh", "vomit", "limp", "itch", "flea", "tick", "worm"];
  const rows = answers.map((a) => {
    const p = prompts.get(a.id);
    if (!p) throw new Error(`${a.id} isn't in the ${full ? "full" : "basic"} prompts`);
    const pet = asOfToday(stored.find((x) => x.id === p.pet));
    const ctx = petContext(pet);
    const reply = stripPetNotes(a.answer);
    const question = p.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const declined = reply.startsWith(PROMPT.notFound.slice(0, 40));
    // assistant.js: reviewAnswer(reply, evidence, { context }) = checkAnswer on sourcesFor(evidence), saved in the prompt.
    const context = [describePet(full ? ctx : basicPet(ctx)), ...conversation([{ role: "user", content: question }]).map((m) => m.content)].join("\n");
    const review = declined ? null : checkAnswer(reply, p.sources, { context });
    const given = p.messages.map((m) => m.content).join("\n").toLowerCase();
    const invented = HEALTH.filter((w) => new RegExp(`\\b${w}`, "i").test(reply) && !new RegExp(`\\b${w}`, "i").test(given));
    const species = pet.species === "Cat" ? /\byour (dog|puppy)\b/i.test(reply) : /\byour (cat|kitten)\b/i.test(reply);
    const wrongSex = (text) => (pet.gender === "Female" ? /\b(he|him|his)\b/i.test(text) : pet.gender === "Male" ? /\b(she|her|hers)\b/i.test(text) : false);
    const pronoun = wrongSex(reply);
    const shown = matchPronouns(reply, pet, { asked: question });
    return { id: a.id, pet: pet.name, species: pet.species, gender: pet.gender, related: p.related, topics: p.topics, declined, accepted: !!review?.ok,
      problems: review?.problems || [], modelNotes: a.answer !== reply, usesName: reply.includes(pet.name), invented, wrongSpecies: species,
      pronoun, pronounShown: wrongSex(shown), words: reply.split(/\s+/).length, question, reply, ...(shown !== reply && { shown }) };
  });
  const pct = (f, of = rows) => `${Math.round((1000 * of.filter(f).length) / (of.length || 1)) / 10}% (${of.filter(f).length}/${of.length})`;
  const report = {
    model: label, context: full ? "full profile" : "basic pet details", prompts: rows.length,
    answered: pct((r) => !r.declined), acceptedByEvidenceCheck: pct((r) => r.accepted),
    inventedHealthWord: pct((r) => r.invented.length), wrongSpecies: pct((r) => r.wrongSpecies), wrongPronoun: pct((r) => r.pronoun),
    wrongPronounShown: pct((r) => r.pronounShown),
    wroteOwnPetNotes: pct((r) => r.modelNotes), usesPetName: pct((r) => r.usesName),
    relatedAccepted: pct((r) => r.accepted, rows.filter((r) => r.related)), unrelatedAccepted: pct((r) => r.accepted, rows.filter((r) => !r.related)),
    meanWords: Math.round(rows.reduce((n, r) => n + r.words, 0) / (rows.length || 1)),
  };
  console.log(JSON.stringify(report, null, 1));
  const flagged = rows.filter((r) => r.invented.length || r.wrongSpecies || r.pronoun);
  for (const r of flagged) {
    console.log(`\n${r.id} ${r.pet} (${r.gender} ${r.species})${r.invented.length ? ` invented: ${r.invented.join(", ")}` : ""}${r.wrongSpecies ? " WRONG SPECIES" : ""}`
      + `${r.pronoun ? ` pronoun${r.pronounShown ? ", STILL WRONG AS SHOWN" : ", fixed as shown"}` : ""}\n  Q: ${r.question}\n  A: ${r.reply.slice(0, 400).replace(/\n/g, " ")}`
      + `${r.shown ? `\n  Shown: ${r.shown.slice(0, 400).replace(/\n/g, " ")}` : ""}`);
  }
  writeFileSync(join(dirname(resolve(scoreFile)), `pets-eval-${label}.json`), JSON.stringify({ report, rows }, null, 1));
}
if (!promptDir && !scoreFile) console.log("Use --prompts <dir> or --score <answers.jsonl> --context full|basic --label <name> (see the top of this file).");
