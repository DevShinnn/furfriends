# Checking the symptom rules

FurFriends can tell an owner what their pet's history means for a symptom. For example, if a male cat is peeing
outside the litter box, it adds: *"Tiger is a male cat, and male cats are most at risk of a blocked bladder. Go to
the vet now if he strains with little or no pee coming out."*

Each of these notes comes from a **rule**. A rule only goes live, in the app and in the AI's training, after
**two of us** have checked it against its source. Our team has no vet, so this check is how we show the notes are accurate.

## What to do (about 1 hour each)

1. Open `symptom-notes-review.csv` in Excel or Google Sheets. There is one row per rule (24 rules).
2. For each row, read:
   - `applies_when`: which pets get the note
   - `note_owners_see`: the note itself (`{name}` becomes the pet's name)
   - `checked_answer_says`: the exact words of FurFriends' checked answer that the note relies on (`[...]` means some words were cut)
   - `checked_answer_sources`: the pages that checked answer came from. **Open the link** and find the same fact there.
3. Mark the row **yes** only if all of these are true:
   - The source page really says it.
   - The note says no more than the source does.
   - The note doesn't name a diagnosis or a dose.
   - `applies_when` is the right group of pets.

   Otherwise mark **no** and say why in `comment`.
4. The first person fills in `reviewer_1` (your name) and `ok_1` (yes/no). The second person fills in `reviewer_2` and `ok_2`.
   Don't look at each other's answers before you've both finished.
5. Save as **CSV** in the same place, with the same file name.
6. Run `npm run symptom-review`. It lists how many rules are approved, and only those are used.

If someone changes a rule later, its review is cleared, and it has to be checked again.

## For the thesis

Report the rules as *checked against their cited sources by two team members*, not as vet-approved. Mention as a
limitation that the team has no veterinarian. The pets in the training data are simulated (made up), and are
labelled that way.
