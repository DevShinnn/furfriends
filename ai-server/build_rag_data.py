"""Builds the training set that teaches the model to answer from FurFriends' checked sources.

Each example is: the owner's question + the best-matching checked passages -> the right answer.
The passages come from the same library the app searches: the training Q&As (data/train.jsonl),
the CDC and FDA passages (data/passages/gov_guides.csv) and the app's first-aid guides. The test
questions (data/test.jsonl) are never used, so the accuracy test stays fair.

  python build_rag_data.py                 -> data/rag_train.jsonl (for train_lora.py)

Most examples include the passage that holds the answer, plus one look-alike passage, both cut to the
same length, so the model learns to pick the right one by meaning. About 80 are owner-style questions
made from the first-aid guides' signs, with the guide as the right passage. About 1 in 10 (all Stack Exchange questions) has only unrelated passages, and the answer says it
couldn't find it in the checked sources, so the model learns not to guess.
Personal-story answers ("my cat...") and very long answers stay in the library but aren't trained on,
so the model learns FurFriends' voice.
"""
import argparse
import csv
import json
import random
import re
import subprocess
from collections import Counter

import torch
from transformers import AutoModel, AutoTokenizer

from evaluate import words
from prompting import NOT_FOUND, build_messages

EMBED = "sentence-transformers/all-MiniLM-L6-v2"   # same model as the app's search (Xenova/all-MiniLM-L6-v2)
PERSONAL = re.compile(r"\b(I|I've|I'm|I'd|my|me|mine|we|our)\b")


def jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def guides():
    """The app's first-aid guides, read from src/lib/emergency.js so they always match the app."""
    code = "import {GUIDES} from './src/lib/emergency.js'; console.log(JSON.stringify(GUIDES))"
    out = subprocess.run(["node", "--input-type=module", "-e", code], cwd="..", capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def label_for(source):
    s = source or ""
    if s.startswith("Pets Stack Exchange"):
        return "Pets Stack Exchange answer"
    if s.startswith(("CDC", "US FDA")):
        return s.split(", http")[0]
    if "first-aid guide" in s:
        return s
    return "FurFriends checked answer"


def clip(text, n):
    w = text.split()
    return text if len(w) <= n else " ".join(w[:n]) + " …"


def library(train, gov_path):
    """Every passage the model may be shown: {id, of, label, text, search}."""
    lib = []
    for ex in train:
        q, a = ex["messages"][0]["content"], ex["messages"][-1]["content"]
        lib.append({"id": ex["id"], "of": ex["id"].split("-")[0], "label": label_for(ex.get("source")),
                    "text": f"Q: {clip(q, 40)}\nA: {a}", "search": f"{q} {a}"})
    for i, r in enumerate(csv.DictReader(open(gov_path, encoding="utf-8-sig"))):
        title = r["title"] + (f" — {r['section']}" if r["section"] else "")
        lib.append({"id": f"gov-{i}", "of": f"gov-{i}", "label": r["source"].split(", http")[0], "text": f"{title}\n{r['text']}",
                    "search": f"{title} {r['text']}"})
    for g in guides():
        extra = " ".join(x for l in g.get("lists", []) for x in l["items"])
        lib.append({"id": f"guide-{g['slug']}", "of": f"guide-{g['slug']}", "label": f"FurFriends first-aid guide: {g['title']}",
                    "text": guide_text(g), "search": f"{g['title']} {g['summary']} {' '.join(g['signs'])} {extra}"})
    return lib


def passage(x, words=0):
    """A library passage as the model sees it. The first-aid guides are never cut (nor in the app), so all
    their steps are there; other passages are cut to `words`."""
    keep = x["id"].startswith("guide-") or not words
    return {"label": x["label"], "text": x["text"] if keep else clip(x["text"], words)}


def guide_text(g):
    """A first-aid guide as a passage. The signs are in it so the model can tell which guide fits the question.
    sourceOf() in src/lib/assistant.js builds it the same way."""
    return (f"{g['title']}. {g['summary']}\nSigns: " + "; ".join(g["signs"])
            + "".join(f"\n{l['title']}: " + "; ".join(l["items"]) for l in g.get("lists", [])) + "\nWhat to do now:\n"
            + "\n".join(f"{i}. {s}" for i, s in enumerate(g["steps"], 1))
            + ("\nDon't: " + " ".join(g["avoid"]) if g.get("avoid") else "")
            + ("\nGo to a vet now." if g["urgency"] == "now" else "\nCall your vet for advice."))


def guide_answer(g, opener=""):
    """What the model should say when a first-aid guide answers the question: the guide, in plain words.
    A guide whose signs say "Go now: ..." (vomiting) lists them, so blood in the vomit is never "call your vet"."""
    steps = "\n".join(f"- {s}" for s in g["steps"])
    now = [s.removeprefix("Go now: ") for s in g["signs"] if s.startswith("Go now: ")]
    now = ("\n\nGo to the vet now if there's:\n" + "\n".join(f"- {s}" for s in now)) if now else ""
    avoid = ("\n\nDon't:\n" + "\n".join(f"- {s}" for s in g["avoid"])) if g.get("avoid") else ""
    end = ("Go to your vet or the nearest 24-hour clinic now." if g["urgency"] == "now"
           else "Call your vet for advice, and go in if it gets worse.")
    start = opener or f"This sounds like it could be {g['title'][0].lower() + g['title'][1:]}."
    return f"{start} {g['summary']}{now}\n\nWhat to do now:\n{steps}{avoid}\n\n{end}"


ASK = ["My {pet}: {a}. What should I do?", "{a} in my {pet}. Is this serious?", "My {pet} has {a}. Help, what do I do?",
       "What do I do? My {pet} shows {a} and {b}.", "{a}, {b}. My {pet} is like this right now, what should I do?"]

# Things on the poisoning guide's list of common poisons, as owners name them.
POISONS = ["chocolate", "coffee", "grapes", "raisins", "onions", "garlic", "xylitol gum", "paracetamol", "ibuprofen",
           "rat poison", "insect spray", "lilies", "a dog flea treatment", "alcohol", "bleach", "antifreeze", "coolant from the car radiator"]
ASK_POISON = ["My {pet} ate some {x}. Is that dangerous?", "Can {pet}s have {x}?", "My {pet} licked {x}. What do I do?"]
ALSO = {"coolant from the car radiator": "antifreeze", "bleach": "cleaning products", "xylitol gum": "xylitol", "insect spray": "insect sprays",
        "a dog flea treatment": "flea", "paracetamol": "painkillers", "ibuprofen": "painkillers", "rat poison": "rat"}


def guide_asks(rnd):
    """Owner-style questions made from each guide's signs (and the poisoning guide's list), so the model also
    learns to answer from the guides. Returns (guide, question, answer)."""
    out = []
    for g in guides():
        pets = ["dog"] if g["species"] == "Dog" else ["cat"] if g["species"] == "Cat" else ["dog", "cat"]
        signs = [s.removeprefix("Go now: ") for s in g["signs"]]
        signs = [s[0].lower() + s[1:] for s in signs]
        for k, t in enumerate(ASK):
            a, b = rnd.sample(signs, 2)
            out.append((g, t.format(pet=pets[k % len(pets)], a=a, b=b), guide_answer(g)))
        items = [x for l in g.get("lists", []) for x in l["items"]]
        for k, x in enumerate(POISONS if items else []):
            item = next(i for i in items if ALSO.get(x, x.split()[0]).lower() in i.lower())
            q = rnd.choice(ASK_POISON).format(pet=pets[k % len(pets)], x=x)
            out.append((g, q, guide_answer(g, f"Yes, this can be dangerous. It's on FurFriends' list of common poisons: {item.rstrip('.')}.")))
    return out


@torch.no_grad()
def embed(texts, tok, model, batch=64):
    out = []
    for i in range(0, len(texts), batch):
        enc = tok(texts[i:i + batch], padding=True, truncation=True, max_length=256, return_tensors="pt")
        h = model(**enc).last_hidden_state
        m = enc["attention_mask"].unsqueeze(-1).float()
        v = (h * m).sum(1) / m.sum(1)
        out.append(torch.nn.functional.normalize(v, dim=-1))
    return torch.cat(out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--train", default="data/train.jsonl")
    p.add_argument("--gov", default="data/passages/gov_guides.csv")
    p.add_argument("--out", default="data/rag_train.jsonl")
    p.add_argument("--max", type=int, default=1500, help="number of training examples")
    p.add_argument("--max-answer-words", type=int, default=160)
    p.add_argument("--source-words", type=int, default=160,
                   help="every passage is cut to this many words, as in the app (SOURCE_WORDS in src/lib/assistant.js)")
    p.add_argument("--not-found-share", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--base", default="Qwen/Qwen2.5-0.5B-Instruct", help="the model to be trained (for counting tokens)")
    p.add_argument("--max-tokens", type=int, default=800, help="longer examples are left out: they slow training on a CPU")
    args = p.parse_args()
    rnd = random.Random(args.seed)

    train = jsonl(args.train)
    lib = library(train, args.gov)
    by_id = {x["id"]: x for x in lib}
    print(f"Library: {len(lib)} passages ({Counter(x['label'].split(':')[0] for x in lib).most_common(6)})")

    # Which Q&As to train on: our own checked answers always (with their other wordings, e.g. Taglish),
    # then neutral, short Stack Exchange answers until --max.
    why, ours, se = Counter(), [], []
    for ex in train:
        a = ex["messages"][-1]["content"]
        n = len(words(a))
        if n > args.max_answer_words:
            why["answer too long"] += 1
            continue
        if (ex.get("source") or "").startswith("Pets Stack Exchange"):
            if len(PERSONAL.findall(a)) / max(n, 1) > 0.015:
                why["personal story"] += 1
                continue
            se.append(ex)
        else:
            ours.append(ex)
    alts = [(ex, alt) for ex in ours for alt in ex.get("also", [])]
    rnd.shuffle(se)
    picked = se[:max(0, args.max - len(ours) - len(alts))]
    asks = [(ex, ex["messages"][0]["content"]) for ex in ours + picked] + alts
    print(f"Training on {len(asks)} questions: {len(ours)} of our own answers, {len(alts)} other wordings of them (incl. Taglish), "
          f"{len(picked)} Stack Exchange. Not trained on: " + ", ".join(f"{k} {n}" for k, n in why.items()))

    print(f"Loading {EMBED} ...")
    tok, model = AutoTokenizer.from_pretrained(EMBED), AutoModel.from_pretrained(EMBED).eval()
    lib_vec = embed([x["search"] for x in lib], tok, model)
    q_vec = embed([q for _, q in asks], tok, model)
    sims = q_vec @ lib_vec.T

    rows, kinds = [], Counter()
    for i, (ex, q) in enumerate(asks):
        own = ex["id"].split("-")[0]
        order = torch.argsort(sims[i], descending=True).tolist()
        others = [lib[j] for j in order[:40] if lib[j]["of"] != own]
        answer = ex["messages"][-1]["content"]
        ours_q = not (ex.get("source") or "").startswith("Pets Stack Exchange")   # our own answers are always taught
        if not ours_q and rnd.random() < args.not_found_share * len(asks) / len(picked):
            # Only unrelated passages: take ones from further down the list, so they really don't answer it.
            far = [lib[j] for j in order[200:400] if lib[j]["of"] != own]
            sources, answer, kind = [passage(x, args.source_words) for x in rnd.sample(far, 2)], NOT_FOUND, "not found"
        else:
            gold = by_id[ex["id"]]
            # Both cut the same way, so a passage's length never gives away which one holds the answer.
            sources = [passage(x, args.source_words) for x in (gold, others[0])]
            rnd.shuffle(sources)
            kind = "answer in the sources"
        kinds[kind] += 1
        prompt = ex["messages"][:-1]
        if q != prompt[-1]["content"]:
            prompt = prompt[:-1] + [{"role": "user", "content": q}]
        rows.append({"id": ex["id"], "category": ex["category"], "pet": ex.get("pet"), "sources": sources,
                     "messages": prompt + [{"role": "assistant", "content": answer}]})

    # The first-aid guides as the right passage, next to the most similar Q&A (e.g. bloat next to an answer
    # about vomiting), so the model learns to pick the passage by what the owner describes.
    base_tok = AutoTokenizer.from_pretrained(args.base)
    size = lambda r: len(base_tok.apply_chat_template(build_messages(r["messages"], r.get("pet"), r["sources"]), tokenize=True))
    g_asks = guide_asks(rnd)
    g_sims = embed([q for _, q, _ in g_asks], tok, model) @ lib_vec.T
    for i, (g, q, answer) in enumerate(g_asks):
        order = torch.argsort(g_sims[i], descending=True).tolist()
        other = next(lib[j] for j in order if not lib[j]["id"].startswith("guide-"))
        # The long guides (poisoning, choking...) only fit with the other passage cut shorter, or left out.
        for n in (args.source_words, 80, 40, 0):
            sources = [passage(by_id[f"guide-{g['slug']}"])] + ([passage(other, n)] if n else [])
            rnd.shuffle(sources)
            row = {"id": f"guide-{g['slug']}-{i}", "category": g["category"], "sources": sources,
                   "messages": [{"role": "user", "content": q[0].upper() + q[1:]}, {"role": "assistant", "content": answer}]}
            if size(row) <= args.max_tokens:
                break
        kinds["first-aid guide in the sources"] += 1
        rows.append(row)
    long = [r for r in rows if size(r) > args.max_tokens]
    rows = [r for r in rows if r not in long]
    for r in long:
        kinds["not found" if r["messages"][-1]["content"] == NOT_FOUND else
              "first-aid guide in the sources" if r["id"].startswith("guide-") else "answer in the sources"] -= 1
    print(f"Left out {len(long)} examples over {args.max_tokens} tokens")
    rnd.shuffle(rows)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps({k: v for k, v in r.items() if v is not None}, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} examples to {args.out}: " + ", ".join(f"{k} {n}" for k, n in kinds.items()))


if __name__ == "__main__":
    main()
