/* Feeding, exercise, grooming and behavior for each breed in the guide, keyed by breed slug.
   General guidance for healthy adults in a hot, humid climate. Portions depend on the food,
   so the advice is about meals and body shape, not grams. Checked against published sources in docs/content-check. */

export const CARE_TOPICS = [
  ["feeding", "Feeding", "bowl"],
  ["exercise", "Exercise", "zap"],
  ["grooming", "Grooming", "scissors"],
  ["behavior", "Behavior", "heart"],
];

export const BREED_CARE = {
  /* ---------------------------------------------------------------- dogs */
  "aspin": {
    feeding: "Two meals a day of a complete dog food for medium dogs. Rice with leftovers isn't a complete diet, and cooked bones can splinter. Keep the waist visible from above.",
    exercise: "Active. Aim for about an hour a day of walks and play, in the cooler morning or evening. Needs a secure fence, as Aspins like to roam.",
    grooming: "Low. Brush weekly with a rubber brush, bathe monthly or when dirty, and check for ticks after every walk.",
    behavior: "Alert, loyal and quick to learn. Often wary of strangers, which makes a good watchdog. Early socialization and treat-based training work well.",
  },
  "shih-tzu": {
    feeding: "Small-breed food in two or three small meals. Small kibble is easier for the flat face to pick up. Gains weight easily, so keep treats tiny.",
    exercise: "Low. Two short walks of 15–20 minutes plus indoor play. Never exercise in the heat; the flat face makes overheating dangerous.",
    grooming: "High. Brush daily, or keep a short puppy cut with a groom every 4–6 weeks. Wipe the eyes and face daily and brush the teeth often.",
    behavior: "Friendly, affectionate and happiest near people. Can be slow to house-train, so be patient and consistent.",
  },
  "labrador-retriever": {
    feeding: "Large-breed food in two measured meals. Labs are very food-driven and gain weight easily, so measure portions and count treats. A slow-feeder bowl helps fast eaters.",
    exercise: "Very high. One to two hours a day of walks, fetch and swimming. A bored Lab chews. Rest in the shade between games on hot days.",
    grooming: "Moderate. Brush weekly, and daily when shedding. Dry the ears well after swimming to prevent infections.",
    behavior: "Friendly, eager to please and great with families. Easy to train with food rewards, but boisterous as a young dog.",
  },
  "golden-retriever": {
    feeding: "Large-breed food in two measured meals, and large-breed puppy food while growing. Keep lean, as extra weight strains the hips and elbows.",
    exercise: "High. One to two hours a day of walks, retrieving and swimming, in the cool parts of the day.",
    grooming: "Moderate to high. Brush two or three times a week, and daily when shedding. Trim the feathering and check the ears weekly.",
    behavior: "Gentle, patient and very social. Gets on with people and other pets, but doesn't like being left alone for long.",
  },
  "german-shepherd": {
    feeding: "Large-breed food in two meals, not one big one. Rest for an hour before and after meals to lower the risk of bloat.",
    exercise: "Very high. One to two hours a day, plus training or puzzle games. Mental work matters as much as walks.",
    grooming: "Moderate. Brush two or three times a week, and daily during the heavy sheds twice a year.",
    behavior: "Loyal, intelligent and protective. Needs early socialization and steady training. Often reserved with strangers.",
  },
  "siberian-husky": {
    feeding: "Often eats less than you'd expect for its size. Two measured meals, adjusted to keep a lean, athletic shape.",
    exercise: "Very high, but only in the cool early morning or late evening here. Keep in a cool room or air-con during the day. Walk on a leash; Huskies run off and escape fences.",
    grooming: "Brush two or three times a week, and daily when shedding. Don't shave the double coat; it protects the skin from sun.",
    behavior: "Friendly, playful and independent, so not a guard dog. Howls and \"talks\". Strong urge to chase cats and small animals.",
  },
  "pug": {
    feeding: "Small portions in two meals. Pugs overeat easily, and extra weight makes breathing worse. Use treats sparingly.",
    exercise: "Low to moderate. Two short walks of 15–20 minutes, in cool hours only. Stop at the first sign of heavy panting, and use a harness, not a collar.",
    grooming: "Low to moderate. Brush weekly, as Pugs shed a lot. Clean the face wrinkles daily and dry them well.",
    behavior: "Charming, playful and people-focused. Good with children. Snores, and can be stubborn.",
  },
  "beagle": {
    feeding: "Two measured meals. Beagles will eat anything, so keep food, rubbish and toxic foods out of reach and watch the waistline.",
    exercise: "High. At least an hour a day. Follows its nose, so walk on a leash and keep a secure fence.",
    grooming: "Low. Brush weekly, and check and clean the long ears weekly.",
    behavior: "Friendly, curious and cheerful. Great with children and other dogs. Bays and howls, and is hard to call back off-leash.",
  },
  "chihuahua": {
    feeding: "Small-breed food in two or three small meals. Tiny puppies need frequent meals to avoid low blood sugar. Very easy to overfeed.",
    exercise: "Low to moderate. Short walks and indoor play, about 30 minutes a day. Protect from rough play and cold air-con.",
    grooming: "Low. Brush weekly (long coats two or three times). Brush the teeth often, as dental problems are common.",
    behavior: "Bold, loyal and often attached to one person. Can be wary of strangers and snappy if handled roughly, so best with older, gentle children.",
  },
  "pomeranian": {
    feeding: "Small-breed food in two or three small meals. Keep treats tiny.",
    exercise: "Moderate. Two short walks and play, about 30 minutes a day, in cool hours. Use a harness to protect the windpipe.",
    grooming: "High. Brush two or three times a week, right down to the skin. Don't shave the double coat.",
    behavior: "Lively, curious and alert. Barks readily, so start training early. Better with older, gentle children.",
  },
  "french-bulldog": {
    feeding: "Two measured meals. Gains weight easily, which makes breathing harder. Some have food allergies, so change foods slowly.",
    exercise: "Low. Short walks of 15–20 minutes in cool hours. Overheats quickly; never leave in a car. Can't swim well, so supervise near water.",
    grooming: "Low. Brush weekly, and clean and dry the face folds.",
    behavior: "Playful, affectionate and happy in small homes. Good with children; can be stubborn.",
  },
  "poodle": {
    feeding: "Food sized for the variety (toy, miniature or standard) in two meals. Standards should rest after meals, as they can get bloat.",
    exercise: "Moderate to high. From 30 minutes a day for toys to over an hour for standards, plus training games. Needs mental work.",
    grooming: "High. Brush several times a week and clip every 4–6 weeks. Clean the ears regularly.",
    behavior: "Very intelligent, eager to learn and sociable. Easy to train, but sensitive to harsh handling.",
  },
  "dachshund": {
    feeding: "Two measured meals. Keeping slim is the best protection for the long back.",
    exercise: "Moderate. Two walks of 20–30 minutes. Limit jumping on and off furniture; use ramps where you can.",
    grooming: "Low for smooth coats, moderate for long or wire coats. Brush weekly.",
    behavior: "Brave, curious and independent. Can be stubborn and vocal, and loves to dig.",
  },
  "pembroke-welsh-corgi": {
    feeding: "Two measured meals. Corgis love food and gain weight easily, which strains the back.",
    exercise: "High. About an hour a day of walks and games, in cool hours. A herding dog that likes having a job.",
    grooming: "Moderate. Brush two or three times a week; sheds heavily.",
    behavior: "Smart, bold and affectionate. May nip at heels when herding children, so train this out early.",
  },
  "japanese-spitz": {
    feeding: "Two meals of a small-to-medium breed food.",
    exercise: "Moderate. Two walks of 20–30 minutes plus play, in cool hours.",
    grooming: "Moderate. Brush two or three times a week. The coat sheds dirt well but sheds a lot of hair.",
    behavior: "Cheerful, affectionate and alert. A good family dog and watchdog; can be barky.",
  },
  "maltese": {
    feeding: "Small-breed food in two or three small meals. Small kibble and regular tooth brushing help with dental problems.",
    exercise: "Low to moderate. Short walks and indoor play, about 30 minutes a day.",
    grooming: "High. Brush daily, or keep a short puppy cut with a groom every 4–6 weeks. Wipe around the eyes daily.",
    behavior: "Gentle, playful and affectionate. Loves company. Small and delicate, so supervise with young children.",
  },
  "american-bully": {
    feeding: "Two measured meals of a food for muscular medium-to-large dogs. Don't overfeed; extra weight strains the joints.",
    exercise: "Moderate. 45–60 minutes a day of walks and play, in cool hours. Shorter muzzles overheat easily.",
    grooming: "Low. Brush weekly and check the skin folds.",
    behavior: "Confident, loyal and affectionate with family. Needs early socialization and steady training; supervise around other dogs.",
  },

  /* ---------------------------------------------------------------- cats */
  "puspin": {
    feeding: "A complete cat food (wet, dry or both) in two or three meals, with fresh water always. Fish and rice alone isn't a complete diet for cats.",
    exercise: "Active. Two or three short play sessions a day with wand toys. Keeping them indoors is safer.",
    grooming: "Low. Brush weekly and check for fleas and ear mites.",
    behavior: "Smart, adaptable and often affectionate once settled. Independent, and personalities vary a lot.",
  },
  "persian": {
    feeding: "Measured meals of a complete cat food; wet food helps them drink enough. Kibble shaped for flat faces is easier to eat.",
    exercise: "Low. Gentle daily play to keep the weight off.",
    grooming: "Very high. Comb daily to prevent mats, wipe the eyes daily, and bathe every 4–6 weeks or keep a short trim.",
    behavior: "Calm, gentle and quiet. Prefers a peaceful home and a set routine.",
  },
  "siamese": {
    feeding: "Measured meals; usually stays slim. Wet food helps them drink enough.",
    exercise: "High. Daily interactive play, and shelves or a cat tree for climbing.",
    grooming: "Low. Brush weekly.",
    behavior: "Very talkative, social and attached to their people. Doesn't like being left alone for long.",
  },
  "maine-coon": {
    feeding: "Measured meals of a complete cat food. Grows slowly until 3–5 years old; avoid overfeeding along the way.",
    exercise: "Moderate. Daily play; many enjoy fetch and water.",
    grooming: "Moderate to high. Brush two or three times a week, more in hot weather when shedding.",
    behavior: "A gentle giant: friendly, patient and usually good with children and dogs.",
  },
  "ragdoll": {
    feeding: "Measured meals; Ragdolls gain weight easily.",
    exercise: "Low to moderate. Gentle daily play sessions.",
    grooming: "Moderate. Brush two or three times a week.",
    behavior: "Relaxed and affectionate, often going limp when picked up. Best kept indoors.",
  },
  "british-shorthair": {
    feeding: "Measured meals; prone to weight gain, so go easy on treats.",
    exercise: "Low. Encourage play every day to keep them moving.",
    grooming: "Low to moderate. Brush weekly.",
    behavior: "Calm, easygoing and independent. Likes being near people, but often not a lap cat.",
  },
  "scottish-fold": {
    feeding: "Measured meals; keeping slim reduces strain on the joints.",
    exercise: "Low to moderate. Gentle play. Tell your vet if they seem stiff or reluctant to jump.",
    grooming: "Low to moderate. Brush weekly and clean the folded ears gently.",
    behavior: "Sweet, calm and people-oriented.",
  },
  "bengal": {
    feeding: "Measured meals of a high-protein cat food. Puzzle feeders help burn energy.",
    exercise: "Very high. Daily vigorous play, climbing spaces and puzzle toys.",
    grooming: "Low. Brush weekly.",
    behavior: "Energetic, curious and clever. Can be demanding, and often likes water.",
  },
  "sphynx": {
    feeding: "Needs more food than most cats to stay warm; split it into several meals.",
    exercise: "Moderate to high. Daily play.",
    grooming: "Hairless but not low-care. Bathe weekly to remove skin oil, clean the ears, and keep out of strong sun, which burns the skin.",
    behavior: "Very affectionate, social and playful.",
  },
  "russian-blue": {
    feeding: "Food-motivated, so measure portions.",
    exercise: "Moderate. Daily play.",
    grooming: "Low. Brush weekly.",
    behavior: "Gentle and loyal; shy with strangers and fond of routine.",
  },
  "abyssinian": {
    feeding: "Measured meals of a complete cat food.",
    exercise: "Very high. Daily play and plenty of climbing.",
    grooming: "Low. Brush weekly.",
    behavior: "Curious, playful and always busy. Rarely a lap cat.",
  },
  "exotic-shorthair": {
    feeding: "Measured meals; prone to weight gain. Kibble shaped for flat faces is easier to eat.",
    exercise: "Low. Gentle daily play.",
    grooming: "Moderate. Brush weekly and wipe the eyes daily.",
    behavior: "Calm, sweet and quietly playful.",
  },
};
