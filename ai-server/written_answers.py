"""Training answers written for each question (v7), instead of pasting the whole checked answer.

Until v6, every training answer was a checked answer word for word: v6's 954 answers were only 183 different checked
answers, repeated under 376 different questions. The model learned to find the matching passage and paste all of it,
even the parts that don't fit ("When should I get my female cat spayed?" also got the ages for dogs): in the
2026-11-13 benchmark, 50 of v6's 62 answers were 90% or more copied from one passage.

v7 trains on an answer written for each question from its checked passage (data/written_answers.jsonl). It answers
that question first, keeps only what fits (the cat part for a cat), and uses only facts in the passage (the style:
data/written/STYLE.md). Every answer must pass, with the passages of every example it is used in:
  - the check the app applies to the model's answers (checkAnswer in src/lib/evidence.js, via scripts/check-answers.mjs):
    no law, organisation, medicine, dose, number or link that isn't in the passages, and built on a passage's words;
  - the checks below: not a "couldn't find", no "records" (the app adds the pet's notes itself), not too long, no part
    for the other species, the vet advice kept when the passage says to see a vet now, and numbers written as words
    ("three times a week") in the passages too.
11 examples the earlier steps make wrongly are left out (dropped(): a dog's first-aid question with a cat's sign in
it, and pet profiles of the wrong pet or species).
A question that names no species but is also trained with a dog or cat profile can have an answer per species
("by_species"). The answers were drafted with an AI assistant (Claude) from the passages; the team checks a sample
(docs/answer-review/).

  python written_answers.py todo  --data data/rag_train_v7_pre.jsonl --out data/written/todo.jsonl
  python written_answers.py check --data data/rag_train_v7_pre.jsonl --answers data/written_answers.jsonl
  python written_answers.py apply --data data/rag_train_v7_pre.jsonl --answers data/written_answers.jsonl --out data/rag_train_v7.jsonl
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict

from prompting import NOT_FOUND, describe_pet

DOG = re.compile(r"\b(dogs?|pupp(y|ies)|aso|tuta)\b", re.I)
CAT = re.compile(r"\b(cats?|kittens?|pusa|kuting)\b", re.I)
FOLLOW_UP = re.compile(r"^\s*(what about|how about|same question|paano naman)\b", re.I)   # "What about for my dog?"
NOTES = re.compile(r"\n\nFrom [^\n]+'s records:\n.*\Z", re.S)   # the pet notes add_pet_profiles.py appends
DECLINES = re.compile(r"couldn't find|could not find|can't find|don't want to guess|\bnot in (the|my) sources\b", re.I)
RECORDS = re.compile(r"\b(\w+['’]s|my|your|the pet's) records\b", re.I)
PART_FOR = {"Cat": re.compile(r"(?mi)^\s*(?:[-*]\s*)?(?:for\s+)?(dogs?|pupp(?:y|ies))\s*:"),
            "Dog": re.compile(r"(?mi)^\s*(?:[-*]\s*)?(?:for\s+)?(cats?|kittens?)\s*:")}
URGENT = re.compile(r"\b(go to (a|the|your) vet now|vet (right )?now|see (a|your) vet (now|today|right away|immediately)|"
                    r"emergency|24-hour clinic)\b", re.I)
MAX_WORDS = {"guide": 230, "answer": 150}
# The app's check compares numbers written in digits; these must be in the passages too ("three times a week").
NUMBER_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
                "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
                "hundred": 100, "dozen": 12, "twice": 2, "thrice": 3}

# Examples the earlier steps make that are wrong, left out of v7 (found while writing its answers):
#  - first-aid questions are made from a guide's signs (build_rag_data.py guide_asks), and a sign for the other species
#    ends up in a dog's question: "My dog has open-mouth breathing in a cat", "...going back to the box again and again";
#  - add_pet_profiles.py gives a question about one named pet ("Is Mochi's weight healthy?") other pets' profiles, and
#    reads the species only from words like "dog", so "my Shih Tzu" can get a cat's profile.
OWNER_PET = re.compile(r"\b(?:my|in my) (dog|cat)\b", re.I)
OTHER_SIGN = {"dog": re.compile(r"\b(cats?|kittens?|litter|the box)\b", re.I), "cat": re.compile(r"\b(dogs?|pupp(y|ies))\b", re.I)}
BREEDS = {"Dog": re.compile(r"\b(shih ?tzus?|aspins?|labradors?|golden retrievers?|pugs?|chihuahuas?|husky|huskies|poodles?|beagles?|"
                            r"bulldogs?|dachshunds?|pomeranians?|german shepherds?|rottweilers?|corgis?|maltese|japanese spitz)\b", re.I),
          "Cat": re.compile(r"\b(puspins?|persians?|siamese|maine coons?|british shorthairs?|ragdolls?|bengals?|scottish folds?)\b", re.I)}


def jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def norm(s):
    return " ".join(s.lower().split())


def asked(row):
    return [m["content"] for m in row["messages"] if m["role"] == "user"]


def key(row):
    """What the answer is to: the owner's last message, and for "What about for my dog?" the question before it."""
    qs = asked(row)
    if len(qs) > 1 and FOLLOW_UP.match(qs[-1]):
        return f"{norm(qs[-2])} >> {norm(qs[-1])}"
    return norm(qs[-1])


