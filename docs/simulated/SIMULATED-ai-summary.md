> **SIMULATED PRACTICE DATA.** Made up by scripts/simulate-practice-data.mjs to show the format. Not real results; do not report these numbers.

## SIMULATED-ai-grader1.csv

Model version: search-v2. Graded: 31 of 31 answers.

| Category | n | Correct (2) | Acceptable (1-2) | Mean score (0-2) | Safe |
|---|---|---|---|---|---|
| behavior | 2 | 0.0% | 100.0% | 1.00 | 100.0% |
| emergency | 5 | 40.0% | 80.0% | 1.20 | 100.0% |
| feeding | 2 | 0.0% | 100.0% | 1.00 | 100.0% |
| grooming | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| medicine | 2 | 100.0% | 100.0% | 2.00 | 100.0% |
| parasites | 4 | 25.0% | 100.0% | 1.25 | 100.0% |
| pet_context | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| philippines | 4 | 50.0% | 75.0% | 1.25 | 100.0% |
| poison | 5 | 40.0% | 80.0% | 1.20 | 100.0% |
| rabies | 1 | 0.0% | 0.0% | 0.00 | 100.0% |
| senior | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| vaccines | 2 | 50.0% | 50.0% | 1.00 | 100.0% |
| when_to_see_vet | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| **All** | 31 | 32.3% | 83.9% | 1.16 | 100.0% |

| Automatic check | Result |
|---|---|
| Urgent questions where it says to see a vet soon | 11/11 (100.0%) |
| Medicine questions answered without a dose | 2/2 (100.0%) |
| Answers under 200 words | 83.9% |
| Average length (words) | 132 |
| Average time per answer (seconds) | 0.0 |
| Average word overlap with the reference (0-100) | 21 |

## SIMULATED-ai-grader2.csv

Model version: search-v2. Graded: 31 of 31 answers.

| Category | n | Correct (2) | Acceptable (1-2) | Mean score (0-2) | Safe |
|---|---|---|---|---|---|
| behavior | 2 | 0.0% | 0.0% | 0.00 | 100.0% |
| emergency | 5 | 40.0% | 80.0% | 1.20 | 100.0% |
| feeding | 2 | 0.0% | 50.0% | 0.50 | 100.0% |
| grooming | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| medicine | 2 | 50.0% | 100.0% | 1.50 | 100.0% |
| parasites | 4 | 25.0% | 100.0% | 1.25 | 100.0% |
| pet_context | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| philippines | 4 | 50.0% | 75.0% | 1.25 | 75.0% |
| poison | 5 | 60.0% | 80.0% | 1.40 | 100.0% |
| rabies | 1 | 0.0% | 0.0% | 0.00 | 100.0% |
| senior | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| vaccines | 2 | 50.0% | 50.0% | 1.00 | 100.0% |
| when_to_see_vet | 1 | 0.0% | 100.0% | 1.00 | 100.0% |
| **All** | 31 | 32.3% | 74.2% | 1.06 | 96.8% |

| Automatic check | Result |
|---|---|
| Urgent questions where it says to see a vet soon | 11/11 (100.0%) |
| Medicine questions answered without a dose | 2/2 (100.0%) |
| Answers under 200 words | 83.9% |
| Average length (words) | 132 |
| Average time per answer (seconds) | 0.0 |
| Average word overlap with the reference (0-100) | 21 |

## Agreement between the two graders

| Grade | Same grade | Cohen's kappa |
|---|---|---|
| Correct (0-2) | 83.9% | 0.75 |
| Safe (Y/N) | 96.8% | 0.00 |

Graders disagree on: q7bf34c, q3a112b, qdf715f, qcbce39, qbd3158. Discuss these and agree on a final grade.
