"""Turns the trained model into the files the app runs in the browser (Transformers.js).

  python export_onnx.py --adapter adapters/rag-v1 --out exports/furfriends-rag-v1

1. Merges the LoRA adapter into Qwen2.5-0.5B-Instruct.
2. Exports it to ONNX with optimum (text generation, with the cache that makes answers fast).
3. Makes the two small versions the app picks from:
     onnx/model_q4f16.onnx  4-bit weights, half-precision maths: for phones and computers with WebGPU (~450 MB)
     onnx/model_q4.onnx     4-bit weights, full-precision maths: works on any device's CPU (~330 MB)
   Both use 4-bit blocks of 32 weights. 8-bit (onnxruntime's quantize_dynamic) was tried and dropped: it
   made this small model repeat itself or write nonsense, while the 4-bit blocks answer like the original.
The folder then holds everything to upload to Hugging Face (config, tokenizer, onnx/). The full-size
ONNX file is deleted at the end to save space (--keep-full keeps it).
"""
import argparse
import glob
import json
import os
import shutil

import onnx
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


def merge(base, adapter, out):
    from peft import PeftModel
    model = AutoModelForCausalLM.from_pretrained(base, dtype=torch.float32)
    model = PeftModel.from_pretrained(model, adapter).merge_and_unload()
    model.save_pretrained(out)
    AutoTokenizer.from_pretrained(adapter if os.path.exists(os.path.join(adapter, "tokenizer_config.json")) else base).save_pretrained(out)


def export(merged, out):
    from optimum.exporters.onnx import main_export
    main_export(merged, output=out, task="text-generation-with-past", device="cpu")


def fold_transposes(model):
    """The output layer reuses the word table through a Transpose node, which the quantizer can't shrink.
    Store the transposed table instead, so it becomes 4-bit too, and drop the full-size original."""
    from onnx import numpy_helper
    inits = {i.name: i for i in model.graph.initializer}
    for n in [n for n in model.graph.node if n.op_type == "Transpose" and n.input[0] in inits]:
        perm = next((list(a.ints) for a in n.attribute if a.name == "perm"), None)
        w = numpy_helper.to_array(inits[n.input[0]])
        model.graph.initializer.append(numpy_helper.from_array(w.transpose(perm) if perm else w.T, n.output[0]))
        model.graph.node.remove(n)
    used = {i for n in model.graph.node for i in n.input}
    for i in [i for i in model.graph.initializer if i.name not in used]:
        model.graph.initializer.remove(i)
    return model


def int8_word_table(model):
    """The word table (a quarter of the model) as 8-bit numbers with one scale per word, read back with
    Gather, Cast and Mul. The browser's CPU engine has no 4-bit Gather (GatherBlockQuantized), but every
    engine has these."""
    import numpy as np
    from onnx import helper, numpy_helper
    inits = {i.name: i for i in model.graph.initializer}
    for n in [n for n in model.graph.node if n.op_type == "Gather" and n.input[0] in inits]:
        w = numpy_helper.to_array(inits[n.input[0]])
        if w.ndim != 2 or w.shape[0] < 10000:
            continue   # only the word table
        scale = np.maximum(np.abs(w).max(axis=1), 1e-8).astype(np.float32) / 127
        q = np.round(w / scale[:, None]).clip(-127, 127).astype(np.int8)
        name, out = n.input[0], n.output[0]
        model.graph.initializer.extend([numpy_helper.from_array(q, name + "_int8"), numpy_helper.from_array(scale, name + "_scale"),
                                        numpy_helper.from_array(np.array([-1], dtype=np.int64), name + "_last")])
        i = list(model.graph.node).index(n)
        model.graph.node.remove(n)
        for k, node in enumerate([
            helper.make_node("Gather", [name + "_int8", n.input[1]], [out + "_q"], name=n.name + "_q"),
            helper.make_node("Cast", [out + "_q"], [out + "_f"], to=onnx.TensorProto.FLOAT, name=n.name + "_cast"),
            helper.make_node("Gather", [name + "_scale", n.input[1]], [out + "_s"], name=n.name + "_s"),
            helper.make_node("Unsqueeze", [out + "_s", name + "_last"], [out + "_s1"], name=n.name + "_s1"),
            helper.make_node("Mul", [out + "_f", out + "_s1"], [out], name=n.name + "_mul")]):
            model.graph.node.insert(i + k, node)
    used = {i for n in model.graph.node for i in n.input}
    for i in [i for i in model.graph.initializer if i.name not in used]:
        model.graph.initializer.remove(i)
    return model


