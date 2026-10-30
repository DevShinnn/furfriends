"""Answers prompts exported by scripts/eval-retrieval.mjs with the real model, exactly as api/ask.py does
(onnx_chat.py: the 4-bit export, greedy, repetition penalty 1.1, at most 260 new words). The prompts are built by
the app's own code (src/lib/prompt.js) from the app's own search, so this measures what owners would get.

  npm run eval:retrieval -- --prompts results/eval-prompts.jsonl          (from the PET folder)
  python answer_prompts.py --prompts results/eval-prompts.jsonl --out results/eval-answers.jsonl
  npm run eval:retrieval -- --answers ai-server/results/eval-answers.jsonl

Identical prompts are answered once (answers are deterministic). If it stops, run it again: answers already in
--out are kept and skipped.

  python answer_prompts.py --serve 8790      a local answerer for scripts/eval-conversation.mjs, which plays whole
                                             conversations through the app's code (POST {"messages": [...]} ->
                                             {"answer": "..."}). Evaluation only: no login, only on this computer.
"""
import argparse
import json
import os
import time

from onnx_chat import OnnxChat

MAX_NEW_TOKENS = 260   # api/ask.py


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prompts")
    p.add_argument("--out")
    p.add_argument("--serve", type=int, default=0, help="answer over HTTP on this port (127.0.0.1) instead")
    p.add_argument("--reuse", default="", help="an earlier answers file: identical prompts take their answer from it")
    p.add_argument("--model", default="exports/furfriends-rag-v2", help="export folder (export_onnx.py), as uploaded to Hugging Face")
    args = p.parse_args()
    if args.serve:
        return serve(args)
    if not (args.prompts and args.out):
        p.error("--prompts and --out are needed (or --serve)")

    prompts = [json.loads(l) for l in open(args.prompts, encoding="utf-8") if l.strip()]
    done = {}
    if os.path.exists(args.out):
        for l in open(args.out, encoding="utf-8"):
            if l.strip():
                r = json.loads(l)
                done[(r["id"], r["policy"])] = r
    cache = {json.dumps(r["messages"]): r["answer"] for r in done.values() if "messages" in r}
    if args.reuse and os.path.exists(args.reuse):
        for l in open(args.reuse, encoding="utf-8"):
            if l.strip():
                r = json.loads(l)
                cache.setdefault(json.dumps(r["messages"]), r["answer"])
    chat = OnnxChat.from_folder(args.model, threads=os.cpu_count() or 0)
    with open(args.out, "a", encoding="utf-8") as f:
        for i, pr in enumerate(prompts):
            if (pr["id"], pr["policy"]) in done:
                continue
            key = json.dumps(pr["messages"])
            start = time.time()
            answer = cache.get(key)
            if answer is None:
                answer = chat.answer(pr["messages"], max_new_tokens=MAX_NEW_TOKENS)
                cache[key] = answer
            secs = round(time.time() - start, 1)
            f.write(json.dumps({"id": pr["id"], "policy": pr["policy"], "answer": answer, "seconds": secs,
                                "sent": pr["sent"], "messages": pr["messages"]}, ensure_ascii=False) + "\n")
            f.flush()
            print(f"[{i + 1}/{len(prompts)}] {pr['id']} {pr['policy']:8} {secs:5}s {answer[:90]!r}", flush=True)


def serve(args):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import threading

    chat = OnnxChat.from_folder(args.model, threads=os.cpu_count() or 0)
    lock, cache = threading.Lock(), {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            messages = json.loads(self.rfile.read(int(self.headers["Content-Length"])))["messages"]
            key = json.dumps(messages)
            with lock:   # one answer at a time, as in api/ask.py
                if key not in cache:
                    cache[key] = chat.answer(messages, max_new_tokens=MAX_NEW_TOKENS)
            body = json.dumps({"answer": cache[key]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    print(f"Answering on http://127.0.0.1:{args.serve}/ with {args.model}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.serve), Handler).serve_forever()


if __name__ == "__main__":
    main()
