import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase";
import { addDays, todayISO } from "../src/lib/utils";
import { demoPets } from "../src/lib/demoData";
import { healthCheck, weightTrend } from "../src/lib/health";
import { describePet, petContext } from "../src/lib/prompt";
import { petNoteText } from "../src/lib/petNotes";
import { addPets } from "../src/lib/seedDemo";
import { RULES } from "../src/lib/symptomNotes";
import { asOfToday, splitOf, topicSpecies, trainingCohort, uuidFor } from "../scripts/simPets.mjs";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

/* The pet history stored in Supabase: the weight history (weight_log, migration 20261112000000_weight_log.sql) and the
   AI's training pets (scripts/training-pets.mjs, built by scripts/simPets.mjs). */

beforeEach(() => supabase.reset());

async function loggedInWithPet(weights = []) {
  withAccount(supabase);
  supabase.state.rows.pets.push({ id: "p1", owner_id: "user-1", created_at: "2026-10-01T00:00:00Z", name: "Bori", species: "Dog", breed: "Golden Retriever",
    age_years: 5, age_months: 0, gender: "Male", weight_kg: 29.4, photo_path: null });
  supabase.state.rows.weight_log = weights;
  const s = await renderStore();
  await run(() => s.current.login("owner@example.com", "secret123"));
  return s;
}

describe("Weight history in the database (weight_log)", () => {
  it("is loaded with each pet, oldest first", async () => {
    const s = await loggedInWithPet([
      { id: "w2", pet_id: "p1", weighed_on: addDays(-30), weight_kg: "30.1" },
      { id: "w1", pet_id: "p1", weighed_on: addDays(-200), weight_kg: "31.2" },
    ]);
    expect(s.current.weightLog).toBe(true);
    expect(s.current.getPet("p1").weights.map((w) => [w.date, w.kg])).toEqual([[addDays(-200), 31.2], [addDays(-30), 30.1]]);
  });

  it("an earlier weight is saved to the history only; today's also becomes the pet's current weight", async () => {
    const s = await loggedInWithPet([{ id: "w1", pet_id: "p1", weighed_on: addDays(-10), weight_kg: 29.4 }]);
    await run(() => s.current.saveWeight("p1", { date: addDays(-90), kg: 30.6 }));
    expect(calls("weight_log", "upsert")[0].payload).toEqual({ pet_id: "p1", weighed_on: addDays(-90), weight_kg: 30.6 });
    expect(calls("pets", "update")).toEqual([]);
    expect(s.current.getPet("p1").weight).toBe(29.4);
    await run(() => s.current.saveWeight("p1", { date: todayISO(), kg: 28.9 }));
    expect(calls("pets", "update")[0].payload).toEqual({ weight_kg: 28.9 });
    expect(s.current.getPet("p1")).toMatchObject({ weight: 28.9 });
    expect(s.current.getPet("p1").weights.map((w) => w.kg)).toEqual([30.6, 29.4, 28.9]);
  });

  it("changing the weight in the profile adds today's weight to the history on screen (the database trigger saves it)", async () => {
    const s = await loggedInWithPet([{ id: "w1", pet_id: "p1", weighed_on: addDays(-60), weight_kg: 29.4 }]);
    await run(() => s.current.updatePet("p1", { weight: 30 }));
    expect(s.current.getPet("p1").weights.map((w) => [w.date, w.kg])).toEqual([[addDays(-60), 29.4], [todayISO(), 30]]);
    expect(calls("weight_log", "upsert")).toEqual([]);   // the trigger on pets does it on the server
  });

  it("a weight can be deleted from the history", async () => {
    const s = await loggedInWithPet([{ id: "w1", pet_id: "p1", weighed_on: addDays(-60), weight_kg: 29.4 }]);
    await run(() => s.current.removeWeight("p1", addDays(-60)));
    expect(s.current.getPet("p1").weights).toEqual([]);
    expect(calls("weight_log", "delete")[0].filters).toEqual([["pet_id", "p1"], ["weighed_on", addDays(-60)]]);
  });

  it("the app still works on a database without the weight_log table yet, with no weight history", async () => {
    withAccount(supabase);
    supabase.state.missingTables = ["weight_log"];
    supabase.state.rows.pets.push({ id: "p1", owner_id: "user-1", created_at: "2026-10-01T00:00:00Z", name: "Bori", species: "Dog", breed: "", age_years: 5, age_months: 0, gender: "Male", weight_kg: 29.4, photo_path: null });
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    expect(s.current.pets.map((p) => p.name)).toEqual(["Bori"]);
    expect(s.current.weightLog).toBe(false);
    expect(s.current.saveWeight("p1", { date: todayISO(), kg: 30 })).toBe(false);
  });

  it("seeding pets saves their earlier weights, and skips them on a database without the table", async () => {
    withAccount(supabase);
    const [mochi] = demoPets("u");
    await addPets(supabase, "user-1", [mochi], null);
    expect(calls("weight_log", "upsert")[0].payload.map((w) => w.weight_kg)).toEqual([3.9, 4.0, 4.2, 4.2]);
    supabase.reset();
    supabase.state.missingTables = ["weight_log"];
    await expect(addPets(supabase, "user-1", [mochi], null)).resolves.toBeUndefined();
  });
});

