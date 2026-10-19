/* Runs the open-source sentence model off the main thread, so typing and scrolling stay smooth.
   The model (about 23 MB) downloads from Hugging Face the first time and is then kept in the
   browser's cache, so later questions work instantly and offline. */
import { env, pipeline } from "@huggingface/transformers";
import { EMBED_MODEL, EMBED_OPTIONS } from "./knowledge";

env.allowLocalModels = false;
let extractor = null;

self.onmessage = async ({ data: { id, text } }) => {
  try {
    extractor ??= pipeline("feature-extraction", EMBED_MODEL, {
      dtype: "q8",
      progress_callback: (p) => { if (p.status === "progress") self.postMessage({ progress: Math.round(p.progress || 0) }); },
    });
    const out = await (await extractor)(text, EMBED_OPTIONS);
    self.postMessage({ id, vector: Array.from(out.data) });
  } catch (e) {
    extractor = null;   // let the next question try again (e.g. after a dropped connection)
    self.postMessage({ id, error: e?.message || String(e) });
  }
};
