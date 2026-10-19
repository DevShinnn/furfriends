# FurFriends AI server

Serves the team's fine-tuned Hugging Face model to the FurFriends app, and holds the scripts
to train it and retrain it from the app's 👍/👎 ratings.

| File | What it does |
|---|---|
| `app.py` | The server the app talks to (`POST /ask`). Checks the user is logged in to FurFriends. |
| `prompting.py` | The system prompt and pet details. Used by both serving and training, so they match. |
| `FurFriends_train.ipynb` | Google Colab notebook: prepare data, train, test accuracy and download, with one click. |
| `train_lora.py` | Fine-tunes a model with LoRA. Runs on a free Google Colab T4 GPU. |
| `fetch_open_data.py` | Downloads 722 openly licensed cat and dog Q&As from Pets Stack Exchange into `data/open/`. |
| `prepare_data.py` | Checks the team's Q&A spreadsheet (`data/qa.csv`) plus `data/open/`, and splits them into training and test files. |
| `export_feedback.py` | Downloads app ratings as new training data, and prints the helpful rate per model version. |
| `evaluate.py` | Accuracy test: asks the model held-out questions, makes a grading sheet, and scores it. |
| `data/sample_train.jsonl` | 8 example Q&As showing the data format. |
| `data/sample_test.jsonl` | 16 test questions with reference answers, to start your test set. |
| `data/SOURCES.md` | Where each piece of training data came from. Fill this in. |

## 1. Prepare the data
The training data has two parts:
- **Open data**, already downloaded: `data/open/pets_stackexchange.csv` has 722 real cat and dog Q&As from Pets Stack Exchange (CC BY-SA, with credit in `data/SOURCES.md`). Only well-voted answers are kept, and answers with medicine doses or emergencies without vet advice are filtered out. To download it again, run `python fetch_open_data.py`. These answers come from owners, not vets, so have your vet adviser check a random sample of about 30.
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
   | `checked_by` | Who checked the answer, for example your vet adviser |

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
