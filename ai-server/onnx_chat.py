"""The trained model (export_onnx.py's onnx/model_q4.onnx) with nothing but onnxruntime, numpy and tokenizers,
small enough for a Vercel function (api/ask.py). It does what transformers' generate() does for this model:
Qwen's chat format, greedy decoding with a repetition penalty of 1.1 (as in answer_rag.py and the app), and the
key/value cache, so each new word only costs one step.

  chat = OnnxChat("exports/furfriends-rag-v2")                         # a folder, or
  chat = OnnxChat.from_hub("DevShin00/furfriends-rag-v2")              # downloaded into memory, no disk needed
  for text in chat.stream(messages): ...                                # the answer so far, as it's written
"""
import json
import os
import urllib.request

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

STOP = {151643, 151645}   # <|endoftext|>, <|im_end|>
FILES = ("config.json", "tokenizer.json", "onnx/model_q4.onnx")


def chat_text(messages):
    """Qwen2.5's chat format (its chat_template), ending where the assistant's answer starts."""
    return "".join(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in messages) + "<|im_start|>assistant\n"


class OnnxChat:
    def __init__(self, config, tokenizer, model, threads=0):
        self.layers, self.heads = config["num_hidden_layers"], config["num_key_value_heads"]
        self.dim = config["hidden_size"] // config["num_attention_heads"]
        self.tok = tokenizer
        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(model, opts, providers=["CPUExecutionProvider"])
        self.outputs = [o.name for o in self.sess.get_outputs()]

    @classmethod
    def from_folder(cls, folder, threads=0):
        config = json.load(open(os.path.join(folder, "config.json"), encoding="utf-8"))
        return cls(config, Tokenizer.from_file(os.path.join(folder, "tokenizer.json")), os.path.join(folder, FILES[2]), threads)

    @classmethod
    def from_hub(cls, repo, threads=0):
        """Reads the files straight into memory (a Vercel function's disk is small)."""
        get = lambda f: urllib.request.urlopen(f"https://huggingface.co/{repo}/resolve/main/{f}", timeout=120).read()
        config, tokenizer, model = (get(f) for f in FILES)
        return cls(json.loads(config), Tokenizer.from_str(tokenizer.decode("utf-8")), model, threads)

    def stream(self, messages, max_new_tokens=300, penalty=1.1):
        ids = self.tok.encode(chat_text(messages), add_special_tokens=False).ids
        seen = np.zeros(self.tok.get_vocab_size(with_added_tokens=True) + 512, dtype=bool)
        seen[ids] = True
        empty = np.zeros((1, self.heads, 0, self.dim), dtype=np.float32)
        past = {f"past_key_values.{i}.{kv}": empty for i in range(self.layers) for kv in ("key", "value")}
        step, total, out = np.array([ids], dtype=np.int64), len(ids), []
        for _ in range(max_new_tokens):
            feed = {"input_ids": step, "attention_mask": np.ones((1, total), dtype=np.int64),
                    "position_ids": np.arange(total - step.shape[1], total, dtype=np.int64)[None], **past}
            res = self.sess.run(self.outputs, feed)
            logits = res[0][0, -1].astype(np.float32)
            # Repetition penalty as in transformers: every token already in the prompt or the answer is made less likely.
            hit = seen[: logits.shape[0]]
            logits[hit] = np.where(logits[hit] > 0, logits[hit] / penalty, logits[hit] * penalty)
            nxt = int(logits.argmax())
            if nxt in STOP:
                break
            out.append(nxt)
            seen[nxt] = True
            past = {name.replace("present", "past_key_values"): v for name, v in zip(self.outputs[1:], res[1:])}
            step, total = np.array([[nxt]], dtype=np.int64), total + 1
            yield self.tok.decode(out)

    def answer(self, messages, **kw):
        text = ""
        for text in self.stream(messages, **kw):
            pass
        return text.strip()
