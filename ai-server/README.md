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
| `answer_rag.py` | Answers the test questions the way the app does (find passages, then generate), for `evaluate.py`. |
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
