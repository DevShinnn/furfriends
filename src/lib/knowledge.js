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
const OPEN_SURE = 0.76;                             // open Stack Exchange posts must match more closely to be shown as the answer
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
/* A cat that hasn't eaten for a day or more must go to a vet now (the checked answers qcf4aff "If your cat hasn't eaten
   properly for 24 hours, take her to the vet now" and qc01447 "Two days without food is serious for a cat"). When the
   owner has said how long, the reply opens with it, whatever answer follows: the model tends to copy a passage that
   says "if ... 24 hours, ... now", which doesn't answer an owner who has just said "tatlong araw na po" (three days).
   `owner` is the owner's own messages: the search text turns "tatlong araw" into just "days". */
const NOT_EATING = /\b(not|isn'?t|won'?t|doesn'?t|didn'?t|hasn'?t|has not|stop(s|ped)?|refus(es|ed|ing)?)\s+(eat|eating|eaten)\b|\b(no|lost|loss of) appetite\b|\boff (his|her|its|their) food\b/i;
const DAYS = /\b(days?|weeks?|since (yesterday|last night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|24 hours|(a|one|two|three|\d+) (whole )?days?|overnight)\b/i;
const NUMBERS = { a: 1, an: 1, one: 1, isang: 1, two: 2, dalawang: 2, three: 3, tatlong: 3, four: 4, apat: 4, five: 5, limang: 5, six: 6, anim: 6, seven: 7, pitong: 7 };
const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
/* "three days", "tatlong araw", "2 days", "isang linggo", "since yesterday" → "Three days"; null when not said. */
export function howLong(text) {
  const m = text.toLowerCase().match(/\b(\d+|a|an|one|two|three|four|five|six|seven|isang|dalawang|tatlong|apat na|limang|anim na|pitong)\s+(days?|araw|weeks?|linggo)\b/);
  if (m) {
    const n = Number(m[1]) || NUMBERS[m[1].replace(/ na$/, "")];
    const unit = /^(weeks?|linggo)$/.test(m[2]) ? "week" : "day";
    return `${WORDS[n] || n} ${unit}${n === 1 ? "" : "s"}`;
  }
  return /\bsince (yesterday|last night)\b|\bkahapon pa\b|\b24 hours\b|\bovernight\b/i.test(text) ? "A day" : null;
}
const APPETITE_MARK = "without eating is serious for a cat. Take her to a vet now";
export const catAppetiteNote = (duration) => `${duration || "More than a day"} ${APPETITE_MARK}: a cat that stops eating can develop a serious `
  + "liver problem (hepatic lipidosis). Don't force-feed her, and tell the vet when she last ate.";
export function withAppetiteAdvice(question, answer, species = "", owner = "") {
  const cat = CAT.test(question) || (species === "cat" && !DOG.test(question));
  const duration = howLong(owner);
  if (!cat || !NOT_EATING.test(question) || !(duration || DAYS.test(question)) || answer.includes(APPETITE_MARK)) return answer;
  return `${catAppetiteNote(duration)}\n\n${answer}`;
}
export function withVetAdvice(question, answer) {
  if (SAYS_VET.test(answer) && SAYS_SOON.test(answer)) return answer;
  if (SWALLOWED.test(question)) return `${answer}\n\n${POISON_NOTE}`;
  return SYMPTOM.test(question) ? `${answer}\n\n${VET_NOTE}` : answer;
}

/* ------------------------------------------------------------------ keywords (BM25) */
const STOP = new Set(("a an the and or but if of to in on at for with is are was be it its this that your you i my me can do does so as by "
  + "from not no they them their he she his her him we our have has had what how when why which should would could will just about there "
  + "been very get got").split(" "));
export const tokens = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) || [])
  .filter((w) => w.length > 2 && !STOP.has(w))
  .map((w) => w.replace(/ies$/, "y").replace(/(ss|x|ch|sh)es$/, "$1").replace(/([^s])s$/, "$1"));   // lilies → lily, ticks → tick

