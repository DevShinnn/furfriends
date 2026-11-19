/* Pet profiles for training the FurFriends AI with pet "pre-context" (ai-server/add_pet_profiles.py).

     npx vite-node scripts/pet-profiles.mjs -- <requests.json>

   The pets are made up (SIMULATED: no real owner's pet is used): either made here (scripts/simPets.mjs), or, with
   TRAINING_PETS=<file>, the training pets exported from the FurFriends training account in Supabase
   (scripts/training-pets.mjs export), which the team can correct in the app. Only their "train" pets are used.

   requests.json: [{ messages: [{ role: "user", content }...], mode, species, seed, rule, petId }]
     mode "topics"   what the question is about: { topics, rules: { Dog: [rule ids], Cat: [...] }, urgent }
     mode "match"    (TRAINING_PETS) which training pets get which notes for this question: { matches: [{ id, species, topics }] }
     mode "pet"      (TRAINING_PETS) the pet `petId`
     mode "relevant" a made-up pet with records the question is about (for `rule`, that symptom rule's), so the
                     model learns to use them
     mode "random"   a made-up pet with any records, often unrelated, so it learns to leave them out
   Prints, as the last line, a JSON array with, for the pet modes, one { pet, notes, topics, described } per request:
     pet        the pet details exactly as the app sends them (petContext in src/lib/prompt.js)
     notes      the "From <name>'s records:" notes the app adds for this question (petNotes.js), or ""
     topics     which notes those are (vaccine, allergy, medication, recovering, checkup, senior, or a symptom rule id)
     described  describePet(pet), so the Python side can check it prints the same pet details */
import { readFileSync } from "node:fs";
import { describePet, petContext } from "../src/lib/prompt.js";
import { noteQuery, noteTopics, petNotes, petNoteText } from "../src/lib/petNotes.js";
import { RULES, rulesFor } from "../src/lib/symptomNotes.js";
import { urgentGuides } from "../src/lib/emergency.js";
import { asOfToday, makePet } from "./simPets.mjs";

// Symptom rules are used only once two teammates approved them (npm run symptom-review). SYMPTOM_NOTES=all uses
// every rule, for a preview of the data before the review only: never train a model for owners on that.
const options = { unreviewed: process.env.SYMPTOM_NOTES === "all" };

// The training pets from the database, as they looked on the day each was added, and their pet details.
const stored = process.env.TRAINING_PETS
  ? JSON.parse(readFileSync(process.env.TRAINING_PETS, "utf8")).pets.filter((p) => p.split === "train").map((p) => {
    const pet = asOfToday(p);
    return { pet, ctx: petContext(pet) };
  })
  : [];
const byId = new Map(stored.map((x) => [x.pet.id, x]));

const result = (q, ctx) => ({ pet: ctx, notes: petNoteText(q, ctx, options), topics: petNotes(q, ctx, options).map((x) => x.rule || x.topic), described: describePet(ctx) });

const requests = JSON.parse(readFileSync(process.argv.at(-1), "utf8"));
const out = requests.map(({ messages, species, seed, mode, rule, petId }) => {
  const q = noteQuery(messages);
  if (mode === "topics") {
    // (A question that brings up a first-aid guide still gets the symptom rules: petNotes adds only those to it.)
    const rules = { Dog: rulesFor(q, "Dog", options).map((x) => x.id), Cat: rulesFor(q, "Cat", options).map((x) => x.id) };
    if (urgentGuides(q).length) return { topics: [], rules, urgent: true };
    return { topics: noteTopics(q), rules, urgent: false };
  }
  if (mode === "match") return { matches: stored.map(({ pet, ctx }) => ({ id: pet.id, species: pet.species, topics: petNotes(q, ctx, options).map((x) => x.rule || x.topic) })) };
  if (mode === "pet") {
    const x = byId.get(petId);
    if (!x) throw new Error(`no training pet ${petId} in ${process.env.TRAINING_PETS}`);
    return result(q, x.ctx);
  }
  const topics = new Set(mode === "relevant" ? noteTopics(q) : []);
  if (topics.has("medicine")) topics.add("medication");
  if (topics.has("skin") || topics.has("food") || topics.has("medicine")) topics.add("allergy");
  if (topics.has("symptom") || topics.has("activity")) topics.add("recovering");
  // (Seniors aren't forced: about 1 pet in 4 is one anyway.)
  // `rule`: make the pet for that symptom rule; otherwise, in "relevant" mode, for one of the question's rules.
  const rules = rule ? RULES.filter((x) => x.id === rule) : mode === "relevant" ? rulesFor(q, species, options) : [];
  const hint = rules.length ? rules[seed % rules.length].sim : {};
  return result(q, petContext(makePet(species, seed, topics, hint)));
});
console.log(JSON.stringify(out));
