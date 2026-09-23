import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useUI } from "./UIContext";
import { PetForm, useDeletePet } from "./Forms";
import { ageText, petVaxSummary, plural, DOC_COLORS } from "../lib/utils";

export const PetThumb = ({ pet, size }) => (
  <div className={`pet-thumb ${pet.species === "Cat" ? "cat" : "dog"}`} style={size ? { width: size, height: size } : undefined}>
    {pet.photo ? <img src={pet.photo} alt="" loading="lazy" /> : <Icon name={pet.species === "Cat" ? "cat" : "dog"} size={20} />}
  </div>
);

export const SpeciesPill = ({ species, glass }) => (
  <span className={`pill ${glass ? "glass" : species === "Cat" ? "cat" : "dog"}`}>
    <Icon name={species === "Cat" ? "cat" : "dog"} size={14} /> {species}
  </span>
);

export const StatusPill = ({ s }) => <span className={`pill ${s.key}`}><span className="dot" />{s.label}</span>;
export const DocPill = ({ type }) => <span className={`pill ${DOC_COLORS[type] || "neutral"}`}>{type}</span>;

export const PetPlaceholder = ({ species, size = 56 }) => (
  <div className="ph" style={species === "Cat" ? { background: "var(--cat-soft)", color: "var(--cat)" } : { background: "var(--dog-soft)", color: "var(--dog)" }}>
    <Icon name={species === "Cat" ? "cat" : "dog"} size={size} />
  </div>
);

export function PetCard({ pet }) {
  const navigate = useNavigate();
  const { openModal } = useUI();
  const deletePet = useDeletePet();
  const s = petVaxSummary(pet);
  const n = pet.documents.length;
  const open = () => navigate(`/app/pets/${pet.id}`);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <article className="pet-card" tabIndex={0} role="link" aria-label={`Open ${pet.name}`}
      onClick={open} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()}>
      <div className="cover">
        {pet.photo ? <img src={pet.photo} alt={pet.name} loading="lazy" /> : <PetPlaceholder species={pet.species} />}
        <div className="overlay-top">
          <SpeciesPill species={pet.species} glass />
          <div className="tools">
            <button className="icon-btn glass" title="Edit" aria-label={`Edit ${pet.name}`} onClick={stop(() => openModal(<PetForm pet={pet} />))}><Icon name="edit" /></button>
            <button className="icon-btn glass danger" title="Delete" aria-label={`Delete ${pet.name}`} onClick={stop(() => deletePet(pet))}><Icon name="trash" /></button>
          </div>
        </div>
        {n > 0 && <span className="pcount"><Icon name="file" size={13} /> {plural(n, "doc")}</span>}
      </div>
      <div className="body">
        <div><h3>{pet.name}</h3><div className="breed">{pet.breed || "Unknown breed"}</div></div>
        <div className="meta"><span>{ageText(pet)}</span><span>{pet.gender || "—"}</span><span>{pet.weight ? `${pet.weight} kg` : "—"}</span></div>
        <div className="foot"><StatusPill s={s} /></div>
      </div>
    </article>
  );
}

export function EmptyPets() {
  const { openModal } = useUI();
  return (
    <div className="empty">
      <div className="ic"><Icon name="paw" size={32} /></div>
      <h3>No pets yet</h3>
      <p>Add your first cat or dog to start their profile.</p>
      <button className="btn btn-primary" onClick={() => openModal(<PetForm />)}><Icon name="plus" /> Add your first pet</button>
    </div>
  );
}
