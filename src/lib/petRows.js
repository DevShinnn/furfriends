/* Pet rows: the database's snake_case rows ↔ the app's camelCase pets. Shared by the store (store/StoreContext.jsx)
   and the scripts that read or write pets in Supabase (scripts/training-pets.mjs), so they read pets the same way. */

export const TABLES = { medical: "medical_records", vaccinations: "vaccinations", documents: "documents", feeding: "feeding_schedules", care: "care_tasks" };
const hhmm = (t) => (t ? t.slice(0, 5) : "");
export const orNull = (v) => (v === "" || v == null ? null : v);

export const FROM = {
  medical: (r) => ({ id: r.id, date: r.date, type: r.type, title: r.title, vet: r.vet, notes: r.notes }),
  vaccinations: (r) => ({ id: r.id, name: r.name, dateGiven: r.date_given, nextDue: r.next_due || "", vet: r.vet, lot: r.lot }),
  documents: (r) => ({ id: r.id, title: r.title, type: r.type, date: r.date, notes: r.notes, filePath: r.file_path, mimeType: r.mime_type, src: null }),
  feeding: (r) => ({ id: r.id, time: hhmm(r.time), food: r.food, amount: r.amount, days: r.days || [], notes: r.notes }),
  care: (r) => ({ id: r.id, kind: r.kind, title: r.title, nextDue: r.next_due, dueTime: hhmm(r.due_time), repeatDays: r.repeat_days, lastDone: r.last_done, done: r.done, notes: r.notes }),
  weights: (r) => ({ id: r.id, date: r.weighed_on, kg: Number(r.weight_kg) }),
};
export const TO = {
  medical: (x) => ({ date: x.date, type: x.type, title: x.title, vet: x.vet || "", notes: x.notes || "" }),
  vaccinations: (x) => ({ name: x.name, date_given: x.dateGiven, next_due: orNull(x.nextDue), vet: x.vet || "", lot: x.lot || "" }),
  documents: (x) => ({ title: x.title, type: x.type, date: x.date, notes: x.notes || "", file_path: x.filePath, mime_type: x.mimeType || "image/jpeg" }),
  feeding: (x) => ({ time: x.time, food: x.food, amount: x.amount || "", days: x.days || [], notes: x.notes || "" }),
  care: (x) => ({ kind: x.kind, title: x.title, next_due: x.nextDue, due_time: orNull(x.dueTime), repeat_days: Number(x.repeatDays) || 0, last_done: orNull(x.lastDone), done: !!x.done, notes: x.notes || "" }),
  weights: (x) => ({ weighed_on: x.date, weight_kg: Number(x.kg) }),
};
export const petToDb = (p) => ({
  name: p.name, species: p.species, breed: p.breed || "", age_years: Number(p.ageYears) || 0, age_months: Number(p.ageMonths) || 0,
  gender: p.gender || null, weight_kg: orNull(p.weight),
});

/* A pet and everything recorded about it, in one query. The weight history is read on its own (petWeights), so the
   app still works on a database without the weight_log table yet (migration 20261112000000_weight_log.sql). */
export const PET_SELECT = "*, medical_records(*), vaccinations(*), documents(*), feeding_schedules(*), care_tasks(*), feeding_log(feeding_id, fed_on)";

export function petFromRow(r) {
  const fedLog = {};
  for (const l of r.feeding_log || []) (fedLog[l.fed_on] ||= []).push(l.feeding_id);
  return {
    id: r.id, ownerId: r.owner_id, createdAt: Date.parse(r.created_at),
    name: r.name, species: r.species, breed: r.breed, ageYears: r.age_years, ageMonths: r.age_months,
    gender: r.gender || "", weight: r.weight_kg == null ? "" : Number(r.weight_kg),
    photoPath: r.photo_path, photo: null,
    medical: (r.medical_records || []).map(FROM.medical),
    vaccinations: (r.vaccinations || []).map(FROM.vaccinations),
    documents: (r.documents || []).map(FROM.documents),
    feeding: (r.feeding_schedules || []).map(FROM.feeding),
    care: (r.care_tasks || []).map(FROM.care),
    weights: [],
    fedLog,
  };
}

/* Adds each pet's weight history (oldest first). Resolves to false if the weight_log table isn't there yet. */
export async function petWeights(db, pets) {
  if (!pets.length) return true;
  const { data, error } = await db.from("weight_log").select("id, pet_id, weighed_on, weight_kg").in("pet_id", pets.map((p) => p.id)).order("weighed_on");
  if (error) return false;
  const byPet = new Map(pets.map((p) => [p.id, p]));
  for (const r of data || []) byPet.get(r.pet_id)?.weights.push(FROM.weights(r));
  for (const p of pets) p.weights.sort((a, b) => a.date.localeCompare(b.date));
  return true;
}