function keywordIndex(texts) {
  const tf = texts.map((t) => { const m = new Map(); for (const w of tokens(t)) m.set(w, (m.get(w) || 0) + 1); return m; });
  const df = new Map();
  tf.forEach((m) => m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const len = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const avg = len.reduce((a, b) => a + b, 0) / Math.max(1, len.length);
  const N = texts.length;
  // How rare a word is in the library (a word found nowhere counts as rarest). evidence.js uses it too.
  const idf = (w) => Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
  const search = (query) => {
    const q = [...new Set(tokens(query))];
    const s = tf.map((m, i) => q.reduce((sum, w) => {
      const f = m.get(w);
      if (!f) return sum;
      return sum + idf(w) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * len[i] / avg));
    }, 0));
    // 0–1: how much of the question's keywords (weighted by rarity) the entry matches. Not relative to the best
    // match: then one shared word ("Philippines") gave a law Q&A the full keyword bonus for any question about
    // the Philippines, whatever the question was about.
    const full = q.reduce((sum, w) => sum + idf(w), 0) || 1;
    return s.map((x) => Math.min(1, x / full));
  };
  search.idf = idf;
  return search;
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
  const named = speciesOf(queryText);
  const scored = entries.map((e, i) => {
    let dot = 0;
    for (let j = 0, o = i * dims; j < dims; j++) dot += queryVector[j] * data[o + j];
    let score = dot / 127 + KEYWORD_WEIGHT * kw[i];
    // Prefer answers about the pet's own species, and keep the other species' answers back.
    if (species && e.sp) score += e.sp === species ? 0.03 : -0.08;
    // When the question itself names an animal ("my cat howls"), an answer about the other one is wrong.
    if (named && e.sp && e.sp !== named) score -= 0.15;
    return { ...e, score };
  });
  // An answer can be found by several wordings of its question; keep only its best one.
  const seen = new Set();
  return scored.sort((a, b) => b.score - a.score)
    .filter((e) => !seen.has(e.of || e.id) && seen.add(e.of || e.id))
    .slice(0, limit);
}

/* The text searched for: the latest question, joined to what it refers back to, with common Tagalog words
   explained in English (the model reads English). "Is that breed suitable for our climate?" after a question
   about huskies is searched as a question about huskies.

   A message leans on the one before when it opens like a follow-up ("what about kittens?", "and is it the
   same for adults?"), is a short question ("is it safe?"), or points back ("that breed", "them", "ganyan")
   without naming an animal of its own. A new symptom or topic ("she is not eating", "why does my cat knead?")
   stands alone. Chains ("my dog has ticks" / "how do I remove them?" / "can they make him sick?") resolve step
   by step, each message joined to the resolved one before it. */
