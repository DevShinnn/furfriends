import { withEnglish } from "./knowledge";
import REVIEW from "./symptomReview.json";

/* What a pet's history means for a symptom: when an owner asks about a symptom with their pet selected, these rules
   link a fact in the pet's records to what a checked FurFriends answer says about that symptom, e.g. a male cat
   peeing outside the litter box: "male cats are most at risk" of a blocked bladder (ASPCA). They never name a
   diagnosis: they say what the records add to the possible causes and how urgent it is, in the source's own words.

   Each rule: the topic (symptom) it's for, `applies` (the condition, in words), `when` (the condition on the pet
   details from petContext in prompt.js), the note shown to the owner, and `quote`: the sentence(s) of the checked
   answer (`source`, an id in ai-server/data/train.jsonl) the note relies on.

   Accuracy: a rule is used (in the app, and in the AI's training data) only after two teammates have checked it
   against its source: npm run symptom-review writes docs/symptom-review/symptom-notes-review.csv, the reviewers fill
   it in, and the same command saves the approved rules to symptomReview.json. Changing a rule's text, condition or
   quote takes its approval away until it's checked again. */

export const TOPICS = [
  { id: "litter", species: "Cat", re: /pee(s|ing)? outside|outside the (litter )?box|litter box|pee\w* on the (floor|bed|carpet|sofa)/i, source: "q285fc9" },
  { id: "drinking", species: "Cat", re: /drink\w* (a lot|more|so much|too much|lots)|very thirsty|pee\w* (a lot|more|so much)|urinat\w* (a lot|more)|umiinom|uhaw/i, source: "q9885b7" },
  { id: "breath", re: /bad breath|breath (smells|stinks)|hininga/i, source: "q9a9005" },
  { id: "ears", re: /\bears?\b|shak\w* (his |her |its )?head|head[- ]shak|\btenga\b|\btainga\b/i, source: { Dog: "qfbd68c", Cat: "q3a26e3" } },
  { id: "catflu", species: "Cat", re: /sneez|runny (eyes?|nose)|cat flu/i, source: "qce12f1" },
  { id: "worms", species: "Cat", re: /\bworms?\b|tapeworm|like (grains of )?rice/i, source: "q8d9eb1" },
  { id: "ticks", species: "Dog", re: /tick fever|ehrlich|babesi|\bticks?\b/i, source: "qab5df5" },
  { id: "hairloss", species: "Cat", re: /hair loss|losing hair|bald|thin(ning)? (coat|fur)|fur (is )?(getting )?thin|nalalagas/i, source: "q1eee29" },
  { id: "skin", re: /itch|scratch|hair loss|losing hair|bald|lick\w* (his |her |its )?(skin|paws|feet)/i, source: { Dog: "q163a45", Cat: "q1d0b4f" } },
  { id: "diarrhea", re: /diarrh|loose (stool|poop)|watery (stool|poop)/i, source: "q394ce7" },
  { id: "appetite", re: /not eat|won'?t eat|stopped eating|hasn'?t eaten|isn'?t eating|no appetite|refus\w* (to eat|food|his food|her food)/i, source: { Dog: "q05288f", Cat: "qcf4aff" } },
  { id: "limp", species: "Dog", re: /limp|stiff|lame\b/i, source: "q0e1e08" },
];

// An illness, injury or surgery in the history whose title matches (not a medicine: "Ear drops" isn't an ear problem).
const hist = (c, re) => (c.history || []).find((h) => ["Illness", "Injury", "Surgery"].includes(h.type) && re.test(h.title));
const newMeds = (c) => (c.history || []).filter((h) => h.type === "Medication" && h.days <= 30);
const overdue = (c, re) => (c.overdueCare || []).find((t) => re.test(t.title));
const notCurrent = (c, re, name) => (c.missingVaccines || []).includes(name) || (c.vaccines || []).some((v) => re.test(v.name) && /^Overdue/.test(v.status));
const lower = (s) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const mentions = (c, re) => [...(c.medications || []), ...(c.recentConditions || []), ...(c.history || []).map((h) => h.title), ...(c.allergies || [])].some((t) => re.test(t));
// The saved weights (weight_log) show a loss of 5% or more in the last 12 months. 5% is the team's choice of when to
// mention the pet's own numbers (the note only repeats them); the reviewers check it with the rest of the rule.
const lostWeight = (c) => c.weightTrend && c.weightTrend.pct <= -5 && { from: c.weightTrend.from, to: c.weightTrend.to, since: c.weightTrend.since };
const FLEA = /flea|tick|bravecto|nexgard|simparica|frontline|revolution|broadline|advocate/i;
const WORM = /deworm|worm|drontal|milbemax|broadline|pyrantel|praziquantel/i;

/* sim: what a made-up pet needs for the rule to apply (scripts/pet-profiles.mjs, for training examples). */
export const RULES = [
  { id: "litter-male-cat", topic: "litter", applies: "The cat is male.",
    when: (c) => c.gender === "Male" && {},
    note: "{name} is a male cat, and male cats are most at risk of a blocked bladder. Go to the vet now if he strains with little or no pee coming out.",
    quote: "Go to the vet now if your cat strains in the box with little or no pee coming out, cries while peeing, or is vomiting or very tired. A blocked bladder can kill, and male cats are most at risk.",
    sim: { gender: "Male" } },
  { id: "drinking-older-cat", topic: "drinking", applies: "The cat is 10 years old or older.",
    when: (c) => c.years >= 10 && { share: c.years >= 15 ? "about 80% of cats over 15" : "up to 40% of cats over 10" },
    note: "{name} is {years} years old. Kidney disease affects {share}, and blood and urine tests are needed to find the cause.",
    quote: "Kidney disease affects up to 40% of cats over 10 and about 80% of cats over 15. [...] The same signs can also come from diabetes or an overactive thyroid, so blood and urine tests are needed to find the cause.",
    sim: { stage: "senior" } },
  { id: "breath-senior", topic: "breath", applies: "The pet is a senior.",
    when: (c) => c.lifeStage === "senior" && {},
    note: "{name} is a senior, and gum disease is very common in older pets. Ask your vet for a mouth check.",
    quote: "Gum disease is very common in older pets, especially small dogs. [...] See your vet for a mouth check.", source: "q75621c",
    sim: { stage: "senior" } },
  { id: "ears-allergy-dog", topic: "ears", species: "Dog", applies: "The dog has an allergy record.", covers: ["allergy"],
    when: (c) => c.allergies?.length > 0 && { allergy: c.allergies.join(", ") },
    note: "{name} has an allergy record ({allergy}). Allergies are often behind ear infections, so tell your vet.",
    quote: "This is a common sign of an ear infection. [...] Allergies are often behind it, and dogs with floppy or hairy ears get them more often.",
    sim: { allergy: true } },
  { id: "ears-before-dog", topic: "ears", species: "Dog", applies: "The dog's records show an ear problem before.",
    when: (c) => { const h = hist(c, /\bears?\b|otitis/i); return h && { title: lower(h.title), ago: h.when }; },
    note: "{name} had {title} {ago}. Tell your vet, and don't use leftover ear drops on your own.",
    quote: "Some ear medicines can cause hearing loss if the eardrum is torn, so don't use leftover or store-bought drops on your own.",
    sim: { history: ["Illness", "Ear infection"] } },
  { id: "ears-before-cat", topic: "ears", species: "Cat", applies: "The cat's records show an ear problem before.",
    when: (c) => { const h = hist(c, /\bears?\b|otitis|mites/i); return h && { title: lower(h.title), ago: h.when }; },
    note: "{name} had {title} {ago}. Other ear problems look similar, so let your vet confirm the cause this time too.",
    quote: "Other ear problems look similar, so let your vet confirm the cause and show you how to clean the ears.",
    sim: { history: ["Illness", "Ear mites"] } },
  { id: "catflu-kitten", topic: "catflu", applies: "The cat is a kitten (under 1 year).",
    when: (c) => c.lifeStage === "kitten" && {},
    note: "{name} is a kitten, and young cats are more likely to get seriously ill. Go to a vet now.",
    quote: "Go now if she: [...] Is a kitten. Young cats are more likely to get seriously ill.",
    sim: { stage: "young" } },
  { id: "catflu-no-fvrcp", topic: "catflu", applies: "No up-to-date FVRCP vaccine in the records (none recorded, or overdue).",
    when: (c) => notCurrent(c, /fvrcp|fvrc|\b[34]-in-1\b/i, "FVRCP") && {},
    note: "{name}'s records show no up-to-date FVRCP vaccine. Vaccines can make these infections milder, so ask your vet about it.",
    quote: "Vaccines can make these infections milder.",
    sim: { noVaccine: "FVRCP" } },
  { id: "worms-kitten", topic: "worms", applies: "The cat is a kitten (under 1 year).",
    when: (c) => c.lifeStage === "kitten" && {},
    note: "{name} is a kitten. Heavy hookworm or roundworm loads can cause serious blood loss in kittens, so see a vet today if you notice black, tarry poop, pale gums or weakness.",
    quote: "See a vet today if you notice black, tarry poop, pale gums or weakness. Heavy hookworm or roundworm loads can cause serious blood loss, especially in kittens.",
    sim: { stage: "young" } },
  { id: "worms-deworming-overdue", topic: "worms", applies: "A deworming task in the records is overdue.",
    when: (c) => { const t = overdue(c, WORM); return t && { title: t.title }; },
    note: "{name}'s deworming ({title}) is overdue. Bring a fresh stool sample to your vet.",
    quote: "Bring a fresh stool sample to your vet. Treat for fleas too, or the tapeworms will come back.",
    sim: { overdue: "Deworming tablet" } },
  { id: "ticks-treatment-overdue", topic: "ticks", species: "Dog", applies: "A flea or tick treatment in the records is overdue.",
    when: (c) => { const t = overdue(c, FLEA); return t && { title: t.title }; },
    note: "{name}'s tick treatment ({title}) is overdue. Year-round tick control helps prevent tick fever, so ask your vet which one to use.",
    quote: "Prevent it with year-round tick control your vet recommends and daily tick checks.",
    sim: { overdue: "Flea & tick treatment" } },
  { id: "skin-allergy", topic: "skin", applies: "The pet has an allergy record.", covers: ["allergy"],
    when: (c) => c.allergies?.length > 0 && { allergy: c.allergies.join(", ") },
    note: "{name} has an allergy record ({allergy}). Allergies are one of the main causes of itching, so tell your vet.",
    quote: { Dog: "The three main causes are parasites (mainly fleas and mites, which are checked first), skin infections from bacteria, yeast or fungus, and allergies to things like insect bites, food, pollen, mold or dust.",
      Cat: "The most common causes in cats are parasites such as fleas and mites, infections (including ringworm, a fungus), and allergies to insect bites, food, dust mites or inherited skin allergy (atopy)." },
    sim: { allergy: true } },
  { id: "skin-flea-overdue", topic: "skin", applies: "A flea treatment in the records is overdue.",
    when: (c) => { const t = overdue(c, FLEA); return t && { title: t.title }; },
    note: "{name}'s flea treatment ({title}) is overdue. Fleas are among the first things your vet will check.",
    quote: { Dog: "The three main causes are parasites (mainly fleas and mites, which are checked first) [...]",
      Cat: "Your vet may comb for fleas, scrape or culture the skin, and try flea control or a diet trial to find the cause." },
    sim: { overdue: "Flea treatment" } },
  { id: "diarrhea-puppy", topic: "diarrhea", species: "Dog", applies: "The dog is a puppy (under 1 year).",
    when: (c) => c.lifeStage === "puppy" && {},
    note: "{name} is a puppy. Diarrhea in a puppy can be an early sign of parvo, which can be deadly, so go to a vet now.",
    quote: "Go now if there is: [...] Diarrhea in a puppy. It can be an early sign of parvo, which can be deadly.",
    sim: { stage: "young" } },
  { id: "diarrhea-puppy-no-dhpp", topic: "diarrhea", species: "Dog", applies: "A puppy with no up-to-date DHPP vaccine in the records.",
    when: (c) => c.lifeStage === "puppy" && notCurrent(c, /dhl?pp|da2l?pp|dapp|\b[5-8]-in-1\b|parvo/i, "DHPP") && {},
    note: "{name}'s records show no up-to-date DHPP vaccine, which protects against parvo. Tell the vet when you arrive.",
    quote: "Core vaccines are the ones every dog should get, wherever it lives. For dogs these protect against: [...] Parvovirus", source: "q38bf3f",
    sim: { stage: "young", noVaccine: "DHPP" } },
  { id: "diarrhea-cat-deworming-overdue", topic: "diarrhea", species: "Cat", applies: "The cat's deworming task is overdue.",
    when: (c) => { const t = overdue(c, WORM); return t && { title: t.title }; },
    note: "{name}'s deworming ({title}) is overdue. Worms can cause diarrhea, so bring a fresh stool sample to the vet.",
    quote: "Other worm signs include: Vomiting or diarrhea [...] Bring a fresh stool sample to your vet.", source: "q8d9eb1",
    sim: { overdue: "Deworming tablet" } },
  { id: "appetite-diabetes-dog", topic: "appetite", species: "Dog", applies: "The dog's records mention diabetes.",
    when: (c) => mentions(c, /diabet/i) && {},
    note: "{name}'s records mention diabetes. A dog with diabetes that refuses even one meal needs a call to the vet right away.",
    quote: "If he has diabetes and refuses even one meal, call your vet right away.",
    sim: { history: ["Illness", "Diabetes"], meds: "Insulin" } },
  { id: "appetite-new-medicine-dog", topic: "appetite", species: "Dog", applies: "The dog's records show a medicine started in the last 30 days.", covers: ["medication"],
    when: (c) => { const m = newMeds(c)[0]; return m && { med: m.title, ago: m.when }; },
    note: "{name} started {med} {ago}. Tell your vet, since a new medicine is one of the changes they will ask about.",
    quote: "Has anything changed lately, like a move, a new food or a new medicine?",
    sim: { newMed: true } },
  { id: "appetite-overweight-cat", topic: "appetite", species: "Cat", applies: "The cat weighs more than the typical range for its breed.",
    when: (c) => c.weightVsBreed === "above" && {},
    note: "{name} weighs more than is typical for the breed, and overweight cats are at higher risk of fatty liver when they stop eating. Don't wait to see the vet.",
    quote: "A cat that stops eating can develop a serious liver problem called hepatic lipidosis (fatty liver). It can be fatal if not treated quickly. Overweight cats are at higher risk.",
    sim: { weight: "above" } },
  { id: "drinking-weight-loss-cat", topic: "drinking", applies: "The cat's saved weights show a loss of 5% or more in the last 12 months.",
    when: lostWeight,
    note: "{name} weighed {from} kg {since} and {to} kg now. Weight loss is one of the signs that can come with drinking more, so tell your vet.",
    quote: "Other signs can follow: Weight loss",
    sim: { weightLoss: true } },
  { id: "hairloss-weight-loss-cat", topic: "hairloss", applies: "The cat's saved weights show a loss of 5% or more in the last 12 months.",
    when: lostWeight,
    note: "{name} weighed {from} kg {since} and {to} kg now. Hair loss together with weight loss is a reason to see your vet.",
    quote: "See your vet if you notice: [...] Hair loss together with weight loss, low energy or a change in eating or drinking",
    sim: { weightLoss: true } },
  { id: "breath-weight-loss", topic: "breath", applies: "The pet's saved weights show a loss of 5% or more in the last 12 months.",
    when: lostWeight,
    note: "{name} weighed {from} kg {since} and {to} kg now. With bad breath, weight loss is a reason to see your vet sooner.",
    quote: "Go sooner if you also see red or swollen gums, more drinking and peeing, weight loss, or poor appetite.",
    sim: { weightLoss: true } },
  { id: "worms-weight-loss-cat", topic: "worms", applies: "The cat's saved weights show a loss of 5% or more in the last 12 months.",
    when: lostWeight,
    note: "{name} weighed {from} kg {since} and {to} kg now. Weight loss can be a sign of worms, so bring a fresh stool sample to your vet.",
    quote: "Other worm signs include: [...] Weight loss [...] Bring a fresh stool sample to your vet.",
    sim: { weightLoss: true } },
  { id: "limp-senior-dog", topic: "limp", species: "Dog", applies: "The dog is a senior.",
    when: (c) => c.lifeStage === "senior" && {},
    note: "{name} is a senior, and arthritis is common in older dogs. Tell your vet if the stiffness is worse after rest.",
    quote: "Arthritis (joint wear and pain) is common in older dogs. Look for: Stiffness, especially after resting", source: "q028111",
    sim: { stage: "senior" } },
];

/* A rule's fingerprint: its approval only holds while its condition, note and quote stay the same. */
export function ruleHash(r) {
  const s = `${r.id}|${r.topic}|${r.species || ""}|${r.applies}|${r.note}|${JSON.stringify(r.quote)}|${JSON.stringify(r.source || "")}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
const APPROVED = REVIEW.approved || {};
export const isApproved = (r) => APPROVED[r.id] === ruleHash(r);
export const sourceOf = (r, species) => r.source || (typeof TOPICS.find((t) => t.id === r.topic).source === "string"
  ? TOPICS.find((t) => t.id === r.topic).source : TOPICS.find((t) => t.id === r.topic).source[species || "Dog"]);

/* The symptom topics a question is about, for this species. */
export function symptomTopics(question, species) {
  const q = `${question}\n${withEnglish(question)}`;
  return TOPICS.filter((t) => (!t.species || t.species === species) && t.re.test(q)).map((t) => t.id);
}
/* The rules that could apply to this question and species (approved ones, unless `unreviewed`). */
export function rulesFor(question, species, { unreviewed = false } = {}) {
  const topics = symptomTopics(question, species);
  return RULES.filter((r) => topics.includes(r.topic) && (!r.species || r.species === species) && (unreviewed || isApproved(r)));
}
/* The notes these rules give for this pet: [{ topic: "symptom", rule, text, covers }]. */
export function symptomNotes(question, ctx, options) {
  if (!ctx?.name) return [];
  const out = [];
  for (const r of rulesFor(question, ctx.species, options)) {
    const vars = r.when(ctx);
    if (!vars) continue;
    const all = { name: ctx.name, years: ctx.years, ...vars };
    out.push({ topic: "symptom", rule: r.id, covers: r.covers || [], text: r.note.replace(/\{(\w+)\}/g, (_, k) => all[k] ?? "") });
  }
  return out;
}
