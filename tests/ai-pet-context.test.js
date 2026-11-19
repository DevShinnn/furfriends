import { existsSync, readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../src/lib/supabase";
import { decodeIndex, search } from "../src/lib/knowledge";
import { planAnswer } from "../src/lib/evidence";
import { noteQuery, petNoteText } from "../src/lib/petNotes";
import { addDays } from "../src/lib/utils";
import PROMPT from "../src/lib/aiPrompt.json";

/* The AI with the owner's pet selected: what it's sent about the pet, the notes from the pet's records under its
   answer (end to end, with the server faked), and the v6 training data that teaches the model to use them. */

const raw = JSON.parse(readFileSync("public/knowledge/index.json", "utf8"));
const index = decodeIndex(raw);
const fixture = JSON.parse(readFileSync("tests/fixtures/regression-queries.json", "utf8"));
const turns = (id) => readFileSync("ai-server/data/regression_eval.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((c) => c.id === id).turns;
const jsonl = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const choco = {
  id: "p1", name: "Choco", species: "Dog", breed: "Aspin", ageYears: 4, ageMonths: 0, gender: "Male", weight: 14, documents: [], fedLog: {},
  medical: [{ id: "m1", date: addDays(-90), type: "Allergy", title: "Chicken protein sensitivity", vet: "", notes: "" },
    { id: "m2", date: addDays(-6), type: "Injury", title: "Paw pad laceration", vet: "", notes: "" }],
  vaccinations: [{ id: "v1", name: "DHPP", dateGiven: addDays(-300), nextDue: addDays(65), vet: "", lot: "" }],
  feeding: [{ id: "f1", time: "07:00", food: "Chicken & rice kibble", amount: "", days: [], notes: "" }],
  care: [],
};

describe("AI with a pet selected (askAssistant end to end)", () => {
  let askAssistant, serverReply, serverCalls;
  const vectors = new Map(Object.values(fixture.queries).map((x) => [x.q, x.vector]));
  beforeAll(async () => {
    globalThis.Worker = class {
      postMessage({ id, text }) { setTimeout(() => this.onmessage({ data: vectors.has(text) ? { id, vector: vectors.get(text) } : { id, error: `no vector for ${text}` } })); }
    };
    if (!globalThis.TextDecoderStream) globalThis.TextDecoderStream = (await import("node:stream/web")).TextDecoderStream;
    vi.stubGlobal("fetch", async (url, init) => {
      if (String(url).endsWith("knowledge/index.json")) return new Response(JSON.stringify(raw));
      serverCalls.push(JSON.parse(init.body));
      return new Response(serverReply, { headers: { "X-Model": "rag-v6" } });
    });
    vi.resetModules();
    ({ askAssistant } = await import("../src/lib/assistant"));
  });
  beforeEach(() => {
    serverCalls = [];
    supabase.state.session = { access_token: "test-token", user: { id: "u1" } };
  });
  const ask = (id, pet) => askAssistant({ messages: turns(id).map((content) => ({ role: "user", content })), pet });

  it("the server gets the pet's whole profile, and the answer ends with the notes the rule picks, not the model's", async () => {
    const { q, vector } = fixture.queries.R07;   // "My dog stopped eating two days ago, is it dangerous?"
    const { evidence } = planAnswer(index, search(index, vector, q, {}), q, turns("R07").at(-1));
    // An answer written from the passage, with notes the model got wrong.
    serverReply = `${evidence[0].a.split("\n\n")[0]}\n\nFrom Choco's records:\n- Choco is allergic to beef.`;
    const r = await ask("R07", choco);
    expect(serverCalls).toHaveLength(1);
    expect(serverCalls[0].pet).toMatchObject({ name: "Choco", lifeStage: "adult", allergies: ["Chicken protein sensitivity"],
      diet: { foods: ["Chicken & rice kibble"], mealsPerDay: 1 }, recovering: [{ title: "Paw pad laceration", daysAgo: 6 }] });
    expect(serverCalls[0].pet.health.flags).toContain("current food (Chicken & rice kibble) may contain chicken, which is in the allergy records");
    expect(r.generated).toBe(true);
    expect(r.modelNotes).toBe(true);
    expect(r.reply).not.toMatch(/beef/);
    expect(r.reply).toMatch(/From Choco's records:\n- Choco's current food \(Chicken & rice kibble\) may contain chicken/);
    expect(r.reply).toMatch(/- Choco's records show paw pad laceration 6 days ago\./);
    expect(r.reply.match(/From Choco's records:/g)).toHaveLength(1);
  });

  it("with no pet selected, no notes; with a pet whose records aren't about the question, none either", async () => {
    const { q, vector } = fixture.queries.R07;
    const { evidence } = planAnswer(index, search(index, vector, q, {}), q, turns("R07").at(-1));
    serverReply = evidence[0].a.split("\n\n")[0];
    expect((await ask("R07", null)).reply).not.toMatch(/records:/);
    const plain = { ...choco, medical: [], feeding: [] };
    expect((await ask("R07", plain)).reply).not.toMatch(/records:/);
  });
});

const V6 = "ai-server/data/rag_train_v6.jsonl";
describe.runIf(existsSync(V6))("AI training data v6 (pet profiles, ai-server/add_pet_profiles.py)", () => {
  const rows = jsonl(V6);
  const v5 = jsonl("ai-server/data/rag_train_v5.jsonl");
  // Other wordings of a question share its id, so an id can have more than one example (with the same answer).
  const answersOf = (id) => v5.filter((r) => r.id === id).map((r) => r.messages.at(-1).content);
  const pets = rows.filter((r) => r.simulated_pet);
  const owner = (r) => r.messages.filter((m) => m.role === "user");

  it("keeps every v5 example and adds examples with simulated, labelled pet profiles", () => {
    expect(rows.filter((r) => !r.simulated_pet && !r.extra_question).map((r) => r.id).sort()).toEqual(v5.map((r) => r.id).sort());
    expect(pets.length).toBeGreaterThan(300);
    for (const r of pets) expect(r.pet, r.id).toMatchObject({ name: expect.any(String), species: expect.stringMatching(/^(Dog|Cat)$/) });
    expect(rows.some((r) => r.unreviewed_rules)).toBe(false);   // never the --unreviewed preview
  });

  it("the other wordings of symptom questions keep their checked answer and sources word for word", () => {
    const wordings = JSON.parse(readFileSync("ai-server/data/symptom_questions.json", "utf8"));
    const extra = rows.filter((r) => r.extra_question && !r.simulated_pet);
    expect(extra.length).toBe(Object.entries(wordings).filter(([k]) => !k.startsWith("_")).reduce((n, [, qs]) => n + qs.length, 0));
    for (const r of extra) {
      const base = r.id.replace(/-ask\d+$/, ""), orig = v5.find((x) => x.id === base && x.messages.length === 2);
      expect(wordings[base], r.id).toContain(r.messages[0].content);
      expect(r.messages[1].content, r.id).toBe(orig.messages[1].content);
      expect(r.sources, r.id).toEqual(orig.sources);
    }
  });

  it("each answer is the v5 answer plus exactly the notes the app adds for that question and pet", () => {
    let withNotes = 0;
    for (const r of pets) {
      const answers = answersOf(r.id.replace(/-pet\d+$/, "").replace(/-ask\d+$/, ""));
      expect(new Set(answers).size, r.id).toBe(1);
      const was = answers[0];
      const notes = was === PROMPT.notFound ? "" : petNoteText(noteQuery(owner(r)), r.pet);
      expect(r.messages.at(-1).content, r.id).toBe(notes ? `${was}\n\n${notes}` : was);
      if (notes) withNotes++;
    }
    // Both kinds, so the model learns when the records matter and when to leave them out.
    expect(withNotes).toBeGreaterThan(150);
    expect(pets.length - withNotes).toBeGreaterThan(100);
  });

  it("\"couldn't find\" answers stay word for word, and no evaluation question is trained on", () => {
    expect(pets.filter((r) => /^I couldn't find/.test(r.messages.at(-1).content)).every((r) => r.messages.at(-1).content === PROMPT.notFound)).toBe(true);
    const evals = new Set([
      ...jsonl("ai-server/data/retrieval_eval.jsonl").flatMap((c) => c.turns),
      ...JSON.parse(readFileSync("ai-server/data/safety_eval.json", "utf8")).cases.map((c) => c.q),
      ...jsonl("ai-server/data/test.jsonl").map((r) => r.messages.at(-2).content),
    ].map((q) => q.trim().toLowerCase()));
    expect(rows.flatMap((r) => owner(r).map((m) => m.content)).filter((q) => evals.has(q.trim().toLowerCase()))).toEqual([]);
  });
});