describe("Weight trend in the health check and the AI's pet details", () => {
  const bori = demoPets("u")[1];   // 31.2 kg ten months ago, 29.4 kg now
  it("says how the weight changed over the last year", () => {
    expect(weightTrend(bori)).toEqual({ from: 31.2, to: 29.4, since: "10 months ago", change: -1.8, pct: -6 });
    expect(healthCheck(bori).checks.find((c) => c.key === "weight").detail).toBe("29.4 kg, within the typical 25–34 kg; down 1.8 kg (6%) since 10 months ago");
    expect(describePet(petContext(bori))).toContain("Weight trend: 31.2 kg 10 months ago, 29.4 kg now.");
    expect(weightTrend({ weights: [{ date: todayISO(), kg: 4 }] })).toBeNull();
  });
  it("a loss of 5% or more is linked to the symptoms where the checked answers name weight loss (once reviewed)", () => {
    expect(petNoteText("My dog has bad breath", petContext(bori), { unreviewed: true }))
      .toBe("From Bori's records:\n- Bori weighed 31.2 kg 10 months ago and 29.4 kg now. With bad breath, weight loss is a reason to see your vet sooner.");
    expect(petNoteText("My dog has bad breath", petContext(bori))).toBe("");   // not approved yet
  });
});

describe("The AI's training pets (stored in the training account)", () => {
  const cohort = trainingCohort().map((p) => ({ ...p, split: splitOf(p.id) }));
  it("every symptom rule applies to at least 2 training pets and 1 kept for evaluation", () => {
    for (const r of RULES) {
      const fits = cohort.filter((p) => (!topicSpecies(r) || topicSpecies(r) === p.species) && r.when(petContext(p)));
      expect(fits.filter((p) => p.split === "train").length, r.id).toBeGreaterThanOrEqual(2);
      expect(fits.filter((p) => p.split === "eval").length, r.id).toBeGreaterThanOrEqual(1);
    }
  });
  it("pets have database ids that decide training or evaluation, the same way every time", () => {
    for (const p of cohort) expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidFor(5, "eval")).toBe(uuidFor(5, "eval"));
    expect(splitOf(uuidFor(5, "eval"))).toBe("eval");
    expect(trainingCohort().map((p) => p.id)).toEqual(cohort.map((p) => p.id));
    expect(cohort.filter((p) => p.split === "eval").length / cohort.length).toBeGreaterThan(0.15);
  });
  it("no record is older than its pet, and a vaccine's next date comes after the date given", () => {
    for (const p of cohort) {
      const born = addDays(-((p.ageYears * 12 + p.ageMonths) * 31));
      for (const d of [...p.medical.map((m) => m.date), ...p.weights.map((w) => w.date), ...p.vaccinations.map((v) => v.dateGiven)]) expect(d >= born, `${p.name} ${d}`).toBe(true);
      for (const v of p.vaccinations) expect(v.nextDue > v.dateGiven, `${p.name} ${v.name}`).toBe(true);
    }
  });
  it("an exported pet is read as of the day it was added, so its history doesn't go stale", () => {
    const pet = { asOf: addDays(-20), medical: [{ date: addDays(-25), type: "Surgery", title: "Spay surgery" }], vaccinations: [], care: [], weights: [{ date: addDays(-20), kg: 4 }], fedLog: {} };
    const now = asOfToday(pet);
    expect(now.medical[0].date).toBe(addDays(-5));     // "5 days ago" when it was added, still 5 days ago
    expect(now.weights[0].date).toBe(todayISO());
  });
});
