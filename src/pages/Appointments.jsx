import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import { AppointmentForm, useCompleteCare, useDeleteCare } from "../components/CareForms";
import { PetThumb, EmptyPets } from "../components/PetBits";
import Icon from "../components/Icon";
import { appointments, fmtTime } from "../lib/care";
import { daysUntil, plural } from "../lib/utils";

/* Vet appointments across all pets, as a plain agenda: upcoming, then ones that need an
   update (date passed but not marked done), then past visits. */
export default function Appointments() {
  const { pets } = useStore();
  const { openModal } = useUI();
  const [petId, setPetId] = useState("all");
  const shown = petId === "all" ? pets : pets.filter((p) => p.id === petId);
  const { upcoming, past } = appointments(shown);
  const overdue = past.filter((x) => !x.t.done);
  const done = past.filter((x) => x.t.done);
  const book = () => openModal(<AppointmentForm petId={petId === "all" ? undefined : petId} />);

  return (
    <>
      <div className="topbar">
        <div><h1>Vet appointments</h1><p>Book visits, get them on your care list, and log what the vet said afterwards.</p></div>
        <div className="actions">
          <Link className="btn btn-soft" to="/app/clinics"><Icon name="pin" size={17} /> Find a vet</Link>
          {pets.length > 0 && <button className="btn btn-primary" onClick={book}><Icon name="plus" /> Book appointment</button>}
        </div>
      </div>

      {!pets.length ? <div className="card"><EmptyPets /></div> : (
        <>
          {pets.length > 1 && (
            <div className="chips" style={{ marginBottom: 20 }}>
              <button className={`chip ${petId === "all" ? "on" : ""}`} onClick={() => setPetId("all")}>All pets</button>
              {pets.map((p) => (
                <button key={p.id} className={`chip ${petId === p.id ? "on" : ""}`} onClick={() => setPetId(p.id)}>
                  {p.photo && <img src={p.photo} alt="" />}{p.name}
                </button>
              ))}
            </div>
          )}

          <section className="card appt-section">
            <div className="card-head"><h3>Upcoming</h3>{upcoming.length > 0 && <span className="pill neutral">{plural(upcoming.length, "visit")}</span>}</div>
            {upcoming.length
              ? <div className="appt-list">{upcoming.map((x) => <ApptRow key={x.t.id} {...x} />)}</div>
              : <div className="empty small">No upcoming visits. <button className="linkish" onClick={book}>Book one</button> and it'll show on your care list and calendar.</div>}
          </section>

          {overdue.length > 0 && (
            <section className="card appt-section">
              <div className="card-head"><h3>Did these happen?</h3></div>
              <p className="care-hint">The date has passed. Mark the visit done to log it in medical history, or edit it to set a new date.</p>
              <div className="appt-list">{overdue.map((x) => <ApptRow key={x.t.id} {...x} />)}</div>
            </section>
          )}

          {done.length > 0 && (
            <section className="card appt-section">
              <div className="card-head"><h3>Past visits</h3></div>
              <div className="appt-list">{done.map((x) => <ApptRow key={x.t.id} {...x} />)}</div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function countdown(t) {
  if (t.done) return { key: "ok", label: "Done" };
  const d = daysUntil(t.nextDue);
  if (d < 0) return { key: "danger", label: `${-d}d ago` };
  if (d === 0) return { key: "warn", label: "Today" };
  if (d === 1) return { key: "warn", label: "Tomorrow" };
  return { key: d <= 7 ? "warn" : "neutral", label: `In ${d} days` };
}

export function ApptRow({ pet, t, compact }) {
  const { openModal } = useUI();
  const { reopenCare } = useStore();
  const complete = useCompleteCare();
  const del = useDeleteCare();
  const d = new Date(t.nextDue + "T00:00:00");
  const st = countdown(t);
  return (
    <div className={`appt-row ${t.done ? "is-done" : ""}`}>
      <div className="appt-date" aria-hidden="true">
        <small>{d.toLocaleDateString(undefined, { weekday: "short" })}</small>
        <b>{d.getDate()}</b>
        <small>{d.toLocaleDateString(undefined, { month: "short" })}</small>
      </div>
      <button className="appt-main" onClick={() => openModal(<AppointmentForm petId={pet.id} appt={t} />)}>
        <b>{t.title}</b>
        <span className="appt-meta">
          <span className="appt-pet"><PetThumb pet={pet} size={20} />{pet.name}</span>
          {t.dueTime && <span><Icon name="clock" size={13} /> {fmtTime(t.dueTime)}</span>}
        </span>
        {t.notes && <small>{t.notes}</small>}
      </button>
      <div className="appt-side">
        <span className={`pill ${st.key}`}><span className="dot" />{st.label}</span>
        {!compact && (
          <div className="appt-acts">
            {t.done
              ? <>
                  <Link className="btn btn-soft btn-sm" to={`/app/pets/${pet.id}?tab=medical`}>History</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => reopenCare(pet.id, t.id)}>Reopen</button>
                </>
              : <button className="btn btn-soft btn-sm" onClick={() => complete(pet, t)}><Icon name="check" size={14} /> Done</button>}
            <button className="icon-btn" onClick={() => openModal(<AppointmentForm petId={pet.id} appt={t} />)} aria-label="Edit appointment"><Icon name="edit" /></button>
            <button className="icon-btn danger" onClick={() => del(pet, "care", t, "this appointment")} aria-label="Delete appointment"><Icon name="trash" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
