import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoPets } from "../src/lib/demoData";
import { foodConflicts, healthCheck, lifeStage, seniorFrom } from "../src/lib/health";
import { basicPet, chatMessages, describePet, knowsProfiles, petContext } from "../src/lib/prompt";
import { NOTES_HEAD, noteQuery, petNoteText, petNotes, stripPetNotes, withPetNotes } from "../src/lib/petNotes";
import { addDays } from "../src/lib/utils";
import { RULES, TOPICS, ruleHash, sourceOf } from "../src/lib/symptomNotes";

/* The pet health check (src/lib/health.js), the pet details the AI gets (prompt.js) and the notes from the pet's
   records added to its answers (petNotes.js). Dates are relative to today, like the demo data. */

const pet = (o = {}) => ({
  id: "p1", name: "Choco", species: "Dog", breed: "Aspin", ageYears: 4, ageMonths: 0, gender: "Male", weight: 14,
  medical: [], vaccinations: [], documents: [], feeding: [], care: [], fedLog: {}, ...o,
});
const med = (days, type, title, notes = "") => ({ id: title, date: addDays(-days), type, title, vet: "", notes });
const vax = (name, due) => ({ id: name, name, dateGiven: addDays(due - 365), nextDue: addDays(due), vet: "", lot: "" });
const meal = (food, days = []) => ({ id: food + days, time: "07:00", food, amount: "", days, notes: "" });
const check = (p, key) => healthCheck(p).checks.find((c) => c.key === key);
// A dog with everything in order.
const healthy = () => pet({
  medical: [med(40, "Checkup", "Annual wellness exam")],
  vaccinations: [vax("DHPP", 200), vax("Rabies", 120)],
  feeding: [meal("Adult dog kibble"), meal("Adult dog kibble")],
  care: [{ id: "d", kind: "Deworming", title: "Drontal Plus", nextDue: addDays(20), repeatDays: 90, lastDone: addDays(-70), done: false }],
});

