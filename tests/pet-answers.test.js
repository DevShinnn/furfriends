import { describe, expect, it } from "vitest";
import { isRecordsQuestion, matchPronouns, petAsSpecies, recordsReply, recordsTopic } from "../src/lib/petAnswers";
import { demoPets } from "../src/lib/demoData";

const pets = demoPets("owner");
const mochi = pets.find((p) => p.name === "Mochi");   // cat
const bori = pets.find((p) => p.name === "Bori");     // dog, chicken allergy, DHPP overdue

describe("the pet's name in the search", () => {
  it("[FR10.6] searches the species instead of the name (the name alone hid the checked answer)", () => {
    expect(petAsSpecies("How do I keep Mochi cool on hot days?", mochi)).toBe("How do I keep my cat cool on hot days?");
    expect(petAsSpecies("bori keeps scratching his ears", bori)).toBe("my dog keeps scratching his ears");
    expect(petAsSpecies("Can I give Bori's leftovers to him?", bori)).toBe("Can I give my dog's leftovers to him?");
    expect(petAsSpecies("Nagsusuka si Mochi kanina pa", mochi)).toBe("Nagsusuka my cat kanina pa");
  });

  it("[FR10.6] leaves a pet named after a food alone when it's the food", () => {
    const peanut = { name: "Peanut", species: "Dog" };
    expect(petAsSpecies("Can my dog eat peanut butter?", peanut)).toBe("Can my dog eat peanut butter?");
    expect(petAsSpecies("Can Peanut eat peanut butter?", peanut)).toBe("Can my dog eat peanut butter?");
  });

  it("[FR10.6] changes nothing without a pet, or when the name isn't there", () => {
    expect(petAsSpecies("How often should I deworm?", null)).toBe("How often should I deworm?");
    expect(petAsSpecies("How often should I deworm?", mochi)).toBe("How often should I deworm?");
    expect(petAsSpecies("Is Mochiko a good name?", mochi)).toBe("Is Mochiko a good name?");
  });
});

describe("questions about the pet's own records", () => {
  it("[FR10.6] are recognised", () => {
    for (const q of ["What is mochi condition now", "How is Mochi?", "how's she doing", "Is Mochi healthy?", "Kumusta si Mochi?",
      "Is Mochi up to date on vaccines?", "When is Mochi's next vaccine?", "What medicines is Mochi on?", "Show me Mochi's health records"]) {
      expect(isRecordsQuestion(q, mochi), q).toBe(true);
    }
    expect(isRecordsQuestion("Is Bori allergic to anything?", bori)).toBe(true);
  });

  it("[FR10.6] leave symptoms, food and general questions to the library", () => {
    for (const q of ["How do I keep Mochi cool on hot days?", "Mochi keeps sneezing, is her condition serious?", "Is Mochi okay to eat mango?",
      "What vaccines does Mochi need?", "How is rabies spread?", "Can Mochi eat tuna? She has allergies", "Nagsusuka si Mochi, ano ang kalagayan niya?"]) {
      expect(isRecordsQuestion(q, mochi), q).toBe(false);
    }
    expect(isRecordsQuestion("What is mochi condition now", null)).toBe(false);
  });

  it("[FR10.6] know which part of the records is asked about", () => {
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

  it("[FR10.6] put the part asked about first, then the rest of the health check", () => {
    const r = recordsReply("When was Mochi's last vet visit?", mochi).reply;
    expect(r).toMatch(/^From Mochi's records:\n- Vet checkup: Last checkup 12 days ago\n\nThe rest of Mochi's health check: Check soon, 5 of 6 on track\./);
    expect(r.match(/Vet checkup/g)).toHaveLength(1);
    expect(recordsReply("How old is Mochi?", mochi).reply).toMatch(/^From Mochi's records: Mochi is 3 years 4 months old \(adult\)\./);
    expect(recordsReply("What medicines is Mochi on?", mochi).reply).toMatch(/^From Mochi's records: Mochi has no medicine on record\./);
    expect(recordsReply("What does Bori eat?", bori).reply).toMatch(/^From Bori's records:\n- Diet: 2 meals a day: Salmon & rice kibble \(avoids chicken\)/);
  });

  it("[FR10.6] answer from the health check, with no diagnosis, and link to the pet", () => {
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

/* Sentences from the answers the pet test flagged (ai-server/results/pets), and the usual traps. */
describe("he/she in an answer matches the pet (matchPronouns)", () => {
  it("[FR10.6] A male pet's answer says he/him/his, even where the source said she/her", () => {
    expect(matchPronouns("Gently wipe her nose clean. A blocked nose can stop her smelling food, so warm her food slightly.", bori))
      .toBe("Gently wipe his nose clean. A blocked nose can stop him smelling food, so warm his food slightly.");
    expect(matchPronouns("If she seems weak, keep her calm and take her to the vet. Make sure she keeps drinking.", bori))
      .toBe("If he seems weak, keep him calm and take him to the vet. Make sure he keeps drinking.");
    expect(matchPronouns("Check her gums. Give her a treat, help her eat small meals, or feed her usual food. Keep her nails short.", bori))
      .toBe("Check his gums. Give him a treat, help him eat small meals, or feed his usual food. Keep his nails short.");
    expect(matchPronouns("Have her checked by a vet. The bed is hers; she chose it herself. Stay with her.", bori))
      .toBe("Have him checked by a vet. The bed is his; he chose it himself. Stay with him.");
  });

  it("[FR10.6] A female pet's answer says she/her, even where the source said he/him/his", () => {
    expect(matchPronouns("If he vomits, keep him off food. There's a chance he swallowed something. He can't chew it.", mochi))
      .toBe("If she vomits, keep her off food. There's a chance she swallowed something. She can't chew it.");
    expect(matchPronouns("Limit his activity and remove the toy from his mouth. The toy is his.", mochi))
      .toBe("Limit her activity and remove the toy from her mouth. The toy is hers.");
  });

  it("[FR10.6] Leaves words that only contain he/she, pets with no sex given, the general chat, and questions about another animal", () => {
    expect(matchPronouns("Keep him out of the heat; check the shed and these other spots.", mochi)).toBe("Keep her out of the heat; check the shed and these other spots.");
    expect(matchPronouns("Keep her calm.", { name: "Brownie", gender: "" })).toBe("Keep her calm.");
    expect(matchPronouns("Keep her calm.", null)).toBe("Keep her calm.");
    expect(matchPronouns("Keep her calm.", bori, { asked: "My neighbour's dog is limping. Should I let her play with Bori?" })).toBe("Keep her calm.");
    expect(matchPronouns("Keep her calm.", bori, { asked: "Bori is limping, what should I do?" })).toBe("Keep him calm.");
  });

  it("[FR10.6] While the answer streams in, the last word and a 'her' or 'his' before it wait for what comes next", () => {
    expect(matchPronouns("Keep him calm and wipe his", mochi, { partial: true })).toBe("Keep her calm and wipe his");
    expect(matchPronouns("Keep him calm and wipe his no", mochi, { partial: true })).toBe("Keep her calm and wipe his no");
    expect(matchPronouns("Move him out of the he", mochi, { partial: true })).toBe("Move her out of the he");
    expect(matchPronouns("Move him out of the heat. ", mochi, { partial: true })).toBe("Move her out of the heat. ");
  });
});
