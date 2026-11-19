import { describe, expect, it } from "vitest";
import { BREED_DB, breedFor, breedOptions, findBreed, range } from "../src/lib/breeds";
import { CARE_TOPICS } from "../src/lib/breedCare";
import { CATEGORIES, GUIDES, RED_FLAGS, categoryOf, findGuide, urgentGuides } from "../src/lib/emergency";

describe("UC5 View Breed Care Tips", () => {
  it("[FR5.1] A pet's breed is matched to the guide ignoring letter case and extra spaces", () => {
    expect(breedFor({ species: "Dog", breed: "  shih   TZU " })?.name).toBe("Shih Tzu");
  });

  it("[FR5.1] A breed is also matched by its other names (Aspin, Puspin)", () => {
    for (const b of BREED_DB) for (const aka of b.aka) expect(breedFor({ species: b.species, breed: aka })?.slug).toBe(b.slug);
  });

  it("[FR5.1] A cat breed is not matched for a dog, and an unknown or empty breed gives no tips", () => {
    const cat = BREED_DB.find((b) => b.species === "Cat");
    expect(breedFor({ species: "Dog", breed: cat.name })).toBeNull();
    expect(breedFor({ species: "Cat", breed: "Unicorn" })).toBeNull();
    expect(breedFor({ species: "Cat", breed: "" })).toBeNull();
  });

  it("[FR5.1] The pet form suggests only breeds of the chosen species", () => {
    const dogs = breedOptions("Dog");
    expect(dogs.length).toBeGreaterThan(0);
    for (const name of dogs) expect(BREED_DB.some((b) => b.species === "Dog" && (b.name === name || b.aka.includes(name)))).toBe(true);
  });

  it(`[FR5.2] Every breed in the guide (${BREED_DB.length}) has feeding, exercise, grooming and behavior tips`, () => {
    for (const b of BREED_DB) for (const [topic] of CARE_TOPICS) expect(b.care?.[topic], `${b.name}: ${topic}`).toBeTruthy();
  });

  it("[FR5.2] Every breed has health risks, care tips, traits rated 1 to 5, and a healthy weight and life span range", () => {
    for (const b of BREED_DB) {
      expect(b.health.length, b.name).toBeGreaterThan(0);
      expect(b.tips.length, b.name).toBeGreaterThan(0);
      for (const v of Object.values(b.traits)) expect(v >= 1 && v <= 5, b.name).toBe(true);
      expect(b.weight[0] < b.weight[1] && b.life[0] < b.life[1], b.name).toBe(true);
    }
    expect(range([3, 6], "kg")).toBe("3–6 kg");
  });

  it("[FR5.2] Each breed page has its own address (slug) and opens by it", () => {
    const slugs = BREED_DB.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(findBreed(slugs[0])).toBe(BREED_DB[0]);
    expect(findBreed("no-such-breed")).toBeNull();
  });
});

describe("UC6 Open Emergency Guide", () => {
  it(`[FR6.1] Every first-aid guide (${GUIDES.length}) has signs, numbered steps, what not to do, and an urgency`, () => {
    for (const g of GUIDES) {
      expect(g.signs.length, g.slug).toBeGreaterThan(0);
      expect(g.steps.length, g.slug).toBeGreaterThan(1);
      expect(g.avoid.length, g.slug).toBeGreaterThan(0);
      expect(["now", "call"], g.slug).toContain(g.urgency);
    }
  });

  it("[FR6.1] The 8 emergencies named in the proposal each have a guide", () => {
    const covered = {
      wounds: "bleeding", choking: "choking", poisoning: "poisoning", heatstroke: "heatstroke",
      seizures: "seizure", bites: "snake", bloat: "bloat", "broken bones": "accident",
    };
    for (const [topic, slug] of Object.entries(covered)) expect(findGuide(slug), topic).not.toBeNull();
    expect(findGuide("bleeding").summary).toMatch(/bite wounds/i);
    expect(findGuide("accident").signs.join(" ")).toMatch(/not putting weight on a leg/i);
  });

  it("[FR6.2] The poisoning guide lists common poisons (chocolate, grapes, onions)", () => {
    const list = findGuide("poisoning").lists.find((l) => l.title === "Common poisons").items.join(" ");
    expect(list).toMatch(/chocolate/i);
    expect(list).toMatch(/grapes/i);
    expect(list).toMatch(/onions/i);
  });

  it("[FR6.2] Every guide belongs to one of the 7 emergency types, and every type has a guide", () => {
    expect(CATEGORIES).toHaveLength(7);
    for (const g of GUIDES) expect(categoryOf(g), g.slug).toBeTruthy();
    for (const c of CATEGORIES) expect(GUIDES.some((g) => g.category === c.key), c.key).toBe(true);
  });

  it("[FR6.2] Guides open by their address, and each address is unique", () => {
    expect(findGuide("heatstroke").title).toBe("Heatstroke");
    expect(findGuide("nothing")).toBeNull();
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
  });

  it("[FR6.2] The 'go to a vet now' warning signs list is shown", () => {
    expect(RED_FLAGS.length).toBeGreaterThan(3);
  });

  it("[FR6.3] Emergency wording brings up the right guide first", () => {
    expect(urgentGuides("my dog ate chocolate").map((g) => g.slug)).toEqual(["poisoning"]);
    expect(urgentGuides("My cat is NOT BREATHING")[0].slug).toBe("cpr");
    expect(urgentGuides("his belly is swollen and he keeps retching").map((g) => g.slug)).toContain("bloat");
    expect(urgentGuides("dog had a seizure")[0].slug).toBe("seizure");
    expect(urgentGuides("how often should I bathe my cat")).toEqual([]);
  });
});
