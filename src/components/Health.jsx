import { useState } from "react";
import Icon from "./Icon";
import { Modal, useUI } from "./UIContext";
import { useStore } from "../store/StoreContext";
import { STATUS_TEXT, healthCheck } from "../lib/health";
import { petContext } from "../lib/prompt";
import { fmtDate, todayISO } from "../lib/utils";

/* The pet health indicator (lib/health.js): a ring with one segment per check, coloured by its status, on the
   pet's page (HealthPanel, with what each check found and why) and on pet cards (HealthBadge). */

const ORDER = ["vaccines", "checkup", "illness", "parasites", "weight", "diet"];   // segments keep their place

export function HealthRing({ h, size = 84, stroke = 8, text = true }) {
  const segs = ORDER.map((k) => h.checks.find((c) => c.key === k)).filter((c) => c && c.status !== "info");
  const r = (size - stroke) / 2, mid = size / 2;
  const gap = segs.length > 1 ? Math.min(0.2, 1.4 / segs.length / 2) : 0;
  const step = (2 * Math.PI) / Math.max(1, segs.length);
  const at = (a) => `${(mid + r * Math.cos(a)).toFixed(2)} ${(mid + r * Math.sin(a)).toFixed(2)}`;
  return (
    <svg className="health-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`${h.label}: ${h.onTrack} of ${h.total} checks on track`}>
      {segs.length === 1
        ? <circle className={`seg ${segs[0].status}`} cx={mid} cy={mid} r={r} strokeWidth={stroke} fill="none" />
        : segs.map((c, i) => {
          const a0 = -Math.PI / 2 + i * step + gap / 2, a1 = a0 + step - gap;
          return <path key={c.key} className={`seg ${c.status}`} d={`M${at(a0)} A${r} ${r} 0 0 1 ${at(a1)}`} strokeWidth={stroke} fill="none" strokeLinecap="round" />;
        })}
      {text && <text x={mid} y={mid} textAnchor="middle" dominantBaseline="central"><tspan className="n">{h.onTrack}</tspan><tspan className="of">/{h.total}</tspan></text>}
    </svg>
  );
}

/* For pet cards: the ring, the overall status and the most important thing to look at. */
export function HealthBadge({ pet }) {
  const h = healthCheck(pet);
  return (
    <div className={`health-badge ${h.key}`}>
      <HealthRing h={h} size={30} stroke={4.5} text={false} />
      <span className="grow"><b>{h.label}</b><small>{h.top ? h.top.detail : `${h.onTrack} of ${h.total} health checks on track`}</small></span>
    </div>
  );
}

