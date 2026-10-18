import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import { PetForm, DocForm, MedForm, VaxForm, useDeletePet, useDeleteDoc } from "../components/Forms";
import { SpeciesPill, StatusPill, DocPill, DocThumb } from "../components/PetBits";
import Icon from "../components/Icon";
import { PetCarePanel } from "./Care";
import { EmergencyCard } from "./Emergency";
import { breedFor } from "../lib/breeds";
import { ageText, fmtDate, petVaxSummary, vaxStatus, byDateDesc } from "../lib/utils";

const TABS = [["medical", "clip", "Medical history"], ["vaccines", "syringe", "Vaccinations"], ["care", "bowl", "Feeding & care"], ["documents", "file", "Documents"]];

export default function PetDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { getPet } = useStore();
  const pet = getPet(id);
  if (!pet) {
    return (
      <div className="card empty">
        <h3>Pet not found</h3><p>It may have been deleted.</p>
        <Link className="btn btn-primary" to="/app/pets">Back to My Pets</Link>
      </div>
    );
  }
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "medical";
  return <PetView pet={pet} tab={tab} setTab={(t) => setParams({ tab: t }, { replace: true })} />;
}

function PetView({ pet, tab, setTab }) {
  const { openModal } = useUI();
  const deletePet = useDeletePet();
  const s = petVaxSummary(pet);
  const counts = { medical: pet.medical.length, vaccines: pet.vaccinations.length, care: (pet.feeding || []).length + (pet.care || []).filter((t) => !t.done).length, documents: pet.documents.length };
  const edit = () => openModal(<PetForm pet={pet} />);
  const breed = breedFor(pet);

  return (
    <>
      <section className="pet-hero">
        {pet.photo
          ? <img src={pet.photo} alt={pet.name} />
          : <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,.3)" }}><Icon name={pet.species === "Cat" ? "cat" : "dog"} size={120} /></div>}
        <div className="ph-top">
          <Link className="btn btn-sm glass-btn" to="/app/pets"><Icon name="arrowL" /> All pets</Link>
          <button className="btn btn-sm glass-btn" onClick={edit}><Icon name="camera" size={15} /> {pet.photo ? "Change photo" : "Add photo"}</button>
        </div>
        <div className="ph-bottom">
          <div>
            <h1>{pet.name}</h1>
            <div className="tags"><SpeciesPill species={pet.species} glass /><span className="pill glass">{pet.breed || "Unknown breed"}</span><StatusPill s={s} /></div>
          </div>
          <div className="actions">
            <button className="btn btn-sm glass-btn" onClick={() => openModal(<EmergencyCard pet={pet} />)}><Icon name="idcard" /> Emergency card</button>
            <Link className="btn btn-sm glass-btn" to={`/app/assistant?pet=${pet.id}`} aria-label={`Ask about ${pet.name}`}><Icon name="chat" size={16} /><span className="ph-lbl"> Ask</span></Link>
            <button className="btn btn-sm glass-btn" onClick={edit} aria-label="Edit"><Icon name="edit" /><span className="ph-lbl"> Edit</span></button>
            <button className="btn btn-sm glass-btn" onClick={() => deletePet(pet, true)} aria-label="Delete"><Icon name="trash" /><span className="ph-lbl"> Delete</span></button>
          </div>
        </div>
      </section>

      <div className="facts">
        {[["Species", pet.species], ["Breed", pet.breed || "—"], ["Age", ageText(pet)], ["Gender", pet.gender || "—"], ["Weight", pet.weight ? `${pet.weight} kg` : "—"]].map(([k, v]) => (
          k === "Breed" && breed
            ? <Link className="fact fact-link" key={k} to={`/app/breeds/${breed.slug}`}><small>{k}</small><b>{v}</b><span>Breed guide <Icon name="arrowR" size={13} /></span></Link>
            : <div className="fact" key={k}><small>{k}</small><b>{v}</b></div>
        ))}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, icon, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <Icon name={icon} size={17} /> {label} <span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {tab === "medical" && <MedicalTab pet={pet} />}
        {tab === "vaccines" && <VaccinesTab pet={pet} />}
        {tab === "care" && <PetCarePanel pet={pet} />}
        {tab === "documents" && <DocumentsTab pet={pet} />}
      </div>
    </>
  );
}