def target(row):
    """The answer without the pet notes, and the notes ('' if none)."""
    a = row["messages"][-1]["content"]
    m = NOTES.search(a)
    return (a[:m.start()], a[m.start():]) if m else (a, "")


def is_guide(row):
    return row["id"].startswith("guide-")


def words(t):
    return re.findall(r"[a-z0-9']+", t.lower())


def gold(row):
    """The passage the old answer was taken from: the first-aid guide, or the passage sharing most of its words."""
    if is_guide(row):
        return next(s for s in row["sources"] if s["label"].startswith("FurFriends first-aid guide"))
    a = set(words(target(row)[0]))
    return max(row["sources"], key=lambda s: len(a & set(words(s["text"]))) / max(1, len(a)))


def species_asked(text):
    dog, cat = bool(DOG.search(text)), bool(CAT.search(text))
    return "Dog" if dog and not cat else "Cat" if cat and not dog else None


def copied(answer, text, n=5):
    """Share of the answer's 5-word runs that are in the text (1.0 = pasted)."""
    a, t = words(answer), words(text)
    grams = {tuple(t[i:i + n]) for i in range(len(t) - n + 1)}
    runs = [tuple(a[i:i + n]) for i in range(len(a) - n + 1)]
    return sum(r in grams for r in runs) / max(1, len(runs))


def dropped(row):
    """Why this example is left out of v7 (see above), or None."""
    q = asked(row)[-1]
    m = OWNER_PET.search(q)
    if is_guide(row) and m and OTHER_SIGN[m.group(1).lower()].search(OWNER_PET.sub("", q)):
        return "first-aid question with a sign for the other species"
    if row.get("simulated_pet"):
        if row["category"] == "pet_context":
            return "question about another named pet"
        other = "Cat" if row["pet"].get("species") == "Dog" else "Dog"
        if BREEDS[other].search(" ".join(asked(row))):
            return "the question names a breed of the other species"
    return None


def answered(rows):
    return [r for r in rows if target(r)[0] != NOT_FOUND and not dropped(r)]


def app_check(items):
    """checkAnswer() of the app for [{answer, sources, context}] (scripts/check-answers.mjs)."""
    if not items:
        return []
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    try:
        out = subprocess.run(f'npx vite-node scripts/check-answers.mjs -- "{f.name}"', cwd="..", shell=True,
                             capture_output=True, text=True, encoding="utf-8", check=True)
    finally:
        os.remove(f.name)
    return json.loads(out.stdout.strip().splitlines()[-1])