/* For the pet's page. onAction(check.action) opens the tab, form or guide the check points to. */
export function HealthPanel({ pet, onAction }) {
  const h = healthCheck(pet);
  const [all, setAll] = useState(false);
  const attention = h.checks.filter((c) => c.status !== "ok" && c.status !== "info");
  const shown = all || !attention.length ? h.checks : attention;
  const hidden = h.checks.length - shown.length;
  const stage = h.stage && (h.stage.key === "young" ? h.stage.label : `${h.stage.label}${h.stage.key === "adult" ? `, senior from about ${h.stage.from} yrs` : ""}`);
  return (
    <section className="card health-card" aria-labelledby="health-h">
      <div className="health-top">
        <HealthRing h={h} />
        <div className="grow">
          <div className="health-title">
            <h3 id="health-h">Health check</h3>
            <span className={`pill ${h.key}`}><span className="dot" />{h.label}</span>
          </div>
          <p className="health-sub">{h.onTrack} of {h.total} checks on track{stage ? ` · ${stage}` : ""}</p>
          <p className="health-note"><Icon name="info" size={13} /> Worked out from {pet.name}'s records in FurFriends: vaccines, medical history, diet and profile. It isn't a vet exam.</p>
        </div>
      </div>
      <ul className="health-list">
        {shown.map((c) => (
          <li key={c.key} className={`hc ${c.status}`}>
            <details>
              <summary>
                <span className="hc-ic"><Icon name={c.icon} size={17} /></span>
                <span className="grow"><b>{c.label} <span className="hc-st">{STATUS_TEXT[c.status]}</span></b><small>{c.detail}</small></span>
                <Icon name="chevR" size={18} className="hc-chev" />
              </summary>
              <div className="hc-more">
                <p>{c.why}</p>
                {c.notes?.length > 0 && <ul>{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                {c.key === "weight" && <WeightHistory pet={pet} />}
                {c.action && onAction && <button type="button" className="btn btn-soft btn-sm" onClick={() => onAction(c.action)}>{c.action.label} <Icon name="arrowR" size={14} /></button>}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {hidden > 0 && <button type="button" className="linkish health-more" onClick={() => setAll(true)}>Show {hidden} more check{hidden === 1 ? "" : "s"}</button>}
      {all && attention.length > 0 && <button type="button" className="linkish health-more" onClick={() => setAll(false)}>Show only what needs a look</button>}
    </section>
  );
}

/* For the assistant: what it's told about the pet, so owners can see why an answer mentions their pet's records. */
export function PetContextChips({ pet }) {
  const c = petContext(pet);
  const overdue = c.vaccines.filter((v) => /^Overdue/.test(v.status)).map((v) => v.name);
  const chips = [
    c.lifeStage && [c.lifeStage.charAt(0).toUpperCase() + c.lifeStage.slice(1), "neutral"],
    ...c.allergies.slice(0, 2).map((a) => [`Allergy: ${a}`, "warn"]),
    c.medications.length && [`Medication: ${c.medications[0]}${c.medications.length > 1 ? ` +${c.medications.length - 1}` : ""}`, "neutral"],
    c.recovering.length && [`Recovering: ${c.recovering[0].title}`, "warn"],
    overdue.length && [`${overdue.join(", ")} overdue`, "danger"],
    c.missingVaccines.length && [`No ${c.missingVaccines.join(" or ")} record`, "warn"],
    c.diet && [`Diet: ${c.diet.foods[0]}`, "neutral"],
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className="ai-context">
      <span>Answers use {pet.name}'s records:</span>
      {chips.map(([t, k]) => <span key={t} className={`pill ${k}`}>{t}</span>)}
    </div>
  );
}

/* The pet's saved weights (weight_log in Supabase): a small trend line, the last few, and adding an earlier one (e.g.
   from a vet visit). Hidden until the database has the weight_log table (migration 20261112000000_weight_log.sql). */
export function WeightHistory({ pet }) {
  const { weightLog, removeWeight } = useStore();
  const { openModal, confirm, toast } = useUI();
  if (!weightLog) return null;
  const list = [...(pet.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const add = () => openModal(<WeightForm pet={pet} />);
  return (
    <div className="weights">
      {list.length >= 2 && <Sparkline points={list.slice(-12)} />}
      {list.length > 0 && (
        <ul className="weight-list">
          {list.slice(-5).reverse().map((w) => (
            <li key={w.date}>
              <span>{fmtDate(w.date)}</span><b>{w.kg} kg</b>
              <button type="button" className="icon-btn danger" aria-label={`Delete the weight of ${fmtDate(w.date)}`} onClick={() => confirm({
                title: "Delete this weight?", text: `${w.kg} kg on ${fmtDate(w.date)} will be removed from ${pet.name}'s weight history.`,
                onConfirm: () => { removeWeight(pet.id, w.date); toast("Weight deleted"); },
              })}><Icon name="trash" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={add}><Icon name="plus" size={14} /> Add a weight</button>
    </div>
  );
}

function Sparkline({ points, width = 240, height = 48 }) {
  const kg = points.map((p) => p.kg), lo = Math.min(...kg), hi = Math.max(...kg);
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points.at(-1).date) || t0 + 1;
  const x = (p) => 6 + ((Date.parse(p.date) - t0) / Math.max(1, t1 - t0)) * (width - 12);
  const y = (p) => (hi === lo ? height / 2 : 6 + (1 - (p.kg - lo) / (hi - lo)) * (height - 12));
  return (
    <svg className="sparkline" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={`Weight from ${points[0].kg} kg on ${fmtDate(points[0].date)} to ${points.at(-1).kg} kg on ${fmtDate(points.at(-1).date)}`}>
      <polyline points={points.map((p) => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ")} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((p) => <circle key={p.date} cx={x(p)} cy={y(p)} r="2.6" />)}
    </svg>
  );
}

function WeightForm({ pet }) {
  const { saveWeight } = useStore();
  const { closeModal, toast } = useUI();
  const [v, setV] = useState({ date: todayISO(), kg: "" });
  const [error, setError] = useState("");
  const submit = () => {
    const kg = Number(v.kg);
    if (!v.date || v.date > todayISO()) return setError("Pick a date that isn't in the future.");
    if (!(kg > 0) || kg > 150) return setError("Enter the weight in kg, e.g. 4.2.");
    saveWeight(pet.id, { date: v.date, kg: Math.round(kg * 100) / 100 });
    closeModal(); toast(`Saved ${kg} kg for ${pet.name}`);
  };
  return (
    <Modal title={`Add a weight · ${pet.name}`} error={error} onSubmit={submit}
      footer={<><button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" type="submit">Save weight</button></>}>
      <p className="form-intro">Weights are kept as a history, so FurFriends can show how {pet.name}'s weight changes. Add today's weight, or an earlier one from a vet visit.</p>
      <div className="row">
        <div className="field"><label htmlFor="w-date">Date weighed *</label><input className="input" id="w-date" type="date" max={todayISO()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
        <div className="field"><label htmlFor="w-kg">Weight (kg) *</label><input className="input" id="w-kg" type="number" min="0" step="0.1" inputMode="decimal" value={v.kg} onChange={(e) => setV({ ...v, kg: e.target.value })} /></div>
      </div>
    </Modal>
  );
}
