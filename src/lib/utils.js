export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const todayISO = () => localISO(new Date());
export const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localISO(d); };
export const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
};
export const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
export const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const peso = (n) => "₱" + Number(n).toLocaleString("en-PH");

// Demo-grade hash so plain passwords are not sitting in localStorage.
// Not a substitute for server-side bcrypt/argon2.
export const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "h" + h.toString(16) + s.length; };

export const ageText = (p) => {
  const y = Number(p.ageYears) || 0, m = Number(p.ageMonths) || 0;
  if (!y && !m) return "—";
  const parts = [];
  if (y) parts.push(`${y} yr${y > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} mo`);
  return parts.join(" ");
};

export const vaxStatus = (v) => {
  const d = daysUntil(v.nextDue);
  if (d === null) return { key: "neutral", label: "No booster", days: null };
  if (d < 0) return { key: "danger", label: `Overdue ${-d}d`, days: d };
  if (d <= 30) return { key: "warn", label: d === 0 ? "Due today" : `Due in ${d}d`, days: d };
  return { key: "ok", label: "Up to date", days: d };
};

export const petVaxSummary = (pet) => {
  const s = (pet.vaccinations || []).map(vaxStatus);
  if (s.some((x) => x.key === "danger")) return { key: "danger", label: "Vaccine overdue" };
  if (s.some((x) => x.key === "warn")) return { key: "warn", label: "Vaccine due soon" };
  if (s.length) return { key: "ok", label: "Vaccines up to date" };
  return { key: "neutral", label: "No vaccines yet" };
};

export const byDateDesc = (a, b) => b.date.localeCompare(a.date);

/* PDFs are stored as they are (no compression), up to the storage bucket's 10 MB limit. */
export const PDF_MAX = 10 * 1024 * 1024;
export const mimeOf = (src) => (typeof src === "string" && src.startsWith("data:") ? src.slice(5, src.indexOf(";")) : null);
// A newly picked file (data URL) wins over the saved type, so replacing a PDF with a photo shows the photo.
export const isPdf = (doc) => (mimeOf(doc?.src) || doc?.mimeType) === "application/pdf";
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Resize images client-side so they fit in localStorage.
export function compressImage(file, max = 1100, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("Not an image"));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unreadable image"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // flatten transparent scans onto white
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const VACCINES = {
  Cat: ["FVRCP", "Rabies", "FeLV", "Chlamydia"],
  Dog: ["DHPP", "Rabies", "Bordetella", "Leptospirosis", "Canine Influenza", "Lyme"],
};
export const MED_TYPES = ["Checkup", "Illness", "Injury", "Surgery", "Medication", "Allergy", "Other"];
export const DOC_TYPES = ["Vaccination certificate", "Lab result", "Prescription", "Invoice / receipt", "X-ray / imaging", "Microchip / registration", "Insurance", "Other"];
export const DOC_COLORS = {
  "Vaccination certificate": "ok", "Lab result": "cat", "Prescription": "warn", "Invoice / receipt": "neutral",
  "X-ray / imaging": "dog", "Microchip / registration": "ok", "Insurance": "cat", "Other": "neutral",
};
