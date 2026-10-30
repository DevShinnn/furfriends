"""Answers prompts exported by scripts/eval-retrieval.mjs with the real model, exactly as api/ask.py does
(onnx_chat.py: the 4-bit export, greedy, repetition penalty 1.1, at most 260 new words). The prompts are built by
the app's own code (src/lib/prompt.js) from the app's own search, so this measures what owners would get.

  npm run eval:retrieval -- --prompts results/eval-prompts.jsonl          (from the PET folder)
  python answer_prompts.py --prompts results/eval-prompts.jsonl --out results/eval-answers.jsonl
  npm run eval:retrieval -- --answers ai-server/results/eval-answers.jsonl

Identical prompts are answered once (answers are deterministic). If it stops, run it again: answers already in
--out are kept and skipped.
"""
import argparse
import json
import os
import time

from onnx_chat import OnnxChat

MAX_NEW_TOKENS = 260   # api/ask.py


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prompts", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--model", default="exports/furfriends-rag-v2", help="export folder (export_onnx.py), as uploaded to Hugging Face")
    args = p.parse_args()

    prompts = [json.loads(l) for l in open(args.prompts, encoding="utf-8") if l.strip()]
    done = {}
    if os.path.exists(args.out):
        for l in open(args.out, encoding="utf-8"):
            if l.strip():
                r = json.loads(l)
                done[(r["id"], r["policy"])] = r
    cache = {json.dumps(r["messages"]): r["answer"] for r in done.values() if "messages" in r}
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


if __name__ == "__main__":
    main()
