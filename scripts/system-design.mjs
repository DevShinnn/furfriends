/* Makes the system design document: architecture, ERD and flows, as one PDF for the thesis panel and team.

     node scripts/system-design.mjs
       → docs/system-design/FurFriends-system-design.html (+ .pdf if Chrome is found)

   The diagrams are drawn by Mermaid (loaded from the jsDelivr CDN, pinned version), so the PDF step needs internet.
   The ERD matches supabase/migrations and docs/database-erd.md; update all three together. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "system-design");
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";
mkdirSync(OUT_DIR, { recursive: true });

/* ---------------------------------------------------------------- diagrams */

const erdPets = `
erDiagram
  AUTH_USERS ||--o{ PETS : "owns"
  PETS ||--o{ MEDICAL_RECORDS : "has"
  PETS ||--o{ VACCINATIONS : "has"
  PETS ||--o{ DOCUMENTS : "has"
  PETS ||--o{ FEEDING_SCHEDULES : "has"
  PETS ||--o{ CARE_TASKS : "has"
  FEEDING_SCHEDULES ||--o{ FEEDING_LOG : "ticked as fed"
  PETS ||--o{ FEEDING_LOG : "has"

  AUTH_USERS {
    uuid id PK
    text email UK
  }
  PETS {
    uuid id PK
    uuid owner_id FK
    text name
    text species "Cat or Dog"
    text breed
    numeric weight_kg
    text photo_path
  }
  MEDICAL_RECORDS {
    uuid id PK
    uuid pet_id FK
    date date
    text type
    text title
  }
  VACCINATIONS {
    uuid id PK
    uuid pet_id FK
    text name
    date date_given
    date next_due
  }
  DOCUMENTS {
    uuid id PK
    uuid pet_id FK
    text title
    text file_path
    text mime_type
  }
  FEEDING_SCHEDULES {
    uuid id PK
    uuid pet_id FK
    time time
    text food
    text amount
  }
  FEEDING_LOG {
    uuid feeding_id PK, FK
    date fed_on PK
    uuid pet_id FK
  }
  CARE_TASKS {
    uuid id PK
    uuid pet_id FK
    text kind
    date next_due
    integer repeat_days
    boolean done
  }
`;

const erdAccount = `
erDiagram
  AUTH_USERS ||--|| PROFILES : "has"
  AUTH_USERS ||--o{ PETS : "owns"
  AUTH_USERS ||--o{ PUSH_SUBSCRIPTIONS : "has devices"
  AUTH_USERS ||--o{ PUSH_LOG : "was sent"
  AUTH_USERS ||--o{ ASSISTANT_FEEDBACK : "rates"
  AUTH_USERS ||--o{ USABILITY_RESPONSES : "submits"
  AUTH_USERS ||--o{ AI_USAGE : "used AI time"
  PETS |o--o{ ASSISTANT_FEEDBACK : "asked about"

  AUTH_USERS {
    uuid id PK
    text email UK
    text encrypted_password
  }
  PETS {
    uuid id PK
    uuid owner_id FK
  }
  PROFILES {
    uuid id PK, FK
    text name
    text phone
    text city
    text address
    boolean notifications_enabled
  }
  PUSH_SUBSCRIPTIONS {
    uuid id PK
    uuid user_id FK
    text endpoint UK
    text timezone
  }
  PUSH_LOG {
    uuid user_id PK, FK
    text key PK
    timestamptz sent_at
  }
  ASSISTANT_FEEDBACK {
    uuid id PK
    uuid user_id FK
    uuid pet_id FK "optional"
    text question
    text answer
    text model
    smallint rating "1 or -1"
  }
  USABILITY_RESPONSES {
    uuid id PK
    uuid user_id FK
    text participant_code
    smallint_array sus "10 answers"
    numeric sus_score "0 to 100"
  }
  CLINIC_SEARCH_CACHE {
    text key PK
    jsonb value
    timestamptz saved_at
  }
  AI_USAGE {
    bigint id PK
    uuid user_id FK
    real cpu_seconds
    text model
  }
`;

