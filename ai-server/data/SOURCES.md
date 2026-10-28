# Training data sources

List every source you take training data from. Your panel will ask where the data came from,
and some "open" sources don't allow reuse. Only use sources whose license allows it, and
rewrite answers in your own words rather than copying text.

| # | Source (name + link) | License / terms | What you used | Date collected | Checked by |
|---|---|---|---|---|---|
| 1 | FurFriends sample answers (`qa.csv`, `sample_train.jsonl`, `sample_test.jsonl`) | Written for this project | 24 Q&As: 8 training, 16 test | 2026-10-19 | Project team, against published sources |
| 2 | Pets Stack Exchange, https://pets.stackexchange.com, from the official Stack Exchange data dump on archive.org ([pets.stackexchange.com.7z](https://archive.org/download/stackexchange/pets.stackexchange.com.7z), April 2024) (`open/pets_stackexchange.csv`, made by `fetch_open_data.py`) | CC BY-SA 2.5 / 3.0 / 4.0, depending on the post date. Credit each post, and share adapted data under the same license. | 2,447 answers to 2,065 cat and dog questions, from 8,360 questions (2013–2024). Up to 2 answers per question: the accepted one (if upvoted) and others with 3+ votes. No medicine doses, no answers needing a photo or replying to other users, and emergencies only with vet advice. In the dump each answer names its own question, so answers can't be paired with the wrong question. (Until 2026-10-28 this came from Hugging Face's partial copy, HuggingFaceH4/stack-exchange-preferences: 669 Q&As, after removing 53 mismatched pairs.) | 2026-10-28 | Project team: check a sample against trusted sources |
| 3 | Researched answers (`open/researched_qa.csv`), written in our own words from public sources. Each row's `source` column lists the exact pages used. Main sources: US FDA Center for Veterinary Medicine and CDC (public domain); Philippine laws RA 9482, RA 8485, RA 10631 and EO 84 (lawphil.net), the RA 9482 implementing rules, DOH and BAI pages (Philippine government works are not copyrighted); WHO rabies fact sheet; WSAVA 2024 vaccination guidelines; 2023 AAHA Senior Care Guidelines; Merck Veterinary Manual (pet owner version); Cornell Feline and Riney Canine Health Centers; ASPCA Animal Poison Control; American Heartworm Society; CAPC; Galay et al. 2018 (ticks in Metro Manila and Laguna). | Facts used and cited; no text copied | 98 Q&As: emergencies 17, poisons 18, vaccines 11, parasites 14, senior pets 10, Philippine rules 18, rabies 10 | 2026-10-19 | Project team: check each against its listed source, especially emergencies and poisons |
| 4 | Researched everyday-care answers (`open/researched_basics.csv`), written in our own words. Each row's `source` column lists the exact pages used: Merck Veterinary Manual (pet owner), Cornell Feline and Riney Canine Health Centers, VCA Animal Hospitals, ASPCA, Humane World for Animals, WSAVA body condition charts. | Facts used and cited; no text copied | 27 Q&As on appetite, vomiting, diarrhea, feeding, weight, limping, nails, teeth, potty training, litter box, spay/neuter, puppy biting, bathing, cat flu, ears, new puppy/kitten, water, grass eating, bad breath, and (added 2026-10-24) hair loss/shedding and itching for cats and dogs, from the Merck pet-owner pages. All training rows, so the test set is unchanged. | 2026-10-20, 4 rows 2026-10-24 | Project team: check each against its listed source |
| 5 | US government pet health pages (`passages/gov_guides.csv`, made by `fetch_gov_guides.py`): CDC Healthy Pets, https://www.cdc.gov/healthy-pets/ (19 pages), and US FDA Center for Veterinary Medicine, Animal Health Literacy, https://www.fda.gov/animal-veterinary/animal-health-literacy (92 pages) | Public domain (works of the US federal government). Each passage keeps its page link. | 203 passages of up to 180 words (pet food safety, toxic foods, flea and tick products, heartworm, diseases people can catch from pets, disaster and travel prep). Not Q&As: the assistant reads them as sources; they aren't training answers. Passages with medicine doses left out. | 2026-10-28 | Project team: check a sample against the live pages |
| 6 |  |  |  |  |  |

