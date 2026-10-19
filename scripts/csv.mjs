/* Minimal CSV reader and writer for the scripts (quoted fields, doubled quotes, newlines inside
   quotes). Reads files from Excel, Google Sheets and Supabase's "Export to CSV". */
import { readFileSync } from "node:fs";

export function readCsv(path) {
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

const cell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* UTF-8 with a BOM, so Excel shows accented and Tagalog text correctly. */
export const toCsv = (columns, rows) =>
  "﻿" + [columns, ...rows.map((r) => columns.map((c) => r[c]))].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
