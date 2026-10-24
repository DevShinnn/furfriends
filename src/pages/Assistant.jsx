import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "../components/UIContext";
import Icon from "../components/Icon";
import { askAssistant, conversation, petContext, urgentGuides } from "../lib/assistant";
import { uid } from "../lib/utils";

/* Chat with the FurFriends assistant, optionally about one pet.
   The conversation lives in this tab only (sessionStorage). Only answers someone rates are saved,
   to the assistant_feedback table, so the team can measure accuracy and retrain. */
const chatKey = (user) => `ff-ai-chat:${user.id}`;
const loadChat = (user) => { try { return JSON.parse(sessionStorage.getItem(chatKey(user))) || []; } catch { return []; } };

const REASONS = ["Wrong or inaccurate", "Not about my pet", "Unsafe advice", "Didn't answer my question", "Hard to understand", "Other"];

function suggestions(pet) {
  if (!pet) return ["What vaccines does a puppy need?", "How do I keep my cat cool in hot weather?", "How often should I deworm my dog?", "Ayaw kumain ng aso ko, ano ang gagawin?"];
  const kind = pet.species === "Cat" ? "cat" : "dog";
  return [
    pet.weight ? `Is ${pet.weight} kg a healthy weight for ${pet.name}?` : `What's a healthy weight for ${pet.name}?`,
    `What health problems should I watch for${pet.breed ? ` in a ${pet.breed}` : ""}?`,
    `How do I keep ${pet.name} cool on hot days?`,
    `Ayaw kumain ng ${kind === "cat" ? "pusa" : "aso"} ko, ano ang gagawin?`,
  ];
}