The `also_asked` column (in the researched files) lists other ways owners ask the same question,
including Taglish. The app's search finds the answer by any of them. Test rows may have them too:
the accuracy test builds its index without the test rows, so they can't help the score.

## Credit for Pets Stack Exchange
The Q&As in `open/pets_stackexchange.csv` come from Pets Stack Exchange users, licensed under
CC BY-SA (https://creativecommons.org/licenses/by-sa/4.0/). Each row's `source` column links to the
original answer and names its author. The rows were changed: HTML formatting was removed, and only
the best answer to each question was kept. Any dataset you share that is built from these rows must
use the same license.

## Notes on the researched answers
- Fine amounts are the ones written in RA 9482 (2007) and RA 10631 (2013). Amendment bills were found but no signed amendment, and cities may have their own ordinances. Each answer that gives a fine says so.
- Some RA 9482 details (14-day observation, 1.5 m leash, yearly re-registration, 90-day and 6-month confinement) come from the implementing rules, read from a third-party copy (dev.lawyerly.ph) because the Supreme Court eLibrary copy didn't load.
- Wound washing: sources say 5 to 15 minutes. The answers use "about 15 minutes" (WHO, DOH Bicol).
- Rabies boosters: global guidelines allow 1- or 3-year vaccines, but the RA 9482 rules require yearly vaccination, so the answers say yearly.
- Points to double-check against a second source in the content check (there is no vet adviser):
  - the cat choking technique
  - the toad mouth-rinse steps
  - kittens' first deworming at 2 weeks (CAPC)
  - the signs of an allergic reaction to vaccines

## Sources checked and not used (2026-10-19, WikiVet re-checked 2026-10-28)
| Source | Why not |
|---|---|
| WikiVet, https://en.wikivet.net (checked 2026-10-28) | Licensed CC BY-NC-ND 3.0. "No Derivatives" doesn't allow sharing changed versions, and a model trained on it, or rewriting it in answers, makes changed versions. Could only be linked to, not used. |
| reematthews/Veterinary_Textbook (Hugging Face) | A copy of a published textbook (Blackwell's Five-Minute Veterinary Consult) uploaded without permission |
| viggovet/Veterinary-Med (Hugging Face) | Access needs an approved request; CC BY-NC-SA; doesn't say who wrote the answers; written for vets, not owners |
| rajparavaah/petgpt (Hugging Face) | A third of the questions are duplicates; dogs only; very short answers; off-topic rows (pet names) |
| PetQA (arXiv 2609.04598) | Korean only; no license found |
| Merck Veterinary Manual, PetMD, VCA, ASPCA | Copyrighted. Use them only to check facts, never as training text. |
| Other Hugging Face results (VetLLM, vet_med, image sets, Reddit petcare sample) | Research abstracts or news text, not owner Q&As; images; answers that don't match the questions |

## Good sources for the team's own Q&As
Write these in your own words, in `qa.csv`:
- **US FDA pet pages** (Animal Health Literacy): public domain, so free to reuse.
- **Philippine government sources**, such as RA 9482 (Anti-Rabies Act) and the Bureau of Animal Industry: government works aren't copyrighted. They give the Philippine-specific rules: rabies vaccination, dog registration with the LGU, and reporting bites within 24 hours.

These are best for the topics the downloaded data covers least: emergencies, poisons, vaccines and parasites.

Before each training run:
- [ ] Every answer was checked by the team against a trusted vet source (see docs/content-check) (for downloaded data: a checked random sample)
- [ ] No owner's personal details (names, phone numbers) are in the data
- [ ] Ratings exported from the app were reviewed, and `_review` was removed
- [ ] A held-out test set (questions not used for training) is kept separate for evaluation
