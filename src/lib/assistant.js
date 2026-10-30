import { supabase } from "./supabase";
import { breedFor } from "./breeds";
import { chatReply, decodeIndex, queryText, safetyReply, search, withAppetiteAdvice, withEnglish, withVetAdvice } from "./knowledge";
import { MODEL_HISTORY, chatMessages, conversation, describePet, petContext, sourcesFor } from "./prompt";
import { EVIDENCE, planAnswer, reviewAnswer, withEmergency } from "./evidence";
import PROMPT from "./aiPrompt.json";

/* Client for the FurFriends assistant.

   1. An open-source sentence model on the owner's device (about 30 MB, downloaded once) finds the best-matching
      checked passages in public/knowledge/index.json (see knowledge.js and scripts/build-knowledge.mjs).
   2. FurFriends' own trained model writes the answer from the 2 best passages. It runs in a Vercel function
      next to the app (api/ask.py), so owners download nothing. ai-server/app.py implements the same contract
      for other hosts (a Hugging Face Space: ai-server/deploy_space.py). Contract:
        POST  ASSISTANT_URL
        Authorization: Bearer <Supabase access token>   (only logged-in FurFriends users get answers)
        body  { messages: [{ role, content }], pet: petContext(pet) | null, sources: [{ label, text }], stream: true }
        200 → the answer as plain text, streamed as it's written; header X-Model: the model version
   3. If the server can't answer (offline, the monthly free allowance used up...), the closest checked
      answer shows instead.

   VITE_ASSISTANT_URL replaces the server (empty: no server). VITE_CHAT_MODEL can instead run a model on the
   device (ai-server/export_onnx.py): the owner is asked before its ~430 MB download.

   This is a thesis pilot: answers are only as accurate as the model's training data, and the UI says so. */

export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL ?? "/api/ask";
const SLEEPS = /\.hf\.space\//.test(ASSISTANT_URL);   // a free Hugging Face Space sleeps when unused

// The prompt (conversation, pet details, checked passages) is built in prompt.js.
export { conversation, petContext } from "./prompt";

