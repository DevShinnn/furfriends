"""Fine-tune a Hugging Face chat model on FurFriends Q&A with LoRA.

Runs on a free Google Colab T4 GPU for models up to ~3B parameters. On Colab:
    !pip install -q -r requirements-train.txt
    !python train_lora.py --data data/train.jsonl --out adapters/v1

Data: one JSON object per line, {"messages": [{"role": "user", ...}, {"role": "assistant", ...}], "pet": {...}?}
The FurFriends system prompt (prompting.py) is added to every example, so training matches
what the server sends. Output: a small LoRA adapter folder. Serve it with
ADAPTER_PATH=adapters/v1 MODEL_VERSION=v1 (same MODEL_ID as --base).
"""
import argparse
import glob
import json
import os
import sys

import torch
from datasets import Dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

from prompting import build_messages


def load_examples(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            if "_review" in ex:
                raise ValueError(f"{path}:{n}: not reviewed yet. Check the answer against your sources, then delete \"_review\".")
            msgs = ex["messages"]
            if not msgs or msgs[-1]["role"] != "assistant":
                raise ValueError(f"{path}:{n}: the last message must be the assistant's answer")
            # Prompt (system + pet + checked sources + question) and completion (the answer), so the loss is
            # only on the answer: the model learns to answer, not to repeat the sources.
            full = build_messages(msgs, ex.get("pet"), ex.get("sources"))
            rows.append({"prompt": full[:-1], "completion": full[-1:]})
    return Dataset.from_list(rows)


def keep_awake():
    """Stops Windows from sleeping while this process runs, so a long CPU run isn't paused."""
    if sys.platform == "win32":
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/train.jsonl")
    p.add_argument("--eval", default="", help="optional held-out JSONL to report loss on")
    p.add_argument("--base", default="Qwen/Qwen2.5-1.5B-Instruct")
    p.add_argument("--out", default="adapters/v1")
    p.add_argument("--epochs", type=float, default=3)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--max-steps", type=int, default=-1, help="for a quick test run")
    p.add_argument("--save-steps", type=int, default=0,
                   help="save progress every N steps, so a long run (e.g. on a laptop CPU) can resume after a stop")
    p.add_argument("--layers", choices=["all", "attention"], default="all",
                   help="attention: train only the attention layers, about 40%% faster on a CPU")
    p.add_argument("--max-length", type=int, default=1024, help="longer examples are cut; shorter is faster")
    p.add_argument("--no-checkpointing", action="store_true", help="faster, but needs more memory")
    args = p.parse_args()
    keep_awake()

    train = load_examples(args.data)
    evals = load_examples(args.eval) if args.eval else None
    print(f"{len(train)} training examples" + (f", {len(evals)} eval" if evals else ""))

    gpu = torch.cuda.is_available()
    config = SFTConfig(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=4 if gpu else 1,
        gradient_accumulation_steps=4 if gpu else 1,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        logging_steps=10 if gpu else 1,
        save_strategy="steps" if args.save_steps else "no",
        save_steps=args.save_steps or 500,
        save_total_limit=2,
        eval_strategy="epoch" if evals else "no",
        fp16=gpu,
        bf16=False,            # the free Colab T4 GPU has no bf16
        use_cpu=not gpu,
        max_length=args.max_length,
        completion_only_loss=True,
        gradient_checkpointing=not args.no_checkpointing,
        report_to=[],
        model_init_kwargs={"dtype": torch.float16 if gpu else torch.float32},
    )
    targets = ["q_proj", "k_proj", "v_proj", "o_proj"] + (["gate_proj", "up_proj", "down_proj"] if args.layers == "all" else [])
    lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM", target_modules=targets)
    trainer = SFTTrainer(model=args.base, args=config, train_dataset=train, eval_dataset=evals, peft_config=lora)
    resume = bool(args.save_steps and glob.glob(os.path.join(args.out, "checkpoint-*")))
    if resume:
        print("Resuming from the last saved checkpoint in", args.out)
    trainer.train(resume_from_checkpoint=resume or None)
    trainer.save_model(args.out)              # the LoRA adapter
    trainer.processing_class.save_pretrained(args.out)
    print(f"Saved adapter to {args.out}. Serve it with ADAPTER_PATH={args.out} MODEL_ID={args.base}")


if __name__ == "__main__":
    main()
