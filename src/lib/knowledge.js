/* FurFriends knowledge search: the assistant's "brain" without a server.

   An open-source sentence model (all-MiniLM-L6-v2, Apache 2.0) turns text into a list of 384 numbers
   that captures its meaning, so "my cat won't eat" lands close to "cat not eating". Every checked
   Q&A and first-aid guide was turned into numbers ahead of time (scripts/build-knowledge.mjs →
   public/knowledge/index.json). In the app, the owner's question is turned into numbers on their own
   device and compared with all of them, together with a keyword match (BM25) so specific words like
   "lily" or "ticks" count too. The closest checked answer is shown, with its source.

   Shared by the app and by the build/accuracy script, so both search exactly the same way. */

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_OPTIONS = { pooling: "mean", normalize: true };
export const KEYWORD_WEIGHT = 0.15;                // how much the keyword match adds (0–0.15)
export const MATCH = { sure: 0.68, maybe: 0.58 };   // score needed to answer / to offer a "closest answer"
const LEAD_WORDS = 60;                              // words of each answer that are searched, with its question

const DOG = /\b(dogs?|pupp(y|ies)|pups?|canines?|aspin)\b/i;
const CAT = /\b(cats?|kittens?|kitty|kitties|felines?|puspin)\b/i;
export const speciesOf = (text) => {
  const d = DOG.test(text), c = CAT.test(text);
  return d && !c ? "dog" : c && !d ? "cat" : "";
};

/* What each entry is searched by: its question (or one of the other ways owners ask it) plus the
   start of its answer. */
export const searchText = (e) => withEnglish(`${e.ask || e.q} ${e.keys || ""} ${e.a.split(/\s+/).slice(0, LEAD_WORDS).join(" ")}`);

/* ------------------------------------------------------------------ safety rules
   Checked before searching. FurFriends never gives medicine doses, whatever the data says. */
const DOSE_ASK = /\b(how (much|many)|what|which)\b.*\b(mg|ml|milligrams?|dosage|doses?|tablets?|pills?|capsules?)\b|\bdos(e|age|ing)\b/i;
const MEDICINE = /\b(medicines?|medications?|antibiotics?|amoxicillin|paracetamol|ibuprofen|aspirin|benadryl|tablets?|pills?|capsules?|drugs?|mg)\b/i;
export const DOSE_REPLY = "I can't give medicine doses. The right medicine and dose depend on your pet's weight, health and what's wrong, "
  + "so only a vet can prescribe them.\n\n- Don't give human medicines or leftover prescriptions\n- Call your vet and tell them your pet's weight and symptoms\n\n"
  + "If your pet is very weak, not eating, or has trouble breathing, go to a vet now.";
export function safetyReply(question) {
  if (DOSE_ASK.test(question) && MEDICINE.test(question)) {
    return {
      reply: DOSE_REPLY,
      sure: true, match: { q: "Medicine doses", source: "FurFriends safety rule", url: "", kind: "rule", score: 1 }, related: [],
    };
  }
  return chatReply(question);
}

/* Greetings, thanks and "what can you do?" get a short reply instead of the closest pet-care answer. */
const GREETING = /^(hi+|hello+|hey+|helo|good (morning|afternoon|evening|day)|kumusta|kamusta|musta|magandang (umaga|hapon|gabi)|yo|sup)\b[\s!.,?]*(po|there|furfriends)?[\s!.,?]*$/i;
const THANKS = /^(thanks?|thank you|thank u|ty|salamat( po)?|maraming salamat|ok(ay)?|got it|noted|sige)\b[\s\w!.,]{0,20}$/i;
const ABOUT = /^(what can you do|what do you do|who are you|what are you|how do (i|you) use (this|you)|help|ano(ng)? (kaya mong gawin|ginagawa mo))\b[\s!.,?]*$/i;
export const INTRO = "Hi! I answer common questions about caring for cats and dogs, from FurFriends' first-aid guides and checked pet-care answers. For example:\n\n"
  + "- My dog ate chocolate, what do I do?\n- How often should I deworm my kitten?\n- When does my puppy need the anti-rabies shot?\n- Ayaw kumain ng pusa ko\n\n"
  + "Ask about one thing at a time, and say if it's a cat or a dog. I'm not a vet: in an emergency, go to a vet now.";
