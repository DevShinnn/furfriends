import { supabase } from "./supabase";
import { GUIDES } from "./emergency";
import { breedFor } from "./breeds";
import { ageText, byDateDesc, vaxStatus } from "./utils";

/* Client for the FurFriends assistant. The model is the team's own; this file only talks to it.

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
  ["poisoning", /poison|chocolate|grape|raisin|xylitol|onion|garlic|rat bait|rodenticide|antifreeze|bleach|paracetamol|ibuprofen|insecticide/],
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

/* ------------------------------------------------------------------ asking */
export async function askAssistant({ user, messages, pet, signal }) {
  if (user.isDemo) return { reply: await demoAnswer(messages.at(-1).content, pet), model: "demo" };

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

/* ------------------------------------------------------------------ demo
   Sample answers from the app's own guides, so the demo works with no model connected. */
async function demoAnswer(q, pet) {
  await new Promise((r) => setTimeout(r, 700));
  const t = q.toLowerCase();
  const name = pet?.name || "your pet";
  const urgent = urgentGuides(q);
  if (urgent.length) {
    const g = urgent[0];
    return `This could be urgent. Open the ${g.title} guide below for what to do right now, and ${g.urgency === "now" ? "take " + name + " to a vet now" : "call your vet for advice"}.\n\nThis is a demo answer. When the FurFriends assistant is connected, you'll get a full reply here.`;
  }
  const breed = pet && breedFor(pet);
  if (breed && /breed|health|problem|watch|care|tip|weight|groom|hot|heat|weather/.test(t)) {
    return [
      `Here's what the breed guide says about ${breed.name}s like ${name}:`,
      `Typical weight is ${breed.weight[0]}–${breed.weight[1]} kg${pet.weight ? `, and ${name} is ${pet.weight} kg` : ""}.`,
      "Health problems to watch for:\n" + breed.health.map((h) => `- ${h}`).join("\n"),
      "Care tips:\n" + breed.tips.map((h) => `- ${h}`).join("\n"),
      "This is a demo answer built from the breed guide.",
    ].join("\n\n");
  }
  return `In the demo, the assistant gives sample answers from the app's breed and first-aid guides. Try asking about ${pet ? name + "'s breed" : "a pet's breed"}, or describe an emergency to see how it points you to the right guide.\n\nWhen the FurFriends assistant is connected, you'll get a full answer about ${name} here.`;
}
