"""The FurFriends AI on Vercel: POST /api/ask writes the answer from the app's checked passages with the team's
own model (DevShin00/furfriends-rag-v4) and streams it back, so owners download nothing.
To go back to the earlier model, set FURFRIENDS_AI_MODEL=DevShin00/furfriends-rag-v2 in Vercel and redeploy.

  POST /api/ask
  Authorization: Bearer <Supabase access token>   (only logged-in FurFriends users get answers)
  body  { messages: [{ role, content }], pet: {...} | null, sources: [{ label, text }] }
  200 → the answer as plain text, streamed as it's written; header X-Model: the model version
  429 → the monthly AI allowance is used up; 401 → not logged in; 400 → no sources (the model never answers
  without checked passages). The app then shows the closest checked answer.
  GET /api/ask → { ok, model, loaded }

Vercel's free plan includes 4 CPU-hours per 30 days and pauses the whole account (the app too) past that.
So every answer's CPU time goes into Supabase (public.ai_usage, supabase/migrations/20261028000000_ai_usage.sql),
and the function stops answering above AI_CPU_SECONDS_30D (3 hours). If it can't read that total, it doesn't
answer at all. The model (~430 MB) downloads from Hugging Face into memory when an instance starts.
"""
import os
import sys
import threading
import time

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "ai-server"))
from onnx_chat import OnnxChat  # noqa: E402
from prompting import build_messages  # noqa: E402

MODEL = os.getenv("FURFRIENDS_AI_MODEL", "DevShin00/furfriends-rag-v4")
VERSION = MODEL.split("/")[-1].removeprefix("furfriends-")          # saved with ratings, e.g. "rag-v4"
LIMIT = float(os.getenv("AI_CPU_SECONDS_30D", str(3 * 3600)))      # 75% of the Hobby plan's 4 CPU-hours
CHECK_USAGE = os.getenv("AI_USAGE_CHECK", "on") != "off"             # "off" only for testing on a laptop
MAX_NEW_TOKENS = 260
SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY") or ""

app = FastAPI(title="FurFriends AI")
_chat = None
_load_lock = threading.Lock()
_run_lock = threading.Lock()    # one answer at a time per instance: it has one CPU


def chat():
    global _chat
    with _load_lock:
        if _chat is None:
            threads = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else 0
            _chat = OnnxChat.from_hub(MODEL, threads=threads)
    return _chat


def supabase(method, path, token, **kw):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return httpx.request(method, f"{SUPABASE_URL}{path}", headers=headers, timeout=10, **kw)


def check(token):
    """Logged in, and the AI's CPU time over the last 30 days is under the limit."""
    if not token:
        raise HTTPException(401, "Please log in to use the assistant.")
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise HTTPException(500, "The AI is missing its Supabase settings.")
    if supabase("GET", "/auth/v1/user", token).status_code != 200:
        raise HTTPException(401, "Your session has expired. Log in again to use the assistant.")
    if not CHECK_USAGE:
        return
    r = supabase("POST", "/rest/v1/rpc/ai_cpu_seconds_30d", token, json={})
    if r.status_code != 200:
        raise HTTPException(429, "The AI's usage counter isn't set up, so it isn't answering.")
    if float(r.json() or 0) >= LIMIT:
        raise HTTPException(429, "The FurFriends AI has used this month's free allowance.")


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


@app.post("/api/ask")
def ask(body: AskBody, authorization: str | None = Header(default=None)):
    token = (authorization or "").removeprefix("Bearer ").strip()
    check(token)
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(400, "The last message must be the user's question.")
    # The model only writes answers from checked passages. Without any, it would answer from memory, so it
    # doesn't answer at all (the app then shows its own "no checked answer" reply).
    if not body.sources:
        raise HTTPException(400, "No checked sources were sent with the question.")
    msgs = build_messages([m.model_dump() for m in body.messages], body.pet,
                          [s.model_dump() for s in body.sources[:3]] if body.sources else None)

    def answer():
        with _run_lock:
            start = time.process_time()   # this process's CPU time, the same thing Vercel counts
            try:
                last = ""
                for text in chat().stream(msgs, max_new_tokens=MAX_NEW_TOKENS):
                    yield text[len(last):]
                    last = text
            finally:
                used = time.process_time() - start
                if CHECK_USAGE:
                    try:
                        supabase("POST", "/rest/v1/ai_usage", token, json={"cpu_seconds": round(used, 1), "model": VERSION})
                    except httpx.HTTPError:
                        pass

    return StreamingResponse(answer(), media_type="text/plain; charset=utf-8", headers={"X-Model": VERSION})


@app.get("/api/ask")
def health():
    return {"ok": True, "model": VERSION, "loaded": _chat is not None}