export function chatReply(question) {
  const q = question.trim();
  const reply = THANKS.test(q) ? "You're welcome! Ask me anything else about your pet's care."
    : GREETING.test(q) || ABOUT.test(q) ? INTRO : null;
  return reply && { reply, sure: true, match: null, related: [] };
}

/* Questions about symptoms always end with vet advice, even when the matched answer has none. */
const SYMPTOM = /\b(not eat|won'?t eat|stopped eating|hasn'?t eaten|isn'?t eating|vomit|throw(ing)? up|diarrh|blood|letharg|weak|limp|cough|sneez|wheez|discharge|swollen|lump|pain|hurt|fever|seiz|not drinking|peeing a lot|drinking a lot)/i;
export const VET_NOTE = "If this has lasted more than a day, keeps coming back, or your pet seems unwell, see your vet. Go now if your pet is very weak, can't keep water down, or has trouble breathing.";
/* Questions about something a pet ate or touched get poison advice, even when the matched answer has none. */
const SWALLOWED = /\b(ate|eaten|eats|swallow(ed)?|licked|chewed|drank|got into|ingest(ed)?|bit a)\b/i;
export const POISON_NOTE = "If your pet may have eaten, licked or touched something harmful, call your vet or the nearest 24-hour clinic now, "
  + "even if your pet seems fine. Bring the package or label, and only make your pet vomit if a vet tells you to.";
const SAYS_VET = /\b(vet|vets|veterinarian|clinic)\b/i;
const SAYS_SOON = /\b(now|immediately|right away|straight away|urgent|urgently|today|as soon as)\b/i;
function withVetAdvice(question, answer) {
  if (SAYS_VET.test(answer) && SAYS_SOON.test(answer)) return answer;
  if (SWALLOWED.test(question)) return `${answer}\n\n${POISON_NOTE}`;
  return SYMPTOM.test(question) ? `${answer}\n\n${VET_NOTE}` : answer;
}

/* ------------------------------------------------------------------ keywords (BM25) */
const STOP = new Set(("a an the and or but if of to in on at for with is are was be it its this that your you i my me can do does so as by "
  + "from not no they them their he she his her him we our have has had what how when why which should would could will just about there "
  + "been very get got").split(" "));
const tokens = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) || [])
  .filter((w) => w.length > 2 && !STOP.has(w))
  .map((w) => w.replace(/ies$/, "y").replace(/(ss|x|ch|sh)es$/, "$1").replace(/([^s])s$/, "$1"));   // lilies → lily, ticks → tick

function keywordIndex(texts) {
  const tf = texts.map((t) => { const m = new Map(); for (const w of tokens(t)) m.set(w, (m.get(w) || 0) + 1); return m; });
  const df = new Map();
  tf.forEach((m) => m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const len = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const avg = len.reduce((a, b) => a + b, 0) / Math.max(1, len.length);
  const N = texts.length;
  return (query) => {
    const q = [...new Set(tokens(query))];
    const s = tf.map((m, i) => q.reduce((sum, w) => {
      const f = m.get(w);
      if (!f) return sum;
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
      return sum + idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * len[i] / avg));
    }, 0));
    const max = Math.max(...s) || 1;
    return s.map((x) => x / max);   // 0–1, relative to the best keyword match
  };
}

/* ------------------------------------------------------------------ index
   Vectors are stored as signed bytes (value × 127) in base64, to keep the file small. */