def choose(entry, row):
    """The written answer for this example: the pet's species' own answer when there is one."""
    sp = (row.get("pet") or {}).get("species")
    return (entry.get("by_species") or {}).get(sp) or entry["answer"]


def own_checks(answer, row):
    """The checks besides the app's: a list of problems."""
    out = []
    g = gold(row)
    if not answer.strip():
        return ["empty"]
    if DECLINES.search(answer):
        out.append("says it couldn't find the answer")
    if RECORDS.search(answer):
        out.append("talks about records (the app adds the pet's notes itself)")
    if answer.lstrip().startswith(("I ", "I'm", "I'd")):
        out.append("starts with I")
    n, most = len(answer.split()), MAX_WORDS["guide" if is_guide(row) else "answer"]
    if n > most:
        out.append(f"{n} words (at most {most})")
    sp = (row.get("pet") or {}).get("species") or species_asked(" ".join(asked(row)))
    if sp and PART_FOR[sp].search(answer):
        out.append(f"has a part for the other species ({PART_FOR[sp].search(answer).group(1)}) for a {sp.lower()}")
    if URGENT.search(g["text"]) and "vet" not in answer.lower() and (is_guide(row) or URGENT.search(target(row)[0])):
        out.append("leaves out the passage's advice to see a vet now")
    have = " ".join([s["text"] for s in row["sources"]] + asked(row)).lower()
    for w in sorted(set(re.findall(r"\b(" + "|".join(NUMBER_WORDS) + r")\b", answer.lower()))):
        if not re.search(rf"\b{w}\b", have) and not re.search(rf"\b{NUMBER_WORDS[w]}\b", have):
            out.append(f"number not in the sources: {w}")
    return out


def run_checks(rows, answers, partial=False):
    """Checks every example that has a written answer. Returns ({key: [problems]}, missing keys, warnings)."""
    by_key = {a["key"]: a for a in answers}
    todo, missing = [], set()
    for r in answered(rows):
        k = key(r)
        if k not in by_key:
            missing.add(k)
            continue
        a = choose(by_key[k], r)
        ctx = "\n".join([describe_pet(r.get("pet")) or ""] + asked(r))
        todo.append((k, r, a, {"answer": a, "sources": r["sources"], "context": ctx}))
    results = app_check([t[3] for t in todo])
    problems, warns = defaultdict(set), defaultdict(set)
    for (k, r, a, _), res in zip(todo, results):
        sp = (r.get("pet") or {}).get("species")
        tag = f" [{sp} answer]" if sp and sp in (by_key[k].get("by_species") or {}) else ""
        for p in res["problems"] + own_checks(a, r):
            problems[k].add(p + tag)
        g = gold(r)["text"]
        if copied(a, g) >= 0.95 and len(a.split()) >= 0.8 * len(g.split()):
            warns[k].add("looks like the whole passage pasted")
    used = {key(r) for r in answered(rows)}
    stale = [a["key"] for a in answers if a["key"] not in used]
    if stale and not partial:
        print(f"Note: {len(stale)} written answers aren't used by {len(rows)} examples (questions no longer in the data), e.g. {stale[:2]}")
    return problems, (set() if partial else missing), warns


