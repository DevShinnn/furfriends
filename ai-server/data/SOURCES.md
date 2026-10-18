# Training data sources

List every source you take training data from. Your panel will ask where the data came from,
and some "open" sources don't allow reuse. Only use sources whose license allows it, and
rewrite answers in your own words rather than copying text.

| # | Source (name + link) | License / terms | What you used | Date collected | Checked by |
|---|---|---|---|---|---|
| 1 | FurFriends sample answers (`sample_train.jsonl`) | Written for this project | 8 Q&A examples | 2026-10-19 | (vet adviser) |
| 2 |  |  |  |  |  |

Before each training run:
- [ ] Every answer was checked by your vet adviser, or against a trusted vet source
- [ ] No owner's personal details (names, phone numbers) are in the data
- [ ] Ratings exported from the app were reviewed, and `_review` was removed
- [ ] A held-out test set (questions not used for training) is kept separate for evaluation
