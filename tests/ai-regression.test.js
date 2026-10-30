import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../src/lib/supabase";
import { catAppetiteNote, decodeIndex, howLong, search, withAppetiteAdvice } from "../src/lib/knowledge";
import { checkAnswer, planAnswer } from "../src/lib/evidence";
import { sourcesFor } from "../src/lib/prompt";

/* The failures found in the release check of 2026-10-30, in English and Tagalog (ai-server/data/regression_eval.jsonl):
   a cat not eating for days answered with a feeding schedule, a dog not eating answered with macadamia poisoning,
   dog food for cats answered with raw-food safety, and a Husky follow-up whose lines went uncredited.
   The questions' vectors are in tests/fixtures/regression-queries.json (npm run eval:sets -- --set regression
   --fixture tests/fixtures/regression-queries.json), so no model is downloaded here. */

const raw = JSON.parse(readFileSync("public/knowledge/index.json", "utf8"));
const index = decodeIndex(raw);
const fixture = JSON.parse(readFileSync("tests/fixtures/regression-queries.json", "utf8"));
const cases = readFileSync("ai-server/data/regression_eval.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const idOf = (e) => e.of || e.id;
function plan(c) {
  const { q, vector } = fixture.queries[c.id];
  return { q, ...planAnswer(index, search(index, vector, q, {}), q, c.turns.at(-1)) };
}
const byCategory = (cat) => cases.filter((c) => c.category === cat);
const entry = (id) => index.entries.find((e) => e.id === id);

describe("AI regressions: the stored vectors match", () => {
  it("were made for this index (rerun npm run eval:sets -- --set regression --fixture ... if not)", () => {
    expect(fixture.indexBuilt).toBe(raw.built);
    for (const c of cases) expect(fixture.queries[c.id], c.id).toBeTruthy();
  });
});

describe("AI regressions: a cat that hasn't eaten for days", () => {
  it("gets the checked answers about a cat not eating, never a feeding schedule (English and Tagalog)", () => {
    for (const c of byCategory("cat-appetite")) {
      const { evidence, fallback } = plan(c);
      const sent = evidence.map(idOf);
      expect(sent.some((id) => c.accept.includes(id)), `${c.id} ${c.turns.join(" / ")}`).toBe(true);
      for (const bad of c.reject) expect(sent, c.id).not.toContain(bad);
      expect(c.accept, c.id).toContain(fallback.match.id);
    }
  });

  it("reads how long the owner said, in English and Tagalog", () => {
    expect(howLong("tatlong araw na po")).toBe("Three days");
    expect(howLong("Hindi kumakain ang pusa ko ng dalawang araw")).toBe("Two days");
    expect(howLong("My kitten won't eat and it's been 2 days")).toBe("Two days");
    expect(howLong("isang linggo na")).toBe("One week");
    expect(howLong("My cat stopped eating since yesterday")).toBe("A day");
    expect(howLong("Ayaw kumain ng pusa ko")).toBeNull();
  });

  it("opens with how long the owner said and to go to a vet now, before anything else (English and Tagalog)", () => {
    const feeding = entry("q0c19b6").a;
    for (const [q, owner, said] of [["My cat has not eaten for three days", "My cat has not eaten for three days", "Three days"],
      ["not eating cat days", "Ayaw kumain ng pusa ko\ntatlong araw na po", "Three days"],
      ["My kitten won't eat and it's been 2 days", "My kitten won't eat and it's been 2 days", "Two days"],
      ["My cat stopped eating since yesterday", "My cat stopped eating since yesterday", "A day"]]) {
      expect(withAppetiteAdvice(q, feeding, "", owner).startsWith(catAppetiteNote(said)), q).toBe(true);
    }
    // The pet's species counts when the question doesn't name one ("Mochi hasn't eaten for 2 days").
    expect(withAppetiteAdvice("Mochi hasn't eaten for 2 days", feeding, "cat", "Mochi hasn't eaten for 2 days").startsWith(catAppetiteNote("Two days"))).toBe(true);
    expect(withAppetiteAdvice("Mochi hasn't eaten for 2 days", feeding, "dog", "Mochi hasn't eaten for 2 days")).toBe(feeding);
    // Not for a dog, not for a feeding question, and not before the owner has said how long.
    expect(withAppetiteAdvice("My dog has not eaten for three days", feeding, "", "My dog has not eaten for three days")).toBe(feeding);
    expect(withAppetiteAdvice("How often should I feed my cat?", feeding, "", "How often should I feed my cat?")).toBe(feeding);
    expect(withAppetiteAdvice("not eating cat", feeding, "", "Ayaw kumain ng pusa ko")).toBe(feeding);
    // Added once, however many times the reply passes through.
    const once = withAppetiteAdvice("not eating cat days", feeding, "", "tatlong araw na po");
    expect(withAppetiteAdvice("not eating cat days", once, "", "tatlong araw na po")).toBe(once);
  });

  it("isn't skipped because the answer says 'if ... 24 hours, ... now' (what rag-v2 copied on the preview)", () => {
    const howLongIsTooLong = entry("qcf4aff").a;   // "If your cat hasn't eaten properly for 24 hours, take her to the vet now."
    const r = withAppetiteAdvice("not eating cat days", howLongIsTooLong, "", "Ayaw kumain ng pusa ko\ntatlong araw na po");
    expect(r.startsWith("Three days without eating is serious for a cat. Take her to a vet now")).toBe(true);
    expect(r.endsWith(howLongIsTooLong)).toBe(true);
  });

  it("the note says only what the checked answers say", () => {
    const checked = `${entry("qc01447").a} ${entry("qcf4aff").a}`.toLowerCase();
    for (const fact of ["is serious for a cat", "take her to the vet now", "hepatic lipidosis", "force-feed", "tell the vet when she last ate"]) expect(checked).toContain(fact);
  });
});

describe("AI regressions: a dog that hasn't eaten", () => {
  it("gets the checked answer about a dog not eating, never a poisoning passage about something it ate (English and Tagalog)", () => {
    for (const c of byCategory("dog-appetite")) {
      const { evidence, fallback } = plan(c);
      const sent = evidence.map(idOf);
      expect(sent, `${c.id} ${c.turns.join(" / ")}`).toContain("q05288f");
      for (const bad of c.reject) {
        expect(sent, c.id).not.toContain(bad);
        expect(fallback.match?.id, c.id).not.toBe(bad);
      }
    }
  });
});

describe("AI regressions: dog food for a cat, cat food for a dog", () => {
  it("is declined (no checked passage covers it), never answered with general pet-food passages", () => {
    for (const c of byCategory("cross-species-food")) {
      const { evidence, fallback } = plan(c);
      expect(evidence.map(idOf), `${c.id} ${c.turns[0]}`).toEqual([]);
      for (const bad of c.reject) expect(fallback.match?.id, c.id).not.toBe(bad);
    }
  });

  it("only a passage naming that food and the other animal could ever count", () => {
    const pet = (id) => ({ ...entry(id), score: 0.95 });
    const ask = (q) => planAnswer(index, [pet("gov-182"), pet("gov-189"), pet("q0c19b6")], q, q).evidence.map(idOf);
    expect(ask("Can I give my cat dog food?")).toEqual([]);
    expect(ask("How often should I feed my cat?")).not.toEqual([]);   // an ordinary food question is unaffected
  });
});

describe("AI regressions: Husky follow-ups and their citations", () => {
  it("a follow-up about the Husky in the heat gets the Husky's guide alone (English and Tagalog)", () => {
    for (const c of byCategory("husky-follow-up")) expect(plan(c).evidence.map(idOf), `${c.id} ${c.turns.join(" / ")}`).toEqual(c.exact);
  });

  it("the heat summary is still found when it is the best match", () => {
    const c = byCategory("heat-summary")[0];
    expect(plan(c).evidence.map(idOf)[0]).toBe("breed-heat-dog");
  });

  it("a line taken from a second passage credits it too; a shared line credits nothing extra", () => {
    const sources = sourcesFor([entry("breed-heat-dog"), entry("breed-siberian-husky")]);
    const heat = entry("breed-heat-dog").a.split("\n").slice(0, 3).join("\n");
    const mixed = `${heat}\nTypical adult weight 16–27 kg; energy 5 of 5.`;
    const r = checkAnswer(mixed, sources);
    expect(r.ok).toBe(true);
    expect(r.used).toEqual([0, 1]);
    // Only the heat summary: only it is credited.
    expect(checkAnswer(heat, sources).used).toEqual([0]);
    // A line both passages share ("watch for heavy panting") doesn't credit the second.
    expect(checkAnswer(`${heat}\nExercise at dawn or after sunset, and watch for heavy panting.`, sources).used).toEqual([0]);
  });
});

/* ---------------------------------------------------------------- end to end, as the owner sees it */
describe("AI regressions: what the owner sees (askAssistant end to end)", () => {
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
      return new Response(serverReply, { headers: { "X-Model": "rag-v2" } });
    });
    vi.resetModules();
    ({ askAssistant } = await import("../src/lib/assistant"));
  });
  beforeEach(() => {
    serverCalls = [];
    supabase.state.session = { access_token: "test-token", user: { id: "u1" } };
  });
  const ask = (id) => askAssistant({ messages: cases.find((c) => c.id === id).turns.map((content) => ({ role: "user", content })), pet: null });

  it("Tagalog 'my cat won't eat' / 'three days now': the AI only gets the not-eating answers, and the reply says to see a vet today", async () => {
    const passage = entry("qc01447");
    serverReply = passage.a.split("\n")[0];   // an answer written from it
    const r = await ask("R02");
    expect(serverCalls).toHaveLength(1);
    expect(JSON.stringify(serverCalls[0].sources)).not.toMatch(/meals a day|8 to 12 hours/);
    expect(r.generated).toBe(true);
    expect(r.sources.map((s) => s.id)).toContain("qc01447");
    expect(r.reply).toMatch(/vet today/);
  });

  it("the exact preview conversation 'Ayaw kumain ng pusa ko' / 'tatlong araw na po': the second reply says three days and to go now", async () => {
    // What rag-v2 wrote for both turns on the preview: the "how long is too long" passage, word for word.
    serverReply = entry("qcf4aff").a;
    const chat = [{ role: "user", content: "Ayaw kumain ng pusa ko" }];   // as pages/Assistant.jsx sends it: the whole chat
    const first = await askAssistant({ messages: chat.slice(), pet: null });
    expect(first.reply).toBe(serverReply);                                // no duration given yet: no note
    chat.push({ role: "assistant", content: first.reply }, { role: "user", content: "tatlong araw na po" });
    const second = await askAssistant({ messages: chat.slice(), pet: null });
    // The model gets both of the owner's messages (never its own earlier answer) and only the not-eating passages.
    expect(serverCalls[1].messages).toEqual([{ role: "user", content: "Ayaw kumain ng pusa ko" }, { role: "user", content: "tatlong araw na po" }]);
    expect(JSON.stringify(serverCalls[1].sources)).not.toMatch(/meals a day/);
    expect(second.generated).toBe(true);
    expect(second.reply).not.toBe(first.reply);
    expect(second.reply.startsWith("Three days without eating is serious for a cat. Take her to a vet now")).toBe(true);
    // With the owner's cat selected and no animal named, the same.
    serverCalls = [];
    const cat = { id: "p1", name: "Mingming", species: "Cat", breed: "", medical: [], vaccinations: [] };
    const withPet = await askAssistant({ messages: chat.slice(), pet: cat });
    expect(withPet.reply.startsWith("Three days without eating")).toBe(true);
  });

  it("dog food for a cat: the AI isn't asked and no pet-food passage is shown as the answer", async () => {
    serverReply = "Raw pet food and treats can make your dog or cat sick.";
    const r = await ask("R10");
    expect(serverCalls).toEqual([]);
    expect(r.match).toBeNull();
    expect(r.reply).toMatch(/don't have a checked answer/);
  });
});