const flowSync = `
sequenceDiagram
  autonumber
  actor O as Owner
  participant A as App on phone
  participant AU as Supabase Auth
  participant DB as Postgres (RLS)
  participant ST as Storage
  participant D2 as Owner's other device
  O->>A: Log in (or tap the demo button)
  A->>AU: Email and password
  AU-->>A: Session token (JWT)
  A->>DB: Load profile, pets, records, schedules
  Note over DB: Row Level Security returns only this owner's rows
  DB-->>A: Data
  A->>ST: Ask for signed links to photos and documents
  ST-->>A: Links that last a week
  O->>A: Add or edit a record
  A-->>O: Screen updates immediately
  A->>DB: Save (queued, in order)
  alt save fails
    A->>DB: Reload everything from the server
  end
  DB-->>D2: Realtime change event
  D2->>DB: Reload once its own saves are done
`;


const flowReminders = `
sequenceDiagram
  autonumber
  participant C as pg_cron (every 5 min)
  participant F as Edge function send-reminders
  participant DB as Postgres
  participant P as Browser push service
  participant S as Service worker on phone
  actor O as Owner
  C->>F: Call with the secret kept in Vault
  F->>DB: Read devices, care tasks, feeding times, vaccines
  Note over F: Works in each device's own time zone.<br/>Due if its time fell in the last 10 minutes.<br/>Morning 8:00, vet visit 2 hours before and the evening before
  F->>DB: Check push_log: already sent?
  F->>P: Send Web Push (VAPID keys)
  P-->>S: Deliver, even if the app is closed
  S-->>O: Show the notification
  F->>DB: Record it in push_log (no repeats)
  O->>S: Tap the notification
  S-->>O: App opens at the right page
`;



/* ---------------------------------------------------------------- tables */
const stack = [
  ["App", "React 19, React Router, Vite", "One codebase for phone and computer; fast to build and to test."],
  ["Installable and offline", "PWA with a Workbox service worker", "Works from the home screen; the app and answers keep working without a connection."],
  ["Accounts and data", "Supabase Auth and Postgres with Row Level Security", "Each owner can only read and change their own rows, enforced in the database itself."],
  ["Files", "Supabase Storage (private buckets)", "Photos and documents kept under the owner's folder, opened with signed links."],
  ["Sync between devices", "Supabase Realtime", "A change on one device reaches the others without a manual refresh."],
  ["Nearby vet clinics", "TomTom Places Search API through a Supabase edge function (find-clinics); Leaflet map with OpenStreetMap tiles", "Free with no card (5,000 searches a month), with opening hours for about half of Batangas clinics; the key stays secret; directions open Google Maps."],
  ["Reminders", "pg_cron, an edge function, Web Push (VAPID)", "Notifications arrive even when the app is closed, and are never sent twice."],
  ["AI search", "Open-source MiniLM model in a Web Worker (transformers.js)", "Finds the 2 checked passages closest to the question on the owner's device; it also works offline."],
  ["AI that writes the answer", "FurFriends' own model (Qwen2.5-0.5B trained with LoRA, 4-bit ONNX) in a Vercel Python function, api/ask.py", "Trained by the team on checked text; runs next to the app, so owners download nothing and there is no paid AI service."],
  ["Hosting", "Vercel, deployed from GitHub", "Every push to main publishes the new version."],
  ["Team tooling", "Node scripts and Python (ai-server)", "Builds the answer index, runs the accuracy test, content check, survey results and the secret scan."],
];

