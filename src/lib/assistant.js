import { supabase } from "./supabase";
import { GUIDES, urgentGuides } from "./emergency";
import { breedFor } from "./breeds";
import { ageText, byDateDesc, vaxStatus } from "./utils";
import { chatReply, compose, decodeIndex, queryText, safetyReply, search, withEnglish } from "./knowledge";
import PROMPT from "./aiPrompt.json";

/* Client for the FurFriends assistant.

   1. An open-source sentence model on the owner's device (about 30 MB, downloaded once) finds the best-matching
      checked passages in public/knowledge/index.json (see knowledge.js and scripts/build-knowledge.mjs).
   2. FurFriends' own trained model writes the answer from the 2 best passages. It runs on the team's free
      Hugging Face Space (ai-server/app.py, deployed by ai-server/deploy_space.py), so owners download nothing.
      Contract:
        POST  ASSISTANT_URL
        Authorization: Bearer <Supabase access token>   (only logged-in FurFriends users get answers)
        body  { messages: [{ role, content }], pet: petContext(pet) | null, sources: [{ label, text }], stream: true }
        200 → the answer as plain text, streamed as it's written; header X-Model: the model version
   3. If the server can't answer (asleep too long, offline...), the closest checked answer shows instead.

   VITE_ASSISTANT_URL replaces the server (empty: no server). VITE_CHAT_MODEL can instead run a model on the
   device (ai-server/export_onnx.py): the owner is asked before its ~430 MB download.

   This is a thesis pilot: answers are only as accurate as the model's training data, and the UI says so. */

export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL ?? "https://devshin00-furfriends-ai.hf.space/ask";
const HISTORY = 10;   // earlier messages sent along as context

/* The messages actually sent to the model: no error notes, only the last few, only role and text. */
export const conversation = (messages) =>
  messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));

