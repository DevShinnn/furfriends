# Checking the AI's training answers (v7)

Until v6, the AI was trained to paste a whole checked answer, even the parts that didn't fit the question (a
question about a female cat also got the ages for dogs). For v7, each of the 382 training questions got **its own
answer**, written from the one checked passage that answers it. The answers were drafted with an AI assistant
(Claude), and every one passed the automatic checks: the app's own evidence check (no number, medicine, dose, law,
organisation or link that isn't in the passage), right species, and the vet advice kept.

This check by **two of us** shows, by people, that the answers say what their passages say. Our team has no vet, so
we check each answer against its passage, which the team already checked against its source.

## What to do (about 1 to 1½ hours each)

1. Open `answer-review.csv` in Excel or Google Sheets. It has 60 rows: a random sample of the written answers
   (46 from checked answers, 14 first-aid answers).
2. For each row, read:
   - `question`, and `earlier_question` if there is one (then the answer is to the follow-up)
   - `passage`: what the AI is given (a FurFriends checked answer or first-aid guide)
   - `written_answer`: what the AI is taught to say
   - `cat_answer` / `dog_answer`, if filled in: the version used when the owner has picked a cat or a dog
3. Mark the row **yes** only if all of these are true:
   - The first sentence answers the question that was asked.
   - Every fact in the answer is in the passage and means the same: nothing added, changed or made stronger.
   - Nothing in the passage that matters for this question's safety is left out (when to go to a vet now, "don't" warnings).
   - It is about the right animal.

   Otherwise mark **no** and say why in `comment`.
4. The first person fills in `reviewer_1` (your name) and `ok_1` (yes/no). The second person fills in `reviewer_2`
   and `ok_2`. Don't look at each other's marks before you finish.
5. Save it as CSV again, with the same name and columns. Then run `python answer_review.py tally` in the
   `ai-server` folder, or send the file to whoever runs it.

## What happens next

- Every "no" is fixed in `ai-server/data/written_answers.jsonl`, and the same mistake is looked for in the other
  answers. Then the data is rebuilt and the model retrained (about 30 minutes on Colab).
- v7 goes live only after this check, and only if it beats v6 in the tests (`ai-server/README.md`).
- For the thesis: report each reviewer's share of yes, and how often the two agreed.
