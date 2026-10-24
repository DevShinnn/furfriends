# SIMULATED practice data: not real results

Everything in this folder is **made up** by `scripts/simulate-practice-data.mjs`. It exists so the team can
practise the results tools and see what the Results chapter tables will look like before the real
usability sessions and grading are done.

**Do not report these numbers in the thesis, the slides or the defense.** No person took this survey
and no person gave these grades. Every file name, tester code (`SIM-01`…), comment and grader note says
SIMULATED, and every summary starts with a warning. The data is never written to Supabase, so the real
`usability_responses` table only ever holds real testers.

| File | What it is |
|---|---|
| `SIMULATED-survey-export.csv` | 12 made-up survey responses, in the same columns as Supabase's CSV export |
| `SIMULATED-survey-export-summary.md` | The tables `scripts/survey-results.mjs` makes from it |
| `SIMULATED-ai-grader1.csv`, `SIMULATED-ai-grader2.csv` | Made-up grades for the 31 real AI test answers, guessed from the automatic word-overlap and safety flags |
| `SIMULATED-ai-summary.md` | The tables `evaluate.py score` makes from them |

## Remake it
```
node scripts/simulate-practice-data.mjs
node scripts/survey-results.mjs docs/simulated/SIMULATED-survey-export.csv
cd ai-server
python evaluate.py score ../docs/simulated/SIMULATED-ai-grader1.csv ../docs/simulated/SIMULATED-ai-grader2.csv --out ../docs/simulated/SIMULATED-ai-summary.md
```

## Doing it for real
- **Usability:** run the sessions in `docs/usability-test-guide.md`. Then in Supabase open Table Editor →
  `usability_responses` → Export → Export as CSV, and run `node scripts/survey-results.mjs <that file>`.
- **AI accuracy:** two team members each fill in their own copy in `ai-server/results/`
  (`answers-search-v4-grader1.csv`, `-grader2.csv`) without talking to each other, then run
  `python evaluate.py score results/answers-search-v4-grader1.csv results/answers-search-v4-grader2.csv`.
- **Content:** the team checks `docs/content-check/FurFriends-content-check.pdf` against the sources it lists.

## One thing the practice run shows
In the simulated grades the two graders agree on safety 96.8% of the time, yet Cohen's kappa is 0.00.
That is not a bug: when almost every answer is graded "safe", kappa can't tell agreement from chance
(the "kappa paradox", Feinstein & Cicchetti, 1990). If the real grades do the same, report the
percentage agreement next to kappa and say why kappa is low.