const dictionary = [
  ["profiles", "an owner's name, phone, city, address and reminder setting", "id (the user's id)", "One per user, created at sign-up."],
  ["pets", "a cat or a dog", "id", "Species is Cat or Dog; age months 0 to 11; weight above 0."],
  ["medical_records", "a checkup, illness, injury, surgery, medication or allergy", "id", "Belongs to a pet."],
  ["vaccinations", "a vaccine given, with its next due date", "id", "Next due date is after the date given."],
  ["documents", "an uploaded photo or PDF", "id", "The file is in private storage; the row keeps its path."],
  ["feeding_schedules", "a meal time with food and amount", "id", "Days 0 to 6, empty means every day."],
  ["feeding_log", "a meal ticked as fed on one day", "feeding_id + fed_on", "Only the last 14 days are loaded."],
  ["care_tasks", "grooming, deworming, vaccination or a vet appointment", "id", "Repeat in days (0 = once); vet appointments are rows here, not a separate table."],
  ["assistant_feedback", "a thumbs up or down on one assistant answer", "id", "Keeps the question, answer and model version; rating is 1 or -1."],
  ["push_subscriptions", "a phone or browser that allowed notifications", "id", "Endpoint is unique; keeps the device's time zone."],
  ["push_log", "a reminder already pushed", "user_id + key", "Stops the same reminder going out twice."],
  ["usability_responses", "one tester's survey", "id", "Exactly 10 answers from 1 to 5; SUS score computed."],
  ["clinic_search_cache", "one saved TomTom clinic search for a ~1 km area, or a typed address's location", "key", "Kept a week. Only the find-clinics function reads or writes it (no user policies); addresses are stored as a hash."],
  ["ai_usage", "the CPU time one AI answer used", "id", "No question text. Users can add rows but not read them; the AI stops at 3 CPU-hours per 30 days."],
];

const security = [
  ["Each owner sees only their own data", "Row Level Security on all 14 tables; a pet's rows are visible only when its owner is the logged-in user. Visitors who are not logged in see nothing."],
  ["Files are private", "Photos and documents sit under a folder named with the owner's user id, locked by a storage policy, and are opened with links that expire after a week."],
  ["Secrets stay on the server", "The app holds only the public Supabase key. The service-role key and push private key live in the edge function's secrets. A secret scan runs before every push and passed on the whole history."],
  ["Locations aren't kept", "The phone's location is used for one search and never saved. Searches are saved per ~1 km area, and a typed address only as a hash. The TomTom key is an edge-function secret, and only logged-in owners can search."],
  ["Questions go only to FurFriends' own AI", "Only logged-in owners can use it. The question and 2 checked passages go to the team's function on Vercel, not to a paid AI service, and are not stored. A question is shared with the team only when the owner rates the answer."],
  ["The free plan can't be overrun", "Each answer's CPU time is logged in Supabase. Above 3 of the free 4 CPU-hours per 30 days, the AI stops and the checked answer shows instead, so the app is never paused."],
  ["Shared demo accounts are protected", "The demo and sample logins have public passwords, so the database refuses changes to their password or email, and refuses their survey answers and ratings."],
  ["The assistant is cautious", "It writes only from 2 checked passages, never gives medicine doses, puts the first-aid guide first in an emergency, shows its sources, and says when the passages don't answer the question."],
];

const limits = [
  "The AI is a small model (0.5 billion parameters). It writes from the 2 closest checked passages but can still pick the wrong ones or word an answer wrongly, and the screen says so. It is not a vet.",
  "There is no vet adviser. Answers are written from public sources (VCA, Merck, Cornell, ASPCA, WSAVA, Philippine laws) and checked against them by the team, which is a limitation to state.",
  "Tagalog and Taglish work through a word list that turns common words into English before the search. Unusual wording can still be missed.",
  "The search model (about 30 MB) downloads once, on the first question. Writing answers needs internet; offline, the closest checked answer shows instead.",
  "The AI shares Vercel's free plan: about 25 to 50 CPU-seconds per answer, so roughly 200 to 400 answers per 30 days before it falls back to checked answers.",
  "Clinic listings and hours come from TomTom and can be wrong or out of date; about half of Batangas clinics have no hours listed, and small towns have few listings. The app says to call before going.",
  "Survey and grading results shown anywhere as SIMULATED are practice data only, not research results.",
];

/* ---------------------------------------------------------------- page */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
/* ---------------------------------------------------------------- hand-drawn diagrams
   Drawn with small helpers instead of Mermaid's auto layout, so they fill the page and the text stays readable. */
