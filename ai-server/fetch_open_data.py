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
These answers come from owners, not vets: the team checks a sample against trusted vet sources.
"""
import argparse
import ast
import csv
import gzip
import html
import json
import os
import time
import re
import urllib.request
from collections import Counter

from evaluate import DOSE, SOON, URGENT, VET, words

PARQUET = ("https://huggingface.co/datasets/HuggingFaceH4/stack-exchange-preferences/resolve/main/"
           "data/pets.stackexchange.com/train-00000-of-00001.parquet")
CACHE = "data/open/cache/pets_stackexchange.parquet"
# Which question each answer really belongs to, from the Stack Exchange API. Hugging Face's copy pairs
# some questions with another question's answers (e.g. a rabbit question with an answer about a cat),
# so every kept answer is checked against the live site. Saved so later runs work offline.
PARENTS = "data/open/cache/answer_parents.json"
# The official data dump (all questions up to April 2024), used by --source dump.
DUMP_URL = "https://archive.org/download/stackexchange/pets.stackexchange.com.7z"
DUMP = "data/open/cache/pets.stackexchange.com.7z"
COLUMNS = ["question", "answer", "category", "set", "pet_name", "pet_species", "pet_breed", "pet_age",
           "pet_weight_kg", "source", "checked_by"]

DOG = re.compile(r"\b(dogs?|pupp(y|ies)|pups?|canines?)\b", re.I)
CAT = re.compile(r"\b(cats?|kittens?|kitty|kitties|felines?)\b", re.I)
# Questions or answers that only make sense with a picture or the rest of the thread
NEEDS_CONTEXT = re.compile(r"\b(this (photo|picture|pic|image|video)|see (the )?(photo|picture|image)|pictured|attached|"
                           r"other answers?|accepted answer|as (others|someone) (said|mentioned)|edit:|update:|"
                           r"(excellent|great|good) (post|answer)|answer above|post above)|@\w+", re.I)   # \b can't come before @
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


def pick_answers(answers, n=1):
    """Up to n good answers: the accepted one if the community agreed with it, then the highest-voted
    ones with 3+ votes."""
    accepted = [a for a in answers if a.get("selected") and a.get("pm_score", 0) >= 1]
    voted = sorted((a for a in answers if a.get("pm_score", 0) >= 3 and a not in accepted), key=lambda a: -a.get("pm_score", 0))
    return (accepted + voted)[:n]


def answer_parents(answer_ids):
    """{answer id: question id} from the Stack Exchange API (100 per request), cached in PARENTS."""
    known = json.load(open(PARENTS)) if os.path.exists(PARENTS) else {}
    todo = [a for a in map(str, answer_ids) if a not in known]
    if todo:
        print(f"Checking {len(todo)} answers against pets.stackexchange.com ...")
    for i in range(0, len(todo), 100):
        url = "https://api.stackexchange.com/2.3/answers/" + ";".join(todo[i:i + 100]) + "?site=pets&pagesize=100"
        raw = urllib.request.urlopen(url).read()
        data = json.loads(gzip.decompress(raw) if raw[:2] == bytes([0x1F, 0x8B]) else raw)   # the API usually gzips
        for a in todo[i:i + 100]:
            known[a] = None   # deleted from the site unless the API returns it
        for item in data["items"]:
            known[str(item["answer_id"])] = item["question_id"]
        time.sleep(0.5)   # the API allows a few requests per second
    if todo:
        os.makedirs(os.path.dirname(PARENTS), exist_ok=True)
        json.dump(known, open(PARENTS, "w"), indent=0)
    return known


def download(path, url=PARQUET, what="Pets Stack Exchange from Hugging Face"):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"Downloading {what} ...")
    urllib.request.urlretrieve(url, path + ".part")
    os.replace(path + ".part", path)


def read_dump():
    """Every question with its answers from the official data dump, in the same shape as the parquet rows.
    In the dump each answer names its own question (ParentId), so no API check is needed."""
    import py7zr
    import xml.etree.ElementTree as ET
    download(DUMP, DUMP_URL, "the Pets Stack Exchange data dump from archive.org (27 MB)")
    folder = os.path.join(os.path.dirname(DUMP), "pets_dump")
    if not os.path.exists(os.path.join(folder, "Posts.xml")):
        with py7zr.SevenZipFile(DUMP) as z:
            z.extract(folder, targets=["Posts.xml", "Users.xml"])
    names = {u.get("Id"): u.get("DisplayName") for _, u in ET.iterparse(os.path.join(folder, "Users.xml")) if u.tag == "row"}
    questions, answers = {}, {}
    for _, p in ET.iterparse(os.path.join(folder, "Posts.xml")):
        if p.tag != "row":
            continue
        author = names.get(p.get("OwnerUserId")) or p.get("OwnerDisplayName") or "unknown"
        if p.get("PostTypeId") == "1":
            questions[p.get("Id")] = {"qid": int(p.get("Id")), "title": p.get("Title") or "", "body": p.get("Body") or "",
                                      "tags": p.get("Tags") or "", "accepted": p.get("AcceptedAnswerId"), "date": p.get("CreationDate")[:10]}
        elif p.get("PostTypeId") == "2":
            answers.setdefault(p.get("ParentId"), []).append(
                {"answer_id": int(p.get("Id")), "text": p.get("Body") or "", "pm_score": int(p.get("Score") or 0), "author": author,
                 "date": p.get("CreationDate")[:10]})
        p.clear()
    for qid, q in questions.items():
        ans = answers.get(qid, [])
        for a in ans:
            a["selected"] = str(a["answer_id"]) == q["accepted"]
        # Title + body, the way the owner asked it. Tags like "dogs" / "cats" help when the text doesn't say.
        yield {"qid": q["qid"], "question": f"<p>{html.escape(q['title'])}</p>{q['body']}", "tags": q["tags"], "date": q["date"], "answers": ans}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default="data/open/pets_stackexchange.csv")
    p.add_argument("--max-answer-words", type=int, default=260, help="longer answers get cut off: the server stops at about 260 words")
    p.add_argument("--min-answer-words", type=int, default=25)
    p.add_argument("--max-question-words", type=int, default=350)
    p.add_argument("--source", choices=["dump", "hf"], default="dump",
                   help="dump: the official archive.org data dump (all questions to April 2024); hf: Hugging Face's older copy")
    p.add_argument("--answers-per-question", type=int, default=2, help="keep up to this many good answers per question")
    args = p.parse_args()

    if args.source == "dump":
        posts = list(read_dump())
    else:
        import pandas as pd   # installed with the training requirements (datasets)
        download(CACHE)
        posts = [{"qid": r["qid"], "question": r["question"], "tags": "", "date": str(r["date"]),
                  "answers": ast.literal_eval(r["answers"]) if isinstance(r["answers"], str) else list(r["answers"])}
                 for _, r in pd.read_parquet(CACHE).iterrows()]
    why = Counter()
    rows = []
    for r in posts:
        q = to_text(r["question"])
        sp = species(q + " " + r["tags"].replace("<", " ").replace(">", " "))
        if not sp:
            why["not about cats or dogs"] += 1
            continue
        best = pick_answers(r["answers"], args.answers_per_question)
        if not best:
            why["no well-voted answer"] += 1
            continue
        for ans in best:
            a = to_text(ans["text"])
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
            qid, aid = r["qid"], ans.get("answer_id")
            rows.append({"_qid": qid, "_aid": aid, "_sp": sp, "question": q, "answer": a, "category": cat, "set": "train",
                         "source": f"Pets Stack Exchange, https://pets.stackexchange.com/a/{aid} (question "
                                   f"https://pets.stackexchange.com/q/{qid}), answer by {ans.get('author', 'unknown')}, "
                                   f"{license_for(str(ans.get('date') or r['date']))}",
                         "checked_by": ""})

    if args.source == "hf":   # Hugging Face's copy pairs some questions with other questions' answers
        parents = answer_parents(r["_aid"] for r in rows)
        for r in rows:
            if parents.get(str(r["_aid"])) != r["_qid"]:
                why["answer belongs to another question" if parents.get(str(r["_aid"])) else "answer deleted from the site"] += 1
        rows = [r for r in rows if parents.get(str(r["_aid"])) == r["_qid"]]
    kept_species = [r["_sp"] for r in rows]
    for r in rows:
        del r["_qid"], r["_aid"], r["_sp"]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(posts)} questions read. Kept {len(rows)} answers to {len({re.search(r'/q/(\d+)', r['source'])[1] for r in rows})} questions. Left out:")
    for k, n in why.most_common():
        print(f"  {n:>5}  {k}")
    print("\nKept, by category:")
    for k, n in Counter(r["category"] for r in rows).most_common():
        print(f"  {n:>5}  {k}")
    print("  " + ", ".join(f"{k.lower()} {n}" for k, n in Counter(kept_species).most_common()))
    print(f"\nWrote {args.out}. Next: python prepare_data.py")


if __name__ == "__main__":
    main()