const FOLLOWS = /^(what about|how about|and|also|but|what if|paano naman|pano naman|paano kung|pano kung|e kung|eh kung|e sa|eh sa)\b/i;
const SHORT_FOLLOW_UP = /^(how much|how many|how long|how often|why|when|which|is it|can i|should i|what should|what do)\b/i;
const REFERS_BACK = /\b(it|its|that|this|they|them|those|these|ganyan|ganyang|ganun|ganung|ganoon|ganoong|iyan|yun|iyon)\b|\b(the same|the (very )?first one|the next one|that one|this one)\b/i;
// "Is it okay to give grapes to dogs?": this "it" points forward, not back.
const EMPTY_IT = /\bit('?s| is)? (okay|ok|safe|normal|bad|good|true|possible|necessary|dangerous|fine|alright|legal|common|better|best|wise|important|harmful)( for \w+)? (to|if|that|when)\b/gi;
const CARRY = 30;   // words of the earlier question carried along, so long chains stay focused
function leansBack(text) {
  const names = DOG.test(text) || CAT.test(text);
  if (FOLLOWS.test(text)) return true;
  if (SHORT_FOLLOW_UP.test(text) && text.split(/\s+/).length < 5) return true;
  // A reply with almost nothing of its own ("tatlong araw na po", "since yesterday") adds to the question before.
  if (!names && tokens(withEnglish(text)).length <= 2) return true;
  return !names && REFERS_BACK.test(text.replace(EMPTY_IT, " "));
}
export function queryText(messages) {
  const asked = messages.filter((m) => m.role === "user" && !m.error).map((m) => m.content.trim());
  let resolved = "";
  for (const [i, text] of asked.entries()) {
    const own = withEnglish(text);
    if (i === 0 || !leansBack(text)) { resolved = own; continue; }
    // "What about kittens?" after a puppy question: the new animal replaces the old one.
    const names = DOG.test(own) || CAT.test(own);
    const before = resolved.split(/\s+/).slice(-CARRY).join(" ");
    const topic = names ? before.replace(new RegExp(DOG.source, "gi"), " ").replace(new RegExp(CAT.source, "gi"), " ") : before;
    resolved = `${topic} ${own}`.replace(/\s+/g, " ").trim();
  }
  return resolved;
}

const TAGALOG = [   // phrases first, so "nakagat ako" (bit me) isn't read as just "bite"
  [/\b(nakagat|kinagat) ako\b/, "bit me what do i do"], [/\b(nakalmot|kinalmot) ako\b/, "scratched me what do i do"],
  [/\bdila nang dila\b|\bdila ng dila\b/, "licking"],
  // Hot weather, before "mainit" (fever) below: "sa init", "tag-init", "mainit na panahon".
  [/\b(sa|ang|ng) init\b|\btag-?init\b|\bmainit (na|ang) panahon\b/, "hot weather heat"], [/\bpilipinas\b/, "philippines"], [/\bkamot nang kamot\b|\bkamot ng kamot\b/, "scratching a lot itchy"],
  [/\bnalalagas\b|\bnagkakalagas\b|\bnagkalagas\b|\bpagkalagas\b|\blagas\b/, "hair loss shedding"], [/\bkalbo\b/, "bald patches"],
  [/\bbalahibo\b|\bbuhok\b/, "fur hair"], [/\bmakati\b|\bkati\b|\bnangangati\b|\bkinakamot\b|\bkamot\b/, "itchy scratching"],
  [/\bkailangan\b/, "need"], [/\b(iparehistro|irehistro|parehistro|rehistro)\b/, "register"],
  [/\baso\b|\bmga aso\b|\btuta\b/, "dog"], [/\bpusa\b|\bkuting\b/, "cat"],
  [/\bnakagat\b|\bkinagat\b|\bkagat\b/, "bitten bite"], [/\bkalmot\b|\bnakalmot\b|\bkinalmot\b/, "scratched scratch"],
  [/\bnagsusuka\b|\bsuka\b|\bsumuka\b/, "vomiting"], [/\bnagtatae\b|\bpagtatae\b/, "diarrhea"], [/\btae\b|\bdumi\b/, "poop"],
  [/\bayaw kumain\b|\bhindi kumakain\b|\bwalang gana\b/, "not eating"], [/\blagnat\b|\bmainit\b/, "fever"],
  [/\b(isang|dalawang|tatlong|ilang) araw\b/, "days"], [/\b(isang|dalawang|tatlong|ilang) linggo\b/, "weeks"],
  [/\bubo\b|\binuubo\b/, "cough"], [/\bsipon\b|\bbumabahing\b/, "sneezing"], [/\bdugo\b|\bdumudugo\b|\bnagdudugo\b|\bdinudugo\b|\bdurugo\b|\bpagdurugo\b/, "blood bleeding"],
  [/\bsugat\b/, "wound"], [/\bpilay\b|\bpiang\b|\bpaika\b/, "limping"], [/\bmatamlay\b|\bnanghihina\b/, "weak lethargic"],
  [/\bnalason\b|\blason\b/, "poison poisoned"], [/\bnakain\b|\bkinain\b|(?<!(ayaw|hindi) )\bkumain ng\b/, "ate"],
  [/\btsokolate\b/, "chocolate"], [/\bubas\b|\bpasas\b/, "grapes raisins"], [/\bsibuyas\b/, "onion"], [/\bbawang\b/, "garlic"],
  [/\bgarapata\b/, "ticks"], [/\bpulgas\b/, "fleas"], [/\bbulate\b|\buod\b/, "worms"], [/\bgalis\b/, "mange itchy skin"],
  [/\bbakuna\b|\bturok\b|\bbinakunahan\b/, "vaccine shot"], [/\bpurga\b|\bpurgahin\b/, "deworm"],
  [/\bkumbulsyon\b|\bnangingisay\b/, "seizure"], [/\bhirap huminga\b|\bhinihingal\b/, "trouble breathing"],
  [/\bmatanda na\b|\bmatandang\b/, "old senior"], [/\bpalaka\b/, "toad"], [/\bahas\b/, "snake"],
  [/\bpagkain\b|\bpakain\b/, "food feeding"], [/\bpaliguan\b|\bligo\b/, "bath"], [/\bkapitbahay\b/, "neighbor"],
  [/\bnaligaw\b|\bnawala\b/, "lost"], [/\bbuntis\b/, "pregnant"], [/\bkapon\b|\bkinapon\b/, "neuter spay"],
  // Emergencies (also read by the emergency check, urgentGuides in emergency.js).
  [/\bnasagasaan\b|\bnasagasa\b|\bnabangga\b|\bbinangga\b/, "hit by a car"], [/\b(hindi|di|ayaw) (maka-?ihi|umiihi|umihi)\b|\bhirap umihi\b/, "can't pee"], [/\b(hindi|di) makahinga\b/, "trouble breathing"],
  [/\bnahulog\b/, "fell from"],
  [/\bnabulunan\b|\bnabilaukan\b/, "choking"], [/\bnakuryente\b|\bnakoryente\b/, "electric shock"], [/\bnapaso\b/, "burned burn"],
  // Question words, so they aren't taken for what the question is about.
  [/\bilang beses\b/, "how often"], [/\bkailan\b/, "when"], [/\bpwede\b|\bpuwede\b/, "can"], [/\bdapat\b/, "should"],
  [/\bgagawin\b|\bgawin\b/, "do"], [/\btanggalin\b|\balisin\b|\btatanggalin\b/, "remove"], [/\bdelikado\b|\bmapanganib\b/, "dangerous"],
];
// Small Tagalog words that carry no meaning for the search ("ang", "ng", "ko" …).
const FILLER = /\b(ang|ng|nang|ko|mo|niya|nya|ako|ka|siya|sya|kami|kayo|sila|namin|natin|nila|yung|iyong|ung|sa|si|ni|may|mayroon|meron|na|ba|po|ho|ano|anong|paano|bakit|ito|iyan|yan|lang|din|rin|pa|kasi|tapos|pag|kapag|dahil|para|mga|eh|naman|talaga|ganito|ganun|ganyan|ganoon|bang|kong|mong|siyang|niyang|nyang)\b/g;
export function withEnglish(text) {
  let t = text.toLowerCase(), found = false;
  for (const [re, en] of TAGALOG) {
    const all = new RegExp(re.source, "g");
    if (all.test(t)) { found = true; t = t.replace(all, ` ${en} `); }
  }
  return found ? t.replace(FILLER, " ").replace(/\s+/g, " ").trim() : text;
}

/* ------------------------------------------------------------------ reply */
const isOpen = (r) => /^Pets Stack Exchange/.test(r.src || "");
// Tap-able questions: short ones only, since many open posts are long personal stories.
const tappable = (r) => !isOpen(r) || r.q.length <= 90;
/* fits(r): may r be shown, as the closest answer? sure(r): may it be shown as the answer, without "I'm not
   sure"? near(r): may it be offered as a similar question? They come from selectEvidence() in evidence.js,
   so a passage that isn't about the question is never shown as its answer. */
export function compose(results, question = "", { fits = () => true, sure = fits, near = () => true } = {}) {
  const best = results.find(fits);
  const rest = results.filter((r) => r !== best);
  const related = rest.filter((r) => r.score >= MATCH.maybe && r.q !== best?.q && tappable(r) && near(r)).map(pick);
  if (best && sure(best) && best.score >= (isOpen(best) ? OPEN_SURE : MATCH.sure)) {
    return { reply: withVetAdvice(question, best.a), sure: true, match: pick(best), related };
  }
  // A loose match to an open Stack Exchange post is often long, rambling or about something else, so it is
  // offered as a question to tap instead of being shown as the answer. Checked FurFriends answers still are.
  if (best && best.score >= MATCH.maybe && !isOpen(best)) {
    return {
      reply: `I'm not sure I have an answer for exactly that. This is the closest one I have, to the question "${pick(best).q}":\n\n${withVetAdvice(question, best.a)}`,
      sure: false, match: pick(best), related,
    };
  }
  const similar = results.filter((r) => r.score >= MATCH.maybe - 0.08 && tappable(r) && near(r)).map(pick);
  return {
    reply: "I don't have a checked answer for that yet, so I'd rather not guess. Try asking in another way, with a few more details"
      + (similar.length ? ", or tap a similar question below if one fits. " : ". ")
      + "If your pet seems unwell, your vet is the best person to ask.",
    sure: false, match: null, related: similar,
  };
}

// A first-aid guide is shown by its title ("Bleeding & wounds"), not its whole summary sentence.
const pick = (r) => ({ id: r.of || r.id, q: short(r.kind === "guide" ? r.q.split(":")[0] : r.q), source: r.src || "", url: r.url || "", kind: r.kind, score: Math.round(r.score * 100) / 100 });
const short = (t, n = 110) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);
