/* First-aid guides for cats and dogs. Built into the app so they work offline.
   urgency: "now" = go to a vet immediately; "call" = call your vet for advice, go now if red flags.
   Content is general first aid, not a diagnosis — every guide ends at the vet. */

export const RED_FLAGS = [
  "Struggling to breathe, or pale, blue or grey gums",
  "Collapse, can't stand, or won't wake up properly",
  "A seizure lasting over 5 minutes, or more than one in a day",
  "Swollen, tight belly with retching but nothing coming up",
  "Straining to pee with little or nothing coming out (especially male cats)",
  "Ate or touched something poisonous, even if they seem fine",
  "Bleeding that won't stop after 5 minutes of firm pressure",
  "Hit by a vehicle or fell from a height",
  "Heavy panting, drooling and weakness on a hot day",
  "Any eye injury, or an eye bulging out of its socket",
];

export const NORMALS = [
  ["Temperature", "38.0–39.2 °C (rectal)"],
  ["Breathing at rest", "Under 30 breaths a minute (count while asleep)"],
  ["Gums", "Moist and pink; color returns within 2 seconds after a press"],
  ["Heart rate", "Dogs 60–140 (small dogs higher) · Cats 140–220 per minute"],
];

export const FIRST_AID_KIT = [
  "Your vet's number and the nearest 24-hour animal hospital",
  "Gauze pads, rolled gauze and self-stick bandage wrap",
  "Blunt-tip scissors, tweezers and a tick remover",
  "Sterile saline for rinsing eyes and wounds",
  "Digital thermometer and petroleum jelly",
  "Disposable gloves and clean towels",
  "A soft muzzle (or a strip of cloth) and a cone collar",
  "Instant cold pack",
  "Needle-free syringe for rinsing or giving water",
  "A sturdy carrier, or a board or blanket to carry a large dog",
];

/* Emergency types, in the order they're listed. Every guide has one. */
export const CATEGORIES = [
  { key: "breathing", label: "Breathing & choking", icon: "wind" },
  { key: "collapse", label: "Collapse & seizures", icon: "heart" },
  { key: "poison", label: "Poisoning", icon: "flask" },
  { key: "bites", label: "Bites & stings", icon: "bug" },
  { key: "injury", label: "Injuries & wounds", icon: "drop" },
  { key: "heat", label: "Heat & burns", icon: "thermo" },
  { key: "tummy", label: "Stomach & bladder", icon: "alert" },
];
export const categoryOf = (g) => CATEGORIES.find((c) => c.key === g.category);

