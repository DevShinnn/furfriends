import { useState, Fragment } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import { FeedingForm, CareForm, useDeleteCare } from "../components/CareForms";
import { PetThumb } from "../components/PetBits";
import Icon from "../components/Icon";
import { todayISO, fmtDate } from "../lib/utils";
import {
  KINDS, WEEKDAYS, fmtTime, feedingsOn, isFed, careStatus, occurrences, scheduleBetween,
  occurrenceStatus, allCareTasks, upcomingActivities, groupLabel, repeatLabel, shiftISO, weekday,
} from "../lib/care";

const KindIcon = ({ kind, size = 36 }) => (
  <span className={`kind-ic k-${KINDS[kind].color}`} style={{ width: size, height: size }}><Icon name={KINDS[kind].icon} size={Math.round(size * 0.5)} /></span>
);

/* ================================================================ Upcoming list */
export function UpcomingList({ pets, horizon = 30, only, limit, showPet = true }) {
  const { toggleFed, completeCare } = useStore();
  const { toast, openModal } = useUI();
  let items = upcomingActivities(pets, horizon);
  if (only) items = items.filter((it) => only.includes(groupLabel(it)));
  const total = items.length;
  if (limit) items = items.slice(0, limit);
  if (!items.length) return <div className="empty small"><Icon name="check" size={18} /> Nothing scheduled — you're all caught up.</div>;

  const groups = [];
  for (const it of items) {
    const g = groupLabel(it);
    if (!groups.length || groups.at(-1).label !== g) groups.push({ label: g, items: [] });
    groups.at(-1).items.push(it);
  }

  const done = (it) => {
    completeCare(it.pet.id, it.task.id);
    const r = Number(it.task.repeatDays);
    toast(r ? `${it.title} done · next on ${fmtDate(shiftISO(todayISO(), r))}` : `${it.title} marked done`);
  };

  return (
    <div className="upcoming">
      {groups.map((g) => (
        <div key={g.label} className={`up-group ${g.label === "Overdue" ? "is-overdue" : ""}`}>
          <div className="up-label">{g.label}<span>{g.items.length}</span></div>
          {g.items.map((it) => (
            <div key={it.key} className={`up-item ${it.fed ? "is-done" : ""}`}>
              <KindIcon kind={it.kind} />
              <div className="when">{it.time ? fmtTime(it.time) : fmtDate(it.date).replace(/, \d{4}$/, "")}</div>
              <button className="grow" onClick={() => it.feeding ? openModal(<FeedingForm petId={it.pet.id} meal={it.feeding} />) : !it.task.fromRecord && openModal(<CareForm petId={it.pet.id} task={it.task} />)}>
                <b>{it.title}</b>
                <small>{showPet && <>{it.pet.name} · </>}{it.kind}{it.sub ? ` · ${it.sub}` : ""}</small>
              </button>
              {showPet && <PetThumb pet={it.pet} size={32} />}
              {it.feeding ? (
                <button className={`check-btn ${it.fed ? "on" : ""}`} onClick={() => toggleFed(it.pet.id, it.feeding.id)} aria-pressed={it.fed}>
                  <Icon name="check" size={14} /> {it.fed ? "Fed" : "Mark fed"}
                </button>
              ) : it.task.fromRecord ? (
                <Link className="check-btn" to={`/app/pets/${it.pet.id}?tab=vaccines`}>View</Link>
              ) : (
                <button className="check-btn" onClick={() => done(it)}><Icon name="check" size={14} /> Done</button>
              )}
            </div>
          ))}
        </div>
      ))}
      {limit && total > limit && <div className="up-more">+{total - limit} more</div>}
    </div>
  );
}