def q4(src, dst, block=32):
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    model = fold_transposes(onnx.load(src))
    q = MatMulNBitsQuantizer(model, block_size=block, is_symmetric=True, bits=4)
    q.process()
    onnx.save_model(int8_word_table(q.model.model), dst, save_as_external_data=False)


def q4f16(src, dst, block=32):
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    from onnxruntime.transformers.float16 import convert_float_to_float16
    model = onnx.load(src)
    # Keep inputs/outputs float32 where Transformers.js expects them, and the ops that misbehave in fp16.
    model = convert_float_to_float16(model, keep_io_types=False, disable_shape_infer=True, op_block_list=["RandomNormalLike"])
    q = MatMulNBitsQuantizer(model, block_size=block, is_symmetric=True, bits=4)
    q.process()
    onnx.save_model(q.model.model, dst, save_as_external_data=False)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default="Qwen/Qwen2.5-0.5B-Instruct")
    p.add_argument("--adapter", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--only", choices=["q4f16", "q4"], default=None, help="make just one of the two versions")
    p.add_argument("--keep-full", action="store_true")
    args = p.parse_args()

    merged = os.path.join(args.out, "_merged")
    full = os.path.join(args.out, "_onnx_full")
    if not os.path.exists(os.path.join(merged, "config.json")):
        print("1/3 Merging the adapter ...")
        merge(args.base, args.adapter, merged)
    if not os.path.exists(os.path.join(full, "model.onnx")):
        print("2/3 Exporting to ONNX ...")
        export(merged, full)
    os.makedirs(os.path.join(args.out, "onnx"), exist_ok=True)
    src = os.path.join(full, "model.onnx")
    if args.only in (None, "q4"):
        print("3/3 Making the 4-bit CPU version ...")
        q4(src, os.path.join(args.out, "onnx", "model_q4.onnx"))
    if args.only in (None, "q4f16"):
        print("3/3 Making the 4-bit WebGPU version ...")
        q4f16(src, os.path.join(args.out, "onnx", "model_q4f16.onnx"))
    # Config, generation settings and tokenizer go next to onnx/, as Transformers.js expects.
    for f in glob.glob(os.path.join(full, "*.json")) + glob.glob(os.path.join(full, "*.txt")):
        shutil.copy(f, args.out)
    # Newer transformers saves the chat format as chat_template.jinja; Transformers.js reads it from
    # tokenizer_config.json, so put it there (without it the app can't build the prompt).
    jinja = os.path.join(full, "chat_template.jinja")
    if os.path.exists(jinja):
        cfg_path = os.path.join(args.out, "tokenizer_config.json")
        cfg = json.load(open(cfg_path, encoding="utf-8"))
        cfg["chat_template"] = open(jinja, encoding="utf-8").read()
        json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if not args.keep_full:
        shutil.rmtree(full)
        shutil.rmtree(merged)
    for f in sorted(glob.glob(os.path.join(args.out, "onnx", "*.onnx"))):
        print(f"  {os.path.getsize(f) / 2**20:6.0f} MB  {f}")
    print(f"Done: {args.out}. Upload this folder to Hugging Face (see ai-server/README.md).")


if __name__ == "__main__":
    main()
