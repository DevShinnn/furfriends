import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon from "../components/Icon";
import { TASKS, TASK_RESULTS, SUS_ITEMS, SCALE } from "../lib/survey";

/* The usability survey testers fill in after trying the app (thesis). Saved to Supabase. */
const DEVICES = ["Android phone", "iPhone", "Computer", "Tablet"];

export default function Survey() {
  const { user, submitSurvey, surveyCount } = useStore();
  const { toast } = useUI();
  const [code, setCode] = useState("");
  const [device, setDevice] = useState("");
  const [tasks, setTasks] = useState({});
  const [sus, setSus] = useState(Array(10).fill(0));
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);   // responses already sent from this account

  useEffect(() => { surveyCount().then(setSent); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = sus.map((a, i) => (a ? null : i + 1)).filter(Boolean);
  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) {
      setError(`Please answer every statement in part 3 (missing: ${missing.join(", ")}).`);
      document.getElementById(`sus-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    const err = await submitSurvey({ participantCode: code, device, tasks, sus, liked, improve });
    setBusy(false);
    if (err) return setError(err);
    setError(""); setSent((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Thank you! Your answers were sent.");
  };

  if (sent > 0) {
    return (
      <div className="card empty survey-done">
        <div className="ic"><Icon name="check" size={30} /></div>
        <h3>Thank you for testing FurFriends!</h3>
        <p>Your answers were sent to the research team. You can keep using the app.</p>
        <Link className="btn btn-primary" to="/app">Back to the dashboard</Link>
      </div>
    );
  }

  return (
    <form className="survey" onSubmit={submit} noValidate>
      <div className="topbar"><div><h1>Usability survey</h1><p>Tell us how FurFriends worked for you. It takes about 5 minutes and helps our capstone research.</p></div></div>
      {user.isDemo && <div className="survey-note"><Icon name="info" size={16} /> You're using the demo account. Log in with your own account to send answers.</div>}

      <section className="card survey-part">
        <h3><span className="survey-num">1</span> About you</h3>
        <div className="row">
          <div className="field"><label htmlFor="sv-code">Participant code</label><input className="input" id="sv-code" placeholder="e.g. P07 (if you were given one)" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="field"><label htmlFor="sv-device">What did you test on?</label>
            <select className="select" id="sv-device" value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="">Choose…</option>{DEVICES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="card survey-part">
        <h3><span className="survey-num">2</span> The tasks you tried</h3>
        <p className="care-hint">For each task, how did it go? Leave it blank if you didn't try it.</p>
        <ol className="survey-tasks">
          {TASKS.map((t) => (
            <li key={t.id}>
              <span className="survey-q">{t.text}</span>
              <div className="seg" role="radiogroup" aria-label={t.text}>
                {TASK_RESULTS.map(([v, label]) => (
                  <label key={v} className={`seg-opt r-${v} ${tasks[t.id] === v ? "on" : ""}`}>
                    <input type="radio" name={`task-${t.id}`} value={v} checked={tasks[t.id] === v} onChange={() => setTasks({ ...tasks, [t.id]: v })} />
                    {label}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card survey-part">
        <h3><span className="survey-num">3</span> How much do you agree?</h3>
        <p className="care-hint">Answer quickly with your first impression. There are no right or wrong answers.</p>
        <ol className="survey-sus">
          {SUS_ITEMS.map((s, i) => (
            <li key={i} id={`sus-${i + 1}`} className={error && !sus[i] ? "is-missing" : ""}>
              <span className="survey-q">{s}</span>
              <div className="likert" role="radiogroup" aria-label={s}>
                {SCALE.map((label, k) => (
                  <label key={k} className={`likert-opt ${sus[i] === k + 1 ? "on" : ""}`} title={label}>
                    <input type="radio" name={`sus-${i}`} value={k + 1} checked={sus[i] === k + 1}
                      onChange={() => setSus(sus.map((a, j) => (j === i ? k + 1 : a)))} />
                    <b>{k + 1}</b><small>{label}</small>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card survey-part">
        <h3><span className="survey-num">4</span> Your comments</h3>
        <div className="field"><label htmlFor="sv-liked">What did you like most?</label><textarea className="textarea" id="sv-liked" value={liked} onChange={(e) => setLiked(e.target.value)} /></div>
        <div className="field"><label htmlFor="sv-improve">What was confusing, or what should we improve?</label><textarea className="textarea" id="sv-improve" value={improve} onChange={(e) => setImprove(e.target.value)} /></div>
      </section>

      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="survey-foot">
        <small>Your answers are saved with your account and read only by the FurFriends research team.</small>
        <button className="btn btn-primary" type="submit" disabled={busy || user.isDemo}>{busy ? "Sending…" : "Send answers"}</button>
      </div>
    </form>
  );
}
