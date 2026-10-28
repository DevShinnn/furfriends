import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { Modal, useUI } from "../components/UIContext";
import { PetThumb, StatusPill } from "../components/PetBits";
import Icon from "../components/Icon";
import { GUIDES, CATEGORIES, RED_FLAGS, NORMALS, FIRST_AID_KIT, findGuide, categoryOf } from "../lib/emergency";
import { ageText, fmtDate, vaxStatus, byDateDesc } from "../lib/utils";

const Urgency = ({ g }) => g.urgency === "now"
  ? <span className="pill danger"><span className="dot" />Go to a vet now</span>
  : <span className="pill warn"><span className="dot" />Call your vet</span>;

const Disclaimer = () => (
  <p className="em-disclaimer"><Icon name="info" size={15} /> First aid only. It doesn't replace a vet, so always get your pet checked after an emergency.</p>
);

/* Buttons that open each pet's emergency card. */
function CardButtons({ light }) {
  const { pets } = useStore();
  const { openModal } = useUI();
  if (!pets.length) return null;
  return (
    <div className="em-cards">
      {pets.map((p) => (
        <button key={p.id} className={`btn btn-sm ${light ? "em-card-btn" : "btn-soft"}`} onClick={() => openModal(<EmergencyCard pet={p} />)}>
          <PetThumb pet={p} size={22} /> {p.name}'s card
        </button>
      ))}
    </div>
  );
}

