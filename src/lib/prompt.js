import { GUIDES } from "./emergency";
import { ageText, byDateDesc, vaxStatus } from "./utils";
import PROMPT from "./aiPrompt.json";

/* What the FurFriends AI is sent: the conversation, the pet's details and the checked passages, built exactly
   like ai-server/prompting.py builds them in training. Kept apart from assistant.js (which talks to Supabase and
   the browser) so the evaluation script (scripts/eval-retrieval.mjs) builds the very same prompt in Node. */

export const HISTORY = 10;                    // earlier messages sent along as context
export const SOURCES = 2, SOURCE_WORDS = 160; // the same as ai-server/answer_rag.py

/* The messages actually sent to the model: no error notes, only the last few, only role and text. */
export const conversation = (messages) =>
  messages.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));

/* A short summary of the pet's records, so answers can be about this pet. */
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
export function describePet(c) {
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
export const sourcesFor = (results) => results.map((e) => { const s = sourceOf(e); return e.kind === "guide" ? s : { ...s, text: clipWords(s.text, SOURCE_WORDS) }; });
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
