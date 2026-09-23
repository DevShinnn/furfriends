import { useState } from "react";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import { PetForm } from "../components/Forms";
import { PetCard, EmptyPets } from "../components/PetBits";
import Icon from "../components/Icon";
import { plural } from "../lib/utils";

export default function Pets() {
  const { pets } = useStore();
  const { openModal } = useUI();
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("All");

  const query = q.trim().toLowerCase();
  const list = pets.filter((p) =>
    (species === "All" || p.species === species) &&
    (!query || [p.name, p.breed].some((x) => (x || "").toLowerCase().includes(query))));
  const count = (s) => pets.filter((p) => s === "All" || p.species === s).length;
  const add = () => openModal(<PetForm />);

  return (
    <>
      <div className="topbar">
        <div><h1>My Pets</h1><p>{plural(pets.length, "pet profile")} · tap a pet to see their records and documents</p></div>
        <div className="actions"><button className="btn btn-primary" onClick={add}><Icon name="plus" /> Add pet</button></div>
      </div>
      {pets.length ? (
        <>
          <div className="toolbar">
            <div className="search"><Icon name="search" /><input className="input" placeholder="Search by name or breed" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="chips">
              {["All", "Cat", "Dog"].map((s) => (
                <button key={s} className={`chip ${species === s ? "on" : ""}`} onClick={() => setSpecies(s)}>
                  {s === "All" ? "All pets" : s + "s"} <span className="n">{count(s)}</span>
                </button>
              ))}
            </div>
          </div>
          {list.length ? (
            <div className="pet-grid">
              {list.map((p) => <PetCard key={p.id} pet={p} />)}
              <button className="add-card" onClick={add}><div><div className="ic"><Icon name="plus" size={24} /></div><b>Add a pet</b><small>Cat or dog</small></div></button>
            </div>
          ) : <div className="card empty small">No pets match your search.</div>}
        </>
      ) : <div className="card"><EmptyPets /></div>}
    </>
  );
}