/* The chat lives in sessionStorage (see pages/Assistant.jsx); this wipes it, e.g. on log in, log out or a demo reset. */
export function clearChats() {
  try { Object.keys(sessionStorage).filter((k) => k.startsWith("ff-ai-chat:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

// The emergency check (urgentGuides) lives in emergency.js, so ai-server/answer_rag.py can run the same one.
export { urgentGuides } from "./emergency";

/* ------------------------------------------------------------------ asking
   Resolves to { reply, model, match?, related? }. match is the checked answer used (with its source). */
export async function askAssistant({ messages, pet, signal, onStatus, onText }) {
  return askKnowledge({ messages, pet, signal, onStatus, onText });
}

/* A Hugging Face Space sleeps after 2 days without questions. Opening the assistant wakes it, so it's ready
   by the time the owner has typed a question. */
export function wakeServer() {
  if (SLEEPS) fetch(ASSISTANT_URL.replace(/\/ask$/, "/health")).catch(() => { /* asleep or offline */ });
}

/* The server writes the answer from the passages; it arrives piece by piece. A Space that is waking up
   answers 502/503 (or not at all), so for a Space this keeps trying for a while and says so
   (onStatus("waking")). Anywhere else, or offline, a failure shows the checked answer straight away. */
async function askServer(messages, pet, used, { signal, onStatus, onText }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("signed out");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, SERVER_TIMEOUT);
  const body = JSON.stringify({ messages: conversation(messages, MODEL_HISTORY), pet: petContext(pet), sources: sourcesFor(used), stream: true });
  try {
    for (;;) {
      const res = await fetch(ASSISTANT_URL, {
        method: "POST", signal: ctrl.signal, body,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).catch((e) => { if (ctrl.signal.aborted || !SLEEPS) throw e; return null; });   // no reply: still waking up
      if (SLEEPS && (!res || res.status === 502 || res.status === 503)) {
        onStatus?.("waking");
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`server ${res.status}`);
      onStatus?.(null);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += value;
        onText?.(text);
      }
      if (!text.trim()) throw new Error("empty answer");
      return { reply: text.trim(), model: res.headers.get("X-Model") || "server" };
    }
  } catch (e) {
    if (signal?.aborted) throw new Error("Cancelled");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}
const SERVER_TIMEOUT = 300000;   // Vercel's limit; a sleeping Space can also take a minute or two to wake

/* ------------------------------------------------------------------ on-device knowledge search */
let indexPromise = null;
const loadIndex = () => (indexPromise ??= fetch(`${import.meta.env.BASE_URL}knowledge/index.json`)
  .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
  .then(decodeIndex)
  .catch(() => { indexPromise = null; throw new Error("Couldn't load the assistant's answers. Check your connection and try again."); }));

let worker = null, nextId = 0;
const waiting = new Map();   // request id -> { resolve, reject, onStatus }
function embed(text, onStatus) {
  if (!worker) {
    worker = new Worker(new URL("./embedWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if ("progress" in data) return waiting.forEach((w) => w.onStatus?.(data.progress));
      const w = waiting.get(data.id);
      if (!w) return;
      waiting.delete(data.id);
      data.error ? w.reject(new Error("The assistant couldn't get ready. Check your connection and try again.")) : w.resolve(data.vector);
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onStatus });
    worker.postMessage({ id, text });
  });
}

async function askKnowledge({ messages, pet, signal, onStatus, onText }) {
  const q = queryText(messages);
  const ready = loadIndex();
  const last = messages.filter((m) => m.role === "user" && !m.error).at(-1)?.content || "";
  const rule = chatReply(last) || safetyReply(q) || breedReply(withEnglish(last), pet);
  const index = await ready;
  if (rule) return { reply: rule.reply, model: index.version, match: rule.match, related: rule.related };
  const species = (pet?.species || "").toLowerCase();
  const results = search(index, await embed(q, onStatus), q, { species });
  if (signal?.aborted) throw new Error("Cancelled");
  // Only passages that are about the question are evidence (evidence.js). The search-only reply is the fallback.
  const { evidence, fallback } = planAnswer(index, results, q, last);
  // The owner's own words, for what the search text loses ("tatlong araw" is searched as just "days").
  const owner = conversation(messages).filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const checked = { reply: withEmergency(last, withAppetiteAdvice(q, fallback.reply, species, owner)), model: index.version, match: fallback.match, related: fallback.related };
  // Nothing checked is about the question: the model isn't asked, so it can't fill the gap with a guess.
  if (!evidence.length) return checked;
  // FurFriends' trained model writes the answer from the evidence: on the server, or on this device if the
  // owner turned that on.
  const write = ASSISTANT_URL ? () => askServer(messages, pet, evidence, { signal, onStatus, onText })
    : (await chatReady()) ? () => generate(chatMessages(messages, pet, evidence), { signal, onStatus, onText }).then((reply) => ({ reply, model: CHAT_VERSION }))
      : null;
  if (write) {
    try {
      const { reply, model } = await write();
      // The model says so when the passages don't answer the question; the search's own reply is then more useful.
      if (!reply.startsWith(PROMPT.notFound.slice(0, 40))) {
        // The answer must lean on its passages and name no law, organisation or number they don't. Only the
        // passages it actually uses are credited (CC BY-SA asks for credit).
        const context = [describePet(petContext(pet)), ...conversation(messages).filter((m) => m.role === "user").map((m) => m.content)].join("\n");
        const review = reviewAnswer(reply, evidence, { context });
        if (review.ok) {
          const sources = review.used.map(pickSource);
          // The same vet advice as the checked answers get, when the question is about a symptom or something
          // the pet ate and the answer doesn't already say to see a vet soon.
          // Written only from passages that cleared the lower limit: say it's the closest checked information.
          const uncertain = review.used.every((e) => e.kind !== "guide" && e.score < EVIDENCE.strong);
          return { reply: withEmergency(last, withAppetiteAdvice(q, withVetAdvice(q, reply), species, owner)), model, match: sources[0], sources, related: fallback.related, generated: true, uncertain };
        }
        console.warn("FurFriends AI answer isn't backed by its checked sources, showing the checked answer instead:", review.problems);
      }
    } catch (e) {
      if (e.message === "Cancelled") throw e;
      console.warn("FurFriends AI failed, using the checked answer instead:", e);
    }
  }
  return checked;
}

/* ------------------------------------------------------------------ the trained model, on the device
   Optional, instead of the server: set VITE_CHAT_MODEL to the Hugging Face folder made by
   ai-server/export_onnx.py (e.g. "DevShin00/furfriends-rag-v2"). The owner chooses once whether to
   download it (about 430 MB). */
export const CHAT_MODEL = ASSISTANT_URL ? "" : import.meta.env.VITE_CHAT_MODEL || "";
// For trying a model on this computer before it's uploaded: a local server with the export folder,
// e.g. VITE_CHAT_HOST=http://localhost:8090/ (see ai-server/README.md). Unset: Hugging Face.
const CHAT_HOST = import.meta.env.VITE_CHAT_HOST || "";
const CHAT_VERSION = CHAT_MODEL.split("/").pop() || "chat";
const CHOICE = "ff-ai-model";            // "yes" | "no": the owner's choice, on this device

export const chatChoice = () => { try { return localStorage.getItem(CHOICE) || ""; } catch { return ""; } };
export function setChatChoice(v) { try { localStorage.setItem(CHOICE, v); } catch { /* ignore */ } }

/* What this device can run. Every device gets the same 4-bit model with full-precision maths (about 430 MB):
   on the graphics chip with WebGPU, otherwise on the CPU. The half-precision version was tried and dropped:
   on WebGPU its numbers overflow and the answers turn to nonsense. Small phones keep the checked answers. */
let supportPromise = null;
export const chatSupport = () => (supportPromise ??= (async () => {
  if (!CHAT_MODEL || typeof Worker === "undefined") return null;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return null;
  try {
    if (await navigator.gpu?.requestAdapter()) return { device: "webgpu", dtype: "q4" };
  } catch { /* no WebGPU */ }
  return { device: "wasm", dtype: "q4" };
})());
const chatReady = async () => chatChoice() === "yes" && !!(await chatSupport());

export { chatMessages } from "./prompt";
const pickSource = (r) => ({ id: r.of || r.id, q: r.kind === "guide" ? r.q.split(":")[0] : r.q.length > 110 ? r.q.slice(0, 110).replace(/\s+\S*$/, "") + "…" : r.q,
  source: r.src || "", url: r.url || "", kind: r.kind, score: Math.round(r.score * 100) / 100 });

let chatWorker = null, chatLoading = null, chatId = 0;
const chatWaiting = new Map();   // id -> { resolve, reject, onText }
function startChat(onStatus) {
  if (chatLoading) return chatLoading;
  chatWorker = new Worker(new URL("./chatWorker.js", import.meta.url), { type: "module" });
  chatLoading = new Promise((resolve, reject) => {
    chatWorker.onmessage = ({ data }) => {
      if ("progress" in data) return chatStatus?.(data.progress);
      if (data.ready) return resolve();
      const w = chatWaiting.get(data.id);
      if (!w) { if (data.error) reject(new Error(data.error)); return; }
      if (data.error) { chatWaiting.delete(data.id); return w.reject(new Error(data.error)); }
      if (data.done) { chatWaiting.delete(data.id); return w.resolve(data.text); }
      w.onText?.(data.text);
    };
  }).catch((e) => { chatLoading = null; chatWorker?.terminate(); throw e; });
  chatStatus = onStatus;
  chatSupport().then((s) => chatWorker.postMessage({ type: "load", model: CHAT_MODEL, host: CHAT_HOST, ...s }));
  return chatLoading;
}
let chatStatus = null;
async function generate(messages, { signal, onStatus, onText }) {
  chatStatus = onStatus;
  await startChat(onStatus);
  onStatus?.(null);
  if (signal?.aborted) throw new Error("Cancelled");
  const id = ++chatId;
  const stop = () => chatWorker.postMessage({ type: "stop" });
  signal?.addEventListener("abort", stop);
  try {
    const text = await new Promise((resolve, reject) => {
      chatWaiting.set(id, { resolve, reject, onText });
      chatWorker.postMessage({ type: "ask", id, messages, maxTokens: 300 });
    });
    if (signal?.aborted) throw new Error("Cancelled");
    if (!text) throw new Error("empty answer");
    return text;
  } finally { signal?.removeEventListener("abort", stop); }
}

/* Questions about the selected pet's weight or breed health are answered from the breed guide,
   with the pet's own weight, rather than from someone else's pet. */
function breedReply(q, pet) {
  const breed = pet && breedFor(pet);
  if (!breed || !/\b(weight|heavy|fat|thin|skinny|breed|health problems?|watch for|prone)\b/i.test(q)) return null;
  const [lo, hi] = breed.weight, w = Number(pet.weight);
  const verdict = !w ? "" : w < lo ? `, so ${pet.name} (${w} kg) is below the typical range` : w > hi ? `, so ${pet.name} (${w} kg) is above the typical range` : `, and ${pet.name} (${w} kg) is within it`;
  return {
    reply: [
      `Here's what the FurFriends breed guide says about ${breed.name}s like ${pet.name}:`,
      `A typical adult weighs ${lo}–${hi} kg${verdict}. Body shape matters as much as the number: you should be able to feel the ribs easily, with a visible waist.`,
      "Health problems to watch for:\n" + breed.health.map((h) => `- ${h}`).join("\n"),
      "Care tips:\n" + breed.tips.map((h) => `- ${h}`).join("\n"),
      "Your vet can check whether this is right for your pet in particular.",
    ].join("\n\n"),
    sure: true, related: [],
    match: { q: `Breed guide: ${breed.name}`, source: "FurFriends breed guide", url: `#/app/breeds/${breed.slug}`, kind: "breed", score: 1 },
  };
}
