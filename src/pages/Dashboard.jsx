import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import { PetForm, DocForm } from "../components/Forms";
import { PetCard, PetThumb, EmptyPets, StatusPill, DocThumb } from "../components/PetBits";
import Icon from "../components/Icon";
import { UpcomingList } from "./Care";
import { ApptRow } from "./Appointments";
import { AppointmentForm } from "../components/CareForms";
import { appointments } from "../lib/care";
import { vaxStatus, fmtDate, plural, byDateDesc } from "../lib/utils";

function Stat({ icon, bg, fg, num, label, to }) {
  return (
    <Link className="stat" to={to}>
      <div className="top"><div className="ic" style={{ background: bg, color: fg }}><Icon name={icon} /></div><Icon name="arrowR" className="arrow" /></div>
      <div className="num">{num}</div><div className="lbl">{label}</div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, pets } = useStore();
  const { openModal, openViewer } = useUI();
  const navigate = useNavigate();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const allVax = pets.flatMap((p) => p.vaccinations.map((v) => ({ ...v, pet: p, st: vaxStatus(v) })));
  const reminders = allVax.filter((v) => v.st.days !== null && v.st.days <= 60).sort((a, b) => a.st.days - b.st.days);
  const dueCount = allVax.filter((v) => v.st.key === "danger" || v.st.key === "warn").length;
  const recentMed = pets.flatMap((p) => p.medical.map((m) => ({ ...m, pet: p }))).sort(byDateDesc).slice(0, 4);
  const docs = pets.flatMap((p) => p.documents.map((d) => ({ ...d, pet: p }))).sort(byDateDesc);
  const recentDocs = docs.slice(0, 4);
  const medCount = pets.reduce((n, p) => n + p.medical.length, 0);
  const names = pets.map((p) => p.name);
  const visits = appointments(pets).upcoming.slice(0, 3);
  const nameList = names.length > 1 ? names.slice(0, -1).join(", ") + " & " + names.at(-1) : names[0];

  return (
    <>
      <section className="welcome">
        <div>
          <h1>{greet}, <em className="serif">{user.name.split(" ")[0]}</em></h1>
          <p>{pets.length
            ? <>{nameList} {pets.length === 1 ? "is" : "are"} counting on you.{" "}
                {dueCount ? <b style={{ color: "var(--sun)" }}>{plural(dueCount, "vaccine")} need{dueCount === 1 ? "s" : ""} attention.</b> : "Everyone's vaccines are up to date."}</>
            : "Add your first pet to get started."}</p>
          <div className="cta">
            <button className="btn btn-coral" onClick={() => openModal(<PetForm />)}><Icon name="plus" /> Add pet</button>
            {pets.length > 0 && <button className="btn btn-ghost-w" onClick={() => openModal(<DocForm />)}><Icon name="upload" size={16} /> Upload document</button>}
            <Link className="btn btn-ghost-w" to="/app/assistant"><Icon name="sparkle" size={16} /> Ask FurFriends</Link>
            <Link className="btn btn-ghost-w" to="/app/clinics"><Icon name="pin" size={16} /> Find a vet</Link>
          </div>
        </div>
        {pets.length > 0 && (
          <div className="pets-row">
            {pets.slice(0, 5).map((p) => (
              <button key={p.id} onClick={() => navigate(`/app/pets/${p.id}`)} title={p.name} aria-label={`Open ${p.name}`}>
                {p.photo ? <img src={p.photo} alt="" /> : <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)" }}><Icon name={p.species === "Cat" ? "cat" : "dog"} /></span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="stats">
        <Stat icon="paw" bg="var(--primary-soft)" fg="var(--primary)" num={pets.length} label="Pets" to="/app/pets" />
        <Stat icon="clip" bg="var(--lilac-soft)" fg="var(--cat)" num={medCount} label="Medical records" to="/app/pets" />
        <Stat icon="file" bg="var(--coral-soft)" fg="var(--coral-2)" num={docs.length} label="Documents stored" to="/app/pets" />
        <Stat icon="syringe" bg={dueCount ? "var(--danger-soft)" : "var(--ok-soft)"} fg={dueCount ? "var(--danger)" : "var(--ok)"} num={dueCount} label="Vaccines due / overdue" to="/app/pets" />
      </div>

      <div className="dash-grid">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Your pets</h3><Link to="/app/pets" className="link-more">View all <Icon name="arrowR" /></Link></div>
            {pets.length ? <div className="pet-grid compact">{pets.slice(0, 4).map((p) => <PetCard key={p.id} pet={p} />)}</div> : <EmptyPets />}
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Recent documents</h3>
              {pets.length > 0 && <button className="link-more" style={{ background: "none", border: 0, padding: 0 }} onClick={() => openModal(<DocForm />)}><Icon name="plus" size={14} /> Upload</button>}
            </div>
            {recentDocs.length ? (
              <div className="doc-row">
                {recentDocs.map((d, i) => (
                  <button key={d.id} className="doc-card sm" aria-label={`Open ${d.title}`}
                    onClick={() => openViewer(recentDocs.map((x) => ({ petId: x.pet.id, docId: x.id })), i)}>
                    <span className="thumb"><DocThumb doc={d} /></span>
                    <span className="meta"><b>{d.title}</b><small>{d.pet.name} · {fmtDate(d.date)}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className="empty small">No documents yet.</div>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Today's care</h3></div>
            <UpcomingList pets={pets} horizon={0} only={["Overdue", "Today"]} limit={7} />
          </div>
          <div className="card">
            <div className="card-head"><h3>Vet visits</h3><Link to="/app/appointments" className="link-more">All visits <Icon name="arrowR" /></Link></div>
            {visits.length
              ? <div className="appt-list">{visits.map((x) => <ApptRow key={x.t.id} {...x} compact />)}</div>
              : <div className="empty small">No visits booked.{pets.length > 0 && <> <button className="linkish" onClick={() => openModal(<AppointmentForm />)}>Book one</button></>}</div>}
          </div>
          <div className="card">
            <div className="card-head"><h3>Vaccine reminders</h3><span className="pill neutral">Next 60 days</span></div>
            {reminders.length ? (
              <div className="list">
                {reminders.map((v) => (
                  <Link key={v.id} className="list-item" to={`/app/pets/${v.pet.id}?tab=vaccines`}>
                    <PetThumb pet={v.pet} />
                    <div className="grow"><b>{v.name} · {v.pet.name}</b><small>Due {fmtDate(v.nextDue)}</small></div>
                    <StatusPill s={v.st} />
                  </Link>
                ))}
              </div>
            ) : <div className="empty small">All caught up — nothing due soon.</div>}
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent vet visits</h3></div>
            {recentMed.length ? (
              <div className="list">
                {recentMed.map((m) => (
                  <Link key={m.id} className="list-item" to={`/app/pets/${m.pet.id}?tab=medical`}>
                    <PetThumb pet={m.pet} />
                    <div className="grow"><b>{m.title}</b><small>{m.pet.name} · {fmtDate(m.date)}</small></div>
                    <span className="pill neutral">{m.type}</span>
                  </Link>
                ))}
              </div>
            ) : <div className="empty small">No medical records yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