/* ================================================================ list */
export default function Emergency() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const [cat, setCat] = useState("all");
  const list = GUIDES.filter((g) => (cat === "all" || g.category === cat)
    && (!query || [g.title, g.summary, categoryOf(g).label, ...g.signs].some((x) => x.toLowerCase().includes(query))));
  const groups = CATEGORIES.map((c) => ({ ...c, guides: list.filter((g) => g.category === c.key) })).filter((c) => c.guides.length);

  return (
    <>
      <section className="em-hero">
        <div className="em-hero-ic"><Icon name="firstaid" size={28} /></div>
        <div className="grow">
          <h1>Emergency</h1>
          <p>If your pet is in danger, <b>call your vet or the nearest 24-hour animal hospital now</b>. Use these steps while you get there.</p>
          <div className="em-cards" style={{ marginBottom: 8 }}>
            <Link className="btn btn-sm em-card-btn" to="/app/clinics"><Icon name="pin" size={16} /> Find a vet near me</Link>
          </div>
          <CardButtons light />
          <small>Show the emergency card to the vet: allergies, medicines and vaccines in one place.</small>
        </div>
      </section>

      <div className="em-grid">
        <section className="card em-flags">
          <div className="card-head"><h3><Icon name="alert" size={18} /> Go to a vet now if you see</h3></div>
          <ul>{RED_FLAGS.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>

        <section>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search"><Icon name="search" /><input className="input" placeholder="Search: poison, bleeding, heat…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="chips em-cats" role="group" aria-label="Emergency type">
            <button className={`chip sm ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")} aria-pressed={cat === "all"}>All types</button>
            {CATEGORIES.map((c) => (
              <button key={c.key} className={`chip sm ${cat === c.key ? "on" : ""}`} onClick={() => setCat(cat === c.key ? "all" : c.key)} aria-pressed={cat === c.key}>
                <Icon name={c.icon} size={13} />{c.label}
              </button>
            ))}
          </div>
          {groups.length ? groups.map((c) => (
            <div className="em-group" key={c.key}>
              <h4 className="em-group-head"><Icon name={c.icon} size={15} />{c.label}<span>{c.guides.length}</span></h4>
              <div className="guide-grid">
                {c.guides.map((g) => (
                  <Link key={g.slug} className={`guide-card u-${g.urgency}`} to={`/app/emergency/${g.slug}`}>
                    <span className="guide-ic"><Icon name={g.icon} size={20} /></span>
                    <span className="grow">
                      <b>{g.title}{g.species !== "both" && <span className="pill neutral">{g.species}s</span>}</b>
                      <small>{g.summary}</small>
                    </span>
                    <Icon name="chevR" size={18} className="guide-go" />
                  </Link>
                ))}
              </div>
            </div>
          )) : <div className="card empty small">No guide matches “{q}”{cat !== "all" && " in this type"}. If you're unsure, call your vet.</div>}
        </section>
      </div>

      <div className="em-grid em-ref">
        <section className="card">
          <div className="card-head"><h3>Know what's normal</h3></div>
          <dl className="em-normals">{NORMALS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="care-hint" style={{ margin: "12px 0 0" }}>Check these when your pet is healthy and relaxed, so you know their normal.</p>
        </section>
        <section className="card">
          <div className="card-head"><h3>Pet first-aid kit</h3></div>
          <ul className="em-kit">{FIRST_AID_KIT.map((x) => <li key={x}><Icon name="check" size={13} />{x}</li>)}</ul>
        </section>
      </div>
      <Disclaimer />
    </>
  );
}

/* ================================================================ one guide */
export function EmergencyGuide() {
  const { slug } = useParams();
  const g = findGuide(slug);
  if (!g) {
    return (
      <div className="card empty">
        <h3>Guide not found</h3>
        <Link className="btn btn-primary" to="/app/emergency">All emergency guides</Link>
      </div>
    );
  }
  const c = categoryOf(g);
  // Same-type guides first, then the rest.
  const others = GUIDES.filter((x) => x.slug !== g.slug).sort((a, b) => (b.category === g.category) - (a.category === g.category));
  return (
    <article className="guide">
      <Link className="back-link" style={{ marginBottom: 18 }} to="/app/emergency"><Icon name="arrowL" /> Emergency guides</Link>
      <header className={`guide-head u-${g.urgency}`}>
        <span className="guide-ic lg"><Icon name={g.icon} size={26} /></span>
        <div className="grow">
          <div className="guide-tags"><Urgency g={g} /><span className="pill neutral"><Icon name={c.icon} size={12} /> {c.label}</span>{g.species !== "both" && <span className="pill neutral">{g.species}s</span>}</div>
          <h1>{g.title}</h1>
          <p>{g.summary}</p>
        </div>
      </header>

      <div className="guide-body">
        <section className="card guide-steps">
          <h3>What to do now</h3>
          <ol>{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        <div className="stack">
          <section className="card">
            <h3>Signs to look for</h3>
            <ul className="guide-list">{g.signs.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
          <section className="card guide-avoid">
            <h3><Icon name="close" size={17} /> Don't</h3>
            <ul className="guide-list">{g.avoid.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
          {(g.lists || []).map((l) => (
            <section className="card" key={l.title}>
              <h3>{l.title}</h3>
              <ul className="guide-list">{l.items.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          ))}
          {g.note && <section className="card guide-note"><Icon name="info" size={18} /><p>{g.note}</p></section>}
        </div>
      </div>

      <section className="card guide-cardbar">
        <div><b>Heading to the vet?</b><small>Open your pet's emergency card to show the vet.</small></div>
        <CardButtons />
      </section>

      <div className="guide-others">
        <div className="nav-label" style={{ padding: 0, color: "var(--ink-3)", opacity: 1 }}>Other guides</div>
        <div className="chips">{others.map((x) => <Link key={x.slug} className="chip sm" to={`/app/emergency/${x.slug}`}>{x.title}</Link>)}</div>
      </div>
      <Disclaimer />
    </article>
  );
}

/* ================================================================ emergency card
   Everything an unfamiliar vet needs at a glance, pulled from the pet's records. */
export function EmergencyCard({ pet }) {
  const { user } = useStore();
  const { closeModal } = useUI();
  const med = [...pet.medical].sort(byDateDesc);
  const allergies = med.filter((m) => m.type === "Allergy");
  const meds = med.filter((m) => m.type === "Medication");
  const history = med.filter((m) => ["Illness", "Injury", "Surgery"].includes(m.type)).slice(0, 4);
  const vet = med.find((m) => m.vet)?.vet;
  const vax = [...pet.vaccinations].sort((a, b) => b.dateGiven.localeCompare(a.dateGiven));
  const facts = [pet.species, pet.breed, pet.gender, ageText(pet) !== "—" && ageText(pet), pet.weight && `${pet.weight} kg`].filter(Boolean);

  const Item = ({ m }) => <li><b>{m.title}</b><small>{fmtDate(m.date)}{m.notes ? ` · ${m.notes}` : ""}</small></li>;

  return (
    <Modal title="Emergency card" onSubmit={closeModal}
      footer={<><Link className="btn btn-ghost" to={`/app/pets/${pet.id}`}>Open profile</Link><button className="btn btn-primary" type="submit">Close</button></>}>
      <div className="ec-head">
        <PetThumb pet={pet} size={64} />
        <div><h2>{pet.name}</h2><small>{facts.join(" · ")}</small></div>
      </div>
      <div className="ec-grid">
        <div className="ec-box danger">
          <h4><Icon name="alert" size={15} /> Allergies</h4>
          {allergies.length ? <ul>{allergies.map((m) => <Item key={m.id} m={m} />)}</ul> : <p>None recorded</p>}
        </div>
        <div className="ec-box">
          <h4><Icon name="pill" size={15} /> Medication</h4>
          {meds.length ? <ul>{meds.map((m) => <Item key={m.id} m={m} />)}</ul> : <p>None recorded</p>}
        </div>
        <div className="ec-box">
          <h4><Icon name="clip" size={15} /> Recent conditions &amp; surgery</h4>
          {history.length ? <ul>{history.map((m) => <Item key={m.id} m={m} />)}</ul> : <p>None recorded</p>}
        </div>
        <div className="ec-box">
          <h4><Icon name="syringe" size={15} /> Vaccines</h4>
          {vax.length
            ? <ul>{vax.map((v) => <li key={v.id} className="ec-vax"><span><b>{v.name}</b><small>Given {fmtDate(v.dateGiven)}</small></span><StatusPill s={vaxStatus(v)} /></li>)}</ul>
            : <p>None recorded</p>}
        </div>
      </div>
      <dl className="ec-contacts">
        <div><dt>Owner</dt><dd>{user.name}{user.phone && <> · <a href={`tel:${user.phone.replace(/\s+/g, "")}`}>{user.phone}</a></>}</dd></div>
        {vet && <div><dt>Usual vet</dt><dd>{vet}</dd></div>}
      </dl>
    </Modal>
  );
}
