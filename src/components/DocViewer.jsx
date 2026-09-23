import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "./UIContext";
import { DocForm, useDeleteDoc } from "./Forms";
import { PetThumb } from "./PetBits";
import Icon from "./Icon";
import { fmtDate } from "../lib/utils";

/* Full-screen viewer for vet documents, with prev/next, keyboard and swipe. */
export default function DocViewer({ state, setState }) {
  const { getPet } = useStore();
  const { openModal, closeViewer, modalOpen } = useUI();
  const deleteDoc = useDeleteDoc();
  const touchX = useRef(null);

  // Drop items whose document or pet has been deleted.
  const items = state.items.filter((it) => getPet(it.petId)?.documents.some((d) => d.id === it.docId));
  const n = items.length;
  const i = Math.min(state.i, n - 1);
  const step = (k) => setState({ items, i: (i + k + n) % n });

  useEffect(() => {
    const onKey = (e) => {
      if (modalOpen || n < 2) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => { if (!n) closeViewer(); }, [n, closeViewer]);
  if (!n) return null;

  const pet = getPet(items[i].petId);
  const doc = pet.documents.find((d) => d.id === items[i].docId);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Document viewer"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
        if (Math.abs(dx) > 50 && n > 1) step(dx < 0 ? 1 : -1);
      }}>
      <div className="lb-top">
        <span className="count">{n > 1 ? `${i + 1} / ${n}` : ""}</span>
        <button className="icon-btn" onClick={closeViewer} aria-label="Close viewer"><Icon name="close" /></button>
      </div>
      <div className="lb-stage" onClick={(e) => e.target === e.currentTarget && closeViewer()}>
        <img key={doc.id} className="doc-img" src={doc.src} alt={doc.title} />
        {n > 1 && <>
          <button className="lb-nav prev" onClick={() => step(-1)} aria-label="Previous document"><Icon name="chevL" /></button>
          <button className="lb-nav next" onClick={() => step(1)} aria-label="Next document"><Icon name="chevR" /></button>
        </>}
      </div>
      <div className="lb-bar">
        <div className="who">
          <PetThumb pet={pet} size={44} />
          <div>
            <b>{doc.title}</b>
            <small>
              {doc.type} · <Link to={`/app/pets/${pet.id}?tab=documents`} onClick={closeViewer} style={{ textDecoration: "underline" }}>{pet.name}</Link> · {fmtDate(doc.date)}
              {doc.notes ? ` · ${doc.notes}` : ""}
            </small>
          </div>
        </div>
        <div className="acts">
          <a className="btn btn-sm" href={doc.src} download={`${pet.name} - ${doc.title}`}><Icon name="download" size={15} /> Save</a>
          <button className="btn btn-sm" onClick={() => openModal(<DocForm petId={pet.id} doc={doc} />)}><Icon name="edit" /> Edit details</button>
          <button className="btn btn-sm dang" onClick={() => deleteDoc(pet, doc)}><Icon name="trash" /> Delete</button>
        </div>
      </div>
    </div>
  );
}
