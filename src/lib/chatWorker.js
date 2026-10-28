/* Runs FurFriends' trained chat model (ai-server/, exported by export_onnx.py) on the owner's device,
   off the main thread. It downloads once from Hugging Face (about 430 MB) and is then kept in the
   browser's cache. It runs on the graphics chip with WebGPU, otherwise on the CPU, which is slower.

   Messages in:  { type: "load", model, host?, device, dtype } | { type: "ask", id, messages, maxTokens } | { type: "stop" }
   Messages out: { progress } while downloading, { ready } once loaded,
                 { id, text } as each piece of the answer is written, { id, done, text } at the end, { id?, error } */
import { env, InterruptableStoppingCriteria, pipeline, TextStreamer } from "@huggingface/transformers";

env.allowLocalModels = false;
let generator = null;
const stopping = new InterruptableStoppingCriteria();

async function load({ model, host, device, dtype }) {
  if (host) { env.remoteHost = host; env.remotePathTemplate = "{model}/"; }   // a local copy, for testing
  const files = {};   // a model has several files; show one overall percentage
  generator ??= pipeline("text-generation", model, {
    device, dtype,
    progress_callback: (p) => {
      if (p.status !== "progress" || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      const [done, all] = Object.values(files).reduce(([a, b], [l, t]) => [a + l, b + t], [0, 0]);
      self.postMessage({ progress: Math.round((done / all) * 100) });
    },
  });
  try { await generator; } catch (e) { generator = null; throw e; }
}

self.onmessage = async ({ data }) => {
  if (data.type === "stop") return stopping.interrupt();
  try {
    if (data.type === "load") {
      await load(data);
      return self.postMessage({ ready: true });
    }
    const gen = await generator;
    stopping.reset();
    let text = "";
    const streamer = new TextStreamer(gen.tokenizer, {
      skip_prompt: true, skip_special_tokens: true,
      callback_function: (piece) => { text += piece; self.postMessage({ id: data.id, text }); },
    });
    // Greedy and a light repetition penalty: the same settings as ai-server/answer_rag.py, which the accuracy test uses.
    await gen(data.messages, { max_new_tokens: data.maxTokens || 300, do_sample: false, repetition_penalty: 1.1, streamer, stopping_criteria: stopping });
    self.postMessage({ id: data.id, done: true, text: text.trim() });
  } catch (e) {
    self.postMessage({ id: data.id, error: e?.message || String(e) });
  }
};