export function encodeVectors(vectors) {
  const bytes = new Int8Array(vectors.length * vectors[0].length);
  vectors.forEach((v, i) => v.forEach((x, j) => { bytes[i * v.length + j] = Math.max(-127, Math.min(127, Math.round(x * 127))); }));
  let s = "";
  const u = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeIndex(raw) {
  const bin = atob(raw.vectors);
  const bytes = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = (bin.charCodeAt(i) << 24) >> 24;
  // Another wording of a question is stored as { id, of, ask }: fill in the answer it leads to.
  const byId = new Map(raw.entries.map((e) => [e.id, e]));
  const entries = raw.entries.map((e) => (e.of && !e.a ? { ...byId.get(e.of), ...e } : e));
  return { ...raw, entries, data: bytes, keywords: keywordIndex(entries.map(searchText)) };
}

/* ------------------------------------------------------------------ search */
export function search(index, queryVector, queryText, { species = "", limit = 3 } = {}) {
  const { dims, data, entries, keywords } = index;
  const kw = keywords(queryText);
  const scored = entries.map((e, i) => {
    let dot = 0;
    for (let j = 0, o = i * dims; j < dims; j++) dot += queryVector[j] * data[o + j];
    let score = dot / 127 + KEYWORD_WEIGHT * kw[i];
    // Prefer answers about the pet's own species, and keep the other species' answers back.
    if (species && e.sp) score += e.sp === species ? 0.03 : -0.08;
    return { ...e, score };
  });
  // An answer can be found by several wordings of its question; keep only its best one.
  const seen = new Set();
  return scored.sort((a, b) => b.score - a.score)
    .filter((e) => !seen.has(e.of || e.id) && seen.add(e.of || e.id))
    .slice(0, limit);
}

/* The text searched for: the latest question, plus the one before if it's a short follow-up
   ("what about kittens?", "is it safe?"), with common Tagalog words explained in English (the model
   reads English). A short question that names its own animal ("my cat is vomiting") is a new question. */
const FOLLOW_UP = /^(what about|how about|and|also|but|what if|paano naman|pano naman|paano kung|pano kung|e kung|eh kung|e sa|eh sa)\b/i;
export function queryText(messages) {
  const asked = messages.filter((m) => m.role === "user" && !m.error).map((m) => m.content.trim());
  const last = asked.at(-1) || "";
  const own = withEnglish(last);
  const names = DOG.test(own) || CAT.test(own);
  if (asked.length < 2 || last.split(/\s+/).length >= 5 || (names && !FOLLOW_UP.test(last))) return own;
  // "What about kittens?" after a puppy question: the new animal replaces the old one.
  const before = withEnglish(asked.at(-2));
  const topic = names ? before.replace(new RegExp(DOG.source, "gi"), " ").replace(new RegExp(CAT.source, "gi"), " ") : before;
  return `${topic} ${own}`.replace(/\s+/g, " ").trim();
}

const TAGALOG = [   // phrases first, so "nakagat ako" (bit me) isn't read as just "bite"
  [/\b(nakagat|kinagat) ako\b/, "bit me what do i do"], [/\b(nakalmot|kinalmot) ako\b/, "scratched me what do i do"],
  [/\bkailangan\b/, "need"], [/\b(iparehistro|irehistro|parehistro|rehistro)\b/, "register"],
  [/\baso\b|\bmga aso\b|\btuta\b/, "dog"], [/\bpusa\b|\bkuting\b/, "cat"],
  [/\bnakagat\b|\bkinagat\b|\bkagat\b/, "bitten bite"], [/\bkalmot\b|\bnakalmot\b|\bkinalmot\b/, "scratched scratch"],
  [/\bnagsusuka\b|\bsuka\b|\bsumuka\b/, "vomiting"], [/\bnagtatae\b|\bpagtatae\b/, "diarrhea"], [/\btae\b|\bdumi\b/, "poop"],
  [/\bayaw kumain\b|\bhindi kumakain\b|\bwalang gana\b/, "not eating"], [/\blagnat\b|\bmainit\b/, "fever"],
  [/\bubo\b|\binuubo\b/, "cough"], [/\bsipon\b|\bbumabahing\b/, "sneezing"], [/\bdugo\b|\bdumudugo\b/, "blood bleeding"],
  [/\bsugat\b/, "wound"], [/\bpilay\b|\bpiang\b|\bpaika\b/, "limping"], [/\bmatamlay\b|\bnanghihina\b/, "weak lethargic"],
  [/\bnalason\b|\blason\b/, "poison poisoned"], [/\bnakain\b|\bkinain\b|(?<!(ayaw|hindi) )\bkumain ng\b/, "ate"],
  [/\btsokolate\b/, "chocolate"], [/\bubas\b|\bpasas\b/, "grapes raisins"], [/\bsibuyas\b/, "onion"], [/\bbawang\b/, "garlic"],
  [/\bgarapata\b/, "ticks"], [/\bpulgas\b/, "fleas"], [/\bbulate\b|\buod\b/, "worms"], [/\bgalis\b/, "mange itchy skin"],
  [/\bbakuna\b|\bturok\b|\bbinakunahan\b/, "vaccine shot"], [/\bpurga\b|\bpurgahin\b/, "deworm"],
  [/\bkumbulsyon\b|\bnangingisay\b/, "seizure"], [/\bhirap huminga\b|\bhinihingal\b/, "trouble breathing"],
  [/\bmatanda na\b|\bmatandang\b/, "old senior"], [/\bpalaka\b/, "toad"], [/\bahas\b/, "snake"],
  [/\bpagkain\b|\bpakain\b/, "food feeding"], [/\bpaliguan\b|\bligo\b/, "bath"], [/\bkapitbahay\b/, "neighbor"],
  [/\bnaligaw\b|\bnawala\b/, "lost"], [/\bbuntis\b/, "pregnant"], [/\bkapon\b|\bkinapon\b/, "neuter spay"],
];
// Small Tagalog words that carry no meaning for the search ("ang", "ng", "ko" …).
const FILLER = /\b(ang|ng|nang|ko|mo|niya|nya|ako|ka|siya|sya|kami|kayo|sila|namin|natin|nila|yung|iyong|ung|sa|si|ni|may|mayroon|meron|na|ba|po|ho|ano|anong|paano|bakit|ito|iyan|yan|lang|din|rin|pa|kasi|tapos|pag|kapag|dahil|para|mga|eh|naman|talaga|ganito|ganun)\b/g;
export function withEnglish(text) {
  let t = text.toLowerCase(), found = false;
  for (const [re, en] of TAGALOG) {
    const all = new RegExp(re.source, "g");
    if (all.test(t)) { found = true; t = t.replace(all, ` ${en} `); }
  }
  return found ? t.replace(FILLER, " ").replace(/\s+/g, " ").trim() : text;
}

/* ------------------------------------------------------------------ reply */
export function compose(results, question = "") {
  const [best, ...rest] = results;
  const related = rest.filter((r) => r.score >= MATCH.maybe && r.q !== best?.q).map(pick);
  if (best && best.score >= MATCH.sure) {
    return { reply: withVetAdvice(question, best.a), sure: true, match: pick(best), related };
  }
  if (best && best.score >= MATCH.maybe) {
    return {
      reply: `I'm not sure I have an answer for exactly that. This is the closest one I have, to the question "${short(best.q)}":\n\n${withVetAdvice(question, best.a)}`,
      sure: false, match: pick(best), related,
    };
  }
  return {
    reply: "I don't have a checked answer for that yet. Try asking in another way, with a few more details. "
      + "If your pet seems unwell, your vet is the best person to ask.",
    sure: false, match: null, related: results.filter((r) => r.score >= MATCH.maybe - 0.08).map(pick),
  };
}

const pick = (r) => ({ q: short(r.q), source: r.src || "", url: r.url || "", kind: r.kind, score: Math.round(r.score * 100) / 100 });
const short = (t, n = 110) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);