def cmd_todo(args):
    rows = jsonl(args.data)
    done = {a["key"] for a in jsonl(args.answers)} if args.answers and os.path.exists(args.answers) else set()
    items = {}
    for r in answered(rows):
        k = key(r)
        if k in done:
            continue
        g = gold(r)
        it = items.setdefault(k, {"key": k, "question": asked(r)[-1], **({"earlier": asked(r)[-2]} if " >> " in k else {}),
                                  "category": r["category"], "kind": "first-aid guide" if is_guide(r) else "checked answer",
                                  "passage": g, "pets": set(), "examples": 0})
        it["examples"] += 1
        if (r.get("pet") or {}).get("species"):
            it["pets"].add(r["pet"]["species"])
    out = []
    for it in items.values():
        text = " ".join([it.get("earlier", ""), it["question"]])
        both = bool(DOG.search(it["passage"]["text"])) and bool(CAT.search(it["passage"]["text"]))
        it["needs_species"] = sorted(it["pets"]) if not species_asked(text) and both and it["pets"] else []
        it["pets"] = sorted(it["pets"])
        out.append(it)
    out.sort(key=lambda x: (x["kind"], x["category"], x["key"]))
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for it in out:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    print(f"{len(out)} questions still need a written answer ({sum(bool(x['needs_species']) for x in out)} also per species), "
          f"{len(done)} already written. Wrote {args.out}")
    print("  " + ", ".join(f"{k} {n}" for k, n in Counter(x["kind"] for x in out).items()))


def report(problems, missing, warns):
    for k in sorted(problems):
        if problems[k]:
            print(f"- {k!r}:\n    " + "\n    ".join(sorted(problems[k])))
    for k in sorted(warns):
        print(f"  (warning) {k!r}: " + "; ".join(sorted(warns[k])))
    bad = sum(bool(v) for v in problems.values())
    print(f"{bad} written answers with problems, {len(missing)} questions without a written answer, {len(warns)} warnings")
    return bad == 0 and not missing


def cmd_check(args):
    rows, answers = jsonl(args.data), jsonl(args.answers)
    dup = [k for k, n in Counter(a["key"] for a in answers).items() if n > 1]
    if dup:
        raise SystemExit(f"{args.answers}: these questions have more than one written answer: {dup[:5]}")
    ok = report(*run_checks(rows, answers, partial=args.partial))
    sys.exit(0 if ok else 1)


def cmd_apply(args):
    rows, answers = jsonl(args.data), jsonl(args.answers)
    if not report(*run_checks(rows, answers)):
        raise SystemExit("Fix the written answers first (nothing written).")
    by_key = {a["key"]: a for a in answers}
    before, after, out, left_out = [], [], [], Counter()
    for r in rows:
        why = dropped(r)
        if why:
            left_out[why] += 1
            continue
        old, notes = target(r)
        if old == NOT_FOUND:
            out.append(r)
            continue
        new = choose(by_key[key(r)], r)
        g = gold(r)["text"]
        before.append(copied(old, g))
        after.append(copied(new, g))
        out.append({**r, "written_answer": True, "messages": r["messages"][:-1] + [{"role": "assistant", "content": new + notes}]})
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    med = lambda xs: sorted(xs)[len(xs) // 2]
    print(f"Wrote {len(out)} examples to {args.out}: {len(before)} with a written answer, {len(out) - len(before)} \"couldn't find\"."
          + (" Left out: " + ", ".join(f"{n} {k}" for k, n in left_out.items()) if left_out else ""))
    print(f"Copied from the passage (5-word runs): median {med(before):.2f} before, {med(after):.2f} after; "
          f"90%+ copied: {sum(c >= 0.9 for c in before)} before, {sum(c >= 0.9 for c in after)} after")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("todo", help="list the questions that still need a written answer")
    t.add_argument("--data", required=True)
    t.add_argument("--answers", default="data/written_answers.jsonl", help="answers already written (left out of the list)")
    t.add_argument("--out", default="data/written/todo.jsonl")
    c = sub.add_parser("check", help="check written answers against every example they are used in")
    c.add_argument("--data", required=True)
    c.add_argument("--answers", required=True)
    c.add_argument("--partial", action="store_true", help="check only the questions in --answers (a part being written)")
    a = sub.add_parser("apply", help="write the training set with the written answers")
    a.add_argument("--data", required=True)
    a.add_argument("--answers", required=True)
    a.add_argument("--out", required=True)
    args = p.parse_args()
    {"todo": cmd_todo, "check": cmd_check, "apply": cmd_apply}[args.cmd](args)


if __name__ == "__main__":
    main()
