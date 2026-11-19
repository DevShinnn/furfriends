import { describe, expect, it } from "vitest";
import { isRecordsQuestion, petAsSpecies, recordsReply, recordsTopic } from "../src/lib/petAnswers";
import { demoPets } from "../src/lib/demoData";

const pets = demoPets("owner");
const mochi = pets.find((p) => p.name === "Mochi");   // cat
const bori = pets.find((p) => p.name === "Bori");     // dog, chicken allergy, DHPP overdue

describe("the pet's name in the search", () => {
  it("searches the species instead of the name (the name alone hid the checked answer)", () => {
    expect(petAsSpecies("How do I keep Mochi cool on hot days?", mochi)).toBe("How do I keep my cat cool on hot days?");
    expect(petAsSpecies("bori keeps scratching his ears", bori)).toBe("my dog keeps scratching his ears");
    expect(petAsSpecies("Can I give Bori's leftovers to him?", bori)).toBe("Can I give my dog's leftovers to him?");
    expect(petAsSpecies("Nagsusuka si Mochi kanina pa", mochi)).toBe("Nagsusuka my cat kanina pa");
  });

  it("leaves a pet named after a food alone when it's the food", () => {
    const peanut = { name: "Peanut", species: "Dog" };
    expect(petAsSpecies("Can my dog eat peanut butter?", peanut)).toBe("Can my dog eat peanut butter?");
    expect(petAsSpecies("Can Peanut eat peanut butter?", peanut)).toBe("Can my dog eat peanut butter?");
  });

  it("changes nothing without a pet, or when the name isn't there", () => {
    expect(petAsSpecies("How often should I deworm?", null)).toBe("How often should I deworm?");
    expect(petAsSpecies("How often should I deworm?", mochi)).toBe("How often should I deworm?");
    expect(petAsSpecies("Is Mochiko a good name?", mochi)).toBe("Is Mochiko a good name?");
  });
});

describe("questions about the pet's own records", () => {
  it("are recognised", () => {
    for (const q of ["What is mochi condition now", "How is Mochi?", "how's she doing", "Is Mochi healthy?", "Kumusta si Mochi?",
      "Is Mochi up to date on vaccines?", "When is Mochi's next vaccine?", "What medicines is Mochi on?", "Show me Mochi's health records"]) {
      expect(isRecordsQuestion(q, mochi), q).toBe(true);
    }
    expect(isRecordsQuestion("Is Bori allergic to anything?", bori)).toBe(true);
  });

  it("leave symptoms, food and general questions to the library", () => {
    for (const q of ["How do I keep Mochi cool on hot days?", "Mochi keeps sneezing, is her condition serious?", "Is Mochi okay to eat mango?",
      "What vaccines does Mochi need?", "How is rabies spread?", "Can Mochi eat tuna? She has allergies", "Nagsusuka si Mochi, ano ang kalagayan niya?"]) {
      expect(isRecordsQuestion(q, mochi), q).toBe(false);
    }
    expect(isRecordsQuestion("What is mochi condition now", null)).toBe(false);
  });

  it("know which part of the records is asked about", () => {
    const cases = {
      "When was Mochi's last vet visit?": "checkup", "When did she last see the vet?": "checkup", "When is Mochi's next deworming?": "parasites",
      "How much does Mochi weigh?": "weight", "What does Mochi eat?": "diet", "What is Mochi's feeding schedule?": "diet",
      "How old is Mochi?": "age", "When was Mochi's last vaccine?": "vaccines", "What vaccines has Mochi had?": "vaccines",
      "Is Mochi allergic to anything?": "allergies", "What is mochi condition now": "overall",
    };
    for (const [q, topic] of Object.entries(cases)) expect(recordsTopic(q, mochi), q).toBe(topic);
    expect(recordsTopic("How much should I feed a kitten?", mochi)).toBeNull();
    expect(recordsTopic("What food is best for an older cat?", mochi)).toBeNull();
  });

  it("put the part asked about first, then the rest of the health check", () => {
    const r = recordsReply("When was Mochi's last vet visit?", mochi).reply;
    expect(r).toMatch(/^From Mochi's records:\n- Vet checkup: Last checkup 12 days ago\n\nThe rest of Mochi's health check: Check soon, 5 of 6 on track\./);
    expect(r.match(/Vet checkup/g)).toHaveLength(1);
    expect(recordsReply("How old is Mochi?", mochi).reply).toMatch(/^From Mochi's records: Mochi is 3 years 4 months old \(adult\)\./);
    expect(recordsReply("What medicines is Mochi on?", mochi).reply).toMatch(/^From Mochi's records: Mochi has no medicine on record\./);
    expect(recordsReply("What does Bori eat?", bori).reply).toMatch(/^From Bori's records:\n- Diet: 2 meals a day: Salmon & rice kibble \(avoids chicken\)/);
  });

  it("answer from the health check, with no diagnosis, and link to the pet", () => {
    const r = recordsReply("Is Bori allergic to anything?", bori);
    expect(r.reply).toMatch(/^From Bori's records: Allergies on record: Chicken protein sensitivity[^\n]*\n\nThe rest of Bori's health check: Needs attention, \d of 6 on track\./);
    expect(r.reply).toContain("- Vaccines (act now): DHPP overdue");
    expect(r.reply.match(/Allergies on record/g)).toHaveLength(1);
    expect(recordsReply("What is Bori's condition?", bori).reply).toMatch(/^Here's how Bori is doing, from Bori's records in FurFriends\. Health check: Needs attention, \d of 6 on track\./);
    expect(r.reply).toMatch(/not an exam\. If Bori seems unwell, see your vet\.$/);
    expect(r.match).toMatchObject({ source: "Bori's records", url: `#/app/pets/${bori.id}`, kind: "records" });
    expect(recordsReply("How do I keep Mochi cool on hot days?", mochi)).toBeNull();
  });
});
