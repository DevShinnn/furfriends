# Writing answers for the questions the AI can't answer yet

The FurFriends AI only answers from the team's checked answers. When none fits, the owner gets "I don't have a
checked answer for that yet". `gap-answers.csv` lists 21 everyday questions where that happens today, or where the
answer only covers part of the question. Each answer you add helps right away: the AI answers from it, and the app
shows it when the AI's own answer fails the check. No retraining is needed.

**Write every answer yourself, from the sources.** Don't write from memory or with an AI: the app tells owners it
only uses checked sources.

## What to do (about 20–30 minutes per answer)

1. Open `gap-answers.csv` in Excel or Google Sheets. Pick rows and put your name in `written_by` so two people
   don't write the same one. Start with priority 1.
2. Open the pages in `where_to_look`. Write the `answer` in your own words, in the style of the app's other answers:
   - the direct answer first ("No. Cow's milk can upset most adult cats' stomachs..."), then the details
   - about 60–150 words; short "- " lists are fine
   - when to see a vet, if the source says
   - no medicine doses and no brand names
3. Put the exact pages you used in `source`, like the app's other answers:
   `Cornell Feline Health Center, Feeding Your Cat, https://...` (separate several with ` ; `).
4. A **second** person checks the answer against the source and puts their name in `checked_by`. Only rows with
   both names go into the app.
5. `also_asked` has other ways owners ask it, separated by ` | `. Add more if you like, in English or Taglish.
6. Save it as CSV again with the same name and columns, and send it to whoever runs the app's build. They copy
   the finished rows into `ai-server/data/open/researched_basics.csv`, then run `python prepare_data.py` and
   `npm run knowledge`, and add each row to the labels of the test questions in `test_ids` (see
   `docs/ai-knowledge-gaps.md`).

## Priorities
- **1**: owners ask these often, and today they get no answer or only part of one (7 rows).
- **2**: everyday cat behaviour questions with no answer (3 rows).
- **3**: questions whose current answer only partly fits, found while checking the AI's answers on 2026-11-20 (11 rows).

Left out on purpose: prices, brands, insurance, which breed is "best", local barangay rules, and animals other than
cats and dogs. FurFriends can't check those, or they're outside the app.
