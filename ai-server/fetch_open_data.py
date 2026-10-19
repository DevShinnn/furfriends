"""Downloads free, openly licensed pet Q&As and turns them into training rows.

Source: Pets Stack Exchange (https://pets.stackexchange.com), real owners' questions with
answers voted on by the community, via Hugging Face's copy of the Stack Exchange data
(HuggingFaceH4/stack-exchange-preferences). License: CC BY-SA. You may reuse and adapt it,
but you must credit each post and share your adapted data under the same license. Every
row keeps a link to its answer and its author for this.

  python fetch_open_data.py

Writes data/open/pets_stackexchange.csv with the same columns as data/qa.csv.
prepare_data.py reads it together with qa.csv. Only cat and dog questions with a well-voted
answer are kept. Answers that give medicine doses, depend on photos or other answers, or don't
send an emergency to the vet are left out, because the assistant must not learn from them.
These answers come from owners, not vets: have your vet adviser check a sample.
"""
import argparse
import ast
import csv
import html
import os
import re
import urllib.request
from collections import Counter

from evaluate import DOSE, SOON, URGENT, VET, words

PARQUET = ("https://huggingface.co/datasets/HuggingFaceH4/stack-exchange-preferences/resolve/main/"
           "data/pets.stackexchange.com/train-00000-of-00001.parquet")
CACHE = "data/open/cache/pets_stackexchange.parquet"
COLUMNS = ["question", "answer", "category", "set", "pet_name", "pet_species", "pet_breed", "pet_age",
           "pet_weight_kg", "source", "checked_by"]

DOG = re.compile(r"\b(dogs?|pupp(y|ies)|pups?|canines?)\b", re.I)
CAT = re.compile(r"\b(cats?|kittens?|kitty|kitties|felines?)\b", re.I)
# Questions or answers that only make sense with a picture or the rest of the thread
NEEDS_CONTEXT = re.compile(r"\b(this (photo|picture|pic|image|video)|see (the )?(photo|picture|image)|pictured|attached|"
                           r"other answers?|accepted answer|@\w+|as (others|someone) (said|mentioned)|edit:|update:)", re.I)
TOPICS = [   # first match wins, so the most important topics come first
    ("poison", r"\b(poison|toxic|ate (a|some|the)|swallowed|chocolate|xylitol|grapes?|raisins?|lil(y|ies)|onions?|antifreeze|rat bait)"),
    ("emergency", r"\b(seizure|collaps|can'?t breathe|trouble breathing|bleeding|hit by a car|unconscious|bloat|heat ?stroke|straining to (pee|urinate)|blocked)"),
    ("medicine", r"\b(medicine|medication|antibiotic|painkiller|ibuprofen|paracetamol|aspirin|benadryl|dose|pills?|tablets?)\b"),
    ("vaccines", r"\b(vaccin|shots?\b|rabies|booster)"),
    ("parasites", r"\b(fleas?|ticks?|worms?|deworm|mites?|parasites?|heartworm|giardia)"),
    ("when_to_see_vet", r"\b(vomit|diarrh|not eating|won'?t eat|stopped eating|letharg|limp|blood in|cough|sneez|lump|infection|swollen|discharge)"),
    ("feeding", r"\b(food|feed|feeding|diet|eat|eating|treats?|kibble|meal|weight|water|drink)"),
    ("grooming", r"\b(groom|bath|brush|nails?|claws?|shed|fur|coat|teeth|dental|ears?)\b"),
    ("behavior", r"\b(bark|bite|biting|aggress|scratch|chew|train|litter|spray|meow|howl|anxi|fear|scared|play|jump|lick|hump)"),
]
TOPICS = [(name, re.compile(rx, re.I)) for name, rx in TOPICS]


