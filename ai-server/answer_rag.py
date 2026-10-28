"""Answers the held-out test questions the way the app will: find the 2 best-matching checked passages,
then let the trained model answer from them. As in the app, a first-aid guide found by the emergency
check goes first. Writes answers for evaluate.py to turn into a grading sheet.

  python answer_rag.py --adapter adapters/rag-v1 --out results/rag-v1-answers.jsonl
  python evaluate.py run --answers results/rag-v1-answers.jsonl --version rag-v1

The passages come from the training Q&As, the CDC/FDA passages and the first-aid guides, the same
library as build_rag_data.py. The test questions' own answers are not in it, so the model can only
answer from other checked text, as it would for a new question in the app. Leave out --adapter to
test the untrained base model the same way, for comparison.
"""
import argparse
import json
import os
import subprocess
import time

import torch
from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer

from build_rag_data import EMBED, clip, embed, jsonl, library
from prompting import build_messages


def urgent_slugs(questions):
    """The app's emergency check (urgentGuides in src/lib/emergency.js) for each question: its first-aid
    guides go first in the sources, as in the app."""
    code = ("import {urgentGuides} from './src/lib/emergency.js'; let s = ''; process.stdin.on('data', (d) => s += d);"
            "process.stdin.on('end', () => console.log(JSON.stringify(JSON.parse(s).map((q) => urgentGuides(q).map((g) => g.slug)))))")
    out = subprocess.run(["node", "--input-type=module", "-e", code], cwd="..", input=json.dumps(questions),
                         capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--test", default="data/test.jsonl")
    p.add_argument("--train", default="data/train.jsonl")
    p.add_argument("--gov", default="data/passages/gov_guides.csv")
    p.add_argument("--base", default="Qwen/Qwen2.5-0.5B-Instruct")
    p.add_argument("--adapter", default="", help="LoRA adapter folder; leave out to test the base model")
    p.add_argument("--sources", type=int, default=2)
    p.add_argument("--source-words", type=int, default=160, help="each passage is cut to this many words, like in training")
    p.add_argument("--max-new-tokens", type=int, default=300)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--no-urgent", action="store_true", help="don't put the emergency check's first-aid guide first")
    p.add_argument("--only", default="", help="only questions containing one of these words (comma-separated), for a quick check")
    p.add_argument("--out", required=True)
    args = p.parse_args()
    torch.manual_seed(0)

    test = jsonl(args.test)[: args.limit or None]
    if args.only:
        test = [t for t in test if any(w in t["messages"][-2]["content"].lower() for w in args.only.lower().split(","))]
    lib = library(jsonl(args.train), args.gov)
    etok, emodel = AutoTokenizer.from_pretrained(EMBED), AutoModel.from_pretrained(EMBED).eval()
    urgent = [[] for _ in test] if args.no_urgent else urgent_slugs([t["messages"][-2]["content"] for t in test])
    at = {x["id"]: j for j, x in enumerate(lib)}
    sims = embed([t["messages"][-2]["content"] for t in test], etok, emodel) @ embed([x["search"] for x in lib], etok, emodel).T

    tok = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.float32)
    if args.adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, args.adapter).merge_and_unload()
    model.eval()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for i, t in enumerate(test):
            first = [at[f"guide-{s}"] for s in urgent[i]]
            top = (first + [j for j in torch.argsort(sims[i], descending=True).tolist() if j not in first])[: args.sources]
            # First-aid guides are never cut, as in the app, so all their steps are there.
            sources = [{"label": lib[j]["label"], "text": lib[j]["text"] if lib[j]["id"].startswith("guide-") else clip(lib[j]["text"], args.source_words)}
                       for j in top]
            msgs = build_messages(t["messages"][:-1], t.get("pet"), sources)
            ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt")
            start = time.time()
            with torch.no_grad():
                out = model.generate(ids, max_new_tokens=args.max_new_tokens, do_sample=False, repetition_penalty=1.1)
            answer = tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()
            secs = round(time.time() - start, 1)
            f.write(json.dumps({"id": t["id"], "answer": answer, "seconds": secs,
                                "sources": [lib[j]["label"] for j in top]}, ensure_ascii=False) + "\n")
            print(f"[{i + 1}/{len(test)}] {secs}s  {t['messages'][-2]['content'][:60]!r} -> {answer[:80]!r}", flush=True)
    print(f"Wrote {args.out}. Next: python evaluate.py run --answers {args.out} --version <name>")


if __name__ == "__main__":
    main()
