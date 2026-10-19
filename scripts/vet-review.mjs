/* Builds the vet review pack: every piece of health content FurFriends shows pet owners, laid out
   for a veterinarian to check, correct and sign. Generated from the app's own source, so re-run it
   after any content change.

     node scripts/vet-review.mjs          → docs/vet-review/FurFriends-vet-review.html (+ .pdf if Chrome is found)
*/
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "vet-review");

/* ---------------------------------------------------------------- load the app's content */
const tmp = mkdtempSync(join(tmpdir(), "ff-vet-"));
const entry = join(tmp, "entry.js");
writeFileSync(entry, ["emergency", "breeds", "breedCare", "care", "utils", "knowledge"]
  .map((m) => `export * as ${m} from ${JSON.stringify(join(ROOT, "src/lib", m + ".js").replace(/\\/g, "/"))};`).join("\n"));
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: join(tmp, "content.mjs"), logLevel: "error" });
const { emergency, breeds, breedCare, care, utils, knowledge } = await import(pathToFileURL(join(tmp, "content.mjs")).href);

// The team's sample answers live with the AI server.
const jsonl = (f) => readFileSync(join(ROOT, "ai-server/data", f), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const samples = jsonl("sample_train.jsonl");
// Reference answers the AI is graded against (evaluate.py): the team's test set once it exists.
const tests = jsonl(existsSync(join(ROOT, "ai-server/data/test.jsonl")) ? "test.jsonl" : "sample_test.jsonl");
// Answers researched from public sources (ai-server/data/open/researched_qa.csv). The ones in the test set are in D.
const RESEARCHED = join(ROOT, "ai-server/data/open/researched_qa.csv");
const tested = new Set(tests.map((t) => t.messages.at(-2).content.trim()));
const researched = existsSync(RESEARCHED) ? readCsv(RESEARCHED).filter((r) => r.question && !tested.has(r.question.trim())) : [];

/* Minimal CSV reader (quoted fields, doubled quotes, newlines inside quotes). */
function readCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/* ---------------------------------------------------------------- html helpers */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const list = (items, tag = "ul") => items?.length ? `<${tag}>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</${tag}>` : "";
const review = (id) => `
  <div class="review" aria-label="Review ${id}">
    <span class="box">☐ OK</span><span class="box">☐ Change</span><span class="box">☐ Remove</span>
    <div class="lines"><span>Corrections:</span><i></i><i></i></div>
  </div>`;
const item = (id, title, body, meta = "") => `
  <section class="item">
    <header><span class="id">${id}</span><h3>${esc(title)}</h3>${meta}</header>
    <div class="content">${body}</div>
    ${review(id)}
  </section>`;
const para = (text) => text.split(/\n{2,}/).map((block) => {
  const lines = block.split("\n");
  if (lines.every((l) => /^- /.test(l))) return list(lines.map((l) => l.slice(2)));
  if (lines.slice(1).every((l) => /^- /.test(l)) && lines.length > 1) return `<p>${esc(lines[0])}</p>${list(lines.slice(1).map((l) => l.slice(2)))}`;
  return `<p>${lines.map(esc).join("<br>")}</p>`;
}).join("");

/* ---------------------------------------------------------------- sections */
const { GUIDES, CATEGORIES, RED_FLAGS, NORMALS, FIRST_AID_KIT } = emergency;
const urgency = (g) => g.urgency === "now" ? `<span class="tag now">Go to a vet now</span>` : `<span class="tag call">Call your vet</span>`;
const catLabel = (g) => CATEGORIES.find((c) => c.key === g.category)?.label || "";

const sectionA = `
  <h2 class="part">A. Emergency first aid</h2>
  <p class="lead">Shown on the Emergency page. Owners use these steps while getting to a vet, so check that nothing could delay care or cause harm.</p>
  ${item("A1", "“Go to a vet now if you see”", list(RED_FLAGS))}
  ${item("A2", "Normal values", `<table>${NORMALS.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`)}
  ${item("A3", "Pet first-aid kit", list(FIRST_AID_KIT))}
  ${GUIDES.map((g, i) => item(`A${i + 4}`, g.title, `
    <p class="summary">${esc(g.summary)}</p>
    <div class="cols">
      <div><h4>Signs to look for</h4>${list(g.signs)}</div>
      <div><h4>Don't</h4>${list(g.avoid)}</div>
    </div>
    <h4>What to do now</h4>${list(g.steps, "ol")}
    ${(g.lists || []).map((l) => `<h4>${esc(l.title)}</h4>${list(l.items)}`).join("")}
    ${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}`,
    `<span class="meta">${urgency(g)} <span class="tag">${esc(catLabel(g))}</span>${g.species !== "both" ? ` <span class="tag">${esc(g.species)}s only</span>` : ""}</span>`)).join("")}`;

const { BREED_DB, TRAITS } = breeds;
const { CARE_TOPICS } = breedCare;
const sectionB = `
  <h2 class="part">B. Breed guide</h2>
  <p class="lead">Shown in the Breed guide and on each pet's profile. The app also uses the weight range to tell owners whether their pet is “within the typical range”. Ratings are 1 (low) to 5 (high); “Handles heat” means tolerance of hot, humid weather.</p>
  ${BREED_DB.map((b, i) => item(`B${i + 1}`, `${b.name} (${b.species})`, `
    <p class="summary">${esc(b.summary)}</p>
    <table class="facts"><tr>
      <th>Weight</th><td>${b.weight[0]}–${b.weight[1]} kg</td><th>Lifespan</th><td>${b.life[0]}–${b.life[1]} yrs</td>
      <th>Size</th><td>${esc(b.size)}</td><th>Coat</th><td>${esc(b.coat)}</td>
    </tr></table>
    <p class="traits">${TRAITS.map(([k, label]) => `${esc(label)} <b>${b.traits[k]}/5</b>`).join(" · ")}</p>
    <div class="cols">
      <div><h4>Health watch-list</h4>${list(b.health)}</div>
      <div><h4>Care tips</h4>${list(b.tips)}</div>
    </div>
    ${b.care ? `<dl class="care">${CARE_TOPICS.map(([k, label]) => `<dt>${esc(label)}</dt><dd>${esc(b.care[k])}</dd>`).join("")}</dl>` : ""}`,
    b.aka?.length ? `<span class="meta">Also called ${esc(b.aka.join(", "))}</span>` : "")).join("")}`;

const sectionC = `
  <h2 class="part">C. Reminders and record-keeping</h2>
  <p class="lead">Suggestions offered when owners add vaccines and care tasks. Owners can type their own; these are only shortcuts.</p>
  ${item("C1", "Vaccine names offered", `<table>${Object.entries(utils.VACCINES).map(([s, v]) => `<tr><th>${s}s</th><td>${esc(v.join(", "))}</td></tr>`).join("")}</table>`)}
  ${item("C2", "Care task suggestions", `<table>${Object.entries(care.SUGGESTIONS).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v.join(", "))}</td></tr>`).join("")}</table>
    <p class="note">Deworming suggestions include brand names. Check that each is appropriate for the species owners would pick it for.</p>`)}`;

const sectionD = `
  <h2 class="part">D. AI assistant</h2>
  <p class="lead">The assistant finds the closest checked answer to the owner's question, using an open-source AI model on the owner's phone. It does not write its own answers. Below are its fixed safety messages, the team's example answers, and the reference answers its accuracy is graded against. Every answer in the app is labelled “It isn't a vet. In an emergency, go to a vet now.”</p>
  ${item("D1", "Fixed safety messages", `
    <h4>Shown for any question asking for a medicine dose</h4>${para(knowledge.DOSE_REPLY)}
    <h4>Added to answers about something a pet ate, licked or touched, if they don't already say to see a vet soon</h4><p>${esc(knowledge.POISON_NOTE)}</p>
    <h4>Added to answers about symptoms that don't already say to see a vet soon</h4><p>${esc(knowledge.VET_NOTE)}</p>`)}
  ${samples.map((s, i) => item(`D${i + 2}`, `Example answer: “${s.messages.at(-2).content}”`, `
    ${s.pet ? `<p class="meta-line">About: ${esc([s.pet.name, s.pet.species, s.pet.breed, s.pet.age, s.pet.weightKg && s.pet.weightKg + " kg"].filter(Boolean).join(", "))}</p>` : ""}
    ${para(s.messages.at(-1).content)}`)).join("")}
  ${tests.map((t, i) => item(`D${samples.length + i + 2}`, `Test answer: “${t.messages.at(-2).content}”`, `
    ${t.pet ? `<p class="meta-line">About: ${esc([t.pet.name, t.pet.species, t.pet.breed, t.pet.age, t.pet.weightKg && t.pet.weightKg + " kg"].filter(Boolean).join(", "))}</p>` : ""}
    ${para(t.messages.at(-1).content)}`, `<span class="meta"><span class="tag">Accuracy test · ${esc(t.category || "general")}</span></span>`)).join("")}`;

const CAT_LABEL = { emergency: "Emergencies", poison: "Poisoning", vaccines: "Vaccines", parasites: "Parasites",
  senior: "Senior pets", philippines: "Philippine rules", rabies: "Rabies" };
const sectionE = researched.length ? `
  <h2 class="part">E. Researched answers</h2>
  <p class="lead">Answers the team researched from public sources and wrote in plain words, for topics the open data barely covers. The assistant shows them to owners, so check each one against current veterinary practice. The source of each is listed under the question.</p>
  ${researched.map((r, i) => item(`E${i + 1}`, `“${r.question}”`, `
    ${para(r.answer)}
    <p class="meta-line">Source: ${esc(r.source)}</p>`, `<span class="meta"><span class="tag">${esc(CAT_LABEL[r.category] || r.category)}</span></span>`)).join("")}` : "";

const nD = 1 + samples.length + tests.length;
const nE = researched.length;
const count = 3 + GUIDES.length + BREED_DB.length + 2 + nD + nE;
const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FurFriends Vet Review</title>
<style>
  :root { --ink: #1b2421; --muted: #5d6763; --line: #cfd6d2; --accent: #1d6b56; --now: #b3261e; --call: #8a5a00; --paper: #ffffff; }
  @page { size: A4; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; }
  main { max-width: 190mm; margin: 0 auto; padding: 8mm 4mm; }
  h1 { font: 700 26pt/1.1 Georgia, "Times New Roman", serif; margin: 0 0 6px; letter-spacing: -0.01em; }
  h2.part { font: 700 17pt/1.2 Georgia, serif; margin: 0 0 4px; padding-top: 2mm; break-before: page; color: var(--accent); }
  h3 { font-size: 12pt; margin: 0; }
  h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 8px 0 3px; }
  p { margin: 4px 0; } ul, ol { margin: 2px 0 4px; padding-left: 18px; } li { margin: 1px 0; }
  .lead { color: var(--muted); max-width: 62em; margin-bottom: 10px; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; gap: 14px; }
  .cover .sub { font-size: 13pt; color: var(--muted); }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; margin-top: 10px; }
  .fields div { border-bottom: 1px solid var(--ink); padding-top: 18px; font-size: 9pt; color: var(--muted); }
  .how { border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; }
  .how ol { margin: 4px 0 0; }
  .item { border-top: 1.5px solid var(--ink); padding: 8px 0 10px; break-inside: avoid; }
  .item header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .id { font: 700 9pt ui-monospace, Consolas, monospace; background: var(--ink); color: var(--paper); padding: 1px 6px; border-radius: 3px; }
  .meta { font-size: 9pt; color: var(--muted); margin-left: auto; }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 3px; padding: 0 5px; font-size: 8.5pt; color: var(--muted); }
  .tag.now { border-color: var(--now); color: var(--now); font-weight: 700; }
  .tag.call { border-color: var(--call); color: var(--call); font-weight: 700; }
  .summary { font-style: italic; }
  .note { font-size: 9.5pt; color: var(--muted); border-left: 3px solid var(--line); padding-left: 8px; }
  .meta-line { font-size: 9pt; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
  table { border-collapse: collapse; margin: 4px 0; width: 100%; font-size: 9.5pt; }
  th, td { border: 1px solid var(--line); padding: 3px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f2; white-space: nowrap; }
  .traits { font-size: 9pt; color: var(--muted); }
  dl.care { display: grid; grid-template-columns: 22mm 1fr; gap: 2px 8px; margin: 6px 0 0; font-size: 9.5pt; }
  dl.care dt { font-weight: 700; } dl.care dd { margin: 0; }
  .review { margin-top: 8px; padding: 6px 8px; border: 1px dashed var(--muted); border-radius: 4px; display: grid; grid-template-columns: auto auto auto 1fr; gap: 4px 14px; align-items: end; font-size: 9.5pt; }
  .box { white-space: nowrap; font-weight: 600; }
  .lines { grid-column: 1 / -1; display: grid; gap: 22px; padding-top: 4px; }
  .lines span { font-size: 8.5pt; color: var(--muted); }
  .lines i { display: block; border-bottom: 1px solid var(--line); height: 0; }
  .signoff { break-before: page; }
  .signoff .stmt { border: 1.5px solid var(--ink); padding: 12px 14px; margin: 10px 0 18px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 30px; }
  .sign div { border-top: 1px solid var(--ink); padding-top: 4px; font-size: 9pt; color: var(--muted); margin-top: 26px; }
  footer.gen { margin-top: 14px; font-size: 8.5pt; color: var(--muted); }
  @media screen { body { background: #e9ecea; } main { background: var(--paper); margin: 16px auto; padding: 14mm; box-shadow: 0 2px 12px rgba(0,0,0,.12); } h2.part { margin-top: 18mm; } }
  @media (max-width: 640px) { .cols, .fields, .sign { grid-template-columns: 1fr; } main { padding: 16px; } }
</style></head>
<body><main>
  <section class="cover">
    <p class="sub">FurFriends · Capstone pilot · Content review</p>
    <h1>Veterinary review of pet health content</h1>
    <p>FurFriends is a pet health records app for cat and dog owners in the Philippines. It shows owners first-aid steps, breed care information and reminders, and includes a pilot AI assistant. This pack contains all of that content (${count} items), so a licensed veterinarian can check it before the app is tested with the public.</p>
    <div class="how">
      <b>How to review</b>
      <ol>
        <li>For each numbered item, tick <b>OK</b>, <b>Change</b> or <b>Remove</b>.</li>
        <li>For <b>Change</b>, write the correction on the lines (or mark up the text directly).</li>
        <li>Pay most attention to part A (emergency steps): anything that could delay getting to a vet or cause harm.</li>
        <li>Sign the last page. The team will update the app and send you a new pack to confirm.</li>
      </ol>
    </div>
    <div class="fields">
      <div>Reviewer name</div><div>PRC license no.</div>
      <div>Clinic / institution</div><div>Date received</div>
    </div>
    <p class="lead">Contents: A. Emergency first aid (${GUIDES.length + 3} items) · B. Breed guide (${BREED_DB.length}) · C. Reminders and record-keeping (2) · D. AI assistant (${nD})${nE ? ` · E. Researched answers (${nE})` : ""}</p>
  </section>
  ${sectionA}
  ${sectionB}
  ${sectionC}
  ${sectionD}
  ${sectionE}
  <section class="signoff">
    <h2 class="part" style="break-before:auto">Sign-off</h2>
    <div class="stmt">I have reviewed the content in this pack (items A1–A${GUIDES.length + 3}, B1–B${BREED_DB.length}, C1–C2, D1–D${nD}${nE ? `, E1–E${nE}` : ""}). Subject to the corrections I have marked, it is appropriate as general educational information for pet owners. It does not replace a veterinary examination.</div>
    <p>☐ Approved with no changes &nbsp;&nbsp; ☐ Approved after the marked changes are made &nbsp;&nbsp; ☐ Not approved (see comments)</p>
    <div class="sign"><div>Signature</div><div>Date</div><div>Printed name</div><div>PRC license no.</div></div>
    <h4 style="margin-top:22px">General comments</h4>
    <div class="lines" style="gap:22px"><i></i><i></i><i></i><i></i><i></i></div>
    <footer class="gen">Generated from the FurFriends source on ${esc(today)} by scripts/vet-review.mjs.</footer>
  </section>
</main></body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const htmlPath = join(OUT_DIR, "FurFriends-vet-review.html");
writeFileSync(htmlPath, html);
console.log(`${count} items → ${htmlPath}`);

/* ---------------------------------------------------------------- optional PDF via Chrome */
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (chrome) {
  const pdfPath = join(OUT_DIR, "FurFriends-vet-review.pdf");
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${join(tmp, "c")}`,
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 120000 });
  console.log(r.status === 0 && existsSync(pdfPath) ? `PDF → ${pdfPath}` : "PDF not made (open the HTML in a browser and print it instead).");
}