def to_text(fragment):
    """Stack Exchange HTML -> plain text with '- ' lists, the format the assistant answers in."""
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", fragment)
    s = re.sub(r"(?i)<img[^>]*>", " ", s)
    s = re.sub(r"(?i)<li[^>]*>\s*", "\n- ", s)
    s = re.sub(r"(?i)</(p|ul|ol|blockquote|h\d|pre)>|<br\s*/?>|<hr\s*/?>", "\n\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = s.replace("�", "'")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in s.split("\n")]
    s = "\n".join(lines)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    s = re.sub(r"\n\n(?=- )", "\n", s)   # keep list items together
    return s


def license_for(date):
    """Stack Exchange's license depends on when the post was made."""
    y = date.replace("/", "-")
    return "CC BY-SA 2.5" if y < "2011-04-08" else "CC BY-SA 3.0" if y < "2018-05-02" else "CC BY-SA 4.0"


def species(text):
    d, c = bool(DOG.search(text)), bool(CAT.search(text))
    return "Both" if d and c else "Dog" if d else "Cat" if c else ""


def topic(text):
    return next((name for name, rx in TOPICS if rx.search(text)), "general")


def pick_answer(answers):
    """The accepted answer if the community agreed with it, else the highest-voted one."""
    accepted = [a for a in answers if a.get("selected") and a.get("pm_score", 0) >= 1]
    best = accepted[0] if accepted else max(answers, key=lambda a: a.get("pm_score", 0), default=None)
    if best and (best.get("pm_score", 0) >= 3 or best in accepted):
        return best
    return None


def download(path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print("Downloading Pets Stack Exchange from Hugging Face ...")
    urllib.request.urlretrieve(PARQUET, path + ".part")
    os.replace(path + ".part", path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="data/open/pets_stackexchange.csv")
    p.add_argument("--max-answer-words", type=int, default=260, help="longer answers get cut off: the server stops at about 260 words")
    p.add_argument("--min-answer-words", type=int, default=25)
    p.add_argument("--max-question-words", type=int, default=350)
    args = p.parse_args()

    import pandas as pd   # installed with the training requirements (datasets)
    download(CACHE)
    df = pd.read_parquet(CACHE)
    why = Counter()
    rows, kept_species = [], []
    for _, r in df.iterrows():
        q = to_text(r["question"])
        answers = ast.literal_eval(r["answers"]) if isinstance(r["answers"], str) else list(r["answers"])
        sp = species(q)
        if not sp:
            why["not about cats or dogs"] += 1
            continue
        best = pick_answer(answers)
        if not best:
            why["no well-voted answer"] += 1
            continue
        a = to_text(best["text"])
        qn, an = len(words(q)), len(words(a))
        cat = topic(q)
        reason = (
            "question too long" if qn > args.max_question_words else
            "answer too short" if an < args.min_answer_words else
            "answer too long" if an > args.max_answer_words else
            "needs a photo or the thread" if NEEDS_CONTEXT.search(q) or NEEDS_CONTEXT.search(a) or "<img" in r["question"] else
            "mentions a medicine dose" if DOSE.search(a) else
            "urgent, but no vet advice" if cat in URGENT and not (VET.search(a) and SOON.search(a)) else
            "")
        if reason:
            why[reason] += 1
            continue
        qid, aid = r["qid"], best.get("answer_id")
        kept_species.append(sp)
        rows.append({"question": q, "answer": a, "category": cat, "set": "train",
                     "source": f"Pets Stack Exchange, https://pets.stackexchange.com/a/{aid} (question "
                               f"https://pets.stackexchange.com/q/{qid}), answer by {best.get('author', 'unknown')}, "
                               f"{license_for(str(r['date']))}",
                     "checked_by": ""})

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(df)} questions read. Kept {len(rows)}. Left out:")
    for k, n in why.most_common():
        print(f"  {n:>5}  {k}")
    print("\nKept, by category:")
    for k, n in Counter(r["category"] for r in rows).most_common():
        print(f"  {n:>5}  {k}")
    print("  " + ", ".join(f"{k.lower()} {n}" for k, n in Counter(kept_species).most_common()))
    print(f"\nWrote {args.out}. Next: python prepare_data.py")


if __name__ == "__main__":
    main()
