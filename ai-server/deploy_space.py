"""Puts the FurFriends assistant server (app.py) on a free Hugging Face Space, so the app's owners
download nothing: the app sends each question with its checked passages, and the Space writes the answer.

  python ai-server/deploy_space.py                      (from the PET folder, logged in with `hf auth login`)
  python ai-server/deploy_space.py --model DevShin00/furfriends-rag-v3 --version rag-v3   (after a retrain)

It creates the Space if needed (public, Docker, free CPU), sets its settings, and uploads app.py,
prompting.py, the app's src/lib/aiPrompt.json and the files in ai-server/space/. The Supabase URL and
publishable key come from the app's .env.local (they're public: the app itself ships them); the server
uses them to check that the person asking is logged in to FurFriends.
The Space builds in about 5-10 minutes; then https://<account>-<name>.hf.space/health says "ok": true.
"""
import argparse
import os
import shutil
import tempfile

from huggingface_hub import HfApi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def env_local():
    """The app's VITE_ settings from .env.local."""
    out = {}
    with open(os.path.join(ROOT, ".env.local"), encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                out[k] = v.strip().strip('"')
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--space", default="DevShin00/furfriends-ai")
    p.add_argument("--model", default="DevShin00/furfriends-rag-v2", help="the exported model (export_onnx.py) on Hugging Face")
    p.add_argument("--version", default="rag-v2", help="saved with each rating in the app, to compare versions")
    p.add_argument("--origins", default="https://furfriends-black.vercel.app,http://localhost:5173,http://localhost:5174")
    args = p.parse_args()

    env = env_local()
    settings = {
        "MODEL_ONNX": args.model, "MODEL_VERSION": args.version, "ALLOWED_ORIGINS": args.origins,
        "SUPABASE_URL": env["VITE_SUPABASE_URL"], "SUPABASE_PUBLISHABLE_KEY": env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    }
    api = HfApi()
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    for k, v in settings.items():
        api.add_space_variable(args.space, k, v)

    with tempfile.TemporaryDirectory() as tmp:
        for f in ("app.py", "prompting.py"):
            shutil.copy(os.path.join(HERE, f), tmp)
        shutil.copy(os.path.join(ROOT, "src", "lib", "aiPrompt.json"), tmp)
        for f in os.listdir(os.path.join(HERE, "space")):
            shutil.copy(os.path.join(HERE, "space", f), tmp)
        api.upload_folder(repo_id=args.space, repo_type="space", folder_path=tmp,
                          commit_message=f"FurFriends AI server with {args.model}")

    host = args.space.replace("/", "-").lower()
    print(f"Uploaded. The Space is building (5-10 minutes): https://huggingface.co/spaces/{args.space}")
    print(f"When https://{host}.hf.space/health shows \"ok\": true, the app's assistant uses it.")


if __name__ == "__main__":
    main()
