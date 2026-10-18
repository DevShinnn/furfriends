import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { PetThumb, SpeciesPill } from "../components/PetBits";
import Icon from "../components/Icon";
import { BREED_DB, TRAITS, findBreed, breedFor, range } from "../lib/breeds";
import { CARE_TOPICS } from "../lib/breedCare";

const Meter = ({ n, label }) => (
  <span className="meter" role="img" aria-label={`${label}: ${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}
  </span>
);

const BreedMark = ({ b, size = 48 }) => (
  <span className={`breed-mark ${b.species === "Cat" ? "cat" : "dog"}`} style={{ width: size, height: size }}>
    <Icon name={b.species === "Cat" ? "cat" : "dog"} size={Math.round(size * 0.55)} />
  </span>
);

/* ================================================================ list */
export default function Breeds() {
  const { pets } = useStore();
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState("All");
  const mine = new Set(pets.map((p) => breedFor(p)?.slug).filter(Boolean));
  const query = q.trim().toLowerCase();
  const list = BREED_DB.filter((b) =>
    (species === "All" || (species === "Mine" ? mine.has(b.slug) : b.species === species)) &&
    (!query || [b.name, ...b.aka].some((x) => x.toLowerCase().includes(query))));
  const filters = [["All", "All breeds"], ["Dog", "Dogs"], ["Cat", "Cats"], ...(mine.size ? [["Mine", "My pets' breeds"]] : [])];

  return (
    <>
      <div className="topbar">
        <div><h1>Breed guide</h1><p>Care tips, health problems to watch for, and how each breed copes with hot weather.</p></div>
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" /><input className="input" placeholder="Search breeds" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          {filters.map(([k, label]) => <button key={k} className={`chip ${species === k ? "on" : ""}`} onClick={() => setSpecies(k)}>{label}</button>)}
        </div>
      </div>
      {list.length ? (
        <div className="breed-grid">
          {list.map((b) => (
            <Link key={b.slug} className="breed-card" to={`/app/breeds/${b.slug}`}>
              <div className="bc-top">
                <BreedMark b={b} size={44} />
                <div className="grow"><b>{b.name}</b><small>{b.size} · {range(b.weight, "kg")}</small></div>
                {mine.has(b.slug) && <span className="pill ok">Your pet</span>}
              </div>
              <p>{b.summary}</p>
              <div className="bc-traits">
                <span><small>Energy</small><Meter n={b.traits.energy} label="Energy" /></span>
                <span><small>Handles heat</small><Meter n={b.traits.heat} label="Handles heat" /></span>
              </div>
            </Link>
          ))}
        </div>
      ) : <div className="card empty small">No breeds match. Mixed-breed dogs are under <b>Aspin</b> and mixed-breed cats under <b>Puspin</b>.</div>}
      <p className="em-disclaimer"><Icon name="info" size={15} /> Typical ranges for healthy adults. Every pet is different, so ask your vet what's right for yours.</p>
    </>
  );
}

/* ================================================================ one breed */
export function BreedDetail() {
  const { slug } = useParams();
  const { pets } = useStore();
  const b = findBreed(slug);
  if (!b) {
    return (
      <div className="card empty">
        <h3>Breed not found</h3>
        <Link className="btn btn-primary" to="/app/breeds">All breeds</Link>
      </div>
    );
  }
  const yours = pets.filter((p) => breedFor(p)?.slug === b.slug);
  const others = BREED_DB.filter((x) => x.species === b.species && x.slug !== b.slug);
  const weightNote = (p) => {
    if (!p.weight) return "No weight recorded yet";
    const [lo, hi] = b.weight;
    if (p.weight < lo || p.weight > hi) return `${p.weight} kg, outside the typical ${range(b.weight, "kg")}. Ask your vet if that's right for ${p.name}.`;
    return `${p.weight} kg, within the typical ${range(b.weight, "kg")}`;
  };

  return (
    <>
      <Link className="back-link" style={{ marginBottom: 18 }} to="/app/breeds"><Icon name="arrowL" /> Breed guide</Link>
      <header className="breed-head">
        <BreedMark b={b} size={72} />
        <div className="grow">
          <div className="guide-tags"><SpeciesPill species={b.species} /><span className="pill neutral">{b.origin}</span></div>
          <h1>{b.name}</h1>
          {b.aka.length > 0 && <small className="breed-aka">Also called {b.aka.join(", ")}</small>}
          <p>{b.summary}</p>
        </div>
      </header>

      <div className="facts breed-facts">
        {[["Size", b.size], ["Weight", range(b.weight, "kg")], ["Lifespan", range(b.life, "yrs")], ["Coat", b.coat]].map(([k, v]) => (
          <div className="fact" key={k}><small>{k}</small><b>{v}</b></div>
        ))}
      </div>

      {yours.length > 0 && (
        <section className="card" style={{ marginBottom: 22 }}>
          <div className="card-head"><h3>Your {b.name}{yours.length > 1 ? "s" : ""}</h3></div>
          <div className="list">
            {yours.map((p) => (
              <Link key={p.id} className="list-item" to={`/app/pets/${p.id}`}>
                <PetThumb pet={p} />
                <div className="grow"><b>{p.name}</b><small>{weightNote(p)}</small></div>
                <Icon name="chevR" size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {b.care && (
        <div className="breed-care">
          {CARE_TOPICS.map(([k, label, icon]) => (
            <section className="card" key={k}>
              <h3><span className={`breed-care-ic t-${k}`}><Icon name={icon} size={17} /></span>{label}</h3>
              <p>{b.care[k]}</p>
            </section>
          ))}
        </div>
      )}

      <div className="breed-body">
        <section className="card">
          <h3>At a glance</h3>
          <dl className="trait-list">
            {TRAITS.map(([k, label]) => <div key={k}><dt>{label}</dt><dd><Meter n={b.traits[k]} label={label} /></dd></div>)}
          </dl>
        </section>
        <section className="card">
          <h3><Icon name="stetho" size={18} /> Health watch-list</h3>
          <ul className="guide-list">{b.health.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <section className="card">
          <h3><Icon name="sun" size={18} /> Care tips</h3>
          <ul className="guide-list">{b.tips.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      </div>

      <div className="guide-others">
        <div className="nav-label" style={{ padding: 0, color: "var(--ink-3)", opacity: 1 }}>Other {b.species.toLowerCase()} breeds</div>
        <div className="chips">{others.map((x) => <Link key={x.slug} className="chip sm" to={`/app/breeds/${x.slug}`}>{x.name}</Link>)}</div>
      </div>
      <p className="em-disclaimer"><Icon name="info" size={15} /> Typical ranges for healthy adults. Every pet is different, so ask your vet what's right for yours.</p>
    </>
  );
}