export const GUIDES = [
  {
    slug: "heatstroke", category: "heat", title: "Heatstroke", icon: "thermo", urgency: "now", species: "both",
    summary: "Overheating can damage organs within minutes. Flat-faced and thick-coated breeds are most at risk.",
    signs: [
      "Heavy panting, or noisy breathing (any panting in a cat is a warning sign)",
      "Thick drool, bright red or very pale gums",
      "Vomiting or diarrhea",
      "Wobbly, weak or confused; collapse or seizures",
    ],
    steps: [
      "Move them out of the sun right away, into shade or an air-conditioned room.",
      "Wet the coat with cool tap water, especially the belly, armpits, groin and paws, then fan them so the water evaporates.",
      "Offer small sips of cool water if they're alert. Don't force them to drink.",
      "Keep cooling for 10–15 minutes, then go to the vet with the car's air-con on, even if they seem better. Damage can show up hours later.",
      "If you have a rectal thermometer, stop active cooling at about 39.5 °C so they don't get too cold.",
    ],
    avoid: [
      "Ice or ice-cold water. It narrows blood vessels and slows cooling.",
      "Leaving a wet towel draped over them. It traps heat. Wet the coat and keep air moving instead.",
      "Waiting to see if they recover on their own.",
    ],
    note: "Never leave a pet in a parked car, even with the windows open. Walk dogs early in the morning or after sunset, and keep water and shade available all day.",
  },
  {
    slug: "poisoning", category: "poison", title: "Poisoning", icon: "flask", urgency: "now", species: "both",
    summary: "Many everyday foods, medicines and plants are toxic. Act fast, even if your pet seems fine. Signs can take hours or days.",
    signs: [
      "Vomiting, drooling or diarrhea",
      "Shaking, twitching or seizures",
      "Wobbly, unusually sleepy or overexcited",
      "Pale gums, bleeding or bruising (rat poison)",
      "Trouble breathing",
    ],
    steps: [
      "Move your pet away from the source and remove anything left in their mouth, if it's safe to do so.",
      "Note what they ate, about how much, and when. Bring the packaging, label or a piece of the plant.",
      "Call your vet or the nearest 24-hour clinic now and tell them you're on your way.",
      "If it's on their skin or fur (for example a flea product), wash with mild dish soap and lukewarm water, then rinse well.",
    ],
    avoid: [
      "Making your pet vomit unless a vet tells you to. It's dangerous with some poisons and if your pet is drowsy.",
      "Home remedies like salt, milk, oil or hydrogen peroxide.",
      "Giving any human medicine.",
    ],
    lists: [{
      title: "Common poisons",
      items: [
        "Chocolate, coffee and energy drinks",
        "Grapes and raisins",
        "Onions, garlic and chives",
        "Xylitol: sugar-free gum, candy and some peanut butters",
        "Human painkillers. Paracetamol is deadly to cats; ibuprofen harms both cats and dogs.",
        "Rat and mouse poison, insect sprays and pesticides",
        "Lilies (cats). Even pollen or the vase water can cause kidney failure.",
        "Dog flea and tick products on cats (permethrin)",
        "Alcohol, cleaning products and antifreeze",
      ],
    }],
  },
  {
    slug: "toad", category: "poison", title: "Toad poisoning", icon: "drop", urgency: "now", species: "both",
    summary: "Cane toads, the large brown toads that come out after rain, release a poison when a dog or cat bites or licks them.",
    signs: [
      "Sudden heavy drooling or foaming at the mouth",
      "Pawing at the mouth, shaking the head",
      "Bright red gums",
      "Vomiting, wobbliness, a racing heartbeat, seizures",
    ],
    steps: [
      "Rinse the mouth straight away. Point the head down and run a gentle stream of water across the gums and tongue from the side, so it flows out of the mouth. Keep going for 10 minutes.",
      "Wipe the gums and tongue with a damp cloth to remove the sticky poison.",
      "Go to the vet now, especially if there's anything more than drooling.",
    ],
    avoid: [
      "Spraying water down the throat. It can go into the lungs.",
      "Making them vomit.",
    ],
  },
  {
    slug: "choking", category: "breathing", title: "Choking", icon: "wind", urgency: "now", species: "both",
    summary: "Something stuck in the mouth or throat. If your pet is still breathing and coughing, go to the vet. Only step in if they can't breathe.",
    signs: [
      "Pawing at the mouth, gagging or retching",
      "Panic, struggling to breathe",
      "Blue or pale gums",
      "Collapse",
    ],
    steps: [
      "Stay calm and hold them gently but firmly. A choking pet may bite.",
      "Open the mouth and look. If you can see the object and get a grip on it, remove it carefully with fingers or tweezers.",
      "If you can't remove it and they can't breathe: hold a cat or small dog with their back against your chest and give 5 firm thrusts inward and upward just below the ribs.",
      "For a large dog, put your arms around the belly from behind, make a fist just below the ribs and push firmly up and forward 5 times. If they're lying down, push from behind the ribs toward the head.",
      "Check the mouth again and repeat. If they collapse and stop breathing, start CPR.",
      "Go to the vet even if the object comes out. The throat may be injured.",
    ],
    avoid: [
      "Sweeping your fingers blindly. It can push the object deeper.",
      "Pulling on string, thread or tinsel hanging from the mouth or bottom. It can cut the intestines.",
    ],
  },
  {
    slug: "breathing", category: "breathing", title: "Trouble breathing", icon: "wind", urgency: "now", species: "both",
    summary: "Breathing problems can come from heart disease, asthma, injury or allergic reactions. They are always urgent.",
    signs: [
      "Open-mouth breathing in a cat",
      "Neck stretched out, elbows held out, belly heaving",
      "More than 40 breaths a minute at rest",
      "Blue, grey or pale gums; noisy breathing",
    ],
    steps: [
      "Keep them calm and cool, and handle them as little as possible.",
      "Loosen or remove a tight collar or harness.",
      "Let them pick the position that's comfortable. Carry small pets in an open carrier.",
      "Go to the vet now, with the car's air-con on.",
    ],
    avoid: [
      "Holding them tightly or covering their face.",
      "Offering food or water.",
    ],
  },
  {
    slug: "bleeding", category: "injury", title: "Bleeding & wounds", icon: "drop", urgency: "now", species: "both",
    summary: "Most bleeding stops with firm, steady pressure. Bite wounds can look small but often get infected.",
    signs: [
      "Bleeding that spurts or won't stop",
      "A deep or gaping wound, or one on the chest or belly",
      "Puncture wounds from another animal's bite",
      "Pale gums, weakness (blood loss)",
    ],
    steps: [
      "If they're in pain, use a soft muzzle or towel so they don't bite. Skip this if they're vomiting or struggling to breathe.",
      "Press firmly on the wound with a clean cloth or gauze for at least 5 minutes. Don't lift it to check.",
      "If blood soaks through, add more layers on top. Don't remove the first one.",
      "Once it stops, wrap it snugly but not tight. You should fit two fingers under the bandage.",
      "Go to the vet for anything deeper than a scrape, all bite wounds, and any bleeding that won't stop.",
    ],
    avoid: [
      "Tourniquets, unless you're trained. They can kill the limb.",
      "Hydrogen peroxide or alcohol in the wound. They damage tissue.",
      "Pulling out something stuck in the wound.",
    ],
  },
  {
    slug: "accident", category: "injury", title: "Hit by a vehicle or fall", icon: "car", urgency: "now", species: "both",
    summary: "Internal bleeding and chest injuries may not show at first. Pets that fall from balconies or windows need a vet check too.",
    signs: [
      "Limping, not putting weight on a leg",
      "Fast breathing, pale gums",
      "Swelling belly, bleeding from the nose or mouth",
      "Seems fine but was hit or fell. Still go.",
    ],
    steps: [
      "Make sure you're safe from traffic first.",
      "Approach slowly and speak softly. Hurt animals bite, so use a towel or muzzle unless they're vomiting or struggling to breathe.",
      "Move them as little as possible. Slide a large dog onto a board or blanket to use as a stretcher, keeping the back and neck straight. Put small pets in a box or carrier.",
      "Press on any bleeding, keep them calm, and go to the vet now.",
    ],
    avoid: [
      "Giving any painkiller.",
      "Trying to straighten or splint a leg.",
      "Giving food or water.",
    ],
  },
  {
    slug: "seizure", category: "collapse", title: "Seizures", icon: "zap", urgency: "now", species: "both",
    summary: "Most seizures stop within 2 minutes. Keep your pet safe, time it, and call your vet.",
    signs: [
      "Collapse, stiff or paddling legs",
      "Jaw chomping, drooling, losing control of pee or poo",
      "Not responding to you",
      "Afterwards: confused, wobbly, briefly blind",
    ],
    steps: [
      "Stay calm and note the time it starts.",
      "Move furniture and objects away, keep them away from stairs and water, and put a towel under the head. Keep your hands away from the mouth.",
      "Dim the lights and keep things quiet. Film it if you can, since it helps the vet.",
      "Afterwards, keep them somewhere quiet and cool, and speak softly while they recover.",
      "Call your vet after any first seizure. Go now if it lasts over 5 minutes, they have another one, they don't wake up between seizures, or they may have eaten a poison.",
    ],
    avoid: [
      "Putting fingers or anything else in their mouth. Pets can't swallow their tongue.",
      "Holding them down.",
      "Giving food, water or medicine until they're fully alert.",
    ],
  },
  {
    slug: "bloat", category: "tummy", title: "Bloat (twisted stomach)", icon: "alert", urgency: "now", species: "Dog",
    summary: "The stomach fills with gas and can twist. It can kill within hours and usually needs surgery. Most common in large, deep-chested dogs.",
    signs: [
      "Swollen, tight belly",
      "Retching or trying to vomit with nothing coming up",
      "Restless, pacing, can't get comfortable",
      "Drooling, pale gums, collapse",
    ],
    steps: [
      "Go to the vet immediately. Call ahead so they can prepare.",
      "Keep your dog as calm and still as you can on the way.",
    ],
    avoid: [
      "Waiting to see if it passes.",
      "Giving food, water or home remedies.",
      "Trying to make them vomit.",
    ],
    note: "To lower the risk, feed two or three smaller meals a day and rest for an hour before and after meals.",
  },
  {
    slug: "urinary", category: "tummy", title: "Can't pee (blocked bladder)", icon: "alert", urgency: "now", species: "both",
    summary: "A blocked bladder, most common in male cats, can be fatal within a day or two. It's often mistaken for constipation.",
    signs: [
      "Straining in the litter box with little or no pee",
      "Going back to the box again and again",
      "Crying while trying to pee, or peeing outside the box",
      "Licking the genitals; vomiting, hiding, low energy",
    ],
    steps: [
      "Go to the vet now. Tell them when you last saw your pet pee normally.",
      "Carry them gently in a carrier.",
    ],
    avoid: [
      "Pressing on the belly or bladder.",
      "Waiting until the next day.",
    ],
  },
  {
    slug: "vomiting", category: "tummy", title: "Vomiting & diarrhea", icon: "alert", urgency: "call", species: "both",
    summary: "One episode in a bright, adult pet is often minor. Call your vet for advice and watch closely for the warning signs below.",
    signs: [
      "Go now: repeated vomiting, or they can't keep water down",
      "Go now: blood in the vomit or stool, or black, tarry stool",
      "Go now: swollen or painful belly, weakness or collapse",
      "Go now: a puppy or kitten, or an unvaccinated young dog (parvovirus risk)",
      "Go now: may have swallowed a toy, bone or poison",
    ],
    steps: [
      "Call your vet and describe what you've seen. A photo helps.",
      "Offer small amounts of water often.",
      "If your vet agrees, feed small portions of bland food, like plain boiled chicken and rice for dogs.",
      "Keep a sick puppy away from other dogs and disinfect the area. Parvovirus spreads easily.",
    ],
    avoid: [
      "Human anti-diarrhea or stomach medicines. Some are toxic to cats and some dogs.",
      "Withholding food from a cat for more than a day. It can cause liver disease.",
    ],
  },
  {
    slug: "burns", category: "heat", title: "Burns & electric shock", icon: "flame", urgency: "now", species: "both",
    summary: "Chewed electric cords, hot water and chemicals are the usual causes. Electric shock can cause breathing problems hours later.",
    signs: [
      "Red, blistered or raw skin; singed fur",
      "Burns at the corners of the mouth after chewing a cord",
      "Coughing or trouble breathing",
      "Collapse",
    ],
    steps: [
      "Electric shock: switch off the power or unplug before you touch them. If you can't, push them away with something dry and wooden, like a broom handle.",
      "Check breathing, and start CPR if they aren't breathing and have no heartbeat.",
      "Heat burns: run cool water over the area for 10 minutes, then cover with a clean, damp cloth.",
      "Chemical burns: wear gloves and rinse with plenty of running water for 15–20 minutes. Stop them licking it.",
      "Go to the vet, even if they seem fine.",
    ],
    avoid: [
      "Touching a pet that's still in contact with electricity.",
      "Ice, butter, oil or creams on burns.",
      "Popping blisters.",
    ],
  },
  {
    slug: "snake", category: "bites", title: "Snake bite", icon: "alert", urgency: "now", species: "both",
    summary: "Venom spreads faster when your pet moves. Keep them still and get to a vet. Signs can be delayed.",
    signs: [
      "A sudden yelp, swelling, puncture marks",
      "Bleeding that won't stop",
      "Drooling, wide pupils, trembling",
      "Weakness, wobbliness, trouble breathing, collapse",
    ],
    steps: [
      "Keep yourself safe. Don't try to catch or kill the snake. Take a photo from a distance if it's easy.",
      "Keep your pet calm and still, and carry them if you can.",
      "Take off the collar if the bite is on the head or neck, because it may swell.",
      "Go to the vet now. Call ahead so they can check for antivenom.",
    ],
    avoid: [
      "Cutting the wound, sucking out venom, tourniquets or ice.",
      "Waiting for signs to appear.",
    ],
  },
  {
    slug: "stings", category: "bites", title: "Stings & allergic reactions", icon: "bug", urgency: "call", species: "both",
    summary: "Bee, wasp, ant and centipede stings usually cause swelling that settles. A spreading reaction or trouble breathing is an emergency.",
    signs: [
      "Mild: swelling and pain where they were stung, licking the spot",
      "Go now: the face swells and keeps spreading, or hives all over the body",
      "Go now: vomiting, diarrhea, pale gums, weakness or collapse",
      "Go now: trouble breathing, a sting inside the mouth or throat, or many stings",
    ],
    steps: [
      "Move away from the insects.",
      "If you see a bee stinger, scrape it out sideways with a card. Don't squeeze it.",
      "Hold a cold pack wrapped in cloth on the spot for 10 minutes.",
      "Watch closely for the next 1–2 hours and call your vet for advice.",
    ],
    avoid: [
      "Giving human allergy or cold tablets without a vet's dose. Some contain decongestants that are toxic to pets.",
    ],
  },
  {
    slug: "eye", category: "injury", title: "Eye injuries", icon: "eye", urgency: "now", species: "both",
    summary: "Eyes get worse fast. Flat-faced breeds like Shih Tzus and Pugs are prone to eye injuries, and an eye can even pop out.",
    signs: [
      "Squinting, an eye held shut, pawing at it",
      "Redness, tearing, cloudiness",
      "Something stuck in the eye",
      "An eye bulging out of its socket",
    ],
    steps: [
      "Stop them rubbing it. Use a cone collar or hold their paws.",
      "Chemicals: flush the eye with sterile saline or clean, lukewarm water for 10–15 minutes.",
      "Eye out of its socket: keep it moist with a clean cloth soaked in saline and go straight away.",
      "Go to the vet the same day for any eye injury.",
    ],
    avoid: [
      "Removing something stuck in the eye.",
      "Pushing a bulging eye back in.",
      "Human eye drops or ointments.",
    ],
  },
  {
    slug: "cpr", category: "collapse", title: "CPR", icon: "heart", urgency: "now", species: "both",
    summary: "Only for a pet who is unconscious, not breathing and has no heartbeat. Get someone to drive to the vet while you work.",
    signs: [
      "Doesn't respond when you call or touch them",
      "No chest movement for 10 seconds",
      "No heartbeat on the left side of the chest, just behind the elbow",
    ],
    steps: [
      "Lay them on their right side on a firm surface. Put flat-chested breeds like Bulldogs on their back.",
      "Cats and small dogs: wrap one hand around the chest just behind the elbows and squeeze. Larger dogs: stack both hands on the widest part of the chest. On their back: press on the breastbone.",
      "Push hard and fast: a third to a half of the chest's width, 100–120 times a minute (the beat of \"Stayin' Alive\"). Let the chest come all the way back up.",
      "After 30 compressions, close the mouth, straighten the neck and give 2 quick breaths into the nose, watching the chest rise.",
      "Keep going 30 compressions to 2 breaths. Check for breathing and a heartbeat every 2 minutes, and keep going on the way to the vet.",
    ],
    avoid: [
      "CPR on a pet who is breathing or has a heartbeat. It can hurt them.",
    ],
  },
];

export const findGuide = (slug) => GUIDES.find((g) => g.slug === slug) || null;