describe("Pet health check: the indicator", () => {
  it("A pet with everything in order is on track, 6 of 6", () => {
    const h = healthCheck(healthy());
    expect(h).toMatchObject({ status: "ok", label: "On track", onTrack: 6, total: 6, score: 100, top: null });
  });

  it("The demo pets come out differently, each from its own records", () => {
    const [mochi, bori, ginger, kong] = demoPets("u").map((p) => healthCheck(p));
    expect(mochi.label).toBe("Check soon");                      // FVRCP due in 13 days
    expect(mochi.top.detail).toMatch(/FVRCP due in 13 days/);
    expect(bori.label).toBe("Needs attention");                  // DHPP overdue
    expect(bori.top.detail).toMatch(/DHPP overdue by 15 days/);
    expect(ginger.checks.find((c) => c.key === "vaccines").detail).toMatch(/No Rabies vaccine recorded/);
    expect(kong).toMatchObject({ label: "On track", onTrack: 6, total: 6 });
  });

  it("Vaccination status: an overdue vaccine is 'act now', a missing core vaccine or one due soon is 'check soon'", () => {
    expect(check(pet({ ...healthy(), vaccinations: [vax("DHPP", -3), vax("Rabies", 90)] }), "vaccines")).toMatchObject({ status: "danger", detail: "DHPP overdue by 3 days" });
    expect(check(pet({ ...healthy(), vaccinations: [vax("DHPP", 90)] }), "vaccines")).toMatchObject({ status: "warn", detail: "No Rabies vaccine recorded" });
    expect(check(pet({ ...healthy(), vaccinations: [vax("5-in-1", 90), vax("Anti-rabies", 10)] }), "vaccines")).toMatchObject({ status: "warn", detail: "Anti-rabies due in 10 days" });
    expect(healthCheck(pet({ ...healthy(), vaccinations: [vax("DHPP", -3), vax("Rabies", 90)] })).label).toBe("Needs attention");
    // Cats: FVRCP and rabies. A 6-week-old kitten without shots isn't behind yet.
    expect(check(pet({ species: "Cat", breed: "Puspin", vaccinations: [vax("FVRCP", 90), vax("Rabies", 90)] }), "vaccines").status).toBe("ok");
    expect(check(pet({ species: "Cat", breed: "Puspin", ageYears: 0, ageMonths: 1 }), "vaccines").status).toBe("info");
  });

  it("Medical history: a checkup a year for adults and every 6 months for seniors; a recent illness is 'check soon'", () => {
    const old = (years, days) => pet({ ...healthy(), species: "Cat", breed: "Puspin", ageYears: years, medical: [med(days, "Checkup", "Checkup")] });
    expect(check(old(5, 200), "checkup").status).toBe("ok");
    expect(check(old(11, 200), "checkup")).toMatchObject({ status: "warn" });
    expect(check(old(5, 400), "checkup").status).toBe("warn");
    expect(check(pet({ ...healthy(), medical: [] }), "checkup")).toMatchObject({ status: "unknown", detail: "No checkup recorded" });
    // A booked checkup counts.
    const booked = { id: "a", kind: "Vet appointment", title: "Annual checkup", nextDue: addDays(5), dueTime: "", repeatDays: 0, lastDone: null, done: false };
    expect(check(pet({ ...healthy(), medical: [], care: [booked] }), "checkup").status).toBe("ok");
    expect(check(pet({ ...healthy(), medical: [...healthy().medical, med(10, "Injury", "Paw pad laceration")] }), "illness"))
      .toMatchObject({ status: "warn", detail: "Recovering from paw pad laceration (10 days ago)" });
    expect(check(pet({ ...healthy(), medical: [...healthy().medical, med(31, "Injury", "Paw pad laceration")] }), "illness").status).toBe("ok");
  });

  it("Diet: a food with something in the allergy records is 'act now'; puppies need more meals", () => {
    const allergic = (food, allergy = "Chicken protein sensitivity", notes = "") => pet({ ...healthy(), medical: [...healthy().medical, med(100, "Allergy", allergy, notes)], feeding: [meal(food)] });
    expect(check(allergic("Chicken & rice kibble"), "diet")).toMatchObject({ status: "danger", detail: "Chicken & rice kibble may contain chicken, which is in the allergy records" });
    expect(check(allergic("Salmon & rice kibble", "Fish allergy"), "diet").status).toBe("danger");
    // Only the allergy's title counts, and "grain-free" has no grain.
    expect(check(allergic("Salmon & rice kibble", "Chicken protein sensitivity", "Switched to salmon-based diet"), "diet")).toMatchObject({ status: "ok", detail: "1 meal a day: Salmon & rice kibble (avoids chicken)" });
    expect(foodConflicts(["Grain sensitivity"], ["Grain-free chicken (dry)"])).toEqual([]);
    expect(check(pet({ ageYears: 0, ageMonths: 2, feeding: [meal("Puppy kibble"), meal("Puppy kibble")] }), "diet")).toMatchObject({ status: "warn", detail: "2 meals a day; puppies this age usually get 4" });
    expect(check(pet({ ...healthy(), feeding: [] }), "diet")).toMatchObject({ status: "unknown", detail: "No feeding schedule" });
  });

  it("Profile: weight is compared with the breed's range (not for puppies), and life stage follows the breed", () => {
    expect(check(pet({ ...healthy(), weight: 24 }), "weight")).toMatchObject({ status: "warn", detail: "24 kg, above the typical 8–20 kg" });
    expect(check(pet({ ...healthy(), weight: 14 }), "weight").status).toBe("ok");
    expect(check(pet({ ...healthy(), weight: "" }), "weight").status).toBe("unknown");
    expect(check(pet({ ageYears: 0, ageMonths: 5, weight: 3 }), "weight").status).toBe("info");   // not counted
    expect(seniorFrom(pet({ breed: "Golden Retriever" }))).toBe(7.5);
    expect(seniorFrom(pet({ breed: "" }))).toBe(7);
    expect(seniorFrom(pet({ species: "Cat" }))).toBe(10);
    expect(lifeStage(pet({ ageYears: 0, ageMonths: 4 })).label).toBe("Puppy");
    expect(lifeStage(pet({ breed: "Golden Retriever", ageYears: 8 })).label).toBe("Senior");
  });
});

