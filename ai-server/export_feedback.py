"""Turn ratings from the app into training data for the next model version.

    python export_feedback.py                 # all ratings
    python export_feedback.py --model v1      # only answers from one model version

Writes two files for the team to REVIEW before training:
  data/feedback_good.jsonl     answers people marked helpful (👍), ready to reuse as examples
  data/feedback_fix.jsonl      answers marked not helpful (👎) with the owner's correction.
                               Owners aren't vets: rewrite each "assistant" answer into a correct
                               one (check it against your sources), then delete "_review".
Also prints the helpful rate per model version, for the thesis.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API keys →
secret key). That key can read everyone's data: keep it on this computer, never in the app.
"""
import argparse
import json
import os
from collections import defaultdict

import httpx


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="", help="only this model version")
    p.add_argument("--out", default="data")
    args = p.parse_args()

    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    q = "select=question,answer,conversation,pet_context,model,rating,reason,comment,created_at&order=created_at"
    if args.model:
        q += f"&model=eq.{args.model}"
    r = httpx.get(f"{url}/rest/v1/assistant_feedback?{q}", headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30)
    r.raise_for_status()
    rows = r.json()

    stats = defaultdict(lambda: [0, 0])
    os.makedirs(args.out, exist_ok=True)
    good_path, fix_path = os.path.join(args.out, "feedback_good.jsonl"), os.path.join(args.out, "feedback_fix.jsonl")
    with open(good_path, "w", encoding="utf-8") as good, open(fix_path, "w", encoding="utf-8") as fix:
        for row in rows:
            stats[row["model"] or "unknown"][0 if row["rating"] == 1 else 1] += 1
            msgs = list(row["conversation"] or []) + [{"role": "user", "content": row["question"]}]
            if row["rating"] == 1:
                good.write(json.dumps({"messages": msgs + [{"role": "assistant", "content": row["answer"]}], "pet": row["pet_context"]}, ensure_ascii=False) + "\n")
            else:
                fix.write(json.dumps({
                    "messages": msgs + [{"role": "assistant", "content": row["comment"] or "TODO: write the correct answer"}],
                    "pet": row["pet_context"],
                    "_review": {"model_answer": row["answer"], "reason": row["reason"], "owner_note": row["comment"]},
                }, ensure_ascii=False) + "\n")

    print(f"{len(rows)} ratings -> {good_path}, {fix_path}")
    print("model      rated  helpful")
    for model, (up, down) in sorted(stats.items()):
        print(f"{model:<10} {up + down:>5}  {100 * up / (up + down):5.1f}%")


if __name__ == "__main__":
    main()
