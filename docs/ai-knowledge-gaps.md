# What the assistant can't answer yet

The FurFriends AI only answers from checked passages. When none is about the question, it says it doesn't have a
checked answer. That's the right reply, but some of these questions are ones owners will keep asking. This list
comes from the labelled questions in `ai-server/data/retrieval_eval.jsonl` that the library has no answer for
(October 2026).

**Only add answers through the usual process**, so every fact has a source and a person who checked it:
1. Add a row to `ai-server/data/open/researched_basics.csv` (or `researched_qa.csv`) in your own words, with the
   exact pages you used in `source`, other ways owners ask it (Taglish too) in `also_asked`, and your name in
   `checked_by` once you have checked it against the source. `prepare_data.py` warns about rows with no `checked_by`.
2. Add the source to `ai-server/data/SOURCES.md` if it's new.
3. `python prepare_data.py`, then `npm run knowledge` (rebuilds the app's index).
4. Questions in `retrieval_eval.jsonl` that the new row answers need its id in their `relevant` list. Otherwise
   the evaluation counts a right answer as wrong. Then run `npm run eval:retrieval -- --calibrate` and `npm test`.

Don't write answers from memory or from an AI. The assistant tells owners it only uses checked sources.

## First: everyday questions that lost their answer
Since 2026-10-30 the assistant answers only from checked sources. Pets Stack Exchange answers are owners' opinions
that nobody checked, so they're no longer searched (`scripts/build-knowledge.mjs`). These questions were only
answered by them, and owners ask them often:

| Question | Where to look |
|---|---|
| r09 Can cats drink cow's milk? | Cornell Feline Health Center, Merck (pet owner): feeding cats |
| s01 Can I give my cat dog food? | Cornell Feline Health Center, Merck: cats' nutritional needs (taurine) |
| r19 How do I introduce a new cat to my other cat? | Cornell Feline Health Center, ASPCA: introducing cats |
| r22 How can I tell if my cat is in pain? | Cornell Feline Health Center, Merck: signs of pain in cats |
| r24, f09 My dog is afraid of fireworks | ASPCA, Merck (pet owner): noise fears in dogs |
| r26 Can I use human shampoo on my cat? | Merck, VCA Animal Hospitals: bathing cats |
| s02 Why does my cat knead blankets? | Cornell Feline Health Center: cat behaviour |
| s06 Why does my cat bring me dead lizards? | Cornell Feline Health Center: hunting behaviour |
| w04 Is it normal for cats to sleep most of the day? | Cornell Feline Health Center, Merck: normal cat behaviour |
| r33 Are aspins healthier than purebred dogs? | Only if a published source covers mixed-breed health; otherwise leave it unanswered |

## Also worth adding (owners ask these, and published guidance exists)
| Topic | Example questions | Where to look |
|---|---|---|
| Breeds and hot, humid weather | o01–o04, m01, w06: "Is a Siberian Husky suitable for the Philippines?" | Merck Veterinary Manual (pet owner) on heatstroke and brachycephalic breeds; breed-club care pages. The answer should be about heat risk and care, not a ranking of breeds. This is the question from the original bug report. |
| Fruits not yet covered | o09: "Can my dog eat durian?" | ASPCA Animal Poison Control and Merck pages on fruit; say so plainly if no source covers durian. |
| Taking a pet abroad | o20: "Can I take my cat with me when I move to Japan?" | Bureau of Animal Industry (export permit) and the destination country's official animal-import page. Point owners to those pages rather than listing rules that change. |
| Local rules on how many dogs | o28: barangay limits | These are city or barangay ordinances, so the answer can only say to ask the barangay or city vet's office. |

## Better left unanswered
Prices and costs (o08, o23, m09), brands and insurance (o11, o22), particular clinics (o24, which the clinic
locator covers), pet names (o18), and things that aren't cat or dog care (o05, o06, o10, o12–o14, o16, o17, o19,
o21, o25, o27). Prices and brands change and FurFriends can't check them. The rest are outside what the app is for.
