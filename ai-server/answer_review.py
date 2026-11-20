"""The team's check of the written training answers (v7): a random sample for two teammates, and the tally.

The written answers (data/written_answers.jsonl, written_answers.py) were drafted with an AI assistant from the checked
passages and all pass the automatic checks. This sample is how the team shows, by people, that they say what their
passage says (docs/answer-review/README.md).

  python answer_review.py sample   -> docs/answer-review/answer-review.csv (60 answers: 46 from checked answers, 14 first aid)
  python answer_review.py tally    -> how many each reviewer marked yes, where they agree, and every "no" with its comment
"""
import argparse
import csv
import json
import os
import random

from written_answers import jsonl

SHEET = os.path.join("..", "docs", "answer-review", "answer-review.csv")
COLUMNS = ["n", "kind", "question", "earlier_question", "passage_label", "passage", "written_answer", "cat_answer", "dog_answer",
           "reviewer_1", "ok_1", "reviewer_2", "ok_2", "comment", "key"]


def cmd_sample(args):
    if os.path.exists(args.out) and not args.force:
        raise SystemExit(f"{args.out} exists (it may have the team's marks). Use --force to replace it.")
    todo = {x["key"]: x for x in jsonl(args.todo)}
    answers = [a for a in jsonl(args.answers) if a["key"] in todo]
    rnd = random.Random(args.seed)
    guide = [a for a in answers if todo[a["key"]]["kind"] == "first-aid guide"]
    other = [a for a in answers if todo[a["key"]]["kind"] != "first-aid guide"]
    n_guide = round(args.size * len(guide) / max(1, len(answers)))
    picked = rnd.sample(other, min(len(other), args.size - n_guide)) + rnd.sample(guide, min(len(guide), n_guide))
    rnd.shuffle(picked)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8-sig", newline="") as f:   # utf-8-sig: Excel opens it with the right letters
        w = csv.DictWriter(f, COLUMNS)
        w.writeheader()
        for i, a in enumerate(picked, 1):
            t = todo[a["key"]]
            sp = a.get("by_species") or {}
            w.writerow({"n": i, "kind": t["kind"], "question": t["question"], "earlier_question": t.get("earlier", ""),
                        "passage_label": t["passage"]["label"], "passage": t["passage"]["text"], "written_answer": a["answer"],
                        "cat_answer": sp.get("Cat", ""), "dog_answer": sp.get("Dog", ""), "key": a["key"]})
    print(f"Wrote {len(picked)} answers to review ({len(picked) - n_guide} from checked answers, {n_guide} first aid) to {args.out}")


def cmd_tally(args):
    rows = list(csv.DictReader(open(args.sheet, encoding="utf-8-sig")))
    mark = lambda v: (v or "").strip().lower()[:1]   # yes / y / no / n
    for r in ("1", "2"):
        done = [x for x in rows if mark(x[f"ok_{r}"]) in ("y", "n")]
        yes = sum(mark(x[f"ok_{r}"]) == "y" for x in done)
        names = {x[f"reviewer_{r}"].strip() for x in done if x[f"reviewer_{r}"].strip()}
        print(f"Reviewer {r} ({', '.join(sorted(names)) or 'no name'}): {len(done)} of {len(rows)} checked, {yes} yes"
              + (f" ({yes / len(done):.0%})" if done else ""))
    both = [x for x in rows if mark(x["ok_1"]) in ("y", "n") and mark(x["ok_2"]) in ("y", "n")]
    if both:
        same = sum(mark(x["ok_1"]) == mark(x["ok_2"]) for x in both)
        ok = sum(mark(x["ok_1"]) == mark(x["ok_2"]) == "y" for x in both)
        print(f"Checked by both: {len(both)}. They agree on {same} ({same / len(both):.0%}); both yes: {ok} ({ok / len(both):.0%})")
    bad = [x for x in rows if "n" in (mark(x["ok_1"]), mark(x["ok_2"]))]
    for x in bad:
        print(f"  no: #{x['n']} {x['question'][:70]!r}: {x['comment'] or '(no comment)'}")
    if bad:
        print("Fix these in data/written_answers.jsonl, look for the same mistake in the other answers, then rebuild and retrain.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--answers", default="data/written_answers.jsonl")
    s.add_argument("--todo", default="data/written/questions.jsonl", help="the questions with their passages (written_answers.py todo)")
    s.add_argument("--size", type=int, default=60)
    s.add_argument("--seed", type=int, default=20261120)
    s.add_argument("--out", default=SHEET)
    s.add_argument("--force", action="store_true")
    t = sub.add_parser("tally")
    t.add_argument("--sheet", default=SHEET)
    args = p.parse_args()
    {"sample": cmd_sample, "tally": cmd_tally}[args.cmd](args)


if __name__ == "__main__":
    main()
