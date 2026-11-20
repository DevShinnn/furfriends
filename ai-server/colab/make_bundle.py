"""Packs what Google Colab needs to train a model into one zip, to upload in colab/train_v7.ipynb.

  python colab/make_bundle.py                                  -> colab/furfriends-train-v7.zip (data/rag_train_v7.jsonl)
  python colab/make_bundle.py --data data/rag_train_v8.jsonl --out colab/furfriends-train-v8.zip

The zip holds train_lora.py, prompting.py, the app's prompt (src/lib/aiPrompt.json, which prompting.py reads from
next to itself) and the training set, so Colab trains on exactly the prompt the app sends.
"""
import argparse
import os
import zipfile

AI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", default="data/rag_train_v7.jsonl")
    p.add_argument("--out", default="colab/furfriends-train-v7.zip")
    args = p.parse_args()
    files = {"train_lora.py": "train_lora.py", "prompting.py": "prompting.py",
             "aiPrompt.json": os.path.join("..", "src", "lib", "aiPrompt.json"), args.data.replace("\\", "/"): args.data}
    out = os.path.join(AI, args.out)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, src in files.items():
            z.write(os.path.join(AI, src), name)
    print(f"Wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB): " + ", ".join(files))


if __name__ == "__main__":
    main()