/* The chat lives in sessionStorage (see pages/Assistant.jsx); this wipes it, e.g. on log in, log out or a demo reset. */
export function clearChats() {
  try { Object.keys(sessionStorage).filter((k) => k.startsWith("ff-ai-chat:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ pet context
   A short summary of the pet's records, so answers can be about this pet. */
export function petContext(pet) {
  if (!pet) return null;
  const med = [...pet.medical].sort(byDateDesc);
  const titles = (types, n = 6) => med.filter((m) => types.includes(m.type)).slice(0, n).map((m) => m.title);
  return {
    name: pet.name, species: pet.species, breed: pet.breed || null, gender: pet.gender || null,
    age: ageText(pet) === "—" ? null : ageText(pet), weightKg: pet.weight ? Number(pet.weight) : null,
    allergies: titles(["Allergy"]), medications: titles(["Medication"]),
    recentConditions: titles(["Illness", "Injury", "Surgery"], 4),
    vaccines: pet.vaccinations.map((v) => ({ name: v.name, status: vaxStatus(v).label })),
  };
}

// The emergency check (urgentGuides) lives in emergency.js, so ai-server/answer_rag.py can run the same one.
export { urgentGuides } from "./emergency";

/* ------------------------------------------------------------------ asking
   Resolves to { reply, model, match?, related? }. match is the checked answer used (with its source). */
export async function askAssistant({ messages, pet, signal, onStatus, onText }) {
  return askKnowledge({ messages, pet, signal, onStatus, onText });
}

/* A free Space sleeps after 2 days without questions. Opening the assistant wakes it, so it's ready by the
   time the owner has typed a question. */
export function wakeServer() {
  if (ASSISTANT_URL) fetch(ASSISTANT_URL.replace(/\/ask$/, "/health")).catch(() => { /* asleep or offline */ });
}

/* The server writes the answer from the passages; it arrives piece by piece. While the Space wakes up it
   answers 502/503 (or not at all), so this keeps trying for a while and says so (onStatus("waking")). */
async function askServer(messages, pet, used, { signal, onStatus, onText }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("signed out");
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, SERVER_TIMEOUT);
  const body = JSON.stringify({ messages: conversation(messages), pet: petContext(pet), sources: sourcesFor(used), stream: true });
  try {
    for (;;) {
      const res = await fetch(ASSISTANT_URL, {
        method: "POST", signal: ctrl.signal, body,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      }).catch((e) => { if (ctrl.signal.aborted) throw e; return null; });   // no reply: still waking up
      if (!res || res.status === 502 || res.status === 503) {
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
const SERVER_TIMEOUT = 180000;   // waking a sleeping Space can take a minute or two, then the answer

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
  const results = search(index, await embed(q, onStatus), q, { species: (pet?.species || "").toLowerCase() });
  const answer = compose(results, q);
  if (signal?.aborted) throw new Error("Cancelled");
  // FurFriends' trained model writes the answer from the 2 best checked passages: on the server, or on this
  // device if the owner turned that on. If it fails, the closest checked answer is shown as before.
  const used = withUrgent(index, last, results).slice(0, SOURCES);
  const write = ASSISTANT_URL ? () => askServer(messages, pet, used, { signal, onStatus, onText })
    : (await chatReady()) ? () => generate(chatMessages(messages, pet, used), { signal, onStatus, onText }).then((reply) => ({ reply, model: CHAT_VERSION }))
      : null;
  if (write) {
    try {
      const { reply, model } = await write();
      // Both passages are credited: the model may have used either (CC BY-SA asks for credit).
      return { reply, model, match: used[0] ? pickSource(used[0]) : null, sources: used.map(pickSource), related: answer.related, generated: true };
    } catch (e) {
      if (e.message === "Cancelled") throw e;
      console.warn("FurFriends AI failed, using the checked answer instead:", e);
    }
  }
  return { reply: answer.reply, model: index.version, match: answer.match, related: answer.related };
}

/* An emergency the app recognises (the red box) puts its first-aid guide first, ahead of the search,
   so the model always has the right guide to answer from. ai-server/answer_rag.py does the same. */
function withUrgent(index, question, results) {
  const urgent = urgentGuides(question).map((g) => index.entries.find((e) => e.id === `guide-${g.slug}`)).filter(Boolean);
  const ids = new Set(urgent.map((e) => e.id));
  return [...urgent, ...results.filter((e) => !ids.has(e.of || e.id))];
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
const SOURCES = 2, SOURCE_WORDS = 160;   // the same as ai-server/answer_rag.py
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

/* The prompt, built exactly like ai-server/prompting.py builds it in training. */
const clipWords = (text, n) => { const w = text.split(/\s+/).filter(Boolean); return w.length <= n ? text : w.slice(0, n).join(" ") + " …"; };
function sourceOf(e) {
  if (e.kind === "guide") {
    const g = GUIDES.find((x) => `guide-${x.slug}` === (e.of || e.id));
    // The same as guide_text() in ai-server/build_rag_data.py: the signs let the model tell which guide fits.
    const text = `${g.title}. ${g.summary}\nSigns: ${g.signs.join("; ")}${(g.lists || []).map((l) => `\n${l.title}: ${l.items.join("; ")}`).join("")}\nWhat to do now:\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      + (g.avoid?.length ? `\nDon't: ${g.avoid.join(" ")}` : "")
      + `\n${g.urgency === "now" ? "Go to a vet now." : "Call your vet for advice."}`;
    return { label: `FurFriends first-aid guide: ${g.title}`, text };
  }
  if (e.kind === "gov") return { label: e.src, text: `${e.q}\n${e.a}` };
  return { label: /^Pets Stack Exchange/.test(e.src || "") ? "Pets Stack Exchange answer" : "FurFriends checked answer", text: `Q: ${clipWords(e.q, 40)}\nA: ${e.a}` };
}
function describePet(c) {
  if (!c) return null;
  const facts = [c.species, c.breed, c.gender, c.age, c.weightKg ? `${c.weightKg} kg` : null].filter(Boolean);
  const lines = [`The owner is asking about ${c.name || "their pet"}: ${facts.join(", ")}.`];
  for (const [k, label] of [["allergies", "Allergies"], ["medications", "Medications"], ["recentConditions", "Recent illnesses or surgery"]]) {
    if (c[k]?.length) lines.push(`${label}: ${c[k].join(", ")}.`);
  }
  if (c.vaccines?.length) lines.push(`Vaccines: ${c.vaccines.map((v) => `${v.name} (${v.status})`).join(", ")}.`);
  return lines.join(" ");
}
// First-aid guides are short and checked: never cut, so all the steps are always there.
const sourcesFor = (results) => results.map((e) => { const s = sourceOf(e); return e.kind === "guide" ? s : { ...s, text: clipWords(s.text, SOURCE_WORDS) }; });
export function chatMessages(messages, pet, results) {
  let system = PROMPT.system;
  const about = describePet(petContext(pet));
  if (about) system += `\n\n${about}`;
  if (results.length) {
    const sources = sourcesFor(results);
    system += `\n\n${PROMPT.sourcesIntro}\n${sources.map((s, i) => `[${i + 1}] ${s.label}\n${s.text}`).join("\n\n")}`;
  }
  return [{ role: "system", content: system }, ...conversation(messages)];
}
const pickSource = (r) => ({ q: r.kind === "guide" ? r.q.split(":")[0] : r.q.length > 110 ? r.q.slice(0, 110).replace(/\s+\S*$/, "") + "…" : r.q,
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
