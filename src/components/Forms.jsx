import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { Modal, useUI } from "./UIContext";
import Icon from "./Icon";
import { BREEDS, VACCINES, MED_TYPES, DOC_TYPES, compressImage, todayISO, plural } from "../lib/utils";

const useFields = (initial) => {
  const [v, setV] = useState(initial);
  const bind = (name) => ({ name, value: v[name] ?? "", onChange: (e) => setV((s) => ({ ...s, [name]: e.target.value })) });
  return [v, setV, bind];
};

const Cancel = () => { const { closeModal } = useUI(); return <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>; };

function Seg({ name, value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([val, icon]) => (
        <span key={val} style={{ display: "contents" }}>
          <input type="radio" id={`${name}-${val}`} name={name} value={val} checked={value === val} onChange={() => onChange(val)} />
          <label htmlFor={`${name}-${val}`}>{icon && <Icon name={icon} size={18} />}{val}</label>
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- pet */
export function PetForm({ pet }) {
  const { addPet, updatePet } = useStore();
  const { closeModal, toast } = useUI();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [v, setV, bind] = useFields(pet ? { ...pet } : { species: "Cat", gender: "Female" });

  async function pickPhoto(e) {
    const f = e.target.files[0]; if (!f) return;
    try { const photo = await compressImage(f, 900); setV((s) => ({ ...s, photo })); setError(""); }
    catch { setError("That file couldn't be read as an image."); }
  }

  function submit() {
    if (!(v.name || "").trim()) return setError("Please give your pet a name.");
    const ay = v.ageYears === "" || v.ageYears == null ? 0 : Number(v.ageYears);
    const am = v.ageMonths === "" || v.ageMonths == null ? 0 : Number(v.ageMonths);
    if (ay < 0 || am < 0 || am > 11) return setError("Age months must be between 0 and 11.");
    if (v.weight !== "" && v.weight != null && Number(v.weight) <= 0) return setError("Weight must be greater than 0.");
    const fields = {
      name: v.name.trim(), species: v.species, breed: (v.breed || "").trim(), ageYears: ay, ageMonths: am,
      gender: v.gender, weight: v.weight === "" || v.weight == null ? "" : Number(v.weight), photo: v.photo || null,
    };
    if (pet) {
      if (!updatePet(pet.id, fields)) return setError("Storage is full — try a smaller photo.");
      closeModal(); toast(`${fields.name}'s profile updated`);
    } else {
      const id = addPet(fields);
      if (!id) return setError("Storage is full — try a smaller photo.");
      closeModal(); toast(`${fields.name} added`); navigate(`/app/pets/${id}`);
    }
  }

  return (
    <Modal title={pet ? `Edit ${pet.name}` : "Add a new pet"} error={error} onSubmit={submit}
      footer={<><Cancel /><button className="btn btn-primary" type="submit">{pet ? "Save changes" : "Create profile"}</button></>}>
      <div className="field cover-pick">
        <div className="thumb">{v.photo ? <img src={v.photo} alt="" /> : <Icon name="camera" size={28} />}</div>
        <div>
          <label style={{ marginBottom: 2 }}>Profile photo</label>
          <div className="hint" style={{ margin: "0 0 8px" }}>A clear photo helps vets and sitters recognise your pet.</div>
          <label className="btn btn-soft btn-sm" style={{ display: "inline-flex", margin: 0 }}>
            <Icon name="upload" size={15} /> {v.photo ? "Change photo" : "Choose photo"}
            <input type="file" accept="image/*" hidden onChange={pickPhoto} />
          </label>
        </div>
      </div>
      <div className="field"><label htmlFor="f-name">Name *</label><input className="input" id="f-name" placeholder="e.g. Mochi" {...bind("name")} /></div>
      <div className="field"><label>Species *</label>
        <Seg name="species" value={v.species} options={[["Cat", "cat"], ["Dog", "dog"]]} onChange={(species) => setV((s) => ({ ...s, species }))} />
      </div>
      <div className="field"><label htmlFor="f-breed">Breed</label>
        <input className="input" id="f-breed" list="breed-list" placeholder="Start typing or pick one" {...bind("breed")} />
        <datalist id="breed-list">{BREEDS[v.species].map((b) => <option key={b} value={b} />)}</datalist>
      </div>
      <div className="row-3">
        <div className="field"><label htmlFor="f-ay">Age (years)</label><input className="input" id="f-ay" type="number" min="0" max="40" {...bind("ageYears")} /></div>
        <div className="field"><label htmlFor="f-am">Age (months)</label><input className="input" id="f-am" type="number" min="0" max="11" {...bind("ageMonths")} /></div>
        <div className="field"><label htmlFor="f-w">Weight (kg)</label><input className="input" id="f-w" type="number" min="0" step="0.1" {...bind("weight")} /></div>
      </div>
      <div className="field"><label>Gender *</label>
        <Seg name="gender" value={v.gender} options={[["Female"], ["Male"]]} onChange={(gender) => setV((s) => ({ ...s, gender }))} />
      </div>
    </Modal>
  );
}

export function useDeletePet() {
  const { deletePet } = useStore();
  const { confirm, toast } = useUI();
  const navigate = useNavigate();
  return (pet, redirect) => confirm({
    title: `Delete ${pet.name}?`, confirmLabel: "Delete profile",
    text: <>This permanently removes <b>{pet.name}</b>'s profile, including {plural(pet.medical.length, "medical record")}, {plural(pet.vaccinations.length, "vaccination")} and {plural(pet.documents.length, "document")}.</>,
    onConfirm: () => { deletePet(pet.id); toast(`${pet.name}'s profile deleted`); if (redirect) navigate("/app/pets"); },
  });
}

/* ---------------------------------------------------------------- documents */
export function DocForm({ petId, doc }) {
  const { pets, upsertItem, getPet } = useStore();
  const { closeModal, toast } = useUI();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [v, setV, bind] = useFields(doc ? { ...doc, pet: petId } : { pet: petId || pets[0]?.id, type: DOC_TYPES[0], date: todayISO(), title: "", notes: "" });

  async function take(file) {
    if (!file || !file.type.startsWith("image/")) return setError("Please choose an image (photo or scan).");
    try {
      const src = await compressImage(file, 1600, 0.82); // keep documents legible
      setError("");
      setV((s) => ({ ...s, src, title: s.title || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") }));
    } catch { setError("That file couldn't be read as an image."); }
  }

  function submit() {
    if (!v.src) return setError("Add a photo or scan of the document.");
    if (!v.title.trim()) return setError("Please give the document a title.");
    const item = { id: doc?.id, src: v.src, title: v.title.trim(), type: v.type, date: v.date || todayISO(), notes: (v.notes || "").trim() };
    if (!upsertItem(v.pet, "documents", item)) return setError("Browser storage is full — try a smaller image.");
    closeModal();
    if (doc) toast("Document updated");
    else { toast(`Saved to ${getPet(v.pet).name}'s documents`); navigate(`/app/pets/${v.pet}?tab=documents`); }
  }

  return (
    <Modal title={doc ? "Edit document" : "Upload a document"} error={error} onSubmit={submit}
      footer={<><Cancel /><button className="btn btn-coral" type="submit">{doc ? "Save changes" : <><Icon name="upload" size={16} /> Save document</>}</button></>}>
      {!doc && (
        <div className="field"><label htmlFor="u-pet">Pet</label>
          <select className="select" id="u-pet" {...bind("pet")}>{pets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.species})</option>)}</select>
        </div>
      )}
      <label className={`dropzone ${v.src ? "has-file" : ""} ${over ? "over" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
        <span className="dz-preview">{v.src && <img src={v.src} alt="" />}</span>
        <span className="dz-empty">
          <span className="ic"><Icon name="camera" size={24} /></span>
          <b>Take a photo or drop a scan here</b><small>JPG or PNG · click to browse</small>
        </span>
        <input type="file" accept="image/*" capture="environment" id="u-file" onChange={(e) => take(e.target.files[0])} />
      </label>
      <div className="field" style={{ marginTop: 16 }}><label htmlFor="u-title">Title *</label><input className="input" id="u-title" placeholder="e.g. Rabies certificate 2026" {...bind("title")} /></div>
      <div className="row">
        <div className="field"><label htmlFor="u-type">Type</label><select className="select" id="u-type" {...bind("type")}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="u-date">Document date</label><input className="input" id="u-date" type="date" max={todayISO()} {...bind("date")} /></div>
      </div>
      <div className="field"><label htmlFor="u-notes">Notes</label><input className="input" id="u-notes" placeholder="Optional" {...bind("notes")} /></div>
    </Modal>
  );
}

export function useDeleteDoc() {
  const { removeItem } = useStore();
  const { confirm, toast } = useUI();
  return (pet, doc) => confirm({
    title: "Delete this document?", confirmLabel: "Delete document",
    text: <>“{doc.title}” will be removed from {pet.name}'s documents.</>,
    onConfirm: () => { removeItem(pet.id, "documents", doc.id); toast("Document deleted"); },
  });
}

/* ---------------------------------------------------------------- medical */
export function MedForm({ pet, rec }) {
  const { upsertItem } = useStore();
  const { closeModal, toast } = useUI();
  const [error, setError] = useState("");
  const [v, , bind] = useFields(rec ? { ...rec } : { date: todayISO(), type: "Checkup", title: "", vet: "", notes: "" });
  function submit() {
    if (!v.date || !v.title.trim()) return setError("Date and title are required.");
    upsertItem(pet.id, "medical", { id: rec?.id, date: v.date, type: v.type, title: v.title.trim(), vet: v.vet.trim(), notes: v.notes.trim() });
    closeModal(); toast(rec ? "Record updated" : "Medical record added");
  }
  return (
    <Modal title={rec ? "Edit medical record" : `Add medical record · ${pet.name}`} error={error} onSubmit={submit}
      footer={<><Cancel /><button className="btn btn-primary" type="submit">{rec ? "Save" : "Add record"}</button></>}>
      <div className="row">
        <div className="field"><label htmlFor="m-date">Date *</label><input className="input" id="m-date" type="date" max={todayISO()} {...bind("date")} /></div>
        <div className="field"><label htmlFor="m-type">Type *</label><select className="select" id="m-type" {...bind("type")}>{MED_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="m-title">Title / diagnosis *</label><input className="input" id="m-title" placeholder="e.g. Annual wellness exam" {...bind("title")} /></div>
      <div className="field"><label htmlFor="m-vet">Vet / clinic</label><input className="input" id="m-vet" placeholder="e.g. Dr. Santos · Maple Vet Clinic" {...bind("vet")} /></div>
      <div className="field"><label htmlFor="m-notes">Notes</label><textarea className="textarea" id="m-notes" placeholder="Treatment, medication, follow-up…" {...bind("notes")} /></div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- vaccinations */
export function VaxForm({ pet, rec }) {
  const { upsertItem } = useStore();
  const { closeModal, toast } = useUI();
  const [error, setError] = useState("");
  const [v, , bind] = useFields(rec ? { ...rec } : { name: "", dateGiven: todayISO(), nextDue: "", vet: "", lot: "" });
  function submit() {
    if (!v.name.trim() || !v.dateGiven) return setError("Vaccine name and date given are required.");
    if (v.nextDue && v.nextDue <= v.dateGiven) return setError("Next due date must be after the date given.");
    upsertItem(pet.id, "vaccinations", { id: rec?.id, name: v.name.trim(), dateGiven: v.dateGiven, nextDue: v.nextDue, vet: v.vet.trim(), lot: v.lot.trim() });
    closeModal(); toast(rec ? "Vaccination updated" : "Vaccination added");
  }
  return (
    <Modal title={rec ? "Edit vaccination" : `Add vaccination · ${pet.name}`} error={error} onSubmit={submit}
      footer={<><Cancel /><button className="btn btn-primary" type="submit">{rec ? "Save" : "Add vaccination"}</button></>}>
      <div className="field"><label htmlFor="v-name">Vaccine *</label>
        <input className="input" id="v-name" list="vax-list" placeholder={`e.g. ${VACCINES[pet.species][0]}`} {...bind("name")} />
        <datalist id="vax-list">{VACCINES[pet.species].map((x) => <option key={x} value={x} />)}</datalist>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="v-given">Date given *</label><input className="input" id="v-given" type="date" max={todayISO()} {...bind("dateGiven")} /></div>
        <div className="field"><label htmlFor="v-due">Next due</label><input className="input" id="v-due" type="date" {...bind("nextDue")} /><div className="hint">Leave blank if no booster needed</div></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="v-vet">Clinic</label><input className="input" id="v-vet" {...bind("vet")} /></div>
        <div className="field"><label htmlFor="v-lot">Lot / batch no.</label><input className="input" id="v-lot" {...bind("lot")} /></div>
      </div>
    </Modal>
  );
}
