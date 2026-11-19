"""Training data with pet "pre-context": the model learns to answer about the owner's own pet.

In the app, the owner can pick one of their pets, and the AI is sent that pet's details with the question
(petContext in src/lib/prompt.js): species, breed, age and life stage, weight, allergies, medicines, recent
illnesses, vaccines, diet, last checkup and the health check's concerns. Until v5 the model was only ever trained
with a species ("pet": {"species": "Dog"}), never with a whole profile.

This makes v6 from an earlier training set (v5 by default). It keeps every example and adds copies with a SIMULATED
pet profile (made up by scripts/pet-profiles.mjs; no real owner's pet is used). A question about something in a
pet's records (food, vaccines, medicines, symptoms, checkups) gets three: two with a pet whose records it's about
and one with any pet; a share of the other questions (--share) get one, with any pet. Then:
  - the answer gets the notes the app itself adds for that question and pet (src/lib/petNotes.js), e.g.
      From Bori's records:
      - Bori has an allergy record: Chicken protein sensitivity. Check food and treat labels for it, ...
    so the model learns to use the pet's records when they're about the question,
  - a pet whose records aren't about the question gets no notes, so the model learns to leave them out,
  - "couldn't find" answers and emergencies stay word for word the same (the app adds no notes to them).
With --db-pets, the pets are the training pets stored in the FurFriends training account in Supabase, which the team
can open and correct in the app (npm run training-pets -- seed / export); only their training split is used.
The notes are made by the app's own rule, through scripts/pet-profiles.mjs, and every profile is printed by both
describePet() (JavaScript) and describe_pet() (prompting.py); the script stops if they differ.

  python add_pet_profiles.py --base data/rag_train_v5.jsonl --out data/rag_train_v6.jsonl
  python train_lora.py --data data/rag_train_v6.jsonl --base Qwen/Qwen2.5-0.5B-Instruct --out adapters/rag-v6 --layers attention --max-length 900 --epochs 1 --no-checkpointing --save-steps 100
"""
import argparse
import json
import os
import random
import re
import subprocess
import tempfile
from collections import Counter, defaultdict

from prompting import NOT_FOUND, build_messages, describe_pet

DOG = re.compile(r"\b(dogs?|pupp(y|ies)|aso|tuta)\b", re.I)
CAT = re.compile(r"\b(cats?|kittens?|pusa|kuting)\b", re.I)


def jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def held_out():
    """The evaluation questions, lower-cased: never trained on (the base set already leaves them out)."""
    qs = {t for r in jsonl("data/retrieval_eval.jsonl") for t in r["turns"]}
    qs |= {c["q"] for c in json.load(open("data/safety_eval.json", encoding="utf-8"))["cases"]}
    qs |= {r["messages"][-2]["content"] for r in jsonl("data/test.jsonl")}
    return {q.strip().lower() for q in qs}


