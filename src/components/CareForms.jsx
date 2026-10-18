import { useState } from "react";
import { useStore } from "../store/StoreContext";
import { Modal, useUI } from "./UIContext";
import { todayISO, fmtDate, addDays } from "../lib/utils";
import { WEEKDAYS, REPEATS, SUGGESTIONS, KINDS, APPT, fmtTime, shiftISO } from "../lib/care";
import { MedForm } from "./Forms";
import Icon from "./Icon";

const PetSelect = ({ value, onChange, disabled }) => {
  const { pets } = useStore();
  return (
    <div className="field"><label htmlFor="c-pet">Pet</label>
      <select className="select" id="c-pet" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {pets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.species})</option>)}
      </select>
    </div>
  );
};

/* ---------------------------------------------------------------- feeding */
export function FeedingForm({ petId, meal }) {
  const { pets, upsertItem, getPet } = useStore();
  const { closeModal, toast } = useUI();
  const [error, setError] = useState("");
  const [v, setV] = useState(meal ? { ...meal, pet: petId } : { pet: petId || pets[0]?.id, time: "07:00", food: "", amount: "", days: [], notes: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const everyDay = !v.days.length;
  const toggleDay = (d) => {
    const base = everyDay ? [0, 1, 2, 3, 4, 5, 6] : v.days;
    const days = base.includes(d) ? base.filter((x) => x !== d) : [...base, d].sort();
    setV({ ...v, days: days.length === 7 ? [] : days });
  };

  function submit() {
    if (!v.time) return setError("Pick a feeding time.");
    if (!v.food.trim()) return setError("What are they eating? Add the food.");
    if (!everyDay && !v.days.length) return setError("Choose at least one day.");
    upsertItem(v.pet, "feeding", { id: meal?.id, time: v.time, food: v.food.trim(), amount: v.amount.trim(), days: v.days, notes: v.notes.trim() });
    closeModal(); toast(meal ? "Feeding schedule updated" : `Meal added to ${getPet(v.pet).name}'s schedule`);
  }

  return (
    <Modal title={meal ? "Edit meal" : "Add a feeding time"} error={error} onSubmit={submit}
      footer={<><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" type="submit">{meal ? "Save" : "Add meal"}</button></>}>
      <PetSelect value={v.pet} onChange={(pet) => setV({ ...v, pet })} disabled={!!meal} />
      <div className="row">
        <div className="field"><label htmlFor="fd-time">Time *</label><input className="input" id="fd-time" type="time" value={v.time} onChange={set("time")} /></div>
        <div className="field"><label htmlFor="fd-amount">Amount</label><input className="input" id="fd-amount" placeholder="e.g. 1/4 cup, 80 g" value={v.amount} onChange={set("amount")} /></div>
      </div>
      <div className="field"><label htmlFor="fd-food">Food *</label><input className="input" id="fd-food" placeholder="e.g. Royal Canin Indoor (dry)" value={v.food} onChange={set("food")} /></div>
      <div className="field"><label>Which days?</label>
        <div className="day-picker">
          {WEEKDAYS.map((d, i) => (
            <button type="button" key={d} className={everyDay || v.days.includes(i) ? "on" : ""} onClick={() => toggleDay(i)} aria-pressed={everyDay || v.days.includes(i)}>{d[0]}<span>{d.slice(1)}</span></button>
          ))}
        </div>
        <div className="hint">{everyDay ? "All days selected = every day. Tap to pick specific days." : `${v.days.length} day${v.days.length === 1 ? "" : "s"} a week`}</div>
      </div>
      <div className="field"><label htmlFor="fd-notes">Notes</label><input className="input" id="fd-notes" placeholder="Optional — e.g. mix in joint supplement" value={v.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- care task (grooming / deworming / vaccination) */
export function CareForm({ petId, task, kind = "Grooming" }) {
  // Every "edit task" button routes through here, so appointments get their own form.
  if ((task?.kind || kind) === APPT) return <AppointmentForm petId={petId} appt={task} />;
  return <TaskForm petId={petId} task={task} kind={kind} />;
}

function TaskForm({ petId, task, kind }) {
  const { pets, upsertItem, getPet } = useStore();
  const { closeModal, toast } = useUI();
  const [error, setError] = useState("");
  const [v, setV] = useState(task
    ? { ...task, pet: petId }
    : { pet: petId || pets[0]?.id, kind, title: "", nextDue: todayISO(), repeatDays: kind === "Vaccination" ? 0 : kind === "Deworming" ? 90 : 14, notes: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const kindLabel = { Grooming: "grooming task", Deworming: "deworming", Vaccination: "vaccine reminder" }[v.kind];

  function submit() {
    if (!v.title.trim()) return setError("Give this task a name.");
    if (!v.nextDue) return setError("Choose when it's due.");
    upsertItem(v.pet, "care", { id: task?.id, kind: v.kind, title: v.title.trim(), nextDue: v.nextDue, repeatDays: Number(v.repeatDays), notes: v.notes.trim(), done: false, lastDone: task?.lastDone || null });
    closeModal(); toast(task ? "Schedule updated" : `${v.kind} scheduled for ${getPet(v.pet).name}`);
  }

  return (
    <Modal title={task ? `Edit ${kindLabel}` : `Schedule ${kindLabel}`} error={error} onSubmit={submit}
      footer={<><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" type="submit">{task ? "Save" : "Schedule"}</button></>}>
      <PetSelect value={v.pet} onChange={(pet) => setV({ ...v, pet })} disabled={!!task} />
      {!task && (
        <div className="field"><label>Type</label>
          <div className="seg">
            {Object.keys(KINDS).filter((k) => k !== "Feeding" && k !== APPT).map((k) => (
              <span key={k} style={{ display: "contents" }}>
                <input type="radio" id={`kind-${k}`} name="kind" checked={v.kind === k} onChange={() => setV({ ...v, kind: k, title: "", repeatDays: k === "Vaccination" ? 0 : k === "Deworming" ? 90 : 14 })} />
                <label htmlFor={`kind-${k}`}><Icon name={KINDS[k].icon} size={16} />{k}</label>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="field"><label htmlFor="c-title">{v.kind === "Deworming" ? "Product / treatment *" : v.kind === "Vaccination" ? "Vaccine *" : "Task *"}</label>
        <input className="input" id="c-title" list="care-suggest" placeholder={`e.g. ${SUGGESTIONS[v.kind][0]}`} value={v.title} onChange={set("title")} />
        <datalist id="care-suggest">{SUGGESTIONS[v.kind].map((s) => <option key={s} value={s} />)}</datalist>
        <div className="chips" style={{ marginTop: 8 }}>
          {SUGGESTIONS[v.kind].slice(0, 4).map((s) => <button type="button" key={s} className="chip sm" onClick={() => setV({ ...v, title: s })}>{s}</button>)}
        </div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="c-due">When is it due? *</label><input className="input" id="c-due" type="date" value={v.nextDue} onChange={set("nextDue")} /></div>
        <div className="field"><label htmlFor="c-rep">How often?</label>
          <select className="select" id="c-rep" value={v.repeatDays} onChange={set("repeatDays")}>{REPEATS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
        </div>
      </div>
      <div className="field"><label htmlFor="c-notes">Notes</label><input className="input" id="c-notes" placeholder="Optional" value={v.notes} onChange={set("notes")} /></div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- vet appointment */
export function AppointmentForm({ petId, appt }) {
  const { pets, upsertItem, getPet } = useStore();
  const { closeModal, toast } = useUI();
  const [error, setError] = useState("");
  const [v, setV] = useState(appt
    ? { pet: petId, title: appt.title, nextDue: appt.nextDue, dueTime: appt.dueTime || "", notes: appt.notes || "" }
    : { pet: petId || pets[0]?.id, title: "", nextDue: addDays(1), dueTime: "09:00", notes: "" });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  function submit() {
    if (!v.title.trim()) return setError("What's the visit for?");
    if (!v.nextDue) return setError("Choose the appointment date.");
    // Moving a finished appointment to a new date books it again.
    const done = !!appt?.done && appt.nextDue === v.nextDue;
    upsertItem(v.pet, "care", {
      id: appt?.id, kind: APPT, title: v.title.trim(), nextDue: v.nextDue, dueTime: v.dueTime, repeatDays: 0,
      notes: v.notes.trim(), done, lastDone: done ? appt.lastDone : null,
    });
    closeModal();
    const name = getPet(v.pet).name;
    toast(appt ? "Appointment updated" : `Booked for ${name} · ${fmtDate(v.nextDue).replace(/, \d{4}$/, "")}${v.dueTime ? `, ${fmtTime(v.dueTime)}` : ""}`);
  }

  return (
    <Modal title={appt ? "Edit vet appointment" : "Book a vet appointment"} error={error} onSubmit={submit}
      footer={<><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" type="submit">{appt ? "Save" : "Book appointment"}</button></>}>
      <PetSelect value={v.pet} onChange={(pet) => setV({ ...v, pet })} disabled={!!appt} />
      <div className="field"><label htmlFor="a-title">What's it for? *</label>
        <input className="input" id="a-title" list="appt-suggest" placeholder="e.g. Annual checkup" value={v.title} onChange={set("title")} />
        <datalist id="appt-suggest">{SUGGESTIONS[APPT].map((s) => <option key={s} value={s} />)}</datalist>
        <div className="chips" style={{ marginTop: 8 }}>
          {SUGGESTIONS[APPT].slice(0, 4).map((s) => <button type="button" key={s} className="chip sm" onClick={() => setV({ ...v, title: s })}>{s}</button>)}
        </div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="a-date">Date *</label><input className="input" id="a-date" type="date" value={v.nextDue} onChange={set("nextDue")} /></div>
        <div className="field"><label htmlFor="a-time">Time</label><input className="input" id="a-time" type="time" value={v.dueTime} onChange={set("dueTime")} /></div>
      </div>
      <div className="field"><label htmlFor="a-notes">Clinic &amp; notes</label>
        <input className="input" id="a-notes" placeholder="e.g. Dr. Santos, Maple Vet Clinic · bring stool sample" value={v.notes} onChange={set("notes")} />
      </div>
    </Modal>
  );
}

/* Mark a task done. Finishing a vet appointment offers to log the visit in medical history. */
export function useCompleteCare() {
  const { completeCare } = useStore();
  const { toast, openModal } = useUI();
  return (pet, t) => {
    if (!completeCare(pet.id, t.id)) return;
    if (t.kind === APPT) {
      const date = t.nextDue <= todayISO() ? t.nextDue : todayISO();
      openModal(<MedForm pet={pet} prefill={{ date, type: "Checkup", title: t.title, vet: t.notes || "" }}
        intro={<>Appointment marked done. Add what the vet said to {pet.name}'s medical history, or press Skip.</>} />);
      return;
    }
    const r = Number(t.repeatDays);
    toast(r ? `${t.title} done · next on ${fmtDate(shiftISO(todayISO(), r))}` : `${t.title} marked done`);
  };
}

export function useDeleteCare() {
  const { removeItem } = useStore();
  const { confirm, toast } = useUI();
  return (pet, list, item, label) => confirm({
    title: `Delete ${label}?`, text: <>This removes “{item.title || item.food}” from {pet.name}'s schedule.</>,
    onConfirm: () => { removeItem(pet.id, list, item.id); toast("Removed from schedule"); },
  });
}
