"""Turns the team's Q&A spreadsheet into the training and test files.

Collect Q&As in a Google Sheet with the columns of data/qa.csv, then File -> Download -> CSV,
save it as data/qa.csv and run (rows from fetch_open_data.py in data/open/ are added too):

  python prepare_data.py

It checks every row, then writes data/train.jsonl (for train_lora.py) and data/test.jsonl
(held-out questions for evaluate.py). Rows with "test" or "train" in the set column stay there;
about 15% of the blank rows go to testing. Each question's place depends only on the question
itself, so adding rows never moves an earlier test question into training.
"""
import argparse
import csv
import glob
import hashlib
import os
import json
import re
import sys
from collections import Counter

from evaluate import DOSE, MEDICINE, SOON, URGENT, VET, words

REQUIRED = ["question", "answer", "category"]


def read_rows(path):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
    except UnicodeDecodeError:
        sys.exit(f"{path} isn't saved as UTF-8. In Excel use Save As -> 'CSV UTF-8', or download it from Google Sheets.")
    missing = [c for c in REQUIRED if rows and c not in rows[0]]
    if missing:
        sys.exit(f"{path} is missing the column(s): {', '.join(missing)}. Copy the header row from data/qa.csv.")
    for n, r in enumerate(rows, 2):   # row 1 is the header, as in the spreadsheet
        r["_file"], r["_where"] = path, f"{os.path.basename(path)} row {n}"
    return rows


def key(text):
    return " ".join(words(text))


def check(rows):
    """Returns (errors, warnings). Errors stop the build; warnings are things to look at.
    A question repeated in a later file is skipped, so your own sheet wins over downloaded data."""
    errors, warnings, seen = [], [], {}
    for r in rows:
        n = r["_where"]
        q, a, cat = (r.get(k, "").strip() for k in ("question", "answer", "category"))
        if not (q or a):
            continue
        if not q or not a or not cat:
            errors.append(f"{n}: question, answer and category are all needed")
            continue
        if (r.get("set") or "").strip().lower() not in ("", "train", "test"):
            errors.append(f"{n}: set must be empty, train or test")
        if key(q) in seen:
            first = seen[key(q)]
            if first["_file"] == r["_file"]:
                errors.append(f"{n}: same question as {first['_where']}")
            else:
                warnings.append(f"{n}: skipped, same question as {first['_where']}")
                r["_skip"] = True
            continue
        seen[key(q)] = r
        if len(words(a)) > 200:
            warnings.append(f"{n}: answer is {len(words(a))} words (the assistant is told to stay under 200)")
        if cat in MEDICINE and DOSE.search(a):
            warnings.append(f"{n}: medicine answer gives a dose, which the assistant must not do")
        elif DOSE.search(a):
            warnings.append(f"{n}: answer mentions a dose. Check it's not a medicine dose")
        if cat in URGENT and not (VET.search(a) and SOON.search(a)):
            warnings.append(f"{n}: '{cat}' answer doesn't tell the owner to see a vet soon")
        if not (r.get("source") or "").strip():
            warnings.append(f"{n}: no source (your panel will ask where each answer came from)")
        if not (r.get("checked_by") or "").strip():
            warnings.append(f"{n}: not checked yet (checked_by is empty)")
    return errors, warnings


def to_example(r):
    q, a = r["question"].strip(), r["answer"].strip()
    ex = {"id": "q" + hashlib.sha1(key(q).encode()).hexdigest()[:6], "category": r["category"].strip(),
          "messages": [{"role": "user", "content": q}, {"role": "assistant", "content": a}]}
    pet = {"name": r.get("pet_name"), "species": r.get("pet_species"), "breed": r.get("pet_breed"), "age": r.get("pet_age")}
    pet = {k: v.strip() for k, v in pet.items() if (v or "").strip()}
    if (r.get("pet_weight_kg") or "").strip():
        pet["weightKg"] = float(r["pet_weight_kg"])
    if pet:
        ex["pet"] = pet
    return ex


def goes_to_test(r, frac, seed):
    """Decided from the question alone, so adding or reordering rows never moves a question
    between train and test (that would make the accuracy score unfair)."""
    h = hashlib.sha1(f"{seed}:{key(r['question'])}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64 < frac


def split(rows, frac, seed):
    """Rows marked train or test stay there; blank rows go to test with chance frac."""
    train, test = [], []
    for r in rows:
        s = (r.get("set") or "").strip().lower()
        (test if s == "test" or (not s and goes_to_test(r, frac, seed)) else train).append(r)
    counts = Counter(r["category"].strip() for r in rows)
    tested = {r["category"].strip() for r in test}
    small = sorted(c for c in counts if c not in tested)
    return train, test, small


def write(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(to_example(r), ensure_ascii=False) + "\n")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", nargs="+", default=["data/qa.csv"] + sorted(glob.glob("data/open/*.csv")),
                   help="your sheet first, then downloaded data (default: data/qa.csv and data/open/*.csv)")
    p.add_argument("--train", default="data/train.jsonl")
    p.add_argument("--test", default="data/test.jsonl")
    p.add_argument("--test-share", type=float, default=0.15, help="share of each category kept for testing")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--all", action="store_true", help="list every warning, not just the first 25")
    args = p.parse_args()

    rows = [r for path in args.csv for r in read_rows(path)
            if (r.get("question") or "").strip() or (r.get("answer") or "").strip()]
    print("Reading " + ", ".join(f"{path} ({sum(r['_file'] == path for r in rows)} rows)" for path in args.csv))
    errors, warnings = check(rows)
    rows = [r for r in rows if not r.get("_skip")]
    if warnings:
        kinds = Counter(re.sub(r"\d+", "N", w.split(": ", 1)[1].split(" (")[0].split(",")[0]) for w in warnings)
        print(f"\n{len(warnings)} warning(s) to look at:")
        for k, n in kinds.most_common():
            print(f"  {n:>5} x {k}")
        shown = warnings if args.all else warnings[:25]
        print("\n" + "\n".join("  " + w for w in shown))
        if len(shown) < len(warnings):
            print(f"  ... and {len(warnings) - len(shown)} more (python prepare_data.py --all)")
    if errors:
        print(f"\n{len(errors)} error(s). Fix these in the spreadsheet, then run again:")
        for e in errors:
            print("  " + e)
        sys.exit(1)

    train, test, small = split(rows, args.test_share, args.seed)
    write(args.train, train)
    write(args.test, test)
    cats = sorted({r["category"].strip() for r in rows})
    tr, te = Counter(r["category"].strip() for r in train), Counter(r["category"].strip() for r in test)
    print(f"\n{'category':<18}{'train':>7}{'test':>7}")
    for c in cats:
        print(f"{c:<18}{tr[c]:>7}{te[c]:>7}")
    print(f"{'total':<18}{len(train):>7}{len(test):>7}")
    if small:
        print(f"\nNo test questions yet for: {', '.join(small)}. Add more rows, or write test in the set column of one of them.")
    print(f"\nWrote {args.train} and {args.test}.")


if __name__ == "__main__":
    main()
