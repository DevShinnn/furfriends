import { supabase } from "./supabase";
import { GUIDES } from "./emergency";
import { breedFor } from "./breeds";
import { ageText, byDateDesc, vaxStatus } from "./utils";
import { chatReply, compose, decodeIndex, queryText, safetyReply, search, withEnglish } from "./knowledge";

/* Client for the FurFriends assistant.

   By default it runs entirely on the owner's device, with nothing to host: an open-source sentence
   model finds the closest checked answer in public/knowledge/index.json (see knowledge.js and
   scripts/build-knowledge.mjs). Answers come only from checked text, never generated.

   Optionally, a team-trained model can answer instead (ai-server/). Set VITE_ASSISTANT_URL to use it.
   Contract the team's server implements:
     POST  VITE_ASSISTANT_URL
     Authorization: Bearer <Supabase access token>   (so the server knows who is asking)
     body  { messages: [{ role: "user" | "assistant", content }], pet: petContext(pet) | null }
     200 → { reply: "…", model?: "v1" }   (model: a version label, saved with ratings so retrains can be compared)
     any other status → an error, optionally { message } or { detail } (FastAPI) to show the user

   This is a thesis pilot: answers are only as accurate as the model's training data, and the UI says so. */

export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL || "";
const HISTORY = 10;   // earlier messages sent along as context

/* The messages actually sent to the model: no error notes, only the last few, only role and text. */
export const conversation = (messages) =>
  messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));
const TIMEOUT = 60000;  // small models on a CPU can take a while

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

/* ------------------------------------------------------------------ emergencies
   Checked on the device before anything is sent, so the first-aid guide shows even offline. */
const URGENT = [
  ["cpr", /not breathing|no heartbeat|unconscious|won'?t wake|unresponsive/],
  ["breathing", /can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|gasping|blue gums|grey gums|gray gums/],
  ["heatstroke", /heat ?stroke|overheat|too hot/],
  ["poisoning", /poison|chocolate|grape|raisin|xylitol|onion|garlic|rat bait|rodenticide|antifreeze|coolant|radiator|bleach|paracetamol|ibuprofen|insecticide/],
  ["toad", /\btoads?\b|palaka/],
  ["choking", /chok/],
  ["bleeding", /bleeding|won'?t stop bleed/],
  ["accident", /hit by|run over|fell (from|off)|fall from/],
  ["seizure", /seiz|convuls|fitting/],
  ["bloat", /bloat|swollen (belly|stomach)|distended/],
  ["urinary", /can'?t pee|cannot pee|can'?t urinate|straining to (pee|urinate)|no urine|not peeing/],
  ["snake", /snake/],
  ["burns", /\bburn|electric shock|electrocut/],
  ["eye", /eye (injur|bulg|popped|out)/],
  ["stings", /\bstung\b|\bsting|\bbee\b|wasp|face (is )?swollen|swollen face|hives/],
  ["vomiting", /vomit|throwing up|diarrh|blood in (the )?(stool|poop)/],
];

export function urgentGuides(text) {
  const t = text.toLowerCase();
  const slugs = URGENT.filter(([, re]) => re.test(t)).map(([s]) => s);
  return GUIDES.filter((g) => slugs.includes(g.slug)).slice(0, 3);
}

/* ------------------------------------------------------------------ asking
   Resolves to { reply, model, match?, related? }. match is the checked answer used (with its source). */
export async function askAssistant({ user, messages, pet, signal, onStatus }) {
  if (!ASSISTANT_URL) return askKnowledge({ messages, pet, signal, onStatus });

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You've been signed out. Log in again to use the assistant.");

  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, TIMEOUT);
  try {
    const res = await fetch(ASSISTANT_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: conversation(messages), pet: petContext(pet) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.reply !== "string") throw new Error(body.message || body.detail || "The assistant couldn't answer just now. Try again in a moment.");
    return { reply: body.reply.trim(), model: typeof body.model === "string" ? body.model : null };
  } catch (e) {
    if (e.name === "AbortError") throw new Error(signal?.aborted ? "Cancelled" : "The assistant took too long to answer. Try again.");
    if (e instanceof TypeError) throw new Error("Couldn't reach the assistant. Check your connection.");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

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

async function askKnowledge({ messages, pet, signal, onStatus }) {
  const q = queryText(messages);
  const ready = loadIndex();
  const last = messages.filter((m) => m.role === "user" && !m.error).at(-1)?.content || "";
  const rule = chatReply(last) || safetyReply(q) || breedReply(withEnglish(last), pet);
  const index = await ready;
  const answer = rule || compose(search(index, await embed(q, onStatus), q, { species: (pet?.species || "").toLowerCase() }), q);
  if (signal?.aborted) throw new Error("Cancelled");
  return { reply: answer.reply, model: index.version, match: answer.match, related: answer.related };
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
