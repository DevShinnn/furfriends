# FurFriends AI server

Serves the team's fine-tuned Hugging Face model to the FurFriends app, and holds the scripts
to train it and retrain it from the app's 👍/👎 ratings.

| File | What it does |
|---|---|
| `onnx_chat.py` | Runs the exported model with only onnxruntime, numpy and tokenizers (used by the Vercel function `api/ask.py`). |
| `app.py` | The same server for other hosts (`POST /ask`): writes the answer from the app's checked passages and streams it. Checks the user is logged in to FurFriends. |
| `deploy_space.py` | Puts `app.py` on a free Hugging Face Space (with `space/`), with the model and settings. |
| `prompting.py` | Builds the prompt: system instructions (from `src/lib/aiPrompt.json`, shared with the app), pet details and checked sources. Used by serving, training and the app's copy in `src/lib/assistant.js`, so they match. |
| `FurFriends_train.ipynb` | Google Colab notebook: prepare data, train, test accuracy and download, with one click. |
| `train_lora.py` | Fine-tunes a model with LoRA, on a free Google Colab T4 GPU or (small models) a laptop CPU. |
| `build_rag_data.py` | Makes the training set: each question with its best-matching checked passages and the right answer, so the model learns to answer from sources. `data/rag_train.jsonl` (v1) and `_v2` are kept for the record; `_v3` is current. |
| `add_pet_profiles.py` | v6: adds examples with simulated pet profiles and the app's notes from the pet's records (`scripts/pet-profiles.mjs`), so the model learns to answer about the owner's own pet. |
| `answer_rag.py` | Answers the test questions the way the app does (find passages, then generate), for `evaluate.py`. |
| `answer_prompts.py` | Answers the prompts the app itself builds (`npm run eval:retrieval -- --prompts ...`) with the exported model, to measure the evidence check; `--serve` answers over HTTP for `npm run eval:conversation` (`docs/ai-evaluation-guide.md`). |
| `data/retrieval_eval.jsonl` | 112 labelled questions and conversations for the search and evidence check. Keep them out of training. |
| `data/out_of_scope.txt` | 40 questions FurFriends doesn't cover (other animals, people's health, not pet care), for `build_rag_data.py --out-of-scope`. Only questions, no facts. |
| `data/safety_eval.json` | 27 questions, emergencies and everyday ones in English and Tagalog, with the first-aid guide each should bring up (or none). Checked by `npm test`. Keep them out of training. |
| `export_onnx.py` | Turns the trained model into the file the app runs in the browser (4-bit, on WebGPU or the CPU). |
| `fetch_gov_guides.py` | Downloads public-domain CDC and FDA pet health pages into `data/passages/gov_guides.csv`. |
| `fetch_open_data.py` | Downloads openly licensed cat and dog Q&As from the Pets Stack Exchange data dump into `data/open/` (2,447 answers in October 2026). |
| `prepare_data.py` | Checks the team's Q&A spreadsheet (`data/qa.csv`) plus `data/open/`, and splits them into training and test files. |
| `export_feedback.py` | Downloads app ratings as new training data, and prints the helpful rate per model version. |
| `evaluate.py` | Accuracy test: asks the model held-out questions, makes a grading sheet, and scores it. |
| `data/sample_train.jsonl` | 8 example Q&As showing the data format. |
| `data/sample_test.jsonl` | 16 test questions with reference answers, to start your test set. |
| `data/SOURCES.md` | Where each piece of training data came from. Fill this in. |

## The FurFriends AI in the app
Since October 2026 the app's assistant uses the team's own trained model: the app finds the 2 best-matching
checked passages (a first-aid guide first, when the emergency check matches) and sends them with the question
to a Vercel function next to the app (`api/ask.py`), which writes the answer from them with `onnx_chat.py`
and streams it back. Owners download nothing, and only logged-in FurFriends users get answers.

