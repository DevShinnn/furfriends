import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../src/lib/supabase";
import { decodeIndex, queryText, search, withEnglish } from "../src/lib/knowledge";
import { EMERGENCY_NOTE, EVIDENCE, checkAnswer, planAnswer, selectEvidence, withEmergency } from "../src/lib/evidence";
import { BREED_DB } from "../src/lib/breeds";
import { sourcesFor } from "../src/lib/prompt";
import { urgentGuides } from "../src/lib/emergency";
import PROMPT from "../src/lib/aiPrompt.json";

/* The assistant's evidence check, on the real knowledge index (public/knowledge/index.json) and the labelled
   questions in ai-server/data/retrieval_eval.jsonl. The questions' vectors come from
   tests/fixtures/retrieval-queries.json (written by npm run eval:retrieval), so no model is downloaded here.
   The end-to-end tests run askAssistant() itself, with the browser's search worker and the AI server faked. */

const raw = JSON.parse(readFileSync("public/knowledge/index.json", "utf8"));
const index = decodeIndex(raw);
const fixture = JSON.parse(readFileSync("tests/fixtures/retrieval-queries.json", "utf8"));
const cases = Object.fromEntries(readFileSync("ai-server/data/retrieval_eval.jsonl", "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((c) => [c.id, c]));

const idOf = (e) => e.of || e.id;
function plan(id) {
  const c = cases[id], { q, vector } = fixture.queries[id];
  const results = search(index, vector, q, { species: c.species || "" });
  return { c, q, results, ...planAnswer(index, results, q, c.turns.at(-1)) };
}
const isLaw = (e) => /^(Republic Act|IRR of RA)/.test(e.src || "");

describe("AI evidence: the fixtures match the index and the questions", () => {
  it("The stored question vectors were made for this index and these questions (rerun npm run eval:retrieval if not)", () => {
    expect(fixture.indexBuilt).toBe(raw.built);
    for (const [id, c] of Object.entries(cases)) {
      expect(fixture.queries[id]?.q, id).toBe(queryText(c.turns.map((content) => ({ role: "user", content }))));
    }
  });

  it("The limits in the app are the ones the evaluation calibrated and reported", () => {
    const report = JSON.parse(readFileSync("ai-server/results/retrieval-eval.json", "utf8"));
    expect(report.rule).toEqual(EVIDENCE);
  });
});

describe("AI evidence: which passages the model may answer from", () => {
  it("The reported question (best dog breed for a tropical country) gets the breed guide on the heat, and no law is offered", () => {
    for (const species of ["", "dog"]) {
      const c = cases.o01, { q, vector } = fixture.queries.o01;
      const results = search(index, vector, q, { species });
      const { evidence, fallback } = planAnswer(index, results, q, c.turns.at(-1));
      expect(evidence.map(idOf)).toContain("breed-heat-dog");
      expect(evidence.filter(isLaw)).toEqual([]);
      expect(fallback.match.id).toBe("breed-heat-dog");
      expect(fallback.related.map((r) => r.q).join(" ")).not.toMatch(/dog meat|put to sleep|legal/i);
    }
  });

  it("Regression: 'Is a Siberian Husky suitable for the Philippines?' is answered from the Husky's breed guide (heat, cooling, exercise), never from laws", () => {
    for (const id of ["o04", "m01", "w06"]) {
      const { evidence } = plan(id);
      expect(evidence.map(idOf)[0], id).toBe("breed-siberian-husky");
      expect(evidence.every((e) => e.src === "FurFriends breed guide"), id).toBe(true);   // the Husky's guide, maybe the heat summary
      expect(evidence[0].a).toMatch(/hot, humid climate.*heatstroke/s);
      expect(evidence[0].a).toMatch(/air-con|shaded room/);
      expect(evidence[0].a).toMatch(/dawn or after sunset/);
    }
  });

  it("Every breed in the breed guide can be found (the index was rebuilt after the guide changed)", () => {
    for (const b of BREED_DB) expect(index.entries.some((e) => e.id === `breed-${b.slug}`), b.name).toBe(true);
  });

  it("A law passage is evidence only for a question about rules, rights or penalties", () => {
    const law = index.entries.find((e) => e.id === "q41a64b");   // RA 9482: walking a dog without a leash
    const as = (question) => selectEvidence([{ ...law, score: 0.66 }], question, index.keywords.idf, { rule: { ...EVIDENCE, cover: 0 } }).evidence.length;
    expect(as("Is it okay to walk my dog in Manila at noon?")).toBe(0);
    expect(as("Can my dog walk in Manila without a leash?")).toBe(1);
  });

  it("Prices and other animals are out of scope: nothing is sent, even when a passage shares words", () => {
    const passage = (id) => ({ ...index.entries.find((e) => e.id === id), score: 0.95 });
    expect(planAnswer(index, [passage("breed-shih-tzu")], "How much is a Shih Tzu puppy in Manila?", "How much is a Shih Tzu puppy in Manila?").evidence).toEqual([]);
    expect(planAnswer(index, [passage("gov-202")], "How do I care for my pet turtle?", "How do I care for my pet turtle?").evidence).toEqual([]);
    // An emergency still gets its first-aid guide, and a question about a dog isn't "another animal".
    expect(planAnswer(index, [], "A snake bit my pet", "A snake bit my pet").evidence.map(idOf)).toEqual(["guide-snake"]);
    expect(planAnswer(index, [passage("q0c19b6")], "How often should I feed my dog?", "How often should I feed my dog?").evidence.map(idOf)).toEqual(["q0c19b6"]);
  });

  it("Questions that only share a place or a legal word with the law Q&As get no law passages", () => {
    for (const id of ["o06", "o08", "o10", "o11", "o16", "o21", "o22", "o24", "o27", "o28", "m09"]) {
      const { evidence } = plan(id);
      expect(evidence.filter(isLaw).map(idOf), id).toEqual([]);
    }
  });

  it("Real legal questions still get the right law (English and Tagalog)", () => {
    for (const id of ["l01", "l04", "l05", "l08", "t08"]) {
      const { c, evidence } = plan(id);
      expect(evidence.some((e) => c.relevant.includes(idOf(e))), id).toBe(true);
    }
  });

  it("Questions the library has no answer for get no passages", () => {
    for (const id of ["o02", "o09", "o12", "o13", "o14", "o17", "o19", "o20", "o23", "o25"]) {
      expect(plan(id).evidence.map(idOf), id).toEqual([]);
    }
  });

  it("Emergencies the app recognises always get their first-aid guide first, and every emergency gets a right passage", () => {
    for (const [id, guide] of [["e01", "guide-poisoning"], ["e03", "guide-bloat"], ["e04", "guide-snake"], ["e05", "guide-seizure"], ["e06", "guide-accident"]]) {
      expect(plan(id).evidence[0]?.id, id).toBe(guide);
    }
    // "Keeps going to the litter box but nothing comes out" isn't caught by the emergency check (emergency.js
    // URGENT) yet, but the checked answer about a blocked bladder is still the evidence.
    for (const id of ["e01", "e02", "e03", "e04", "e05", "e06"]) {
      const { c, evidence } = plan(id);
      expect(evidence.some((e) => c.relevant.includes(idOf(e))), id).toBe(true);
    }
  });

  it("Everyday questions in English, Tagalog, and about cats or dogs get a passage that answers them", () => {
    // (s01 dog food for cats and s02 kneading were answered only by Stack Exchange posts, which the app no longer
    // searches: until the team writes checked answers, the library has none. docs/ai-knowledge-gaps.md)
    for (const id of ["r01", "r03", "r11", "r14", "r27", "t05", "t06", "t07", "s03"]) {
      const { c, evidence } = plan(id);
      expect(evidence.length, id).toBeGreaterThan(0);
      expect(evidence.some((e) => c.relevant.includes(idOf(e))), id).toBe(true);
    }
  });

  it("A passage about the other animal isn't used when the question names one", () => {
    for (const id of ["s01", "s02", "s03", "r06", "r28"]) {
      const { evidence } = plan(id);
      expect(evidence.filter((e) => e.sp === "dog").map(idOf), id).toEqual([]);
    }
  });
});

describe("AI follow-ups, Tagalog and keywords: what the search is asked", () => {
  const qt = (...turns) => queryText(turns.map((content) => ({ role: "user", content })));

  it("A follow-up keeps the subject of the message it refers to, however long it is", () => {
    expect(qt("Is a Siberian Husky a good family dog?", "Is that breed suitable for a hot tropical climate like ours?")).toMatch(/Husky.*tropical/);
    expect(qt("My dog ate some grapes", "Is that something I should take him to the vet for right away?")).toMatch(/grapes.*vet/);
    expect(qt("Can dogs eat chocolate?", "What happens if he already ate a small piece of it?")).toMatch(/chocolate.*piece/);
    expect(qt("Ayaw kumain ng pusa ko", "tatlong araw na po")).toMatch(/not eating.*days/);
  });

  it("A chain of follow-ups resolves step by step", () => {
    expect(qt("My dog has ticks", "How do I remove them?", "Can they make him sick?")).toMatch(/ticks.*remove.*sick/);
  });

  it("A new animal replaces the old one in a follow-up", () => {
    const q = qt("How often should I deworm my puppy?", "what about kittens?");
    expect(q).toMatch(/deworm.*kittens/);
    expect(q).not.toMatch(/puppy/);
  });

  it("A new topic stands alone, even after a long conversation", () => {
    expect(qt("How often should I bathe my dog?", "My cat is vomiting a lot, what should I do?")).not.toMatch(/bathe/);
    expect(qt("How often should I bathe my dog?", "Is it okay to give grapes to dogs as a treat?")).not.toMatch(/bathe/);   // "is it okay to" points forward
    expect(qt("Can dogs eat grapes?", "How do I take care of a hamster?")).not.toMatch(/grapes/);
    expect(qt("How often should I bathe my dog?", "Why does my cat knead blankets?")).not.toMatch(/bathe/);
  });

  it("Follow-ups get a passage that answers them", () => {
    for (const id of ["f01", "f02", "f03", "f04", "f05", "f07", "f08", "f12", "m06", "m08"]) {
      const { c, evidence } = plan(id);
      expect(evidence.some((e) => c.relevant.includes(idOf(e))), id).toBe(true);
    }
  });

  it("A follow-up asking something the library doesn't cover gets nothing from the earlier topic", () => {
    expect(plan("m09").evidence.map(idOf), "cost of kitten vaccines").toEqual([]);
  });

  it("Tagalog question words are translated, not taken for the subject, and Tagalog questions find their answer", () => {
    expect(withEnglish("Kailangan ko bang iparehistro ang aso ko?")).toBe("need register dog ?");
    expect(withEnglish("Ilang beses dapat paliguan ang aso?")).toMatch(/how often should bath dog/);
    for (const id of ["t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08"]) {
      const { c, evidence } = plan(id);
      expect(evidence.some((e) => c.relevant.includes(idOf(e))), id).toBe(true);
    }
  });

  it("One shared word (Philippines) no longer gives a passage the full keyword bonus; matching the whole question does", () => {
    const at = (id) => index.entries.findIndex((e) => e.id === id);
    expect(index.keywords(fixture.queries.o01.q)[at("q0f7a59")]).toBeLessThan(0.4);
    expect(index.keywords("Can dogs eat grapes?")[at("q7bf34c")]).toBe(1);
  });
});

describe("AI safety: emergencies, vet advice, doses", () => {
  const safety = JSON.parse(readFileSync("ai-server/data/safety_eval.json", "utf8")).cases;

  it("Emergencies are recognised in English and Tagalog, and look-alikes don't raise an alarm", () => {
    for (const { q, guide } of safety) {
      const got = urgentGuides(q).map((g) => g.slug);
      if (guide) expect(got, q).toContain(guide);
      else expect(got, q).toEqual([]);
    }
  });

  it("A pet named Lily isn't a lily poisoning", () => {
    expect(urgentGuides("my kitten ate a lily").map((g) => g.slug)).toContain("poisoning");
    expect(urgentGuides("My cat Lily is sneezing")).toEqual([]);
    expect(urgentGuides("Lily my dog won't eat")).toEqual([]);
  });

  it("Heatstroke is recognised from collapse or hard panting in the heat, not from collapse alone", () => {
    expect(urgentGuides("My dog collapsed after a walk in the heat and is panting hard").map((g) => g.slug)).toContain("heatstroke");
    expect(urgentGuides("my dog is panting heavily after playing in the sun").map((g) => g.slug)).toContain("heatstroke");
    expect(urgentGuides("my dog's back legs collapsed when he stood up").map((g) => g.slug)).not.toContain("heatstroke");
  });

  it("An emergency reply always says to go to a vet now, without repeating it when it already does", () => {
    expect(withEmergency("My dog was hit by a car", "Keep him still and warm.")).toBe(`Keep him still and warm.\n\n${EMERGENCY_NOTE}`);
    expect(withEmergency("Nasagasaan ang aso ko", "Keep him still.")).toContain(EMERGENCY_NOTE);
    expect(withEmergency("My dog was hit by a car", "Go to a vet now.")).toBe("Go to a vet now.");
    expect(withEmergency("How often should I bathe my dog?", "Every 1 to 3 months.")).toBe("Every 1 to 3 months.");
  });

  it("An AI answer that names a medicine its passages don't is rejected; one they name (to warn) is fine", () => {
    const src = [{ label: "x", text: "Q: My dog is itchy\nA: Itching is often caused by fleas or allergies. See your vet, who can find the cause. Never give paracetamol." }];
    expect(checkAnswer("Itching is often caused by fleas or allergies. Give Benadryl and see your vet, who can find the cause.", src).problems.join()).toMatch(/medicine the sources don't: benadryl/);
    expect(checkAnswer("Itching is often caused by fleas or allergies. Never give paracetamol. See your vet, who can find the cause.", src).ok).toBe(true);
  });

  it("An AI answer that gives a medicine dose is rejected, even if a passage has one", () => {
    const src = [{ label: "x", text: "Amoxicillin is an antibiotic. Some vets give 250 mg twice a day for infections." }];
    expect(checkAnswer("Amoxicillin is an antibiotic. Some vets give 250 mg twice a day for infections.", src).problems).toContain("gives a medicine dose");
  });
});

describe("AI evidence: checking what the model wrote", () => {
  const sources = [
    { label: "FurFriends checked answer", text: "Q: Do I need to register my dog?\nA: Yes. Under Section 5 of RA 9482, dog owners must register their dogs with the city or municipality and vaccinate them every year." },
    { label: "FurFriends checked answer", text: "Q: How often should I bathe my dog?\nA: Most dogs need a bath every 1 to 3 months. Use a dog shampoo, never human shampoo." },
  ];

  it("A law, section or organisation that isn't in the passages is rejected", () => {
    expect(checkAnswer("Yes, under Republic Act No. 8485 you must register your dog with the city every year.", sources).problems.join()).toMatch(/law not in the sources: Republic Act No\. 8485/);
    expect(checkAnswer("Yes. Section 9 says owners must register their dogs with the city every year.", sources).problems.join()).toMatch(/Section 9/);
    expect(checkAnswer("The ASPCA says owners must register their dogs with the city every year.", sources).problems.join()).toMatch(/ASPCA/);
  });

  it("A law that is in the passages is fine, and only the passage the answer uses is credited", () => {
    const r = checkAnswer("Yes. Section 5 of RA 9482 says dog owners must register their dogs with the city or municipality and vaccinate them every year.", sources);
    expect(r.ok).toBe(true);
    expect(r.used).toEqual([0]);
  });

  it("A number that isn't in the passages is rejected; a 24-hour clinic is FurFriends' own advice", () => {
    expect(checkAnswer("Bathe your dog every 2 weeks with a dog shampoo, never human shampoo.", sources).problems.join()).toMatch(/number not in the sources: 2/);
    expect(checkAnswer("Bathe most dogs every 1 to 3 months with a dog shampoo, never human shampoo. If the skin is red, call a 24-hour clinic.", sources).ok).toBe(true);
  });

  it("An answer that doesn't come from its passages is rejected, and a passage it only touches isn't credited", () => {
    const off = "Huskies were bred for pulling sleds in the snow, so they can overheat quickly in hot weather.";
    expect(checkAnswer(off, sources).problems.join()).toMatch(/not based on the sources/);
    // Mostly the first passage, with one word ("dog shampoo") of the second: only the first is credited.
    const r = checkAnswer("Yes. Section 5 of RA 9482 says dog owners must register their dogs with the city or municipality. Use a dog shampoo.", sources);
    expect(r.ok).toBe(true);
    expect(r.used).toEqual([0]);
  });
});

/* ---------------------------------------------------------------- askAssistant() end to end */
describe("AI evidence: what the owner sees (askAssistant end to end)", () => {
  let askAssistant, serverReply, serverCalls;
  const vectors = new Map(Object.values(fixture.queries).map((x) => [x.q, x.vector]));

  beforeAll(async () => {
    // The search model runs in a Web Worker in the browser: answer with the stored vectors instead.
    globalThis.Worker = class {
      postMessage({ id, text }) { setTimeout(() => this.onmessage({ data: vectors.has(text) ? { id, vector: vectors.get(text) } : { id, error: `no vector for ${text}` } })); }
    };
    if (!globalThis.TextDecoderStream) globalThis.TextDecoderStream = (await import("node:stream/web")).TextDecoderStream;
    vi.stubGlobal("fetch", async (url, init) => {
      if (String(url).endsWith("knowledge/index.json")) return new Response(JSON.stringify(raw));
      serverCalls.push(JSON.parse(init.body));
      return new Response(serverReply, { headers: { "X-Model": "rag-v2" } });
    });
    ({ askAssistant } = await import("../src/lib/assistant"));
  });
  beforeEach(() => {
    serverCalls = [];
    serverReply = "";
    supabase.state.session = { access_token: "test-token", user: { id: "u1" } };
  });
  const ask = (id, pet = null) => askAssistant({ messages: cases[id].turns.map((content) => ({ role: "user", content })), pet });

  it("The reported tropical-breed question: the AI gets only the breed guide, an answer citing a law is rejected, and no law is shown or credited", async () => {
    serverReply = "Under Republic Act No. 9482 ...";   // what a wrongly prompted model might say
    for (const pet of [null, { id: "p1", name: "Bantay", species: "Dog", breed: "", medical: [], vaccinations: [] }]) {
      serverCalls = [];
      const r = await ask("o01", pet);
      expect(serverCalls).toHaveLength(1);
      expect(serverCalls[0].sources.map((s) => s.label).join()).toMatch(/^FurFriends breed guide/);
      expect(JSON.stringify(serverCalls[0].sources)).not.toMatch(/9482|8485|Republic Act/);
      expect(r.generated).toBeFalsy();
      expect(r.reply).not.toMatch(/9482|8485|Republic Act/);
      expect(r.match.source).toBe("FurFriends breed guide");
    }
  });

  it("Regression, end to end: the Husky question is answered from the Husky's guide and credited to it; a sledding story is rejected", async () => {
    const husky = index.entries.find((e) => e.id === "breed-siberian-husky");
    serverReply = husky.a.split("\n").slice(0, 2).join(" ");   // an answer written from the passage
    let r = await ask("o04");
    expect(serverCalls[0].sources[0]).toEqual(sourcesFor([husky])[0]);
    expect(serverCalls[0].sources.every((s) => s.label.startsWith("FurFriends breed guide"))).toBe(true);
    expect(r.generated).toBe(true);
    expect(r.sources.map((s) => s.id)).toEqual(["breed-siberian-husky"]);
    expect(r.reply).toMatch(/heat/);
    serverReply = "Siberian Huskies were bred by the Chukchi people to pull sleds across the snow for long distances.";
    r = await ask("o04");
    expect(r.generated).toBeFalsy();
    expect(r.reply).not.toMatch(/sled|Chukchi/);
  });

  it("A question with evidence goes to the AI with only that evidence, and the passage it uses is credited", async () => {
    const { evidence } = plan("r11");
    const passage = evidence[0];
    serverReply = passage.a.split(/(?<=\.)\s/).slice(0, 3).join(" ");   // an answer written from the first passage
    const r = await ask("r11");
    expect(serverCalls).toHaveLength(1);
    expect(serverCalls[0].sources).toEqual(sourcesFor(evidence));
    expect(r.generated).toBe(true);
    expect(r.sources.map((s) => s.id)).toEqual([idOf(passage)]);
  });

  it("An AI answer that cites a law its passages don't contain is replaced by the checked answer", async () => {
    const { evidence, fallback } = plan("r11");
    serverReply = `${evidence[0].a.split(/(?<=\.)\s/).slice(0, 2).join(" ")} Under Republic Act No. 8485 you must report it to your barangay.`;
    const r = await ask("r11");
    expect(serverCalls).toHaveLength(1);
    expect(r.generated).toBeFalsy();
    expect(r.reply).toBe(fallback.reply);
    expect(r.reply).not.toMatch(/8485/);
  });

  it("An AI answer that wanders off its passages is replaced by the checked answer", async () => {
    serverReply = "Huskies were bred for pulling sleds in the snow, so they overheat in hot weather. Keep them in air conditioning.";
    const r = await ask("r11");
    expect(r.generated).toBeFalsy();
    expect(r.reply).not.toMatch(/sled|snow/i);
  });

  it("In a conversation, the AI gets the owner's messages but never the app's earlier answers", async () => {
    const [first, follow] = cases.f05.turns;   // "My dog has ticks" / "Can those make him really sick?"
    const earlier = "Under Republic Act No. 9482, huskies were bred for sledding in the snow.";   // an earlier reply that must not become evidence
    const { evidence } = plan("f05");
    serverReply = evidence[0].a.split(/(?<=\.)\s/).slice(0, 2).join(" ");
    const r = await askAssistant({ messages: [{ role: "user", content: first }, { role: "assistant", content: earlier }, { role: "user", content: follow }], pet: null });
    expect(serverCalls).toHaveLength(1);
    expect(serverCalls[0].messages).toEqual([{ role: "user", content: first }, { role: "user", content: follow }]);
    expect(JSON.stringify(serverCalls[0])).not.toMatch(/9482|sledding/);
    expect(r.generated).toBe(true);
  });

  it("An AI answer about a symptom gets the same see-a-vet advice as a checked answer", async () => {
    const { evidence } = plan("t05");   // "Nagtatae ang pusa ko ng dalawang araw na" (diarrhea for two days)
    serverReply = evidence[0].a.split(/(?<=\.)\s/)[0];   // a first sentence with no "see a vet soon" in it
    expect(serverReply).not.toMatch(/\bvet\b.*\b(now|today|soon)\b/i);
    const r = await ask("t05");
    expect(r.generated).toBe(true);
    expect(r.reply.startsWith(serverReply)).toBe(true);
    expect(r.reply).toMatch(/see your vet/);
  });

  it("When the AI says the passages don't answer it, the checked answer shows, as before", async () => {
    serverReply = PROMPT.notFound;
    const { fallback } = plan("r11");
    const r = await ask("r11");
    expect(r.reply).toBe(fallback.reply);
  });
});
