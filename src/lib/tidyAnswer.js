/* Tidies an answer before the owner sees it, without training the model (2026-11-21).

   The model (rag-v6) mostly repeats its checked passage, so its answers carry what the passage has, even parts that
   don't fit the question. On v6's saved benchmark and pet-test answers, 10 of 139 included the part for the other
   animal ("Cats: ..." for a dog), 6 ended mid-word at the length limit ("...leftover steroids. Antihist"), 2
   repeated a line and 1 had a stray "Q: ... A:" from the passage. This removes exactly those:
     - a block or bullet only for the other animal ("Cats:", "Adult cats (from about 1 year old): ...",
       "- ... retching (dogs)"), but never a line with urgent advice ("vet now", "emergency"...), and never so much
       that little is left;
     - a repeated line, a "Q: ..." line and a leading "A: ";
     - a few words cut off at the end (only once the answer is complete, not while it streams in).
   It only removes text, so it can't add anything the evidence check didn't see. Used for the AI's answer and the
   checked answer shown instead, before the app adds the pet's notes and the emergency advice (assistant.js). */

const DOG = /\b(dogs?|pupp(y|ies)|aso|tuta)\b/i;
const CAT = /\b(cats?|kittens?|pusa|kuting)\b/i;
const WORD = { dog: DOG, cat: CAT };
const OTHER = { dog: "cat", cat: "dog" };
const URGENT = /\b(vet now|go now|go immediately|right away|emergency|24-hour|immediately)\b/i;
// A heading for one animal: "Cats:", "- Dogs: ...", "Adult cats (from about 1 year old): ...", "For puppies:".
const heading = (kind) => new RegExp(`^\\s*(?:[-*•]\\s*)?(?:for\\s+|adult\\s+|senior\\s+|older\\s+|young\\s+)?(?:${kind === "dog" ? "dogs?|pupp(?:y|ies)" : "cats?|kittens?"})\\b[^:\\n]{0,40}:`, "i");
// A line tagged for one animal at its end: "- Has a swollen belly and keeps retching (dogs)".
const tagged = (kind) => new RegExp(`\\((?:${kind === "dog" ? "dogs?|pupp(?:y|ies)" : "cats?|kittens?"})\\)[.;,]?\\s*$`, "i");

/* Which animal the question is about from its words, or null (both or neither). */
export function speciesAsked(text) {
  const dog = DOG.test(text || ""), cat = CAT.test(text || "");
  return dog && !cat ? "dog" : cat && !dog ? "cat" : null;
}

const words = (t) => (t.match(/\S+/g) || []).length;

function forSpecies(text, kind) {
  const other = OTHER[kind];
  if (!other) return text;
  const isHeading = heading(other), isTagged = tagged(other);
  // A line that names both animals ("Cats and small dogs: ...") is for both.
  const onlyOther = (line) => !WORD[kind].test(line) && !URGENT.test(line);
  const blocks = text.split(/\n[ \t]*\n/).filter((block) => {
    const first = block.split("\n")[0];
    return !(isHeading.test(first) && onlyOther(first) && !URGENT.test(block));
  }).map((block) => block.split("\n").filter((line) => !((isHeading.test(line) || isTagged.test(line)) && onlyOther(line))).join("\n"));
  const out = blocks.filter((b) => b.trim()).join("\n\n");
  // Keep the original if the trim would leave little (a passage that is mostly about the other animal).
  return words(out) >= Math.max(20, 0.4 * words(text)) ? out : text;
}

export function tidyAnswer(text, { species = null, partial = false } = {}) {
  if (!text) return text;
  let out = text
    .split("\n")
    .filter((line) => !/^\s*Q:\s/.test(line))
    .map((line) => line.replace(/^(\s*)A:\s+/, "$1"))
    .join("\n");
  const kind = (species || "").toLowerCase();
  if (WORD[kind]) out = forSpecies(out, kind);
  const seen = new Set();
  out = out.split("\n").filter((line) => {
    const key = line.trim().toLowerCase();
    if (key.length <= 20) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("\n");
  if (!partial) {
    // A few words cut off at the length limit: "...leftover steroids. Antihist". A complete bullet without a full
    // stop ("- Straining with nothing coming out") is kept, and so is a whole sentence missing only its full stop.
    const lines = out.trimEnd().split("\n");
    const lastLine = lines.at(-1);
    if (!/[.!?)\]"'”’:]\s*$/.test(lastLine)) {
      const end = Math.max(lastLine.lastIndexOf(". "), lastLine.lastIndexOf("! "), lastLine.lastIndexOf("? "));
      const bullet = /^\s*(?:[-*•]|\d+[.)])\s/.test(lastLine);
      if (end >= 0 && words(lastLine.slice(end + 2)) < 5) lines[lines.length - 1] = lastLine.slice(0, end + 1);
      else if (end < 0 && !bullet && words(lastLine) < 5) lines[lines.length - 1] = "";
      out = lines.join("\n");
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
