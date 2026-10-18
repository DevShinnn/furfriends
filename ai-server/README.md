# FurFriends AI server

Serves the team's fine-tuned Hugging Face model to the FurFriends app, and holds the scripts
to train it and retrain it from the app's 👍/👎 ratings.

| File | What it does |
|---|---|
| `app.py` | The server the app talks to (`POST /ask`). Checks the user is logged in to FurFriends. |
| `prompting.py` | The system prompt and pet details. Used by both serving and training, so they match. |
| `train_lora.py` | Fine-tunes a model with LoRA. Runs on a free Google Colab T4 GPU. |
| `export_feedback.py` | Downloads app ratings as new training data, and prints the helpful rate per model version. |
| `data/sample_train.jsonl` | 8 example Q&As showing the data format. |
| `data/SOURCES.md` | Where each piece of training data came from. Fill this in. |

## 1. Prepare the data
One JSON object per line. Each example is a short conversation ending with the correct answer:

```json
{"messages": [{"role": "user", "content": "How often should I deworm my puppy?"}, {"role": "assistant", "content": "Puppies are dewormed more often than adults..."}]}
```

You can add `"pet": {"name": "Mochi", "species": "Cat", "breed": "Puspin", "weightKg": 4.2}` so the model learns to use the pet's details, the same way the app sends them. Don't add a system message: `train_lora.py` adds the FurFriends one itself.

Keep about 10–20% of your questions out of training as a **test set**, so you can measure accuracy honestly. Record every source in `data/SOURCES.md`.

## 2. Train (Google Colab, free GPU)
1. Upload this `ai-server` folder to Colab or Google Drive, and choose **Runtime → Change runtime type → T4 GPU**.
2. Run:
   ```
   !pip install -q -r requirements-train.txt
   !python train_lora.py --data data/train.jsonl --eval data/test.jsonl --base Qwen/Qwen2.5-1.5B-Instruct --out adapters/v1
   ```
3. Download the `adapters/v1` folder. It's small, tens of MB.

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