function MedicalTab({ pet }) {
  const { openModal, confirm, toast } = useUI();
  const { removeItem } = useStore();
  const med = [...pet.medical].sort(byDateDesc);
  return (
    <>
      <div className="tab-head"><h3>Medical history</h3><button className="btn btn-primary btn-sm" onClick={() => openModal(<MedForm pet={pet} />)}><Icon name="plus" size={15} /> Add record</button></div>
      {med.length ? (
        <div className="timeline">
          {med.map((m) => (
            <div key={m.id} className={`tl-item type-${m.type.toLowerCase()}`}>
              <div className="tl-card">
                <div className="grow">
                  <div className="when"><Icon name="cal" /> {fmtDate(m.date)} <span className="pill neutral">{m.type}</span></div>
                  <h4>{m.title}</h4>
                  {m.vet && <small style={{ color: "var(--ink-3)" }}>{m.vet}</small>}
                  {m.notes && <p>{m.notes}</p>}
                </div>
                <button className="icon-btn" onClick={() => openModal(<MedForm pet={pet} rec={m} />)} aria-label="Edit record"><Icon name="edit" /></button>
                <button className="icon-btn danger" aria-label="Delete record" onClick={() => confirm({
                  title: "Delete medical record?", text: "This record will be removed from the pet's history.",
                  onConfirm: () => { removeItem(pet.id, "medical", m.id); toast("Record deleted"); },
                })}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="empty small"><p>No medical history recorded for {pet.name} yet.</p></div>}
    </>
  );
}

function VaccinesTab({ pet }) {
  const { openModal, confirm, toast } = useUI();
  const { removeItem } = useStore();
  const vax = [...pet.vaccinations].sort((a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"));
  return (
    <>
      <div className="tab-head"><h3>Vaccination records</h3><button className="btn btn-primary btn-sm" onClick={() => openModal(<VaxForm pet={pet} />)}><Icon name="plus" size={15} /> Add vaccine</button></div>
      {vax.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Vaccine</th><th>Date given</th><th>Next due</th><th>Status</th><th>Clinic</th><th /></tr></thead>
            <tbody>
              {vax.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.name}</b>{v.lot && <><br /><small style={{ color: "var(--ink-3)" }}>Lot {v.lot}</small></>}</td>
                  <td>{fmtDate(v.dateGiven)}</td>
                  <td>{fmtDate(v.nextDue)}</td>
                  <td><StatusPill s={vaxStatus(v)} /></td>
                  <td>{v.vet || "—"}</td>
                  <td className="actions">
                    <button className="icon-btn" onClick={() => openModal(<VaxForm pet={pet} rec={v} />)} aria-label="Edit vaccination"><Icon name="edit" /></button>
                    <button className="icon-btn danger" aria-label="Delete vaccination" onClick={() => confirm({
                      title: "Delete vaccination?", text: "This vaccination record will be removed.",
                      onConfirm: () => { removeItem(pet.id, "vaccinations", v.id); toast("Vaccination deleted"); },
                    })}><Icon name="trash" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty small"><p>No vaccinations recorded for {pet.name} yet.</p></div>}
    </>
  );
}

function DocumentsTab({ pet }) {
  const { openModal, openViewer } = useUI();
  const deleteDoc = useDeleteDoc();
  const docs = [...pet.documents].sort(byDateDesc);
  const upload = () => openModal(<DocForm petId={pet.id} />);
  const items = docs.map((d) => ({ petId: pet.id, docId: d.id }));
  return (
    <>
      <div className="tab-head"><h3>Documents</h3><button className="btn btn-coral btn-sm" onClick={upload}><Icon name="upload" size={15} /> Upload document</button></div>
      <div className="doc-grid">
        <button className="doc-add" onClick={upload}>
          <span><Icon name="camera" size={28} /><b>Add a document</b><small>Photo, scan or PDF of certificates, lab results, receipts…</small></span>
        </button>
        {docs.map((d, i) => (
          <div className="doc-card" key={d.id}>
            <button className="thumb" onClick={() => openViewer(items, i)} aria-label={`Open ${d.title}`}>
              <DocThumb doc={d} alt={d.title} /><span className="zoom"><Icon name="zoom" /></span>
            </button>
            <div className="meta">
              <div className="grow"><DocPill type={d.type} /><b>{d.title}</b><small><Icon name="cal" /> {fmtDate(d.date)}</small></div>
              <div className="acts">
                <button className="icon-btn" onClick={() => openModal(<DocForm petId={pet.id} doc={d} />)} aria-label="Edit document"><Icon name="edit" /></button>
                <button className="icon-btn danger" onClick={() => deleteDoc(pet, d)} aria-label="Delete document"><Icon name="trash" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

