"""FurFriends assistant server: answers the app with the team's fine-tuned Hugging Face model.
It runs on a free Hugging Face Space (deploy_space.py), so owners download nothing.

Contract (the app's side is src/lib/assistant.js):
  POST /ask
  Authorization: Bearer <Supabase access token of the logged-in user>
  body  {"messages": [{"role": "user" | "assistant", "content": "..."}], "pet": {...} | null,
         "sources": [{"label": "...", "text": "..."}] | null, "stream": false}
  200 → {"reply": "...", "model": "<MODEL_VERSION>"}
        with "stream": true, the answer as plain text, sent as it's written (header X-Model: <MODEL_VERSION>)
  GET /health → {"ok": true once the model is loaded}. The app calls it to wake a sleeping Space early.

The app finds the 2 best checked passages and sends them as "sources"; the model answers only from them,
as it was trained (build_rag_data.py). The prompt is built by prompting.py, the same as in training.

Run:  uvicorn app:app --host 0.0.0.0 --port 8000
Settings come from environment variables (see .env.example in this folder).
"""
import asyncio
import json
import os
import threading
import time

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from prompting import build_messages

DEFAULT_BASE = "Qwen/Qwen2.5-1.5B-Instruct"
MODEL_ID = os.getenv("MODEL_ID", "")         # base model from Hugging Face; empty = the one the adapter was trained on
ADAPTER_PATH = os.getenv("ADAPTER_PATH", "")                     # LoRA adapter folder from train_lora.py
# Or the exported 4-bit model (export_onnx.py), e.g. DevShin00/furfriends-rag-v2: fast on a small CPU.
MODEL_ONNX = os.getenv("MODEL_ONNX", "")
ONNX_FILE = os.getenv("ONNX_FILE", "onnx/model_q4.onnx")
MODEL_VERSION = os.getenv("MODEL_VERSION", "base")               # saved with ratings; bump it after each retrain
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "350"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "https://furfriends-black.vercel.app,http://localhost:5173").split(",") if o.strip()]

app = FastAPI(title="FurFriends assistant")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"], expose_headers=["X-Model"])


# ---------------------------------------------------------------- who is asking
# The token is checked with Supabase, so only signed-in FurFriends users can use the model.
_seen: dict[str, float] = {}   # token -> time it was confirmed valid


async def require_user(authorization: str | None):
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Please log in to use the assistant.")
    if _seen.get(token, 0) > time.time() - 300:
        return
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise HTTPException(500, "The assistant server is missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{SUPABASE_URL}/auth/v1/user", headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        raise HTTPException(401, "Your session has expired. Log in again to use the assistant.")
    _seen[token] = time.time()


# ---------------------------------------------------------------- the model
_model = _tokenizer = None
_base = ""                      # the base model actually loaded
_lock = threading.Lock()        # one generation at a time: a single GPU (or a 2-CPU Space) can't share well


def adapter_base(adapter_path):
    """The base model an adapter was trained on (train_lora.py records it in adapter_config.json)."""
    try:
        with open(os.path.join(adapter_path, "adapter_config.json"), encoding="utf-8") as f:
            return json.load(f).get("base_model_name_or_path") or ""
    except OSError:
        return ""


def load_onnx(repo, file):
    """The exported 4-bit model, with onnxruntime on the CPU. Downloads once from Hugging Face."""
    global _model, _tokenizer, _base
    from optimum.onnxruntime import ORTModelForCausalLM
    from transformers import AutoTokenizer
    sub, name = os.path.split(file)
    _tokenizer = AutoTokenizer.from_pretrained(repo)
    _model = ORTModelForCausalLM.from_pretrained(repo, subfolder=sub, file_name=name, use_cache=True)
    _base = f"{repo}/{file}"


def load_model(model_id="", adapter_path=""):
    """Also used by evaluate.py, so tests run the model exactly as the app gets it.
    Empty arguments fall back to MODEL_ID / ADAPTER_PATH from the environment."""
    global _model, _tokenizer, _base
    if not (model_id or adapter_path) and MODEL_ONNX:
        return load_onnx(MODEL_ONNX, ONNX_FILE)
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model_id, adapter_path = model_id or MODEL_ID, adapter_path or ADAPTER_PATH
    trained_on = adapter_base(adapter_path) if adapter_path else ""
    if model_id and trained_on and model_id != trained_on:
        raise RuntimeError(f"The adapter in {adapter_path} was trained on {trained_on}, but MODEL_ID is {model_id}. "
                           "An adapter only works with its own base model: set MODEL_ID to it, or leave MODEL_ID empty.")
    model_id = _base = model_id or trained_on or DEFAULT_BASE

    _tokenizer = AutoTokenizer.from_pretrained(adapter_path or model_id)
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(model_id, dtype=dtype, device_map="auto" if torch.cuda.is_available() else None)
    if adapter_path:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter_path)
    _model = model.eval()


def settings(greedy):
    # With checked sources: greedy, like the accuracy test (answer_rag.py), so answers stick to the sources.
    if greedy:
        return {"do_sample": False, "repetition_penalty": 1.1}
    return {"do_sample": True, "temperature": 0.6, "top_p": 0.9, "repetition_penalty": 1.1}


def generate(chat, max_new_tokens=MAX_NEW_TOKENS, greedy=False, streamer=None) -> str:
    import torch
    with _lock:
        inputs = _tokenizer.apply_chat_template(chat, add_generation_prompt=True, return_tensors="pt", return_dict=True).to(_model.device)
        with torch.no_grad():
            out = _model.generate(**inputs, max_new_tokens=max_new_tokens, pad_token_id=_tokenizer.eos_token_id,
                                  streamer=streamer, **settings(greedy))
    return _tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def stream(chat, greedy):
    """The answer piece by piece, as it's written (generation runs in a thread)."""
    from transformers import TextIteratorStreamer
    streamer = TextIteratorStreamer(_tokenizer, skip_prompt=True, skip_special_tokens=True, timeout=300)
    threading.Thread(target=generate, args=(chat,), kwargs={"greedy": greedy, "streamer": streamer}, daemon=True).start()
    yield from (piece for piece in streamer if piece)


@app.on_event("startup")
def startup():
    # Loads in the background, so the Space answers /health (and wakes up) while the model loads.
    threading.Thread(target=load_model, daemon=True).start()


# ---------------------------------------------------------------- routes
class Message(BaseModel):
    role: str
    content: str


class Source(BaseModel):
    label: str
    text: str


class AskBody(BaseModel):
    messages: list[Message]
    pet: dict | None = None
    sources: list[Source] | None = None
    stream: bool = False


@app.post("/ask")
async def ask(body: AskBody, authorization: str | None = Header(default=None)):
    await require_user(authorization)
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(400, "The last message must be the user's question.")
    if _model is None:
        raise HTTPException(503, "The assistant is still starting. Try again in a minute.")
    sources = [s.model_dump() for s in body.sources[:3]] if body.sources else None
    chat = build_messages([m.model_dump() for m in body.messages], body.pet, sources)
    if body.stream:
        return StreamingResponse(stream(chat, bool(sources)), media_type="text/plain; charset=utf-8", headers={"X-Model": MODEL_VERSION})
    reply = await asyncio.to_thread(generate, chat, greedy=bool(sources))
    return {"reply": reply or "Sorry, I couldn't come up with an answer. Please try asking another way.", "model": MODEL_VERSION}


@app.get("/health")
def health():
    return {"ok": _model is not None, "model": MODEL_VERSION, "base": _base, "adapter": ADAPTER_PATH or None}
