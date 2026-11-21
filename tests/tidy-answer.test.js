import { describe, expect, it } from "vitest";
import { speciesAsked, tidyAnswer } from "../src/lib/tidyAnswer";

/* tidyAnswer(): what the owner sees is cleaned up without training the model (src/lib/tidyAnswer.js). */

const NAILS = `Go slowly and keep it positive with treats and praise.

Dogs:
- Trim when the nails touch the ground or click on the floor. For many dogs this is about monthly.
- Cut small bits at a time. On light nails, stop a little short of the pink quick.
- Don't forget the dewclaws.

Cats:
- Gently press the toe pad so the claw comes out.
- Snip only the sharp white tip. Avoid the pink part, which has nerves and blood vessels.
- Trim every 2 to 3 weeks.

If a nail bleeds, press styptic powder or cornstarch on the tip. If your pet fights or gets upset, stop.`;

const EMERGENCY = `Any sudden, serious problem is an emergency. If you're unsure, call your vet or the nearest 24-hour clinic now.

Go immediately if your pet:
- Has trouble breathing, breathes with the mouth open (cats), or has blue or very pale gums
- Is bleeding heavily
- Has a swollen belly and keeps retching (dogs)
- Suddenly acts very differently from normal`;

describe("Tidying the AI's answer for the chosen pet", () => {
  it("[FR10.6] A dog's answer loses the cats' part and a cat's the dogs' part; with no animal known, both stay", () => {
    const dog = tidyAnswer(NAILS, { species: "dog" });
    expect(dog).toMatch(/dewclaws/);
    expect(dog).not.toMatch(/Cats:|toe pad/);
    expect(dog).toMatch(/styptic powder/);   // the part for both stays
    const cat = tidyAnswer(NAILS, { species: "Cat" });
    expect(cat).toMatch(/toe pad/);
    expect(cat).not.toMatch(/Dogs:|dewclaws/);
    expect(tidyAnswer(NAILS)).toBe(NAILS);
  });

  it("[FR10.6] A sign tagged for the other animal is dropped from a list; one tagged inside a line, and urgent lines, stay", () => {
    const cat = tidyAnswer(EMERGENCY, { species: "cat" });
    expect(cat).not.toMatch(/swollen belly/);
    expect(cat).toMatch(/mouth open \(cats\)/);
    expect(cat).toMatch(/24-hour clinic now/);
    const dog = tidyAnswer(EMERGENCY, { species: "dog" });
    expect(dog).toMatch(/swollen belly/);
    expect(dog).toMatch(/mouth open \(cats\)/);   // part of a line for both
    // A block for the other animal that says to go to a vet now is never removed.
    const urgent = "Most pets recover at home.\n\nCats: a cat straining to pee with nothing coming out needs a vet now.\n\nKeep water out and watch them closely for a day.";
    expect(tidyAnswer(urgent, { species: "dog" })).toBe(urgent);
  });

  it("[FR10.6] Lines for both animals stay, and an answer mostly about the other animal is left whole", () => {
    const cpr = "Push hard and fast.\n\nCats and small dogs: wrap one hand around the chest just behind the elbows and squeeze.\n\nKeep going on the way to the vet.";
    expect(tidyAnswer(cpr, { species: "cat" })).toBe(cpr);
    const mostlyCats = "Use a toothpaste made for pets.\n\nCats: brush the outer surfaces at the gumline, starting with the big back teeth and the long fang teeth, about 30 seconds per side, daily if you can and at least three times a week, keeping sessions short.";
    expect(tidyAnswer(mostlyCats, { species: "dog" })).toBe(mostlyCats);
  });

  it("[FR10.6] Repeated lines, a stray \"Q:\" line and a few words cut off at the end are removed; a complete bullet stays", () => {
    const messy = "Many common food items can be dangerous to pets. Check labels first.\nKeep the bag closed.\nMany common food items can be dangerous to pets. Check labels first.\nQ: What are the signs of tick fever in dogs?\nA: Ticks spread germs. See your vet. Antihist";
    expect(tidyAnswer(messy)).toBe("Many common food items can be dangerous to pets. Check labels first.\nKeep the bag closed.\nTicks spread germs. See your vet.");
    const list = "Go now if there is:\n- Blood in the stool\n- Straining with nothing coming out";
    expect(tidyAnswer(list)).toBe(list);
    const bullet = "Call your vet if:\n- The skin smells bad. Please don't give human allergy pills or leftover steroids. Antihist";
    expect(tidyAnswer(bullet)).toBe("Call your vet if:\n- The skin smells bad. Please don't give human allergy pills or leftover steroids.");
    // While the answer streams in, its last words aren't cut: they're still being written.
    expect(tidyAnswer("See your vet. Antihist", { partial: true })).toBe("See your vet. Antihist");
  });

  it("[FR10.6] The animal comes from the question when no pet is chosen, in English or Tagalog", () => {
    expect(speciesAsked("How often should I bathe my dog?")).toBe("dog");
    expect(speciesAsked("Ilang beses dapat paliguan ang pusa?")).toBe("cat");
    expect(speciesAsked("My dog ate my cat's food")).toBeNull();
    expect(speciesAsked("How often should I deworm?")).toBeNull();
  });
});