def profiles(requests, unreviewed=False, db_pets=None):
    """The app's own profiles and notes for each request (scripts/pet-profiles.mjs)."""
    env = {**os.environ, **({"SYMPTOM_NOTES": "all"} if unreviewed else {}), **({"TRAINING_PETS": os.path.abspath(db_pets)} if db_pets else {})}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(requests, f)
    try:
        out = subprocess.run(f'npx vite-node scripts/pet-profiles.mjs -- "{f.name}"', cwd="..", shell=True, env=env,
                             capture_output=True, text=True, encoding="utf-8", check=True)
    finally:
        os.remove(f.name)
    return json.loads(out.stdout.strip().splitlines()[-1])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default="data/rag_train_v5.jsonl", help="the training set to add pet profiles to")
    p.add_argument("--out", default="data/rag_train_v6.jsonl")
    p.add_argument("--share", type=float, default=0.35, help="share of the other examples (not about a pet's records) also trained with a pet profile")
    p.add_argument("--per-rule", type=int, default=2, help="examples per symptom rule for each question it applies to")
    p.add_argument("--contrast", type=int, default=2, help="examples with an unrelated pet for each symptom question (per species)")
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct", help="the model to be trained (for counting tokens)")
    p.add_argument("--max-tokens", type=int, default=1024, help="longer examples are left out (train with --max-length at least this)")
    p.add_argument("--questions", default="data/symptom_questions.json", help="other wordings of checked symptom questions")
    p.add_argument("--db-pets", default="", help="the training pets exported from the database (npm run training-pets -- export), "
                   "e.g. data/training_pets.json; without it, pets are made up on the fly")
    p.add_argument("--unreviewed", action="store_true",
                   help="use symptom rules the team hasn't approved yet: a PREVIEW of the data only, written to its own file; never train on it")
    args = p.parse_args()
    if args.unreviewed and args.out == p.get_default("out"):
        args.out = "data/rag_train_v6_PREVIEW_unreviewed.jsonl"
    approved = json.load(open("../src/lib/symptomReview.json", encoding="utf-8"))["approved"]
    print(f"Symptom rules approved by two teammates: {len(approved)}" + (" (using ALL rules: preview only)" if args.unreviewed else ""))
    rnd = random.Random(args.seed)

    rows = jsonl(args.base)
    evals = held_out()
    asked = lambda r: [m["content"] for m in r["messages"] if m["role"] == "user"]
    leaked = [r["id"] for r in rows if any(q.strip().lower() in evals for q in asked(r))]
    if leaked:
        raise SystemExit(f"{len(leaked)} examples in {args.base} ask an evaluation question: {leaked[:5]}")

    # Other ways owners ask the checked symptom questions (data/symptom_questions.json), with the same checked answer
    # and sources, so every symptom rule gets enough examples.
    extra = json.load(open(args.questions, encoding="utf-8"))
    added_q = []
    for pid, qs in extra.items():
        if pid.startswith("_"):
            continue
        base = next((r for r in rows if r["id"] == pid and len(r["messages"]) == 2 and r["messages"][-1]["content"] != NOT_FOUND), None)
        if not base:
            raise SystemExit(f"{args.questions}: {pid} isn't a checked answer in {args.base}")
        for k, q in enumerate(qs, 1):
            if q.strip().lower() in evals:
                raise SystemExit(f"{args.questions}: {q!r} is an evaluation question")
            added_q.append({**base, "id": f"{pid}-ask{k}", "extra_question": True,
                            "messages": [{"role": "user", "content": q}, base["messages"][-1]]})
    rows = rows + added_q
    print(f"Added {len(added_q)} other wordings of checked symptom questions ({args.questions})")

    # Which questions are about something in a pet's records (food, vaccines, medicines, symptoms...), by the app's rule.
    owner = lambda r: [m for m in r["messages"] if m["role"] == "user"]
    about = profiles([{"messages": owner(r), "species": "Dog", "seed": 1, "mode": "topics"} for r in rows], args.unreviewed)

    def species_of(r):
        if (r.get("pet") or {}).get("species"):
            return r["pet"]["species"]
        text = " ".join(asked(r))
        dog, cat = bool(DOG.search(text)), bool(CAT.search(text))
        either = re.search(r"\b(dogs?|cats?) (or|and) (dogs?|cats?)\b", text, re.I)   # "my dog or cat has diarrhea"
        return "Dog" if dog and not cat else "Cat" if cat and not dog else None if dog and cat and not either else rnd.choice(["Dog", "Cat"])

    # A question about the records: twice with a pet whose records it's about (notes), once with any pet (mostly
    # none), so the model sees what makes the difference. Any other question: a share of them once, with any pet.
    # A symptom question (in the history rules of src/lib/symptomNotes.js): --per-rule pets for each rule that can apply,
    # and one with any pet. A rule is per species, so a "dog or cat" question gets pets of both.
    picked, requests = [], []
    add = lambda r, species, mode, rule=None: (picked.append(r), requests.append(
        {"messages": owner(r), "species": species, "seed": rnd.randrange(1, 2**31), "mode": mode, "rule": rule}))
    for r, a in zip(rows, about):
        species = species_of(r)
        if not species:   # about a dog and a cat ("my dog's flea spot-on on my cat"): which one would the pet be?
            continue
        answered = r["messages"][-1]["content"] != NOT_FOUND
        text = " ".join(asked(r))
        both = not ((r.get("pet") or {}).get("species")) and not (DOG.search(text) and not CAT.search(text)) and not (CAT.search(text) and not DOG.search(text))
        kinds = ["Dog", "Cat"] if both else [species]
        rules = {s: a.get("rules", {}).get(s, []) for s in kinds} if answered else {}
        if any(rules.values()):
            for s in kinds:
                for rule in rules[s]:
                    for _ in range(args.per_rule):
                        add(r, s, "relevant", rule)
                for _ in range(args.contrast):
                    add(r, s, "random")
        elif a["topics"] and answered:
            for mode in ("relevant", "relevant", "random"):
                add(r, species, mode)
        elif rnd.random() < args.share:
            add(r, species, "random")
    if args.db_pets:
        # The training pets stored in the database: for each planned example, one that fits it (records the question is
        # about, or for the contrast examples, none), and never the same pet twice for a question.
        need = list({id(r): r for r in picked}.values())
        found = profiles([{"messages": owner(r), "mode": "match"} for r in need], args.unreviewed, args.db_pets)
        matches = {id(r): x["matches"] for r, x in zip(need, found)}
        print(f"Using the {len(found[0]['matches']) if found else 0} training pets in {args.db_pets} (evaluation pets left out)")
        used, chosen = defaultdict(set), []
        for r, req in zip(picked, requests):
            pets = [x for x in matches[id(r)] if x["species"] == req["species"] and x["id"] not in used[id(r)]]
            if req["mode"] == "relevant":
                fits = [x for x in pets if (req["rule"] in x["topics"] if req["rule"] else x["topics"])]
            else:
                fits = [x for x in pets if not x["topics"]] or pets
            if fits:
                pet = rnd.choice(fits)
                used[id(r)].add(pet["id"])
                chosen.append((r, {"messages": owner(r), "mode": "pet", "petId": pet["id"], "plan": req["mode"]}))
        picked, requests = [r for r, _ in chosen], [q for _, q in chosen]
    print(f"Adding {len(picked)} pet-profile examples to the {len(rows)} in {args.base} "
          f"({sum(bool(a['topics']) for a in about)} questions are about something in a pet's records)...")
    made = profiles(requests, args.unreviewed, args.db_pets)

    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(args.model)
    size = lambda r: len(tok.apply_chat_template(build_messages(r["messages"], r.get("pet"), r.get("sources")), tokenize=True))

    added, kinds, long, copies = [], Counter(), 0, Counter()
    for r, req, m in zip(picked, requests, made):
        copies[r["id"]] += 1
        if describe_pet(m["pet"]) != m["described"]:
            raise SystemExit(f"prompting.describe_pet() and describePet() differ for {r['id']}:\n  py: {describe_pet(m['pet'])}\n  js: {m['described']}")
        answer = r["messages"][-1]["content"]
        if answer == NOT_FOUND:
            new, kind = answer, "couldn't find (no notes)"
        elif m["notes"]:
            new, kind = f"{answer}\n\n{m['notes']}", "with notes: " + "+".join(m["topics"])
        else:
            new, kind = answer, f"no notes ({req.get('plan', req['mode'])} profile)"
        row = {**r, "id": f"{r['id']}-pet{copies[r['id']]}", "pet": m["pet"], "simulated_pet": True,
               **({"db_pet": req["petId"]} if args.db_pets else {}),
               **({"unreviewed_rules": True} if args.unreviewed else {}),
               "messages": r["messages"][:-1] + [{"role": "assistant", "content": new}]}
        if size(row) > args.max_tokens:
            long += 1
            continue
        added.append(row)
        kinds["with notes" if kind.startswith("with notes") else kind] += 1
        if kind.startswith("with notes"):
            kinds[kind] += 1
        for t in m["topics"]:
            if "-" in t:   # a symptom rule (rule ids have dashes)
                kinds[f"symptom rule: {t}"] += 1

    out = rows + added
    rnd.shuffle(out)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Left out {long} examples over {args.max_tokens} tokens")
    print(f"Wrote {len(out)} examples to {args.out}: {len(rows)} from {args.base}, {len(added)} with a simulated pet profile")
    for k, n in sorted(kinds.items(), key=lambda x: (not x[0].startswith(("with notes", "no notes", "couldn't")), -x[1])):
        print(f"  {n:4}  {k}")


if __name__ == "__main__":
    main()