/* ================================================================ Feeding */
export function FeedingPanel({ pets }) {
  const { toggleFed } = useStore();
  const { openModal } = useUI();
  const del = useDeleteCare();
  const today = todayISO();
  return (
    <div className="feed-grid">
      {pets.map((pet) => {
        const meals = [...(pet.feeding || [])].sort((a, b) => a.time.localeCompare(b.time));
        const todays = feedingsOn(pet, today);
        const fed = todays.filter((m) => isFed(pet, m.id)).length;
        return (
          <div className="feed-card" key={pet.id}>
            <div className="feed-head">
              <PetThumb pet={pet} size={40} />
              <div className="grow"><b>{pet.name}</b><small>{todays.length ? `${fed} of ${todays.length} meals fed today` : "No meals today"}</small></div>
              <button className="icon-btn" onClick={() => openModal(<FeedingForm petId={pet.id} />)} aria-label={`Add meal for ${pet.name}`}><Icon name="plus" /></button>
            </div>
            {todays.length > 0 && <div className="progress"><span style={{ width: `${(fed / todays.length) * 100}%` }} /></div>}
            {meals.length ? (
              <ul className="meals">
                {meals.map((m) => {
                  const scheduledToday = todays.includes(m);
                  const done = isFed(pet, m.id);
                  return (
                    <li key={m.id} className={done ? "is-done" : ""}>
                      <button className={`tick ${done ? "on" : ""}`} disabled={!scheduledToday} onClick={() => toggleFed(pet.id, m.id)}
                        aria-label={done ? "Mark as not fed" : "Mark as fed"} title={scheduledToday ? "" : "Not scheduled today"}><Icon name="check" size={14} /></button>
                      <span className="t">{fmtTime(m.time)}</span>
                      <span className="grow"><b>{m.food}</b><small>{[m.amount, m.days?.length ? m.days.map((d) => WEEKDAYS[d]).join(", ") : "Every day", m.notes].filter(Boolean).join(" · ")}</small></span>
                      <button className="icon-btn" onClick={() => openModal(<FeedingForm petId={pet.id} meal={m} />)} aria-label="Edit meal"><Icon name="edit" /></button>
                      <button className="icon-btn danger" onClick={() => del(pet, "feeding", m, "meal")} aria-label="Delete meal"><Icon name="trash" /></button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <button className="feed-empty" onClick={() => openModal(<FeedingForm petId={pet.id} />)}><Icon name="bowl" /> Create a feeding schedule</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================ Care table (grooming / deworming / vaccines) */
export function CareTable({ pets, kinds, showPet = true, empty }) {
  const { completeCare, reopenCare } = useStore();
  const { openModal, toast } = useUI();
  const del = useDeleteCare();
  const rows = pets.flatMap((pet) => allCareTasks(pet).filter((t) => kinds.includes(t.kind)).map((t) => ({ pet, t, st: careStatus(t) })))
    .sort((a, b) => (a.t.done - b.t.done) || (a.t.nextDue || "").localeCompare(b.t.nextDue || ""));
  if (!rows.length) return <div className="empty small">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="data care-table">
        <thead><tr><th>Task</th>{showPet && <th>Pet</th>}<th>Repeats</th><th>Last done</th><th>Next due</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map(({ pet, t, st }) => (
            <tr key={pet.id + t.id} className={t.done ? "is-done" : ""}>
              <td><div className="task-cell"><KindIcon kind={t.kind} size={32} /><div><b>{t.title}</b>{(t.notes || t.fromRecord) && <small>{t.fromRecord ? "From vaccination records" : t.notes}</small>}</div></div></td>
              {showPet && <td><Link className="pet-inline" to={`/app/pets/${pet.id}?tab=care`}><PetThumb pet={pet} size={28} />{pet.name}</Link></td>}
              <td>{t.fromRecord ? "—" : repeatLabel(t.repeatDays)}</td>
              <td>{t.lastDone ? fmtDate(t.lastDone) : "—"}</td>
              <td>{t.done ? "—" : fmtDate(t.nextDue)}</td>
              <td><span className={`pill ${st.key}`}><span className="dot" />{st.label}</span></td>
              <td className="actions">
                {t.fromRecord ? <Link className="btn btn-soft btn-sm" to={`/app/pets/${pet.id}?tab=vaccines`}>View record</Link> : <>
                  {t.done
                    ? <button className="btn btn-soft btn-sm" onClick={() => reopenCare(pet.id, t.id)}>Reopen</button>
                    : <button className="btn btn-soft btn-sm" onClick={() => { completeCare(pet.id, t.id); toast(`${t.title} marked done`); }}><Icon name="check" size={14} /> Done</button>}
                  <button className="icon-btn" onClick={() => openModal(<CareForm petId={pet.id} task={t} />)} aria-label="Edit"><Icon name="edit" /></button>
                  <button className="icon-btn danger" onClick={() => del(pet, "care", t, "this task")} aria-label="Delete"><Icon name="trash" /></button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================ Per-pet care panel (pet profile tab)
   "Upcoming" = a simple agenda of what's next for this pet (each task shown once, soonest first).
   "Manage"   = the editable schedule (feeding times + grooming/deworming/vaccine reminders). */
export function PetCarePanel({ pet }) {
  const [view, setView] = useState("upcoming");
  return (
    <div className="care-panel">
      <div className="care-toggle">
        <button className={view === "upcoming" ? "on" : ""} onClick={() => setView("upcoming")}><Icon name="list" size={16} /> Upcoming</button>
        <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}><Icon name="cal" size={16} /> Chart</button>
        <button className={view === "schedule" ? "on" : ""} onClick={() => setView("schedule")}><Icon name="edit" size={15} /> Manage</button>
      </div>
      {view === "upcoming" && <PetUpcoming pet={pet} onManage={() => setView("schedule")} />}
      {view === "chart" && <PetChart pet={pet} />}
      {view === "schedule" && <PetSchedule pet={pet} />}
    </div>
  );
}

/* A plain, chronological agenda for one pet — no grid. Feed / mark-done inline. */
function PetUpcoming({ pet, onManage }) {
  return (
    <>
      <p className="care-hint">What's next for {pet.name}, soonest first. Tap <b>Fed</b> or <b>Done</b> to check things off, or <b>Manage</b> to edit the schedule.</p>
      <UpcomingList pets={[pet]} showPet={false} horizon={30} />
      <button className="btn btn-soft btn-sm care-manage-btn" onClick={onManage}><Icon name="list" size={15} /> Manage feeding &amp; tasks</button>
    </>
  );
}

/* Month calendar for one pet. Dots mark days with grooming/deworming/vaccine events;
   feeding stays out of the grid (it's daily) and shows in the tapped-day detail below. */
const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function PetCalendar({ pet }) {
  const { openModal, toast } = useUI();
  const { completeCare, toggleFed } = useStore();
  const today = todayISO();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(today);

  const base = new Date(today + "T00:00:00");
  const anchor = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const y = anchor.getFullYear(), mo = anchor.getMonth();
  const monthStart = isoOf(new Date(y, mo, 1));
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const monthEnd = isoOf(new Date(y, mo, daysInMonth));
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Monday = 0

  // Map each day → the care events that fall on it (past + future, so history shows).
  const evMap = {};
  for (const t of allCareTasks(pet).filter((x) => !x.done))
    for (const d of scheduleBetween(t, monthStart, monthEnd)) (evMap[d] ||= []).push(t);

  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => isoOf(new Date(y, mo, i + 1)))];
  const monthLabel = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goMonth = (delta) => {
    const n = monthOffset + delta;
    setMonthOffset(n);
    const a = new Date(base.getFullYear(), base.getMonth() + n, 1);
    const ns = isoOf(new Date(a.getFullYear(), a.getMonth(), 1));
    const ne = isoOf(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    setSelected(today >= ns && today <= ne ? today : ns);
  };

  const dayMeals = feedingsOn(pet, selected);
  const dayTasks = evMap[selected] || [];
  const selLabel = fmtDate(selected).replace(/, \d{4}$/, "");
  const isToday = selected === today;
  const isPast = selected < today;

  return (
    <>
      <div className="planner-bar">
        <button className="icon-btn" onClick={() => goMonth(-1)} aria-label="Previous month"><Icon name="chevL" size={20} /></button>
        <b>{monthLabel}</b>
        <button className="icon-btn" onClick={() => goMonth(1)} aria-label="Next month"><Icon name="chevR" size={20} /></button>
        {monthOffset !== 0 && <button className="btn btn-soft btn-sm" onClick={() => goMonth(-monthOffset)}>Today</button>}
      </div>

      <div className="cal-dow">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal-grid">
        {cells.map((iso, i) => {
          if (!iso) return <span key={`b${i}`} className="cal-blank" />;
          const tasks = evMap[iso] || [];
          const kinds = [...new Set(tasks.map((t) => t.kind))];
          // A past day counts as "logged" if every scheduled meal was fed and every task was done.
          const past = iso < today;
          const allFed = feedingsOn(pet, iso).every((m) => isFed(pet, m.id, iso));
          const allDone = tasks.every((t) => occurrenceStatus(t, iso, today) === "done" || t.fromRecord);
          const logged = past && allFed && allDone && (tasks.length || feedingsOn(pet, iso).length);
          const cls = [iso === today ? "today" : "", iso === selected ? "sel" : "", past ? "past" : "", logged ? "logged" : ""].filter(Boolean).join(" ");
          return (
            <button key={iso} className={`cal-day ${cls}`} onClick={() => setSelected(iso)} aria-label={`${fmtDate(iso)}${kinds.length ? `, ${kinds.length} event${kinds.length > 1 ? "s" : ""}` : ""}`}>
              <span className="cd-num">{Number(iso.slice(8))}</span>
              <span className="cd-dots">
                {logged ? <b className="cd-check"><Icon name="check" size={10} /></b> : kinds.slice(0, 3).map((k) => <i key={k} className={`k-${KINDS[k].color}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-detail">
        <div className="cd-head">
          <b>{isToday ? "Today" : selLabel}</b>
          {isPast && <span className="cd-tag log">Log</span>}
          {dayMeals.length + dayTasks.length > 0 && <span>{dayMeals.length + dayTasks.length} {isPast ? "logged" : "scheduled"}</span>}
        </div>
        {dayMeals.length === 0 && dayTasks.length === 0 ? (
          <div className="empty small">Nothing {isPast ? "was" : ""} scheduled{isPast ? " that day" : ""}.{!isPast && <> <button className="linkish" onClick={() => openModal(<CareForm petId={pet.id} />)}>Add a task</button>.</>}</div>
        ) : (
          <div className="care-rows">
            {dayMeals.map((m) => {
              const fed = isFed(pet, m.id, selected);
              return (
                <div className={`care-row ${fed && !isToday ? "is-done" : ""}`} key={m.id}>
                  <div className="cr-main">
                    <span className="cr-ic k-sun"><Icon name="bowl" size={16} /></span>
                    <div className="cr-info"><b>{m.food}</b><small>{[fmtTime(m.time), m.amount].filter(Boolean).join(" · ")}</small></div>
                  </div>
                  <div className="cr-side">
                    {isToday
                      ? <button className={`fed-btn ${fed ? "on" : ""}`} onClick={() => toggleFed(pet.id, m.id, selected)}>{fed ? <><Icon name="check" size={14} /> Fed</> : "Mark fed"}</button>
                      : isPast
                        ? <span className={`log-badge ${fed ? "ok" : "miss"}`}>{fed ? <><Icon name="check" size={13} /> Fed</> : "Not fed"}</span>
                        : <span className="cr-skip">Scheduled</span>}
                  </div>
                </div>
              );
            })}
            {dayTasks.map((t) => {
              const st = occurrenceStatus(t, selected, today);
              return (
                <div className={`care-row ${st === "done" ? "is-done" : ""}`} key={t.id}>
                  <div className="cr-main">
                    <span className={`cr-ic k-${KINDS[t.kind].color}`}><Icon name={KINDS[t.kind].icon} size={16} /></span>
                    <div className="cr-info"><b>{t.title}</b><small>{t.fromRecord ? "Vaccine record" : `${t.kind} · ${repeatLabel(t.repeatDays)}`}</small></div>
                  </div>
                  <div className="cr-side">
                    {t.fromRecord ? <Link className="btn btn-soft btn-sm" to={`/app/pets/${pet.id}?tab=vaccines`}>View</Link>
                      : st === "done" ? <span className="log-badge ok"><Icon name="check" size={13} /> Done</span>
                      : st === "missed" ? <span className="log-badge miss">Missed</span>
                      : <>
                          <button className="btn btn-soft btn-sm" onClick={() => { completeCare(pet.id, t.id); toast(`${t.title} marked done`); }}><Icon name="check" size={14} /> Done</button>
                          <button className="icon-btn" onClick={() => openModal(<CareForm petId={pet.id} task={t} />)} aria-label="Edit task"><Icon name="edit" /></button>
                        </>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="care-hint cal-legend">
        <span><i className="cd-check-legend"><Icon name="check" size={9} /></i> Done</span>
        <span><i className="k-lilac" /> Grooming</span>
        <span><i className="k-coral" /> Deworming</span>
        <span><i className="k-sky" /> Vaccine</span>
        <span className="cl-note">Page back with ‹ for past days — tap any day to see its log.</span>
      </p>
    </>
  );
}

/* Chart tab = pick the view you prefer: a month calendar or a Gantt timeline. */
function PetChart({ pet }) {
  const [mode, setMode] = useState("month");
  return (
    <>
      <div className="chart-switch">
        <button className={mode === "month" ? "on" : ""} onClick={() => setMode("month")}><Icon name="cal" size={14} /> Calendar</button>
        <button className={mode === "gantt" ? "on" : ""} onClick={() => setMode("gantt")}><Icon name="gantt" size={14} /> Gantt</button>
      </div>
      {mode === "month" ? <PetCalendar pet={pet} /> : <PetGantt pet={pet} />}
    </>
  );
}

/* Gantt timeline for one pet — a 2-week window you can page through.
   Feeding is one continuous bar (it's daily); each care task is a lane with dots on its dates. */
const GANTT_DAYS = 14;
function PetGantt({ pet }) {
  const { openModal } = useUI();
  const today = todayISO();
  const [offset, setOffset] = useState(0);
  const start = shiftISO(today, offset * GANTT_DAYS);
  const days = Array.from({ length: GANTT_DAYS }, (_, i) => shiftISO(start, i));
  const end = days.at(-1);

  const meals = pet.feeding || [];
  const rows = [];
  if (meals.length) rows.push({ id: "feeding", kind: "Feeding", title: "Feeding", sub: `${meals.length}/day`, bars: days.map((d) => feedingsOn(pet, d).length > 0) });
  for (const t of allCareTasks(pet).filter((x) => !x.done)) {
    const occ = new Set(occurrences(t, start, end));
    if (!occ.size) continue;
    rows.push({ id: t.id, kind: t.kind, title: t.title, sub: t.fromRecord ? "Vaccine" : repeatLabel(t.repeatDays), dots: days.map((d) => occ.has(d)), task: t });
  }
  const label = offset === 0 ? "Next 2 weeks" : `${fmtDate(start).replace(/,.*/, "")} – ${fmtDate(end).replace(/,.*/, "")}`;

  return (
    <>
      <div className="planner-bar">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Previous 2 weeks"><Icon name="chevL" size={20} /></button>
        <b>{label}</b>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Next 2 weeks"><Icon name="chevR" size={20} /></button>
        {offset !== 0 && <button className="btn btn-soft btn-sm" onClick={() => setOffset(0)}>Today</button>}
      </div>

      {rows.length === 0 ? (
        <div className="empty small">Nothing scheduled in this window. <button className="linkish" onClick={() => openModal(<CareForm petId={pet.id} />)}>Add a task</button> or page ahead with <b>›</b>.</div>
      ) : (
        <div className="gc" style={{ "--days": GANTT_DAYS }}>
          <div className="gc-head gc-corner" />
          {days.map((d) => {
            const wd = weekday(d);
            return <div key={d} className={`gc-head ${d === today ? "today" : ""} ${wd === 0 || wd === 6 ? "wknd" : ""}`}><small>{WEEKDAYS[wd][0]}</small>{Number(d.slice(8))}</div>;
          })}
          {rows.map((r) => (
            <Fragment key={r.id}>
              <button className="gc-label" onClick={() => r.task && openModal(<CareForm petId={pet.id} task={r.task} />)} disabled={!r.task}>
                <span className={`gc-ic k-${KINDS[r.kind].color}`}><Icon name={KINDS[r.kind].icon} size={13} /></span>
                <span className="gc-lt"><b>{r.title}</b><small>{r.sub}</small></span>
              </button>
              {days.map((d, i) => {
                const wd = weekday(d);
                return (
                  <div key={d} className={`gc-cell ${d === today ? "today" : ""} ${wd === 0 || wd === 6 ? "wknd" : ""}`}>
                    {r.bars ? (r.bars[i] && <span className={`gc-bar k-${KINDS[r.kind].color} ${r.bars[i - 1] ? "" : "s"} ${r.bars[i + 1] ? "" : "e"}`} />)
                            : (r.dots[i] && <span className={`gc-dot k-${KINDS[r.kind].color}`} />)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      <p className="care-hint cal-legend">
        <span><i className="k-sun" /> Feeding</span>
        <span><i className="k-lilac" /> Grooming</span>
        <span><i className="k-coral" /> Deworming</span>
        <span><i className="k-sky" /> Vaccine</span>
        <span className="cl-note">Tap a lane name to edit that task.</span>
      </p>
    </>
  );
}

function PetSchedule({ pet }) {
  const { openModal } = useUI();
  const meals = [...(pet.feeding || [])].sort((a, b) => a.time.localeCompare(b.time));
  const tasks = allCareTasks(pet).filter((t) => ["Grooming", "Deworming", "Vaccination"].includes(t.kind))
    .sort((a, b) => (a.done - b.done) || (a.nextDue || "").localeCompare(b.nextDue || ""));
  return (
    <>
      <section>
        <div className="tab-head"><h3><Icon name="bowl" size={18} /> Feeding</h3><button className="btn btn-primary btn-sm" onClick={() => openModal(<FeedingForm petId={pet.id} />)}><Icon name="plus" size={15} /> Add meal</button></div>
        {meals.length ? <MealList pet={pet} meals={meals} /> : <div className="empty small">No meals yet — add {pet.name}'s first meal time and food.<br /><button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => openModal(<FeedingForm petId={pet.id} />)}><Icon name="plus" size={15} /> Add a meal</button></div>}
      </section>
      <section style={{ marginTop: 26 }}>
        <div className="tab-head"><h3><Icon name="syringe" size={17} /> Grooming, deworming &amp; vaccines</h3><button className="btn btn-primary btn-sm" onClick={() => openModal(<CareForm petId={pet.id} />)}><Icon name="plus" size={15} /> Add task</button></div>
        <p className="care-hint">Tap <b>Done</b> when finished — repeating reminders reschedule to the next date automatically.</p>
        {tasks.length ? <TaskList pet={pet} tasks={tasks} /> : <div className="empty small">No reminders yet — add a grooming, deworming or vaccine reminder.<br /><button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => openModal(<CareForm petId={pet.id} />)}><Icon name="plus" size={15} /> Add a reminder</button></div>}
      </section>
    </>
  );
}

function MealList({ pet, meals }) {
  const { toggleFed } = useStore();
  const { openModal } = useUI();
  const del = useDeleteCare();
  const today = todayISO();
  const todays = feedingsOn(pet, today);
  const fed = todays.filter((m) => isFed(pet, m.id)).length;
  return (
    <>
      {todays.length > 0 && (
        <div className="meal-progress">
          <span className="mp-bar"><span style={{ width: `${(fed / todays.length) * 100}%` }} /></span>
          <small>{fed === todays.length ? "All fed today ✓" : `${fed} of ${todays.length} fed today`} · resets daily</small>
        </div>
      )}
      <div className="care-rows">
        {meals.map((m) => {
          const scheduledToday = todays.includes(m);
          const done = isFed(pet, m.id);
          return (
            <div className={`care-row ${done && scheduledToday ? "is-done" : ""}`} key={m.id}>
              <div className="cr-main">
                <span className="cr-time">{fmtTime(m.time)}</span>
                <div className="cr-info"><b>{m.food}</b><small>{[m.amount, m.days?.length ? m.days.map((d) => WEEKDAYS[d]).join(", ") : "Every day", m.notes].filter(Boolean).join(" · ")}</small></div>
              </div>
              <div className="cr-side">
                {scheduledToday
                  ? <button className={`fed-btn ${done ? "on" : ""}`} onClick={() => toggleFed(pet.id, m.id)}>{done ? <><Icon name="check" size={14} /> Fed</> : "Mark fed"}</button>
                  : <span className="cr-skip">Not today</span>}
                <button className="icon-btn" onClick={() => openModal(<FeedingForm petId={pet.id} meal={m} />)} aria-label="Edit meal"><Icon name="edit" /></button>
                <button className="icon-btn danger" onClick={() => del(pet, "feeding", m, "meal")} aria-label="Delete meal"><Icon name="trash" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TaskList({ pet, tasks }) {
  const { completeCare, reopenCare } = useStore();
  const { openModal, toast } = useUI();
  const del = useDeleteCare();
  return (
    <div className="care-rows">
      {tasks.map((t) => {
        const st = careStatus(t);
        return (
          <div className={`care-row ${t.done ? "is-done" : ""}`} key={t.id}>
            <div className="cr-main">
              <span className={`cr-ic k-${KINDS[t.kind].color}`}><Icon name={KINDS[t.kind].icon} size={16} /></span>
              <div className="cr-info">
                <b>{t.title}</b>
                <small>{t.fromRecord ? "Vaccine record" : repeatLabel(t.repeatDays)}{t.done ? "" : ` · due ${fmtDate(t.nextDue).replace(/, \d{4}$/, "")}`}</small>
              </div>
            </div>
            <div className="cr-side">
              <span className={`pill ${st.key}`}><span className="dot" />{st.label}</span>
              {t.fromRecord ? <Link className="btn btn-soft btn-sm" to={`/app/pets/${pet.id}?tab=vaccines`}>View</Link> : <>
                {t.done
                  ? <button className="btn btn-soft btn-sm" onClick={() => reopenCare(pet.id, t.id)}>Reopen</button>
                  : <button className="btn btn-soft btn-sm" onClick={() => { completeCare(pet.id, t.id); toast(`${t.title} marked done`); }}><Icon name="check" size={14} /> Done</button>}
                <button className="icon-btn" onClick={() => openModal(<CareForm petId={pet.id} task={t} />)} aria-label="Edit task"><Icon name="edit" /></button>
                <button className="icon-btn danger" onClick={() => del(pet, "care", t, "this task")} aria-label="Delete task"><Icon name="trash" /></button>
              </>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