export default function Assistant() {
  const { user, pets, rateAnswer, clearRating } = useStore();
  const { toast } = useUI();
  const [params, setParams] = useSearchParams();
  const petId = params.get("pet") || "";
  const pet = pets.find((p) => p.id === petId) || null;
  const [chat, setChat] = useState(() => loadChat(user));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(null);   // % of the model downloaded, the first time only
  const abort = useRef(null);
  const saving = useRef(Promise.resolve());
  const end = useRef(null);
  const input = useRef(null);

  useEffect(() => { try { sessionStorage.setItem(chatKey(user), JSON.stringify(chat)); } catch { /* ignore */ } }, [chat, user]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [chat, busy]);
  useEffect(() => () => abort.current?.abort(), []);

  const pickPet = (id) => setParams(id ? { pet: id } : {}, { replace: true });

  const send = async (q = text) => {
    q = q.trim();
    if (!q || busy) return;
    const mine = { id: uid(), role: "user", content: q, petName: pet?.name, urgent: urgentGuides(q).map((g) => g.slug) };
    const next = [...chat, mine];
    setChat(next); setText(""); setBusy(true);
    abort.current = new AbortController();
    try {
      const { reply, model, match, related } = await askAssistant({
        user, messages: next.filter((m) => !m.error), pet, signal: abort.current.signal, onStatus: setPreparing,
      });
      // Keep what the assistant saw alongside the answer, in case it's rated later.
      setChat((c) => [...c, {
        id: uid(), fid: crypto.randomUUID(), role: "assistant", content: reply, model, match, related,
        q, petId: pet?.id || null, ctx: petContext(pet), convo: conversation(chat), rating: 0,
      }]);
    } catch (e) {
      if (e.message === "Cancelled") return;
      setChat((c) => [...c, { id: uid(), role: "assistant", error: true, content: e.message }]);
    } finally {
      setBusy(false); setPreparing(null);
      input.current?.focus();
    }
  };

  // Ratings save in order, so a quick change of mind can't be overwritten by an older request.
  const patch = (id, fields) => setChat((c) => c.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  const saveRating = (m) => {
    saving.current = saving.current.then(async () => {
      const err = m.rating
        ? await rateAnswer({ id: m.fid, petId: m.petId, question: m.q, answer: m.content, conversation: m.convo,
            petContext: m.ctx, model: m.model, rating: m.rating, reason: m.reason, comment: m.comment })
        : await clearRating(m.fid);
      if (err) toast(`Couldn't save your rating: ${err}`, "error");
    });
  };
  const rate = (m, rating) => {
    const next = { ...m, rating: m.rating === rating ? 0 : rating, reason: null, comment: "", reasonDone: false };
    patch(m.id, next);
    saveRating(next);
  };
  const explain = (m, reason, comment) => {
    const next = { ...m, reason, comment, reasonDone: true };
    patch(m.id, next);
    if (reason || comment) { saveRating(next); toast("Thanks, that helps the team improve the assistant."); }
  };

  const clear = () => { abort.current?.abort(); setChat([]); setBusy(false); };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } };

  return (
    <>
      <div className="topbar">
        <div><h1>Ask FurFriends</h1><p>Ask in English, Tagalog or Taglish about food, care, behavior or symptoms. Answers come from checked pet-care sources.</p></div>
        {chat.length > 0 && <div className="actions"><button className="btn btn-ghost" onClick={clear}><Icon name="plus" /> New chat</button></div>}
      </div>

      {pets.length > 0 && (
        <div className="ai-about">
          <span>Asking about</span>
          <div className="chips">
            <button className={`chip ${!pet ? "on" : ""}`} onClick={() => pickPet("")}>Pets in general</button>
            {pets.map((p) => (
              <button key={p.id} className={`chip ${pet?.id === p.id ? "on" : ""}`} onClick={() => pickPet(p.id)}>
                {p.photo && <img src={p.photo} alt="" />}{p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="card ai-card">
        <div className="ai-log" aria-live="polite">
          {!chat.length ? (
            <div className="ai-start">
              <div className="ai-start-ic"><Icon name="sparkle" size={28} /></div>
              <h3>{pet ? `What would you like to know about ${pet.name}?` : "What would you like to know?"}</h3>
              <p className="ai-lang"><Icon name="check" size={14} /> Understands Tagalog too, like "nagsusuka ang pusa ko".</p>
              {pet && <p>Answers are picked for {pet.species === "Cat" ? "cats" : "dogs"}, and weight and breed questions use {pet.name}'s breed guide.</p>}
              <div className="ai-suggest">
                {suggestions(pet).map((s) => <button key={s} className="ai-suggestion" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          ) : (
            chat.map((m) => <Message key={m.id} m={m} onRate={rate} onExplain={explain} onAsk={send} />)
          )}
          {busy && (
            <div className="ai-msg bot">
              <div className="ai-bubble ai-typing" aria-label="The assistant is looking for an answer"><span /><span /><span /></div>
              {preparing !== null && <small className="ai-preparing">Getting the assistant ready on your device ({preparing}%). This only happens the first time.</small>}
            </div>
          )}
          <div ref={end} className="ai-end" />
        </div>

        <form className="ai-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="ai-row">
            <textarea ref={input} className="textarea ai-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
              placeholder={pet ? `Ask about ${pet.name}…` : "Ask a question…"} aria-label="Your question" disabled={busy} />
            <button className="btn btn-primary ai-send" type="submit" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
          </div>
          <div className="ai-foot">Pilot: it can pick the wrong answer, and it isn't a vet. In an emergency, go to a vet now.
            <details className="ai-foot-more">
              <summary>How it works</summary>
              An open-source AI on your device picks the closest answer from FurFriends' guides and open pet-care Q&As. Check the question it matched. Rating an answer shares it with the FurFriends team to improve the assistant.
            </details>
          </div>
        </form>
      </section>
    </>
  );
}

function Message({ m, onRate, onExplain, onAsk }) {
  if (m.role === "user") {
    const guides = urgentGuides(m.content);
    return (
      <>
        <div className="ai-msg me"><div className="ai-bubble">{m.content}{m.petName && <small>About {m.petName}</small>}</div></div>
        {guides.length > 0 && (
          <div className="ai-urgent" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <b>This could be an emergency.</b> Don't wait for an answer if your pet is struggling. Follow the guide and go to a vet.
              <div className="ai-urgent-links">
                {guides.map((g) => <Link key={g.slug} className="btn btn-sm em-card-btn" to={`/app/emergency/${g.slug}`}><Icon name={g.icon} size={14} /> {g.title}</Link>)}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="ai-msg bot">
      <span className="ai-avatar" aria-hidden="true"><Icon name="sparkle" size={17} /></span>
      <div className="ai-turn">
        <div className={`ai-bubble ${m.error ? "is-error" : ""}`}><Reply text={m.content} /></div>
        {m.match && <Source match={m.match} />}
        {m.related?.length > 0 && (
          <div className="ai-related">
            <span>Similar questions:</span>
            {m.related.map((r) => <button key={r.q} type="button" className="chip sm" onClick={() => onAsk(r.q)}>{r.q}</button>)}
          </div>
        )}
        {m.fid && <Rating m={m} onRate={onRate} onExplain={onExplain} />}
      </div>
    </div>
  );
}

/* Where the answer came from: owners can check it, and Stack Exchange's license requires the credit. */
function Source({ match }) {
  const inApp = match.url?.startsWith("#/");
  const label = match.source || "FurFriends";
  return (
    <small className="ai-source">
      {match.kind === "qa" && <>Matched: “{match.q}” · </>}
      {inApp ? <Link to={match.url.slice(1)}>{label}</Link>
        : match.url ? <a href={match.url} target="_blank" rel="noopener noreferrer">{label}</a> : label}
    </small>
  );
}

function Rating({ m, onRate, onExplain }) {
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const label = m.rating === 1 ? "Thanks! Glad it helped." : m.rating === -1 ? "Thanks for telling us." : "Was this helpful?";
  return (
    <>
      <div className="ai-rate">
        <span>{label}</span>
        <button type="button" className={`ai-rate-btn ${m.rating === 1 ? "on" : ""}`} onClick={() => onRate(m, 1)} aria-pressed={m.rating === 1} aria-label="Helpful"><Icon name="thumbUp" size={15} /></button>
        <button type="button" className={`ai-rate-btn down ${m.rating === -1 ? "on" : ""}`} onClick={() => onRate(m, -1)} aria-pressed={m.rating === -1} aria-label="Not helpful"><Icon name="thumbDown" size={15} /></button>
      </div>
      {m.rating === -1 && !m.reasonDone && (
        <form className="ai-why" onSubmit={(e) => { e.preventDefault(); onExplain(m, reason, comment.trim()); }}>
          <b>What was wrong?</b>
          <div className="chips">
            {REASONS.map((r) => <button key={r} type="button" className={`chip sm ${reason === r ? "on" : ""}`} onClick={() => setReason(reason === r ? null : r)}>{r}</button>)}
          </div>
          <textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="What should the answer have said? (optional)" aria-label="What should the answer have said?" />
          <div className="ai-why-acts">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExplain(m, null, "")}>Skip</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!reason && !comment.trim()}>Send</button>
          </div>
        </form>
      )}
      {m.rating === -1 && m.reasonDone && m.reason && <small className="ai-why-done">{m.reason}{m.comment && ` · “${m.comment}”`}</small>}
    </>
  );
}

/* Plain-text replies with paragraphs and "- " / "1. " lists. No HTML from the model is rendered. */
function Reply({ text }) {
  return text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n");
    const bullets = lines.filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (bullets.length && bullets.length >= lines.length - 1) {
      const head = bullets.length < lines.length ? lines[0] : null;
      const Tag = /^\s*\d/.test(bullets[0]) ? "ol" : "ul";
      return (
        <div key={i}>
          {head && <p>{head}</p>}
          <Tag>{bullets.map((l, j) => <li key={j}>{l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}</li>)}</Tag>
        </div>
      );
    }
    return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{l}</span>)}</p>;
  });
}