Vercel's free plan includes 4 CPU-hours per 30 days and **pauses the whole account (the app too)** past that.
An answer costs about 25-50 CPU-seconds, so the function records each answer's CPU time in Supabase
(`public.ai_usage`, from `supabase/migrations/20261028000000_ai_usage.sql`) and stops at 3 hours; owners then
get the closest checked answer. If the counter isn't there, the AI doesn't answer at all. To check the total:
`select round(public.ai_cpu_seconds_30d() / 3600, 2);` in the Supabase SQL editor.
(`app.py` + `deploy_space.py` run the same thing on a Hugging Face Space instead, which now needs HF PRO.)

Steps, all on a laptop (no GPU needed):
```
python fetch_open_data.py          # Pets Stack Exchange data dump  -> data/open/pets_stackexchange.csv
python fetch_gov_guides.py         # CDC + FDA pages                -> data/passages/gov_guides.csv
python prepare_data.py             # all Q&As                       -> data/train.jsonl, data/test.jsonl
python build_rag_data.py --out data/rag_train_v3.jsonl     # question + sources -> answer (833 examples)
python train_lora.py --data data/rag_train_v3.jsonl --base Qwen/Qwen2.5-0.5B-Instruct --out adapters/rag-v3 --layers attention --max-length 800 --epochs 1 --no-checkpointing --save-steps 100   # ~1.5 h on a Ryzen 5, needs ~7 GB free RAM
python answer_rag.py --adapter adapters/rag-v3 --out results/rag-v3-answers.jsonl
python evaluate.py run --answers results/rag-v3-answers.jsonl --version rag-v3   # grading sheet
python export_onnx.py --adapter adapters/rag-v3 --out exports/furfriends-rag-v3 --only q4   # ~430 MB
```
v4 adds near misses, conversations and out-of-scope questions (see the top of `build_rag_data.py`), and is measured
with the app's own search and evidence check (`docs/ai-evaluation-guide.md`, "Search and evidence check"):
```
python build_rag_data.py --out data/rag_train_v4.jsonl --near-miss-share 0.4 --multi-turn-share 0.15 --out-of-scope   # 1,052 examples
python train_lora.py --data data/rag_train_v4.jsonl --base Qwen/Qwen2.5-0.5B-Instruct --out adapters/rag-v4 --layers attention --max-length 800 --epochs 1 --no-checkpointing --save-steps 100
python export_onnx.py --adapter adapters/rag-v4 --out exports/furfriends-rag-v4 --only q4
```
v6 is trained with pet "pre-context": when the owner picks one of their pets in the app, the model gets that pet's
profile (species, breed, age and life stage, weight, allergies, medicines, recent illnesses, vaccines, diet, last
checkup and the health check's concerns: `petContext` in `src/lib/prompt.js`). `add_pet_profiles.py` keeps all of
v5 and adds copies with **simulated** pet profiles (made up by `scripts/pet-profiles.mjs`, no real owner's pet).
When the pet's records are about the question, the answer ends with the same notes the app adds
(`src/lib/petNotes.js`), e.g. "From Bori's records: - Bori has an allergy record: Chicken protein sensitivity...";
otherwise it has none, so the model learns to leave unrelated records out. The app still replaces whatever notes
the model writes with the rule's own, so an owner never sees a wrong fact about their pet. `npm test` checks the
data (`tests/ai-pet-context.test.js`), and the script stops if Python and the app print a pet differently.
```
npm run symptom-review                       # from the PET folder: which symptom rules two teammates approved
npm run training-pets -- export              # from the PET folder: the training pets stored in Supabase (see below)
python add_pet_profiles.py --base data/rag_train_v5.jsonl --out data/rag_train_v6.jsonl --db-pets data/training_pets.json
python train_lora.py --data data/rag_train_v6.jsonl --base Qwen/Qwen2.5-0.5B-Instruct --out adapters/rag-v6 --layers attention --max-length 1024 --epochs 1 --no-checkpointing --save-steps 100   # ~3-4 h on this laptop's CPU
C:\Python312\python.exe export_onnx.py --adapter adapters/rag-v6 --out exports/furfriends-rag-v6 --only q4   # not the .venv one: see below
npm run eval:pets -- --prompts ai-server/results/pets   # from the PET folder: the pet-profile test (docs/ai-evaluation-guide.md)
```
**Export with the Python that has a working optimum** (on the team laptop `C:\Python312\python.exe`, transformers 4.57).
The `.venv` has transformers 5 for training, and optimum 2.1 can't export with it. Mixing the two (merging with 5, exporting
with 4.57) made a broken rag-v6 export on 2026-11-13: transformers 5 saves `rope_theta` where 4.57 doesn't look, so the
model got the default 10000 instead of Qwen2.5's 1000000 (wrong word positions), and the tokenizer was left out.
`export_onnx.py` now stops when that happens, and uses the base model's tokenizer when the adapter's is in the newer
format, after checking it is the same (all 183,307 tokens of the v6 training text tokenize identically).

The profile includes the pet's medical history with dates, and for symptoms the notes also say what that history
means, in the words of the checked answer (`src/lib/symptomNotes.js`, e.g. a male cat peeing outside the litter box,
a puppy with diarrhea, a 12-year-old cat drinking a lot, a cat losing weight). Those 24 rules are used, in the app and in the data, only
once two teammates have checked each against its source (`docs/symptom-review/README.md`); until then the data has
none. `--unreviewed` writes a preview with all of them to `data/rag_train_v6_PREVIEW_unreviewed.jsonl` (1,552
examples, every rule 8+ times) so the team can see what the model will learn; `train_lora.py` refuses to train on it.
`data/symptom_questions.json` adds other wordings (English and Taglish) of the checked symptom questions, with the
same answers, so every rule gets enough examples.
**The training pets live in the database.** `npm run training-pets:setup` (once) makes the training account's login in
`.env.local`, creates the account and saves 136 made-up pets with full histories
(illnesses, medicines, vaccines, checkups, feeding, deworming, weight history) in a private FurFriends training account
in Supabase (TRAINING_EMAIL / TRAINING_PASSWORD in `.env.local`), with pets for every symptom rule. The team logs in to
the app with that account to look through and correct them (or add their own); `export` writes what's stored to
`data/training_pets.json`, and `--db-pets` builds the training data from those pets only. 1 pet in 5 is kept for
evaluation, never trained on (decided by the pet's id, also for pets added by hand). `npm run training-pets -- check`
shows which rules the pets cover without going online. Without `--db-pets`, pets are made up on the fly, as before.
Weight trends need the `weight_log` table (`supabase/migrations/20261112000000_weight_log.sql`).
v6 is also the first model trained on v5's data (checked sources only), so compare it with v2 the way v4 was
(`docs/ai-evaluation-guide.md`) before it goes live. Only a model named `rag-v6` or later gets the whole profile
(`knows_profiles` in `prompting.py`, used by `api/ask.py`; `FURFRIENDS_PET_CONTEXT=full|basic` overrides it):
earlier models get the pet details they were trained with, because given the extra lines rag-v2 wrote things the
records don't say (checked 2026-11-11 on 6 questions: 4 answers unchanged, 1 rephrased, 1 invented "if he has
diabetes"). The notes from the pet's records are added by the app for every model.

v7 keeps v6's pet profiles but changes **what the model is taught to say**. Until v6, every training answer was a
checked answer word for word (v6's 954 answers were only 183 different checked answers), so the model learned to paste
the matching passage whole, parts that don't fit included. v7 trains on an answer written for each of its 382
questions from that question's passage (`written_answers.py`; the rules are in `data/written/STYLE.md`): it answers
the question first and keeps only what fits it, such as the cat part for a cat. Every answer passes the app's own
evidence check with the passages of every example it is used in, and two teammates check a sample (`docs/answer-review/`).
The answers were drafted with an AI assistant (Claude) from the passages. Of v7's 898 answers, 15 are 90% or more
copied from their passage (before: 770; median share copied 0.66, before 1.00). v7 also fixes four data problems: the
first-aid guides were read with the wrong encoding ("100â€“120", in v2-v6's data); 1 example in 5 of v5 taught
"couldn't find" (v7: 92 of 990), some with a first-aid guide in front of it (v7: none); the first-aid answers came
from a template ("This sounds like it could be cPR."); and 11 examples were wrong (a dog's first-aid question with a
cat's sign, "My dog has open-mouth breathing in a cat", and pet profiles of the wrong pet or species), now left out.
Questions whose checked answer only partly answers them are listed in `docs/ai-knowledge-gaps.md`. v7 trains all layers for 2 passes on Colab's free GPU
(`colab/train_v7.ipynb`, about 30 minutes) with the same package versions as the export Python:
```
python build_rag_data.py --checked-only --near-miss-share 0.15 --multi-turn-share 0.15 --out-of-scope --out data/rag_train_v7_base.jsonl   # 471 examples
python add_pet_profiles.py --base data/rag_train_v7_base.jsonl --out data/rag_train_v7_pre.jsonl --db-pets data/training_pets.json        # 1,001 examples
python written_answers.py todo --data data/rag_train_v7_pre.jsonl --answers "" --out data/written/questions.jsonl   # the questions and their passages
python written_answers.py apply --data data/rag_train_v7_pre.jsonl --answers data/written_answers.jsonl --out data/rag_train_v7.jsonl   # 990 examples
python answer_review.py sample                     # the team's sample check: docs/answer-review/answer-review.csv
python colab/make_bundle.py                        # colab/furfriends-train-v7.zip, to upload in colab/train_v7.ipynb
C:\Python312\python.exe export_onnx.py --adapter adapters/rag-v7 --out exports/furfriends-rag-v7 --only q4
```
`build_rag_data.py` gives the same data only with the same library: v5 couldn't be rebuilt exactly on 2026-11-20
(517 examples instead of 543) because the checked answers had changed since.

Then upload `exports/furfriends-rag-v3` to a public Hugging Face model repo (name it `furfriends-...`, see
`vite.config.js`), set `MODEL` in `api/ask.py` to it, rebuild the app's index (`npm run knowledge`) and push:
```
hf upload <account>/furfriends-rag-v3 ai-server/exports/furfriends-rag-v3 . --repo-type model --exclude "_merged/*" --exclude "_onnx_full/*"
```
To try the function on a laptop: `uvicorn api.ask:app --port 8001` from the PET folder (with SUPABASE_URL and
SUPABASE_PUBLISHABLE_KEY set, and AI_USAGE_CHECK=off if the counter table isn't reachable), then `npm run dev`:
the dev server sends `/api` to it. If training stops, run the same command again: it resumes from the last saved step.

The model can also run on the owner's device instead (no server): set `VITE_ASSISTANT_URL=` (empty) and
`VITE_CHAT_MODEL=<account>/furfriends-rag-v3`. The owner is then asked once before the ~430 MB download.

To try a model in the app before uploading it, serve the `exports` folder with CORS on port 8090 and start
the app with `VITE_CHAT_MODEL=furfriends-rag-v3 VITE_CHAT_HOST=http://localhost:8090/ npm run dev`.

What we learned (keep these when retraining):
- **Both passages must be cut to the same length in training.** v1 always had the right passage long and
  the other short, so it learned "copy the long one" and copied the wrong topic in the app (bloat got
  "one vomit is often not serious").
- **The first-aid guides must be the right passage in some examples**, next to a look-alike Q&A, or the
  model skips them. v2 added these; v3 shows the guides in full (with the list of common poisons), as the app does.
- **Use the 4-bit, full-precision version (`model_q4.onnx`) on every device.** The 8-bit version made the
  model repeat itself, and the half-precision one (`q4f16`) overflowed on WebGPU and wrote nonsense.
  The word table is 8-bit, because the browser's CPU engine has no 4-bit Gather.
- **v3 (full guides, 17 poison questions, "go now" signs) answered more but was wrong more often**: on the
  31 held-out questions it said "couldn't find" 5 times (v2: 14), but gave heatstroke first aid for coolant,
  the dog-bite answer for a lump, and once leaked its instructions. v2 stays live: when it's unsure it says so,
  and the app then shows the closest checked answer. Next time, keep the poison questions few and varied,
  and add look-alike guides (poisoning next to heatstroke) as the wrong passage.
- **v6 (pet profiles, on v5's data) says "couldn't find" too often, so v2 stays live** (tested 2026-11-13, with the
  app's own prompts from that day). On the 99 benchmark questions neither model was trained on (13 v2 had seen
  were left out), v6's own answer was shown for 47 of the 62 answerable ones that got a right passage, v2's for
  61: v6 declined 11 (v2: 1), for example the heatstroke guide for "is my dog overheating" and the vomiting guide for
  "Nagsusuka ang aso ko", and 4 failed the evidence check. On questions the library can't answer it was a little
  safer (AI answer on 3% against 6%). The cause is in the data, not the profiles: v6's data teaches "couldn't find"
  in 15 examples where a first-aid guide is among the passages and for 29 of its 192 Tagalog questions; v2's in
  none. Those come from v4's near misses, kept in v5, and v4 also lost to v2. Next time: keep "couldn't find" for
  passages that really don't answer, never with a first-aid guide, and not more often in Tagalog than in English.
  The pet part did what it should: on 68 questions about 34 evaluation pets it never saw (simulated), v6 invented
  no health fact about the pet (v2: 1, a made-up "arvin worm") and never got the species wrong. It wrote its own
  "From <pet>'s records" notes for 43 of them, 18 where the app adds none, and both models copy he/she from the
  checked answer instead of the pet's sex; the app replaces those notes with its own. Results:
  `results/answer-eval-cmp-v6.json`, `results/answer-eval-cmp-v2.json`, `results/pets/pets-eval-v6.json`, `results/pets/pets-eval-v2.json`.
- **v6 is used with a second try instead of retraining** (2026-11-20). When v6 says "couldn't find" although its
  passages are strong (a first-aid guide, or a match at or above `EVIDENCE.strong`), the app asks once more with
  `no_decline` (api/ask.py): the answer may not start with "I", "Yes" or "No" (`OnnxChat.no_decline_tokens`). With
  only "I" banned it started with "Yes" whatever the question ("Yes, I don't think so. Paracetamol is poisonous").
  The app keeps that answer only if it passes `reviewAnswer` and `forcedAnswerOk` (evidence.js): not a decline in
  other words, built on the best passage, not talking about "records". Offline, on the same prompts as above: 31
  answers were asked again, 27 kept (the 4 dropped were the wrong ones: twice "blood in vomit" for plain vomiting,
  one garbled, one decline). Benchmark (99 questions): AI answer shown on 84.8% of answerable ones (v6 71.2%, v2
  92.4%), on unanswerable ones 6.1% (v6 3.0%, v2 6.1%), 0 unsupported, wrong credits 4 (v6 4, v2 3). Pet test: 97.1%
  passed the checks (v6 89.7%, v2 94.1%), 0 invented health facts. It costs a second answer only for those questions.
  The same run found rag-v6 writing "From my records:", now also stripped (stripPetNotes).
- **he/she is fixed by the app, not the model** (2026-11-20). The checked answers say "he" or "her" about any pet,
  and both models copy them: in the pet test 17 of 68 v6 answers (v2: 15) called the pet by the other sex ("Gently
  wipe her nose" to the owner of a male cat). In a pet's chat the app now switches he/she to the pet's sex before the
  owner sees it (`matchPronouns` in src/lib/petAnswers.js; "her" becomes "him" or "his" from the words around it),
  also while the answer streams in, and also in the checked answers and the cat-appetite advice. Nothing changes when
  the owner's own question says he/she the other way. Re-scored on the same saved answers (`wrongPronounShown` in
  `results/pets/pets-eval-v6.json` and `-v2.json`): v6 1 of 68 (the question itself said "his paw" for a female
  dog), v2 0 of 68; every other number unchanged. No retraining needed.
- **v6 pastes whole checked answers because it was taught to** (found 2026-11-20). Its 954 training answers were 183
  checked answers word for word, repeated under 376 questions, and the same checked answer was always one of the
  passages. On the benchmark, 83.3% of v6's shown answers are 90% or more copied from one passage (*pasted*, re-scored
  from its saved answers; `answer-eval-cmp-v6-rescored.json`), so a cat owner asking when to spay got the ages for
  dogs too. v7's written answers (above) are the fix. The model stays at 0.5B: Vercel's free plan gives the AI about
  3 CPU-hours a month, and a 1.5B model costs about 3 times as much per answer.
- **Never train on the evaluation questions.** v2 and v3 were trained on 11 questions that are also in
  `retrieval_eval.jsonl` and `safety_eval.json` (the library's own questions, such as "How often should I deworm my
  kitten?"). `build_rag_data.py` now leaves them out, also as earlier messages in a conversation, and
  `tests/ai-training-data.test.js` checks it.
- **A "couldn't find" example must really not answer.** Look-alike passages are only used when they share none
  of the question's subject words, not even loosely ("dewormer" counts for "deworm"); a test checks it. Emergencies
  and poisons never get a "couldn't find" example: in the app their first-aid guide is always sent.
- **The held-out test is harder than the app**: each test question's own checked answer is left out of the
  sources, so the model must answer from other passages. In the app that answer is there.

## 1. Prepare the data
The training data has two parts:
- **Open data**, already downloaded: `data/open/pets_stackexchange.csv` has 722 real cat and dog Q&As from Pets Stack Exchange (CC BY-SA, with credit in `data/SOURCES.md`). Only well-voted answers are kept, and answers with medicine doses or emergencies without vet advice are filtered out. To download it again, run `python fetch_open_data.py`. These answers come from owners, not vets, so the team checks a random sample of about 30 against trusted vet sources.
- **Your own Q&As**, in `data/qa.csv`. Focus on what the open data covers least: emergencies, poisons, vaccines, parasites and Philippine rules such as rabies vaccination. Your test questions go here too.

Collect your Q&As in a spreadsheet, so the whole team can add to it:
1. In Google Sheets, go to **File → Import → Upload** and choose `data/qa.csv`. It already has the 24 sample Q&As.
2. Add one row per question:

   | Column | What to write |
   |---|---|
   | `question` | The owner's question, the way an owner would ask it |
   | `answer` | The correct answer in your own words: under 200 words, no medicine doses, and "go to a vet now" for emergencies |
   | `category` | For example `emergency`, `poison`, `vaccines`, `feeding`, `grooming`, `behavior`, `medicine` (see `docs/ai-evaluation-guide.md`) |
   | `set` | Leave it blank. Write `test` or `train` only to force a row into one set. |
   | `pet_name` … `pet_weight_kg` | Optional. Fill these in when the answer is about one specific pet. |
   | `source` | Where the information came from (name and link). Also list each source in `data/SOURCES.md`. |
   | `checked_by` | Who checked the answer, for example the team member who checked it against its source |

3. Go to **File → Download → Comma-separated values (.csv)**, and save the file over `data/qa.csv`.
4. Run:
   ```
   python prepare_data.py
   ```
   It reads `data/qa.csv` and everything in `data/open/`. It checks every row and lists problems, such as duplicate questions, doses, emergencies without vet advice, or missing sources. Then it writes `data/train.jsonl` for training and `data/test.jsonl` for the accuracy test.
   - About 15% of your own blank-set rows go to the test set.
   - The Stack Exchange rows always go to training. The researched answers in `data/open/researched_qa.csv` (98 Q&As on emergencies, poisons, vaccines, parasites, senior pets and Philippine rules, with sources) are split like your own rows, so the test set covers those topics too.
   - If a question appears in both, your sheet's version wins.

A question's place in the train or test set depends only on the question itself. Adding rows later never moves an earlier test question into training, so your accuracy test stays fair. Run it again after every change to the sheet.

`data/sample_train.jsonl` shows the file format, if you want to write JSONL yourself. Don't add a system message: `train_lora.py` adds the FurFriends one itself.

## 2. Train (Google Colab, free GPU)
The notebook `FurFriends_train.ipynb` does everything in one go: it gets the code from GitHub, prepares the data, trains, runs the accuracy test, and downloads the results.
1. Open it in Colab: https://colab.research.google.com/github/DevShinnn/furfriends/blob/main/ai-server/FurFriends_train.ipynb
2. Choose **Runtime → Change runtime type → T4 GPU → Save**.
3. Choose **Runtime → Run all**. It takes about 20–30 minutes.
4. Your browser downloads `furfriends-v1.zip`, which has:
   - the trained adapter (`adapters/v1`, tens of MB)
   - the grading sheets for the trained and the base model
   - the exact train and test files used

Colab uses the code and data on GitHub, so push your changes first. To use a newer Q&A sheet without pushing, set `UPLOAD_QA = True` in the Settings cell.

To train without the notebook:
```
pip install -r requirements-train.txt
python prepare_data.py
python train_lora.py --data data/train.jsonl --eval data/test.jsonl --base Qwen/Qwen2.5-1.5B-Instruct --out adapters/v1
```

`Qwen/Qwen2.5-1.5B-Instruct` (Apache 2.0 license) is a good size for a T4. For a quick test on a laptop CPU, use `HuggingFaceTB/SmolLM2-135M-Instruct` with `--max-steps 4`. It runs, but its answers are poor.

## 3. Run the server
```
python -m venv .venv
.venv\Scripts\activate            (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env            (then fill it in, then load it, or set the variables in your terminal)
uvicorn app:app --host 0.0.0.0 --port 8000
```
Check it at http://localhost:8000/health. Set `ADAPTER_PATH=adapters/v1` and `MODEL_VERSION=v1` to serve your trained model.

A GPU makes answers take a few seconds. On a laptop CPU a 1.5B model can take 30–60 seconds, and the app waits up to 60 seconds.

## 4. Connect it to the app
The live app is served over HTTPS, so the AI server needs an HTTPS address too. For demos, a free Cloudflare tunnel is the easiest:
```
cloudflared tunnel --url http://localhost:8000
```
It prints an address like `https://something.trycloudflare.com`. Then, in the main project folder:
```
npx vercel env add VITE_ASSISTANT_URL production      (paste https://something.trycloudflare.com/ask)
npx vercel deploy --prod --yes
```
The quick-tunnel address changes every time you start it, so you'd have to update the setting each time. For a fixed address, use a named Cloudflare tunnel, or host the server on a GPU service such as Hugging Face Spaces.

Add the address your app runs on to `ALLOWED_ORIGINS` if it isn't already there.

## 5. Retrain from the app's ratings
```
set SUPABASE_URL=https://psafcnnalphzmwfmuxpp.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=<Supabase → Project Settings → API keys → secret key>
python export_feedback.py
```
- `data/feedback_good.jsonl`: answers marked 👍. Read them before reusing them.
- `data/feedback_fix.jsonl`: answers marked 👎 with the owner's note. Owners aren't vets: rewrite each answer so it's correct, check it against your sources, then delete the `"_review"` part. `train_lora.py` refuses rows that still have it.

Add the reviewed rows to your training data, train `adapters/v2`, and serve it with `MODEL_VERSION=v2`. The helpful rate printed by `export_feedback.py` lets you compare v1 and v2 for your thesis.

**Keep the secret key on your computer only.** It can read every user's data. These exported files contain users' questions, so git ignores them.

## 6. Measure accuracy
```
python evaluate.py run --test data/test.jsonl --version base
python evaluate.py run --test data/test.jsonl --adapter adapters/v1 --version v1
python evaluate.py score results/answers-v1-grader1.csv results/answers-v1-grader2.csv
```
Graders fill in each sheet between `run` and `score`. The rubric and what to report are in `docs/ai-evaluation-guide.md` in the main project.
