# How the v7 training answers are written

Each training question gets its own answer, written from the one checked passage that answers it (the `passage` in
`todo.jsonl`: a FurFriends checked answer, or a FurFriends first-aid guide). The model learns to write like this,
so these answers are what owners will get. `written_answers.py check` enforces the rules marked ✔.

## Rules
1. **Answer the exact question first**, in the first sentence: yes or no, the number, or the main thing to do
   ("Yes. Even indoor cats need core vaccines." / "Every 3 months." / "Cool them down and go to a vet now.").
2. **Keep only what this question needs.** Leave out passage parts about the other species, other topics, and
   repeats. A cat question never gets the "Dogs:" part, and the other way round ✔.
3. **Only facts that are in the passage** ✔: no new numbers, medicines, doses, laws, organisations, links or
   advice, and nothing from general knowledge, even if true. Keep the passage's words for the facts: the app checks
   that most of an answer's words come from its passage ✔. Rephrase only to connect sentences and fit the question.
4. **Keep the safety parts that apply**: "go to a vet now if…" signs, "don't…" warnings, and the vet line at the
   end ✔ (when the passage says to see a vet now).
5. **Length**: usually 40 to 110 words; first-aid questions up to about 180 words. At most 150 (first aid: 230) ✔.
   Short "- " lists are fine for steps and signs.
6. **First-aid questions** (`kind: first-aid guide`): say what it may be and how urgent it is, then the guide's
   "What to do now" steps (all that apply, same facts, shorter words are fine), the "Don't" items, and end with the
   guide's own line ("Go to a vet now." or "Call your vet for advice."). For "Can dogs have X?" or "My cat ate X",
   start with whether X is dangerous, using the guide's list of common poisons.
7. **Talk to the owner** ("your dog"), in English, also when the question is in Tagalog or Taglish.
8. **Never**: start with "I" ✔, say you couldn't find it ✔, mention "records" ✔ (the app adds the pet's notes
   itself), name the pet, or mention "the passage", "sources" or "FurFriends' checked answer".
9. **Follow-ups** (`earlier` is set, e.g. "What about for my dog?"): answer the follow-up for the species it asks
   about, from its passage.
10. **Per species**: when `needs_species` lists a species, the question is also trained with that species' pet
    profile. If the passage has parts that differ by species, add `by_species` with an answer for each listed species
    that keeps only that species' part. If nothing differs, leave `by_species` out.

## Format
One JSON object per line, `key` copied exactly from `todo.jsonl`:
```json
{"key": "how often should i deworm my dog?", "question": "How often should I deworm my dog?", "answer": "...", "by_species": {"Cat": "..."}}
```

## Examples (all pass the checks)
**Can dogs have chocolate?** (first-aid guide: Poisoning)
> No. Chocolate is on the list of common poisons, so don't give your dog any. If your dog already ate some, act fast,
> even if they seem fine. Signs can take hours or days.
>
> What to do now:
> - Move your dog away from it and remove anything left in their mouth, if it's safe to do so.
> - Note what they ate, about how much, and when. Bring the packaging.
> - Call your vet or the nearest 24-hour clinic now and tell them you're on your way.
>
> Don't:
> - Make your dog vomit unless a vet tells you to.
> - Use home remedies like salt, milk, oil or hydrogen peroxide, or give any human medicine.
>
> Go to a vet now.

**I just got a new kitten. What should I do first? → How about puppies?** (checked answer about a new puppy)
> For a new puppy, book a vet visit soon. Your puppy will need a series of shots and deworming.
>
> - Vaccines: shots every 2 to 3 weeks until about 4 months old. Your vet will set the exact schedule.
> - Until the shots are done, keep your puppy away from dogs that may not be vaccinated.
> - Deworming: your vet may deworm and check stool samples every 2 to 4 weeks until two tests in a row are clear.
> - Feeding: puppies 6 to 12 weeks old usually eat 4 small meals a day of puppy food.
> - Start potty training early, and let them meet people and other animals gently, especially at 2 to 4 months old.

**How can I tell if my pet's problem is a real emergency or can wait?** (`needs_species: ["Cat"]`): the general
answer leaves out "(dogs)" and "(cats)" details; the `by_species.Cat` answer keeps the cat ones ("breathes with the
mouth open", "especially male cats") and drops "a swollen belly and keeps retching (dogs)".
