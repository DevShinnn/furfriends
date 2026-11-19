/* Puts the demo pets into a real account on the server. Used by the demo account's
   "Reset demo data" button (in the browser) and by scripts/seed-sample-accounts.mjs (in Node),
   so both always build the same data.

   `files` turns the sample assets in public/ into something storage accepts:
     files.photo("/assets/pets/mochi-1.jpg") → JPEG (Blob or Buffer)
     files.doc("/assets/docs/bori-invoice.svg") → PNG, or null to skip; storage takes no SVG. */
import { demoPets } from "./demoData";
import { newId } from "./utils";

const orNull = (v) => (v === "" || v == null ? null : v);
const check = ({ error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

/* Deletes every pet in the signed-in account, with its photos and documents. */
export async function clearPets(db, uid) {
  const old = await db.from("pets").select("id");
  check(old, "list pets");
  for (const { id } of old.data) {
    for (const bucket of ["pet-photos", "pet-documents"]) {
      const files = await db.storage.from(bucket).list(`${uid}/${id}`);
      if (files.data?.length) await db.storage.from(bucket).remove(files.data.map((f) => `${uid}/${id}/${f.name}`));
    }
  }
  if (old.data.length) check(await db.from("pets").delete().in("id", old.data.map((p) => p.id)), "delete pets");
}

/* Adds the named demo pets (all four if `names` is empty) to the signed-in account. Dates are
   relative to today, so due vaccines and upcoming appointments are always current. */
export const addDemoPets = (db, uid, files, names = []) => addPets(db, uid, demoPets(uid).filter((p) => !names.length || names.includes(p.name)), files);

/* Adds pets (as the app holds them) with all their records to the signed-in account. Also used for the AI's training
   pets (scripts/training-pets.mjs), which have no photos or documents (files can then be null).
   `id` keeps a pet's own id if it has one that should stay (the training pets' ids decide training vs. evaluation). */
export async function addPets(db, uid, pets, files) {
  for (const p of pets) {
    const petId = p.keepId && p.id ? p.id : newId();
    let photo_path = null;
    if (p.photo && files) {
      photo_path = `${uid}/${petId}/${newId()}.jpg`;
      check(await db.storage.from("pet-photos").upload(photo_path, await files.photo(p.photo), { contentType: "image/jpeg" }), "photo");
    }
    check(await db.from("pets").insert({
      id: petId, name: p.name, species: p.species, breed: p.breed, age_years: p.ageYears, age_months: p.ageMonths,
      gender: p.gender || null, weight_kg: orNull(p.weight), photo_path,
    }), `pet ${p.name}`);

    const rows = async (table, list) => { if (list.length) check(await db.from(table).insert(list), table); };
    await rows("medical_records", p.medical.map((x) => ({ pet_id: petId, date: x.date, type: x.type, title: x.title, vet: x.vet || "", notes: x.notes || "" })));
    await rows("vaccinations", p.vaccinations.map((x) => ({ pet_id: petId, name: x.name, date_given: x.dateGiven, next_due: orNull(x.nextDue), vet: x.vet || "", lot: x.lot || "" })));

    const docs = [];
    for (const d of files ? p.documents : []) {
      const png = await files.doc(d.src);
      if (!png) continue;
      const file_path = `${uid}/${petId}/${newId()}.png`;
      check(await db.storage.from("pet-documents").upload(file_path, png, { contentType: "image/png" }), "document file");
      docs.push({ pet_id: petId, title: d.title, type: d.type, date: d.date, notes: d.notes || "", file_path, mime_type: "image/png" });
    }
    await rows("documents", docs);

    // Feeding plans get database ids, and the 2-week meal log moves onto them.
    const mealId = new Map(p.feeding.map((m) => [m.id, newId()]));
    await rows("feeding_schedules", p.feeding.map((m) => ({ id: mealId.get(m.id), pet_id: petId, time: m.time, food: m.food, amount: m.amount || "", days: m.days || [], notes: m.notes || "" })));
    await rows("feeding_log", Object.entries(p.fedLog).flatMap(([day, ids]) => ids.map((id) => ({ feeding_id: mealId.get(id), pet_id: petId, fed_on: day }))));
    await rows("care_tasks", p.care.map((x) => ({ pet_id: petId, kind: x.kind, title: x.title, next_due: x.nextDue, due_time: orNull(x.dueTime),
      repeat_days: Number(x.repeatDays) || 0, last_done: orNull(x.lastDone), done: !!x.done, notes: x.notes || "" })));
    // Earlier weights. (Today's is already saved by the database when the pet is added.) Skipped on a database
    // without the weight_log table yet (migration 20261112000000_weight_log.sql).
    if (p.weights?.length) {
      const r = await db.from("weight_log").upsert(p.weights.map((w) => ({ pet_id: petId, weighed_on: w.date, weight_kg: w.kg })), { onConflict: "pet_id,weighed_on" });
      if (r.error && !/weight_log/.test(r.error.message || "")) check(r, "weights");
    }
  }
}

/* In the browser: photos as they are, documents drawn from SVG onto a canvas as PNG. */
export const browserFiles = {
  photo: async (src) => (await fetch(src)).blob(),
  doc: (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 850; canvas.height = img.naturalHeight || 1100;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = src;
  }),
};