const KIND = { device: ["#e3f1ec", "#1f6f5a"], cloud: ["#fff4d6", "#c99a1c"], ext: ["#f1ece4", "#8a8272"], rule: ["#fff4d6", "#c99a1c"] };
const FS = 15;
const FONT = "Segoe UI, Arial, sans-serif";
const label = (lines, cx, cy, { fs = FS, bold = false, color = "#1b1f1d" } = {}) => {
  const lh = fs * 1.22, y0 = cy - ((lines.length - 1) * lh) / 2 + fs * 0.34;
  return `<text text-anchor="middle" font-size="${fs}" fill="${color}" font-family="${FONT}">${lines.map((l, i) =>
    `<tspan x="${cx}" y="${(y0 + i * lh).toFixed(1)}"${bold && i === 0 ? ' font-weight="700"' : ""}>${esc(l)}</tspan>`).join("")}</text>`;
};
const box = (x, y, w, h, lines, kind = "device", o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${KIND[kind][0]}" stroke="${KIND[kind][1]}" stroke-width="1.6"/>` + label(lines, x + w / 2, y + h / 2, { bold: true, ...o });
const diamond = (cx, cy, w, h, lines, kind = "device") =>
  `<polygon points="${cx - w / 2},${cy} ${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2}" fill="${KIND[kind][0]}" stroke="${KIND[kind][1]}" stroke-width="1.6"/>` + label(lines, cx, cy, { fs: 14 });
const zone = (x, y, w, h, title) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#faf7f1" stroke="#cfc7b8" stroke-width="1.4" stroke-dasharray="6 5"/>` +
  `<text x="${x + 14}" y="${y + 22}" font-size="14" font-weight="700" fill="#5b625e" font-family="${FONT}">${esc(title)}</text>`;
const arrow = (pts, text = "", { dash = false, both = false, lx, ly } = {}) => {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const k = Math.floor((pts.length - 1) / 2), mid = pts[k], nxt = pts[k + 1];
  const tx = lx ?? (mid[0] + nxt[0]) / 2, ty = ly ?? (mid[1] + nxt[1]) / 2 - 7;
  return `<path d="${d}" fill="none" stroke="#4a524e" stroke-width="1.8"${dash ? ' stroke-dasharray="6 5"' : ""} marker-end="url(#ah)"${both ? ' marker-start="url(#ah)"' : ""}/>` +
    (text ? `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="13" font-weight="600" fill="#3b423f" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round" font-family="${FONT}">${esc(text)}</text>` : "");
};
const note = (x, y, lines, fs = 14) => `<text font-size="${fs}" fill="#5b625e" font-family="${FONT}">${lines.map((t, i) => `<tspan x="${x}" y="${y + i * fs * 1.45}">${esc(t)}</tspan>`).join("")}</text>`;
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
  `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4a524e"/></marker></defs>${body}</svg>`;

const architecture = () => svg(1080, 570, [
  zone(10, 92, 480, 372, "Owner's phone or computer"),
  box(30, 135, 205, 84, ["React app", "Home, Pets, Care, Visits,", "Emergency, Breeds,", "Ask AI, Profile, Survey"]),
  box(265, 135, 205, 84, ["App store", "screen updates at once,", "saves queued in order"]),
  box(30, 255, 205, 168, ["AI search on the device", "", "safety rules first, then", "the MiniLM model finds", "the 2 closest of 2,997", "checked passages"]),
  box(265, 315, 205, 84, ["Service worker", "offline cache and", "notifications"]),
  box(30, 8, 200, 62, ["Vercel", "app hosting and CDN"], "cloud"),
  box(255, 8, 235, 62, ["AI function (Vercel)", "FurFriends' own model"], "cloud"),
  zone(560, 8, 510, 456, "Supabase (cloud backend)"),
  box(585, 48, 220, 62, ["Auth", "email and password"], "cloud"),
  box(585, 128, 220, 62, ["Private storage", "photos and documents"], "cloud"),
  box(585, 208, 220, 62, ["Realtime", "sync between devices"], "cloud"),
  box(840, 48, 210, 222, ["Postgres database", "14 tables", "Row Level Security:", "each owner sees only", "their own rows"], "cloud"),
  box(585, 330, 220, 62, ["pg_cron", "every 5 minutes"], "cloud"),
  box(840, 330, 210, 62, ["Edge function", "send-reminders"], "cloud"),
  box(585, 404, 220, 52, ["Edge function", "find-clinics"], "cloud"),
  box(960, 498, 110, 62, ["TomTom", "clinics, hours"], "ext"),
  box(30, 498, 300, 62, ["Hugging Face", "search model, downloaded once"], "ext"),
  box(400, 498, 250, 62, ["Browser push service", "Web Push, VAPID keys"], "ext"),
  arrow([[130, 70], [130, 135]], "loads the app", { lx: 200, ly: 86 }),
  arrow([[235, 177], [265, 177]]),
  arrow([[235, 285], [250, 285], [250, 70]], "question + 2 passages, answer back", { both: true, lx: 385, ly: 85 }),
  arrow([[490, 59], [585, 59]], "login, CPU limit", { lx: 538, ly: 46 }),
  arrow([[130, 219], [130, 255]]),
  arrow([[470, 177], [560, 177]], "HTTPS and Realtime", { lx: 515, ly: 163, both: true }),
  arrow([[130, 498], [130, 423]], "first use only", { dash: true, lx: 190, ly: 480 }),
  arrow([[805, 361], [840, 361]]),
  arrow([[945, 330], [945, 270]]),
  arrow([[945, 392], [945, 529], [650, 529]], "sends", { lx: 800, ly: 520 }),
  arrow([[805, 430], [1015, 430], [1015, 498]], "searches", { lx: 880, ly: 422 }),
  arrow([[400, 529], [367, 529], [367, 399]], "notification, even when closed", { dash: true, lx: 250, ly: 440 }),
].join(""));

const assistantFlow = () => svg(1060, 630, [
  box(5, 115, 150, 70, ["Owner asks", "(English, Tagalog", "or Taglish)"], "ext"),
  diamond(250, 150, 180, 120, ["Greeting, thanks,", "dose or emergency", "wording?"]),
  diamond(440, 150, 180, 120, ["Weight or breed", "question, and a", "pet selected?"]),
  box(550, 105, 160, 90, ["Search on the device", "2 closest of 2,997", "checked passages;", "emergency guide first"]),
  box(735, 105, 145, 90, ["FurFriends AI", "on Vercel writes", "the answer from", "the 2 passages"], "cloud"),
  diamond(970, 150, 170, 120, ["Did the AI", "answer from the", "passages?"]),
  box(160, 255, 180, 72, ["Friendly reply, a", "'no doses' note, or", "the first-aid guide"], "rule"),
  box(350, 255, 180, 72, ["Answer from the breed", "guide, using the pet's", "own weight"], "rule"),
  box(875, 0, 180, 72, ["Show the AI's answer", "with both sources", "and rating buttons"]),
  diamond(970, 320, 170, 130, ["Score 0.68", "or more? (0.76", "for open posts)"]),
  box(690, 285, 170, 70, ["Show the checked", "answer with", "its source"]),
  diamond(970, 470, 170, 130, ["0.58 or more and", "a checked FurFriends", "answer?"]),
  box(690, 435, 170, 70, ["Show the closest", "answer with a", "'not sure' note"]),
  box(875, 555, 180, 70, ["Say there is no checked", "answer yet; offer", "similar questions"]),
  arrow([[155, 150], [160, 150]]),
  arrow([[340, 150], [350, 150]], "no", { lx: 345, ly: 136 }),
  arrow([[530, 150], [550, 150]], "no", { lx: 540, ly: 136 }),
  arrow([[710, 150], [735, 150]]),
  arrow([[880, 150], [885, 150]]),
  arrow([[250, 210], [250, 255]], "yes", { lx: 270, ly: 237 }),
  arrow([[440, 210], [440, 255]], "yes", { lx: 460, ly: 237 }),
  arrow([[970, 90], [970, 72]], "yes", { lx: 995, ly: 86 }),
  arrow([[970, 210], [970, 255]], "no", { lx: 988, ly: 237 }),
  arrow([[885, 320], [860, 320]], "yes", { lx: 872, ly: 306 }),
  arrow([[970, 385], [970, 405]], "no", { lx: 988, ly: 400 }),
  arrow([[885, 470], [860, 470]], "yes", { lx: 872, ly: 456 }),
  arrow([[970, 535], [970, 555]], "no", { lx: 988, ly: 550 }),
  note(10, 400, ["Safety first: the assistant never gives medicine doses, and in an", "emergency the first-aid guide is put in front of the AI.",
    "'No' at the AI also covers: offline, not logged in, or this month's free", "AI allowance used up. The checked answer then shows instead.",
    "Open posts must match more closely than FurFriends' own answers."]),
].join(""));

const researchFlow = () => svg(1060, 570, [
  `<text x="10" y="30" font-size="15" font-weight="700" fill="#123d33" font-family="${FONT}">Usability testing</text>`,
  box(10, 50, 230, 90, ["Survey page", "10 SUS questions,", "tasks and comments"], "device"),
  box(290, 50, 230, 90, ["usability_responses", "own rows only"], "cloud"),
  box(570, 50, 230, 90, ["survey-results script", "SUS score and tables"], "ext"),
  box(850, 50, 200, 90, ["Usability results", "for the thesis"], "ext"),
  `<text x="10" y="290" font-size="15" font-weight="700" fill="#123d33" font-family="${FONT}">Improving the assistant</text>`,
  box(10, 310, 230, 90, ["Thumbs up or down", "on an answer,", "with a reason"], "device"),
  box(290, 310, 230, 90, ["assistant_feedback", "question, answer,", "model version"], "cloud"),
  box(570, 310, 230, 90, ["Wrong answers reviewed;", "new sourced Q&A", "rows written in CSV"], "ext"),
  box(850, 310, 200, 90, ["prepare_data.py,", "then build-knowledge", "(new answer index)"], "ext"),
  box(850, 460, 200, 90, ["evaluate.py", "31 held-out questions,", "two graders, kappa"], "ext"),
  box(570, 460, 230, 90, ["Better index ships", "to the live app"], "device"),
  box(290, 190, 230, 76, ["Demo and sample accounts", "are blocked from writing", "these two tables"], "rule"),
  arrow([[240, 95], [290, 95]]), arrow([[520, 95], [570, 95]]), arrow([[800, 95], [850, 95]]),
  arrow([[240, 355], [290, 355]]), arrow([[520, 355], [570, 355]]), arrow([[800, 355], [850, 355]]),
  arrow([[950, 400], [950, 460]]),
  arrow([[850, 505], [800, 505]]),
  arrow([[405, 190], [405, 140]], "", { dash: true }),
  arrow([[405, 266], [405, 310]], "", { dash: true }),
].join(""));

const deployFlow = () => svg(1060, 570, [
  box(10, 60, 200, 90, ["Developer", "edits code, data", "or migrations"], "ext"),
  box(270, 60, 240, 90, ["Local checks", "build, content check,", "secret scan before every push"], "ext"),
  box(570, 60, 200, 90, ["git push", "to GitHub (main)"], "ext"),
  box(830, 60, 220, 90, ["Vercel", "builds the app (Vite, PWA)", "and the AI function"], "device"),
  box(830, 250, 220, 90, ["Live site", "furfriends-black", ".vercel.app"], "device"),
  box(10, 250, 300, 100, ["Supabase changes", "migrations (SQL, run in the", "Supabase SQL editor) and the", "send-reminders edge function"], "cloud"),
  box(400, 250, 260, 100, ["Supabase project", "tables, policies,", "reminder schedule"], "cloud"),
  arrow([[210, 105], [270, 105]]), arrow([[510, 105], [570, 105]]), arrow([[770, 105], [830, 105]]),
  arrow([[940, 150], [940, 250]], "every push goes live by itself", { lx: 940, ly: 205 }),
  arrow([[110, 150], [110, 250]]),
  arrow([[310, 300], [400, 300]]),
  arrow([[830, 295], [660, 295]], "HTTPS", { both: true, lx: 745, ly: 281 }),
  note(10, 450, ["Database changes are written as numbered SQL files in supabase/migrations and applied in order.", "The reminder schedule and push keys live in Supabase (Vault and edge function secrets), never in the app."], 14.5),
].join(""));

const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="k"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const figure = (title, lead, svgText, extra = "") => `<section class="page"><h2>${title}</h2><p class="lead">${lead}</p><div class="diagram">${svgText}</div>${extra}</section>`;
const diagram = (title, lead, code, extra = "") => `<section class="page"><h2>${title}</h2><p class="lead">${lead}</p><div class="diagram"><pre class="mermaid">${code.trim()}</pre></div>${extra}</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FurFriends system design</title>
<style>
  @page { size: A4 landscape; margin: 11mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11pt/1.45 "Segoe UI", Arial, sans-serif; color: #1b1f1d; }
  .page { page-break-after: always; break-after: page; height: 182mm; overflow: hidden; display: flex; flex-direction: column; }
  section.page:last-of-type { page-break-after: auto; break-after: auto; }
  h1 { font-size: 30pt; margin: 0 0 4px; color: #123d33; letter-spacing: -0.5px; }
  h2 { font-size: 17pt; margin: 0 0 2px; color: #123d33; border-bottom: 2px solid #ffc94d; padding-bottom: 4px; }
  .lead { margin: 6px 0 8px; color: #4a524e; font-size: 10.5pt; }
  .diagram { flex: none; height: 142mm; }
  .diagram .mermaid { width: 100%; height: 100%; margin: 0; }
  .diagram svg { width: 100% !important; height: 100% !important; max-width: none !important; }
  .cover { justify-content: center; }
  .cover .sub { font-size: 14pt; color: #4a524e; margin: 0 0 22px; }
  .cover .tag { display: inline-block; background: #123d33; color: #fff; border-radius: 6px; padding: 3px 10px; font-size: 10pt; margin-bottom: 14px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 8px; }
  .card { border: 1px solid #ded7cb; border-radius: 8px; padding: 10px 12px; background: #fbf8f3; }
  .card b { color: #123d33; display: block; margin-bottom: 3px; }
  .card span { font-size: 10pt; color: #3b423f; }
  table { width: 100%; border-collapse: collapse; font-size: 9.2pt; }
  th { text-align: left; background: #123d33; color: #fff; padding: 5px 8px; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5dfd4; vertical-align: top; }
  td.k { font-weight: 700; color: #123d33; white-space: nowrap; }
  tr:nth-child(even) td { background: #faf7f1; }
  ul { margin: 6px 0 0 18px; padding: 0; } li { margin: 4px 0; }
  .note { margin-top: 8px; font-size: 9.5pt; color: #5b625e; }
  .foot { margin-top: auto; padding-top: 6px; font-size: 8.5pt; color: #7a817c; }
</style></head><body>

<section class="page cover">
  <span class="tag">System design</span>
  <h1>FurFriends</h1>
  <p class="sub">System architecture, database (ERD) and flows</p>
  <p>FurFriends is an installable web app where cat and dog owners in the Philippines keep their pets' health records, get care reminders, read first-aid guides, find nearby vet clinics, and ask the FurFriends AI, in English or Tagalog.</p>
  <div class="cols">
    <div class="card"><b>What owners can do</b><span>Keep profiles, medical history, vaccinations and documents for each pet; plan feeding and care with reminders; read first-aid and breed guides; find nearby vet clinics with hours and directions; ask the assistant.</span></div>
    <div class="card"><b>How it is built</b><span>A React web app that works offline, a Supabase backend with private per-owner data, push reminders, and the team's own trained AI, running in a free Vercel function.</span></div>
    <div class="card"><b>What this document shows</b><span>1. Architecture 2. Technology 3. ERD and data dictionary 4. Flows: sign-in and sync, the assistant, reminders, research data, deployment 5. Security and limits.</span></div>
  </div>
  <p class="note">Live at furfriends-black.vercel.app. The database section matches supabase/migrations: 14 tables, 15 relationships (checked against the live project on 2026-10-24; ai_usage added 2026-10-28, clinic_search_cache 2026-10-29). Document date: 2026-10-29.</p>
</section>

${figure("1. System architecture", "Three places do the work: the owner's device (app, offline cache and the search), Vercel (serves the app and runs the AI that writes answers) and Supabase (accounts, data, files, sync, reminders and the AI's usage limit).", architecture())}

<section class="page"><h2>2. Technology and why</h2><p class="lead">Each layer and the reason it was chosen.</p>
${table(["Layer", "Technology", "Why"], stack)}
</section>

${diagram("3. Entity relationship diagram (1 of 2): owners, pets and their records", "Every owner owns pets, and every health record, document, schedule and task belongs to a pet. Key columns are shown; the data dictionary lists every table.", erdPets, `<p class="note">PK = primary key, FK = foreign key, UK = unique. Deleting an account deletes its pets, and deleting a pet deletes everything under it.</p>`)}

${diagram("3. Entity relationship diagram (2 of 2): accounts, reminders and research", "The profile, reminder devices, survey answers and assistant ratings hang off the owner's login. A rating may also point to the pet it was about.", erdAccount, `<p class="note">Ratings keep their question and answer if the pet is deleted (the pet link is cleared). One profile per login; the profile shares the login's id. clinic_search_cache stands alone: shared saved clinic searches that only the find-clinics function writes.</p>`)}

<section class="page"><h2>4. Data dictionary</h2><p class="lead">14 tables in the public schema, plus Supabase's own auth.users. Every table has Row Level Security on.</p>
${table(["Table", "One row is", "Key", "Rules"], dictionary)}
<p class="note">Not in the database on purpose: the first-aid guides, breed guide and the assistant's answers are built into the app, so they work offline. There is no clinics table: nearby clinics come live from TomTom, and clinic_search_cache only keeps each search for a week.</p>
</section>

${diagram("5. Flow: sign-in, loading and sync", "How an owner's data reaches the screen, stays private, and appears on a second device.", flowSync)}

${figure("6. Flow: asking the assistant", "Rules run first. Then the device finds the 2 closest checked passages, and FurFriends' own model on Vercel writes the answer from them. If it can't, the closest checked answer shows, only when it is close enough.", assistantFlow())}

${diagram("7. Flow: reminder notifications", "A schedule in the database wakes an edge function every 5 minutes. Reminders arrive even when the app is closed.", flowReminders)}

${figure("8. Flow: research data and improving the assistant", "Survey answers and ratings are collected from real testers only, then used to measure usability and to fix wrong answers.", researchFlow())}

${figure("9. Flow: deployment", "Code and data go through local checks, then GitHub, then Vercel. Database changes are SQL migrations applied to Supabase.", deployFlow())}

<section class="page"><h2>10. Security, privacy and limits</h2>
<div style="display:grid;grid-template-columns:1.35fr 1fr;gap:18px;margin-top:6px">
<div>${table(["Area", "How it is handled"], security)}</div>
<div><b style="color:#123d33">Limits to state honestly</b><ul>${limits.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>
</div>
<p class="foot">FurFriends system design. Generated by scripts/system-design.mjs.</p>
</section>

<script src="${MERMAID}"></script>
<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "base", fontFamily: "Segoe UI, Arial, sans-serif",
    themeVariables: { primaryColor: "#e3f1ec", primaryBorderColor: "#1f6f5a", primaryTextColor: "#123d33", lineColor: "#5b625e", fontSize: "16px" },
    flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 30, rankSpacing: 42, useMaxWidth: false }, sequence: { mirrorActors: false, wrap: true, useMaxWidth: false, width: 170, messageFontSize: 15, noteFontSize: 14, actorFontSize: 15 }, er: { useMaxWidth: false, fontSize: 15, minEntityWidth: 150, entityPadding: 14, layoutDirection: "TB" } });
</script>
</body></html>`;

const htmlPath = join(OUT_DIR, "FurFriends-system-design.html");
writeFileSync(htmlPath, html);
console.log(`HTML → ${htmlPath}`);

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (chrome) {
  const pdfPath = join(OUT_DIR, "FurFriends-system-design.pdf");
  const tmp = mkdtempSync(join(tmpdir(), "furfriends-pdf-"));
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=30000",
    `--user-data-dir=${join(tmp, "c")}`, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 180000 });
  console.log(r.status === 0 && existsSync(pdfPath) ? `PDF → ${pdfPath}` : "PDF not made (open the HTML in a browser and print it, landscape A4).");
} else console.log("Chrome not found: open the HTML in a browser and print it, landscape A4.");