describe("The AI's pet details (pre-context)", () => {
  it("say the pet's life stage, diet, last checkup, missing vaccines and concerns", () => {
    const bori = demoPets("u")[1];
    const c = petContext(bori);
    expect(c).toMatchObject({ lifeStage: "adult", diet: { foods: ["Salmon & rice kibble"], mealsPerDay: 2 }, checkupDaysAgo: null, missingVaccines: [] });
    expect(c.recovering).toEqual([{ title: "Paw pad laceration", daysAgo: 30 }]);
    const text = describePet(c);
    expect(text).toMatch(/^The owner is asking about Bori: Dog, Golden Retriever, Male, 5 yrs, 29\.4 kg, adult\./);
    expect(text).toContain("Allergies: Chicken protein sensitivity.");
    expect(text).toContain("Vaccines: DHPP (Overdue 15d)");
    expect(text).toContain("Diet: Salmon & rice kibble, 2 meals a day.");
    expect(text).toContain("Last checkup: none recorded.");
    expect(text).toContain("Health check: recovering from paw pad laceration (30 days ago).");
    expect(describePet(petContext(demoPets("u")[2]))).toContain("No record of: Rabies vaccine.");
  });

  it("only a model trained with whole profiles (v6 on) gets them; earlier ones get the details they were trained with", () => {
    expect([knowsProfiles("rag-v2"), knowsProfiles("rag-v4"), knowsProfiles("rag-v6"), knowsProfiles("furfriends-rag-v10")]).toEqual([false, false, true, true]);
    const bori = demoPets("u")[1];
    const ask = [{ role: "user", content: "What food is best?" }];
    const v2 = chatMessages(ask, bori, [], "owner", false)[0].content, v6 = chatMessages(ask, bori, [], "owner", true)[0].content;
    expect(v2).toContain("Allergies: Chicken protein sensitivity.");
    expect(v2).not.toMatch(/adult\.|Diet:|Last checkup:|Health check:/);
    expect(v6).toMatch(/Diet: Salmon & rice kibble, 2 meals a day\. Last checkup: none recorded\./);
    expect(describePet(basicPet(petContext(bori)))).toBe("The owner is asking about Bori: Dog, Golden Retriever, Male, 5 yrs, 29.4 kg. Allergies: Chicken protein sensitivity. "
      + "Medications: Heartworm prevention started. Recent illnesses or surgery: Paw pad laceration. Vaccines: DHPP (Overdue 15d), Rabies (Up to date), Bordetella (Due in 22d).");
  });

  it("an older saved context (without the new fields) prints as before", () => {
    const old = { name: "Mingming", species: "Cat", breed: null, gender: null, age: null, weightKg: null, allergies: [], medications: [], recentConditions: [], vaccines: [] };
    expect(describePet(old)).toBe("The owner is asking about Mingming: Cat.");
    expect(describePet({ species: "Dog" })).toBe("The owner is asking about their pet: Dog.");
  });
});

