import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase";
import { ageText } from "../src/lib/utils";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

/* Saving, changing and deleting pets in the store (the database writes it makes). Form checks are in uc02-pet-forms. */

beforeEach(() => supabase.reset());

async function loggedIn() {
  withAccount(supabase);
  const s = await renderStore();
  await run(() => s.current.login("owner@example.com", "secret123"));
  return s;
}
const mochi = { name: "Mochi", species: "Cat", breed: "Puspin", ageYears: 2, ageMonths: 3, gender: "Female", weight: 4.2, photo: null };

describe("UC2 Manage Pet Profile", () => {
  it("[FR2.1] Adding a pet shows it at once and saves it to the database with the right columns", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    expect(s.current.pets.map((p) => p.name)).toEqual(["Mochi"]);
    expect(calls("pets", "insert")[0].payload).toEqual({
      id, name: "Mochi", species: "Cat", breed: "Puspin", age_years: 2, age_months: 3, gender: "Female", weight_kg: 4.2, photo_path: null,
    });
  });

  it("[FR2.1] A pet photo is uploaded to private storage under the owner's folder", async () => {
    const s = await loggedIn();
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    const id = await run(() => s.current.addPet({ ...mochi, photo }));
    const up = supabase.state.storage.find((x) => x.op === "upload");
    expect(up.bucket).toBe("pet-photos");
    expect(up.args[0]).toMatch(new RegExp(`^user-1/${id}/.+\\.jpg$`));
    expect(calls("pets", "insert")[0].payload.photo_path).toBe(up.args[0]);
  });

  it("[FR2.1] A pet with no weight is saved with an empty weight (null), not 0", async () => {
    const s = await loggedIn();
    await run(() => s.current.addPet({ ...mochi, weight: "" }));
    expect(calls("pets", "insert")[0].payload.weight_kg).toBeNull();
  });

  it("[FR2.2] Editing a pet updates its profile on screen and in the database", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.updatePet(id, { name: "Mochi Jr", weight: 4.5 }));
    expect(s.current.getPet(id)).toMatchObject({ name: "Mochi Jr", weight: 4.5 });
    const upd = calls("pets", "update")[0];
    expect(upd.payload).toMatchObject({ name: "Mochi Jr", weight_kg: 4.5 });
    expect(upd.filters).toEqual([["id", id]]);
  });

  it("[FR2.3] Deleting a pet removes it, its database row, and its photos and documents in storage", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.deletePet(id));
    expect(s.current.pets).toEqual([]);
    expect(calls("pets", "delete")[0].filters).toEqual([["id", id]]);
    const removed = supabase.state.storage.filter((x) => x.op === "remove").map((x) => x.bucket).sort();
    expect(removed).toEqual(["pet-documents", "pet-photos"]);
  });

  it("[FR2.4] A medical record is saved to medical_records under the pet", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.upsertItem(id, "medical", { date: "2026-10-01", type: "Checkup", title: "Annual exam", vet: "Dr. Cruz", notes: "" }));
    expect(s.current.getPet(id).medical).toHaveLength(1);
    expect(calls("medical_records", "upsert")[0].payload).toMatchObject({ pet_id: id, date: "2026-10-01", type: "Checkup", title: "Annual exam", vet: "Dr. Cruz" });
  });

  it("[FR2.4] A vaccination is saved with its next due date; an empty next due date is saved as null", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.upsertItem(id, "vaccinations", { name: "Rabies", dateGiven: "2026-10-01", nextDue: "2027-10-01", vet: "", lot: "" }));
    await run(() => s.current.upsertItem(id, "vaccinations", { name: "FVRCP", dateGiven: "2026-10-01", nextDue: "", vet: "", lot: "" }));
    const rows = calls("vaccinations", "upsert").map((c) => c.payload);
    expect(rows[0]).toMatchObject({ name: "Rabies", date_given: "2026-10-01", next_due: "2027-10-01" });
    expect(rows[1]).toMatchObject({ name: "FVRCP", next_due: null });
  });

  it("[FR2.4] A PDF document is uploaded to the documents bucket as a .pdf file", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.upsertItem(id, "documents", { title: "Lab result", type: "Lab result", date: "2026-10-01", notes: "", src: "data:application/pdf;base64,JVBERi0" }));
    const up = supabase.state.storage.find((x) => x.op === "upload" && x.bucket === "pet-documents");
    expect(up.args[0]).toMatch(/\.pdf$/);
    expect(calls("documents", "upsert")[0].payload).toMatchObject({ mime_type: "application/pdf", file_path: up.args[0] });
  });

  it("[FR2.4] Removing a record deletes it from the screen and the database", async () => {
    const s = await loggedIn();
    const id = await run(() => s.current.addPet(mochi));
    await run(() => s.current.upsertItem(id, "medical", { date: "2026-10-01", type: "Illness", title: "Cough", vet: "", notes: "" }));
    const recId = s.current.getPet(id).medical[0].id;
    await run(() => s.current.removeItem(id, "medical", recId));
    expect(s.current.getPet(id).medical).toEqual([]);
    expect(calls("medical_records", "delete")[0].filters).toEqual([["id", recId]]);
  });

  it("[FR2.1] Age is shown in years and months ('2 yrs 3 mo', '1 yr', '5 mo', or '—' when unknown)", () => {
    expect(ageText({ ageYears: 2, ageMonths: 3 })).toBe("2 yrs 3 mo");
    expect(ageText({ ageYears: 1, ageMonths: 0 })).toBe("1 yr");
    expect(ageText({ ageYears: 0, ageMonths: 5 })).toBe("5 mo");
    expect(ageText({ ageYears: "", ageMonths: "" })).toBe("—");
  });
});
