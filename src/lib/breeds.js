/* Breed guide for common cat and dog breeds in the Philippines. Built into the app so it works offline.
   Ranges are typical adults; individual pets vary. traits are 1 (low) – 5 (high):
     energy, grooming (effort), shedding, heat (tolerance of hot, humid weather), kids (good with children). */

import { BREED_CARE } from "./breedCare";

const B = (species, name, o) => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  return { species, name, slug, aka: [], care: BREED_CARE[slug], ...o };
};

export const BREED_DB = [
  /* ---------------------------------------------------------------- dogs */
  B("Dog", "Aspin", {
    aka: ["Asong Pinoy", "Mixed Breed"], origin: "Philippines", size: "Medium",
    weight: [8, 20], life: [12, 16], coat: "Short, single coat",
    summary: "The Philippines' own street-smart dog: alert, loyal and adaptable. Aspins are generally hardy and well suited to the local climate.",
    traits: { energy: 4, grooming: 1, shedding: 2, heat: 5, kids: 4 },
    health: ["Tick-borne blood infections (ehrlichia, babesia)", "Mange and other skin parasites", "Parvovirus and distemper if not vaccinated"],
    tips: ["Year-round tick and flea prevention is the most important care step.", "Keep vaccines up to date, including rabies and leptospirosis.", "Spaying or neutering helps prevent roaming and unwanted litters."],
  }),
  B("Dog", "Shih Tzu", {
    origin: "China (Tibet)", size: "Small", weight: [4, 7.5], life: [10, 16], coat: "Long, double coat",
    summary: "Affectionate lap dog that loves company. Its flat face and long coat need extra care in hot weather.",
    traits: { energy: 2, grooming: 5, shedding: 2, heat: 1, kids: 4 },
    health: ["Breathing problems from the flat face (BOAS)", "Eye injuries, ulcers and dry eye", "Dental disease", "Ear infections and skin allergies"],
    tips: ["Keep indoors with a fan or air-con on hot days and avoid midday walks.", "Brush daily or keep a short puppy cut, with a groom every 4–6 weeks.", "Wipe the eyes and face daily, and see a vet quickly for any squinting."],
  }),
  B("Dog", "Labrador Retriever", {
    aka: ["Labrador", "Lab"], origin: "Canada / UK", size: "Large", weight: [25, 36], life: [11, 14], coat: "Short, dense double coat",
    summary: "Friendly, eager-to-please family dog with lots of energy. Labs love food, so watch their weight.",
    traits: { energy: 5, grooming: 2, shedding: 4, heat: 3, kids: 5 },
    health: ["Obesity", "Hip and elbow dysplasia", "Ear infections", "Exercise-induced collapse"],
    tips: ["Measure meals and keep treats under 10% of daily food.", "Exercise early in the morning or evening, and let them swim if they can.", "Dry the ears after baths and swimming."],
  }),
  B("Dog", "Golden Retriever", {
    aka: ["Golden"], origin: "Scotland", size: "Large", weight: [25, 34], life: [10, 12], coat: "Medium-long, double coat",
    summary: "Gentle, patient and very social. Their thick coat needs regular brushing and they feel the heat.",
    traits: { energy: 4, grooming: 3, shedding: 5, heat: 2, kids: 5 },
    health: ["Hip and elbow dysplasia", "Higher cancer risk than many breeds", "Hot spots and skin allergies in humid weather", "Hypothyroidism"],
    tips: ["Brush 2–3 times a week. Don't shave the coat; it protects against sun and heat.", "Dry the coat fully after baths to prevent hot spots.", "Have regular senior check-ups and report new lumps early."],
  }),
  B("Dog", "German Shepherd", {
    aka: ["GSD", "Alsatian"], origin: "Germany", size: "Large", weight: [22, 40], life: [9, 13], coat: "Medium, double coat",
    summary: "Intelligent, loyal working dog that needs training, a job to do and plenty of exercise.",
    traits: { energy: 5, grooming: 3, shedding: 5, heat: 2, kids: 4 },
    health: ["Hip and elbow dysplasia", "Bloat (twisted stomach)", "Degenerative myelopathy", "Skin and ear allergies"],
    tips: ["Feed two or three smaller meals a day and rest after eating to lower bloat risk.", "Give daily training or puzzle games as well as walks.", "Brush several times a week; never shave the double coat."],
  }),
  B("Dog", "Siberian Husky", {
    aka: ["Husky"], origin: "Russia (Siberia)", size: "Medium", weight: [16, 27], life: [12, 14], coat: "Thick, double coat",
    summary: "Bred for snow, so the tropics are hard on them. Friendly, vocal and a known escape artist.",
    traits: { energy: 5, grooming: 3, shedding: 5, heat: 1, kids: 4 },
    health: ["Heatstroke", "Eye problems (cataracts, progressive retinal atrophy)", "Hypothyroidism"],
    tips: ["Needs air-con or a cool shaded room on hot days.", "Exercise only at dawn or after sunset, and watch for heavy panting.", "Don't shave the coat; brush out the loose undercoat instead."],
  }),
  B("Dog", "Pug", {
    origin: "China", size: "Small", weight: [6, 8], life: [12, 15], coat: "Short, fine coat",
    summary: "Charming, comical companion. The flat face makes breathing and staying cool difficult.",
    traits: { energy: 2, grooming: 2, shedding: 4, heat: 1, kids: 5 },
    health: ["Breathing problems (BOAS)", "Heatstroke", "Eye injuries", "Skin-fold infections", "Obesity"],
    tips: ["Keep cool and indoors on hot days, and keep walks short and gentle.", "Clean and dry the face wrinkles daily.", "Use a harness instead of a collar, and keep them lean so they breathe easier."],
  }),
  B("Dog", "Beagle", {
    origin: "England", size: "Medium", weight: [9, 14], life: [10, 15], coat: "Short, dense coat",
    summary: "Merry, curious scent hound. Their nose leads them everywhere, including into the trash.",
    traits: { energy: 4, grooming: 1, shedding: 3, heat: 3, kids: 5 },
    health: ["Obesity", "Ear infections", "Epilepsy", "Back problems (IVDD)"],
    tips: ["Keep food and trash out of reach.", "Walk on a leash or in a secure yard, since they follow their nose.", "Check and clean the floppy ears weekly."],
  }),
  B("Dog", "Chihuahua", {
    origin: "Mexico", size: "Toy", weight: [1.5, 3], life: [14, 16], coat: "Short or long coat",
    summary: "Tiny dog with a big personality. Bonds closely with one person.",
    traits: { energy: 3, grooming: 1, shedding: 2, heat: 3, kids: 2 },
    health: ["Dental disease", "Kneecap slipping (luxating patella)", "Low blood sugar in puppies", "Collapsing windpipe"],
    tips: ["Brush teeth several times a week.", "Use a harness to protect the windpipe.", "Feed puppies small meals often, and watch for weakness or shaking."],
  }),
  B("Dog", "Pomeranian", {
    aka: ["Pom"], origin: "Germany / Poland", size: "Toy", weight: [1.5, 3.5], life: [12, 16], coat: "Fluffy, double coat",
    summary: "Bright, lively little dog with a big fluffy coat. Confident and often vocal.",
    traits: { energy: 3, grooming: 4, shedding: 4, heat: 2, kids: 3 },
    health: ["Kneecap slipping (luxating patella)", "Collapsing windpipe", "Dental disease", "Coat loss (alopecia X)"],
    tips: ["Brush 2–3 times a week down to the skin.", "Keep cool on hot days; the coat traps heat.", "Use a harness instead of a collar."],
  }),
  B("Dog", "French Bulldog", {
    aka: ["Frenchie"], origin: "France", size: "Small", weight: [8, 13], life: [10, 12], coat: "Short, smooth coat",
    summary: "Easygoing, affectionate companion. One of the breeds most at risk from heat because of its flat face.",
    traits: { energy: 2, grooming: 1, shedding: 2, heat: 1, kids: 4 },
    health: ["Breathing problems (BOAS)", "Heatstroke", "Back problems (IVDD)", "Skin-fold infections and allergies"],
    tips: ["Keep indoors with air-con on hot days and exercise only when it's cool.", "Can't swim well. Supervise around pools.", "Clean the face folds and keep them lean."],
  }),
  B("Dog", "Poodle", {
    aka: ["Toy Poodle", "Miniature Poodle", "Standard Poodle"], origin: "Germany / France", size: "Toy to large",
    weight: [2, 32], life: [10, 18], coat: "Curly, low-shedding coat",
    summary: "Very clever and easy to train. Comes in toy, miniature and standard sizes; the coat keeps growing.",
    traits: { energy: 4, grooming: 5, shedding: 1, heat: 3, kids: 4 },
    health: ["Dental disease (smaller sizes)", "Kneecap slipping (luxating patella)", "Progressive retinal atrophy", "Bloat and Addison's disease (standard size)"],
    tips: ["Professional groom every 4–6 weeks; a short clip is cooler.", "Give daily brain games and training.", "Brush the teeth of toy and miniature Poodles often."],
  }),
  B("Dog", "Dachshund", {
    aka: ["Doxie", "Wiener dog"], origin: "Germany", size: "Small", weight: [4, 14], life: [12, 16], coat: "Smooth, long or wire coat",
    summary: "Brave, playful and stubborn. Their long back needs protecting.",
    traits: { energy: 3, grooming: 2, shedding: 2, heat: 3, kids: 3 },
    health: ["Back disc disease (IVDD)", "Obesity", "Dental disease"],
    tips: ["Use ramps and avoid jumping off furniture or using stairs.", "Keep them slim to take strain off the spine.", "Go to the vet right away for back pain, wobbliness or dragging legs."],
  }),
  B("Dog", "Pembroke Welsh Corgi", {
    aka: ["Corgi", "Welsh Corgi"], origin: "Wales", size: "Small to medium", weight: [10, 14], life: [12, 13], coat: "Medium, double coat",
    summary: "Smart, bold herding dog on short legs. Loves food and people.",
    traits: { energy: 4, grooming: 3, shedding: 5, heat: 2, kids: 4 },
    health: ["Back problems (IVDD)", "Hip dysplasia", "Obesity", "Degenerative myelopathy"],
    tips: ["Keep them lean and limit jumping.", "Brush several times a week, more when shedding heavily.", "Walk in the cooler parts of the day."],
  }),
  B("Dog", "Japanese Spitz", {
    origin: "Japan", size: "Small", weight: [5, 10], life: [12, 14], coat: "White, fluffy double coat",
    summary: "Cheerful, loyal family dog with a bright white coat that sheds dirt surprisingly well.",
    traits: { energy: 3, grooming: 3, shedding: 4, heat: 2, kids: 5 },
    health: ["Kneecap slipping (luxating patella)", "Tear staining and eye irritation"],
    tips: ["Brush 2–3 times a week; don't shave the coat.", "Wipe tear stains daily.", "Keep cool and shaded in the hottest months."],
  }),
  B("Dog", "Maltese", {
    origin: "Malta", size: "Toy", weight: [2, 4], life: [12, 15], coat: "Long, silky single coat",
    summary: "Gentle, playful toy dog with a silky white coat that sheds very little.",
    traits: { energy: 3, grooming: 5, shedding: 1, heat: 3, kids: 3 },
    health: ["Dental disease", "Kneecap slipping (luxating patella)", "Tear staining", "Collapsing windpipe"],
    tips: ["Brush daily or keep a short trim.", "Brush teeth several times a week.", "Use a harness instead of a collar."],
  }),
  B("Dog", "American Bully", {
    aka: ["Bully"], origin: "United States", size: "Medium to large", weight: [14, 55], life: [10, 13], coat: "Short, smooth coat",
    summary: "Muscular, confident and people-loving. Needs early socialization and consistent, kind training.",
    traits: { energy: 3, grooming: 1, shedding: 2, heat: 2, kids: 4 },
    health: ["Hip and elbow dysplasia", "Skin allergies", "Heat sensitivity in shorter-muzzled dogs", "Cherry eye"],
    tips: ["Socialize early with people and other dogs.", "Exercise in the cooler parts of the day and keep them at a healthy weight.", "Watch for itchy skin and red paws, signs of allergies."],
  }),

  /* ---------------------------------------------------------------- cats */
  B("Cat", "Puspin", {
    aka: ["Pusang Pinoy", "Domestic Shorthair", "Domestic Longhair", "Mixed"], origin: "Philippines", size: "Medium",
    weight: [3, 5.5], life: [12, 18], coat: "Usually short coat",
    summary: "The Filipino house cat: clever, adaptable and generally very healthy. Comes in every color and pattern.",
    traits: { energy: 4, grooming: 1, shedding: 2, heat: 5, kids: 4 },
    health: ["Cat flu (upper respiratory infections)", "FIV and FeLV in cats that go outdoors", "Worms, fleas and ear mites", "Urinary blockage in males"],
    tips: ["Keep vaccines (FVRCP, rabies) and deworming on schedule.", "Keeping them indoors means fewer fights, infections and accidents.", "Spay or neuter to prevent litters and roaming."],
  }),
  B("Cat", "Persian", {
    origin: "Iran (Persia)", size: "Medium", weight: [3, 5.5], life: [12, 17], coat: "Long, thick coat",
    summary: "Calm, gentle and quiet. The long coat and flat face need daily care, especially in the heat.",
    traits: { energy: 1, grooming: 5, shedding: 4, heat: 1, kids: 3 },
    health: ["Polycystic kidney disease (PKD)", "Breathing problems from the flat face", "Tear staining and eye problems", "Dental problems"],
    tips: ["Comb daily to stop mats, or keep a short trim.", "Wipe the eyes and face daily.", "Keep in a cool room on hot days, and ask your vet about kidney screening."],
  }),
  B("Cat", "Siamese", {
    origin: "Thailand", size: "Medium", weight: [3, 5.5], life: [12, 20], coat: "Short, fine coat",
    summary: "Talkative, social and very attached to their people. They don't like being left alone for long.",
    traits: { energy: 4, grooming: 1, shedding: 2, heat: 4, kids: 4 },
    health: ["Dental disease", "Asthma and respiratory problems", "Progressive retinal atrophy", "Amyloidosis (liver)"],
    tips: ["Give plenty of play time and company.", "Brush teeth or use dental treats.", "See the vet for any coughing or wheezing."],
  }),
  B("Cat", "Maine Coon", {
    origin: "United States", size: "Large", weight: [4, 9], life: [12, 15], coat: "Long, shaggy coat",
    summary: "A gentle giant: friendly, playful and dog-like. Their heavy coat needs help staying cool.",
    traits: { energy: 3, grooming: 4, shedding: 4, heat: 2, kids: 5 },
    health: ["Heart disease (hypertrophic cardiomyopathy)", "Hip dysplasia", "Spinal muscular atrophy"],
    tips: ["Brush 2–3 times a week.", "Use a large litter box and a sturdy scratching post.", "Ask your vet about heart screening."],
  }),
  B("Cat", "Ragdoll", {
    origin: "United States", size: "Large", weight: [4.5, 9], life: [12, 17], coat: "Semi-long, silky coat",
    summary: "Famously relaxed and floppy when picked up. Best kept indoors.",
    traits: { energy: 2, grooming: 3, shedding: 3, heat: 2, kids: 5 },
    health: ["Heart disease (hypertrophic cardiomyopathy)", "Bladder stones", "Obesity"],
    tips: ["Brush twice a week.", "Encourage play to keep them trim.", "Offer water fountains or wet food to help the bladder."],
  }),
  B("Cat", "British Shorthair", {
    origin: "United Kingdom", size: "Medium to large", weight: [3.5, 8], life: [12, 20], coat: "Short, very dense coat",
    summary: "Calm, easygoing teddy-bear cat. Independent but affectionate.",
    traits: { energy: 2, grooming: 2, shedding: 3, heat: 2, kids: 4 },
    health: ["Heart disease (hypertrophic cardiomyopathy)", "Polycystic kidney disease (PKD)", "Obesity", "Gum disease"],
    tips: ["Brush weekly, more often when shedding.", "Measure meals; they gain weight easily.", "Keep a cool spot available on hot days."],
  }),
  B("Cat", "Scottish Fold", {
    origin: "Scotland", size: "Medium", weight: [3, 6], life: [11, 15], coat: "Short or long coat",
    summary: "Sweet, quiet cat with folded ears. The gene that folds the ears also affects cartilage everywhere, so many get painful joints.",
    traits: { energy: 2, grooming: 2, shedding: 3, heat: 3, kids: 4 },
    health: ["Bone and joint disease (osteochondrodysplasia)", "Arthritis, often at a young age", "Ear wax build-up"],
    tips: ["Watch for stiffness, a short or thick tail, or not wanting to jump. These are signs of pain.", "Provide steps and low-sided litter boxes.", "Clean the folded ears gently every week."],
  }),
  B("Cat", "Bengal", {
    origin: "United States", size: "Medium", weight: [3.5, 7], life: [12, 16], coat: "Short, pelt-like coat",
    summary: "Athletic, wild-looking and very active. Needs lots of play and climbing space, and often loves water.",
    traits: { energy: 5, grooming: 1, shedding: 1, heat: 4, kids: 4 },
    health: ["Heart disease (hypertrophic cardiomyopathy)", "Progressive retinal atrophy", "Kneecap slipping (luxating patella)"],
    tips: ["Plan daily play sessions and give them cat trees.", "Puzzle feeders help prevent boredom.", "Keep indoors or use a secure catio."],
  }),
  B("Cat", "Sphynx", {
    origin: "Canada", size: "Medium", weight: [3, 5.5], life: [9, 15], coat: "Hairless (fine down)",
    summary: "Warm, cuddly and outgoing. With no coat, they need baths and protection from sun and air-con chill.",
    traits: { energy: 4, grooming: 3, shedding: 1, heat: 3, kids: 4 },
    health: ["Heart disease (hypertrophic cardiomyopathy)", "Sunburn", "Oily skin and ear wax build-up", "Dental disease"],
    tips: ["Bathe weekly or as needed to remove skin oils.", "Keep out of direct sun and give a blanket in air-con.", "Clean the ears and nail beds regularly."],
  }),
  B("Cat", "Russian Blue", {
    origin: "Russia", size: "Medium", weight: [3, 5.5], life: [15, 20], coat: "Short, dense silver-blue coat",
    summary: "Gentle and quietly affectionate. Shy with strangers but devoted to their family.",
    traits: { energy: 3, grooming: 1, shedding: 2, heat: 3, kids: 3 },
    health: ["Generally healthy", "Obesity", "Bladder stones"],
    tips: ["Keep a steady routine; they like predictability.", "Measure food and encourage play.", "Brush weekly."],
  }),
  B("Cat", "Abyssinian", {
    aka: ["Aby"], origin: "Ethiopia / Egypt", size: "Medium", weight: [3, 5], life: [12, 15], coat: "Short, ticked coat",
    summary: "Curious, athletic and always busy. Not a lap cat. Loves climbing high.",
    traits: { energy: 5, grooming: 1, shedding: 2, heat: 4, kids: 4 },
    health: ["Progressive retinal atrophy", "Gum disease", "Kidney amyloidosis", "Pyruvate kinase deficiency"],
    tips: ["Give high perches and lots of interactive play.", "Brush teeth or use dental treats.", "Ask about genetic tests from the breeder."],
  }),
  B("Cat", "Exotic Shorthair", {
    aka: ["Exotic"], origin: "United States", size: "Medium", weight: [3, 6], life: [12, 15], coat: "Short, plush coat",
    summary: "A Persian in a short coat: calm and sweet, with the same flat-face care needs.",
    traits: { energy: 2, grooming: 2, shedding: 3, heat: 1, kids: 4 },
    health: ["Breathing problems from the flat face", "Polycystic kidney disease (PKD)", "Tear staining and eye problems"],
    tips: ["Wipe the eyes and face daily.", "Keep in a cool room on hot days.", "Brush weekly."],
  }),
];

export const TRAITS = [
  ["energy", "Energy"], ["grooming", "Grooming needs"], ["shedding", "Shedding"],
  ["heat", "Handles heat"], ["kids", "Good with kids"],
];

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
export const findBreed = (slug) => BREED_DB.find((b) => b.slug === slug) || null;

/* Match a pet's free-text breed ("Domestic Shorthair", "lab", …) to the guide. */
export function breedFor(pet) {
  const q = norm(pet?.breed);
  if (!q) return null;
  const same = BREED_DB.filter((b) => b.species === pet.species);
  return same.find((b) => norm(b.name) === q || b.aka.some((a) => norm(a) === q)) || null;
}

/* Breed suggestions for the pet form. */
export const breedOptions = (species) => {
  const list = BREED_DB.filter((b) => b.species === species);
  return [...new Set([...list.map((b) => b.name), ...list.flatMap((b) => b.aka.filter((a) => /^(Domestic|Mixed Breed)/.test(a)))])];
};

export const range = ([a, b], unit) => `${a}–${b} ${unit}`;