describe("Notes from the pet's records under an answer", () => {
  const [mochi, bori] = demoPets("u").map(petContext);
  it("are added only when the question is about something in the records", () => {
    expect(petNotes("How do I trim my dog's nails?", bori)).toEqual([]);
    expect(petNotes("What food is best for my dog?", bori).map((x) => x.topic)).toEqual(["allergy"]);
    expect(petNotes("Can I give him a vitamin supplement?", bori).map((x) => x.topic)).toEqual(["allergy", "medication"]);
    expect(petNotes("My dog is limping", bori).map((x) => x.topic)).toEqual(["recovering"]);
    expect(petNoteText("When is his next vaccine?", bori)).toBe(`${NOTES_HEAD("Bori")}\n- Bori's vaccines: DHPP overdue by 15 days, Rabies up to date, Bordetella due in 22 days.`);
    expect(petNoteText("How often should she see the vet for a checkup?", mochi)).toMatch(/Mochi's last recorded checkup was 12 days ago\. Adult pets should have a checkup at least once a year\./);
  });

  it("are never added to an emergency, and never without a pet", () => {
    expect(petNotes("My dog ate chocolate, what do I do?", bori)).toEqual([]);
    expect(petNotes("What food is best?", null)).toEqual([]);
  });

  it("warn when the pet's current food may contain something it's allergic to", () => {
    const c = petContext(pet({ medical: [med(90, "Allergy", "Chicken protein sensitivity")], feeding: [meal("Chicken & rice kibble")] }));
    expect(petNoteText("What should I feed him?", c)).toMatch(/Choco's current food \(Chicken & rice kibble\) may contain chicken, which is in Choco's allergy records/);
  });

  it("follow the conversation: a follow-up keeps the earlier topic", () => {
    const q = noteQuery([{ role: "user", content: "Can I give my dog vitamins?" }, { role: "user", content: "what about for puppies?" }]);
    expect(petNotes(q, bori).map((x) => x.topic)).toContain("medication");
  });

  it("replace any notes the model wrote, so a wrong fact about the pet never shows", () => {
    const written = "Choose a complete and balanced food.\n\nFrom Bori's records:\n- Bori has an allergy record: Beef allergy.";
    expect(stripPetNotes(written)).toBe("Choose a complete and balanced food.");
    const shown = withPetNotes("What food is best for my dog?", written, bori);
    expect(shown).toContain("Chicken protein sensitivity");
    expect(shown).not.toContain("Beef allergy");
    expect(shown.match(/From Bori's records:/g)).toHaveLength(1);
    expect(withPetNotes("How do I trim nails?", written, bori)).toBe("Choose a complete and balanced food.");
    // However the model types it: a curly apostrophe, the first note on the same line, another name.
    expect(stripPetNotes("Feed twice a day.\n\nFrom Bori’s records: Bori is diabetic.")).toBe("Feed twice a day.");
    expect(stripPetNotes("Feed twice a day.\nFrom Max's records:\n- Max takes insulin.")).toBe("Feed twice a day.");
    expect(stripPetNotes("Treat fleas monthly.\n\nFrom my records:\n- There's no mention of this in my records.")).toBe("Treat fleas monthly.");
    expect(stripPetNotes("Records from the vet help: bring them.")).toBe("Records from the vet help: bring them.");
  });
});

/* ---------------------------------------------------------------- what the pet's history means for a symptom */
describe("Symptom rules: what a pet's history means for a symptom (symptomNotes.js)", () => {
  const library = new Map();
  for (const l of readFileSync("ai-server/data/train.jsonl", "utf8").split("\n").filter(Boolean)) {
    const ex = JSON.parse(l);
    if (!library.has(ex.id)) library.set(ex.id, ex);
  }
  const flat = (s) => s.replace(/\s*\n-\s*/g, " ").replace(/\s+/g, " ").trim();
  const all = { unreviewed: true };   // every rule, as for the review; the app uses only approved ones
  const ctxOf = (o) => petContext(pet(o));

  it("every rule quotes its checked answer word for word ([...] marks a cut), and that answer is in the library", () => {
    for (const r of RULES) {
      const species = r.species ? [r.species] : TOPICS.find((t) => t.id === r.topic).species ? [TOPICS.find((t) => t.id === r.topic).species] : ["Dog", "Cat"];
      for (const s of species) {
        const ex = library.get(sourceOf(r, s));
        expect(ex, `${r.id}: ${sourceOf(r, s)}`).toBeTruthy();
        const text = flat(ex.messages.at(-1).content);
        const quote = typeof r.quote === "string" ? r.quote : r.quote[s];
        for (const part of quote.split("[...]").map((x) => flat(x)).filter(Boolean)) expect(text, `${r.id} (${s}) quotes "${part}"`).toContain(part);
      }
    }
  });

  it("a rule is used only once two teammates approved it, and only while its text stays the same", () => {
    const male = ctxOf({ species: "Cat", breed: "Puspin", name: "Tiger", gender: "Male" });
    expect(petNotes("My cat pees outside the litter box", male)).toEqual([]);   // nothing approved yet (src/lib/symptomReview.json)
    expect(petNotes("My cat pees outside the litter box", male, all).map((x) => x.rule)).toEqual(["litter-male-cat"]);
    const rule = RULES.find((r) => r.id === "litter-male-cat");
    expect(ruleHash({ ...rule, note: rule.note + " Soon." })).not.toBe(ruleHash(rule));
  });

  it("the notes repeat the pet's facts and the source's words", () => {
    const male = ctxOf({ species: "Cat", breed: "Puspin", name: "Tiger", gender: "Male" });
    expect(petNoteText("Why does my cat pee on the floor?", male, all)).toBe("From Tiger's records:\n- Tiger is a male cat, and male cats are most at risk of a blocked bladder. Go to the vet now if he strains with little or no pee coming out.");
    expect(petNotes("My cat pees outside the litter box", ctxOf({ species: "Cat", breed: "Puspin", gender: "Female" }), all)).toEqual([]);
    const old = ctxOf({ species: "Cat", breed: "Puspin", ageYears: 16 });
    expect(petNoteText("My cat is drinking a lot more water than before", old, all)).toMatch(/Choco is 16 years old\. Kidney disease affects about 80% of cats over 15/);
  });

  it("a puppy with diarrhea gets the parvo warning even though the first-aid guide comes up, and nothing else", () => {
    const puppy = ctxOf({ ageYears: 0, ageMonths: 3, vaccinations: [], medical: [med(100, "Allergy", "Chicken protein sensitivity")] });
    const notes = petNotes("My puppy has diarrhea", puppy, all);
    expect(notes.map((x) => x.rule)).toEqual(["diarrhea-puppy", "diarrhea-puppy-no-dhpp"]);
    expect(notes[0].text).toBe("Choco is a puppy. Diarrhea in a puppy can be an early sign of parvo, which can be deadly, so go to a vet now.");
  });

  it("medicines count for appetite only when started in the last 30 days; a medicine isn't an ear problem", () => {
    const q = "My dog won't eat";
    expect(petNotes(q, ctxOf({ medical: [med(10, "Medication", "Antibiotics for skin infection")] }), all).map((x) => x.rule)).toContain("appetite-new-medicine-dog");
    expect(petNotes(q, ctxOf({ medical: [med(200, "Medication", "Insulin")] }), all).map((x) => x.rule || x.topic)).not.toContain("appetite-new-medicine-dog");
    expect(petNotes("My dog keeps scratching his ears", ctxOf({ medical: [med(60, "Medication", "Ear drops")] }), all).map((x) => x.rule)).not.toContain("ears-before-dog");
    expect(petNotes("My dog keeps scratching his ears", ctxOf({ medical: [med(60, "Illness", "Ear infection")] }), all).map((x) => x.rule)).toContain("ears-before-dog");
  });

  it("a food question only mentions allergies a food can contain", () => {
    const flea = ctxOf({ medical: [med(100, "Allergy", "Flea allergy dermatitis")] });
    expect(petNotes("What food is best for my dog?", flea)).toEqual([]);
    expect(petNotes("My dog keeps scratching", flea, all).map((x) => x.rule)).toEqual(["skin-allergy"]);
  });

  it("the pet's history (with dates) is what the model reads, instead of the undated list", () => {
    const c = ctxOf({ medical: [med(90, "Illness", "Ear infection"), med(400, "Surgery", "Neuter surgery")] });
    expect(describePet(c)).toContain("Medical history: Ear infection (3 months ago), Neuter surgery (13 months ago).");
    expect(describePet(c)).not.toContain("Recent illnesses or surgery");
    expect(describePet(basicPet(c))).toContain("Recent illnesses or surgery: Ear infection, Neuter surgery.");
  });
});
