import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useUI } from "./UIContext";
import { DocForm, useDeleteDoc } from "./Forms";
import { PetThumb } from "./PetBits";
import Icon from "./Icon";
import { fmtDate, isPdf } from "../lib/utils";

/* Browsers block opening data: URLs in a new tab, so demo files (stored as data URLs) get a blob URL. */
function useFileUrl(src) {
  const local = typeof src === "string" && src.startsWith("data:");
  const [url, setUrl] = useState(local ? null : src);
  useEffect(() => {
    if (!local) { setUrl(src); return; }
    let alive = true, made = null;
    setUrl(null);
    fetch(src).then((r) => r.blob()).then((b) => { if (alive) { made = URL.createObjectURL(b); setUrl(made); } });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [src, local]);
  return url;
}

/* PDFs show inline where the browser can; phones that can't get the fallback with an Open button. */
function PdfView({ doc, url }) {
  if (!url) return null;
  return (
    <object className="doc-pdf" data={url} type="application/pdf" aria-label={doc.title}>
      <div className="pdf-fallback">
        <span className="pdf-tile"><Icon name="file" size={40} /><b>PDF</b></span>
        <b>{doc.title}</b>
        <a className="btn btn-coral" href={url} target="_blank" rel="noreferrer"><Icon name="file" size={16} /> Open PDF</a>
      </div>
    </object>
  );
}

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

  const current = n ? getPet(items[i].petId)?.documents.find((d) => d.id === items[i].docId) : null;
  const fileUrl = useFileUrl(current?.src);
  useEffect(() => { if (!n) closeViewer(); }, [n, closeViewer]);
  if (!n) return null;

  const pet = getPet(items[i].petId);
  const doc = pet.documents.find((d) => d.id === items[i].docId);
  const pdf = isPdf(doc);

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
        {pdf ? <PdfView key={doc.id} doc={doc} url={fileUrl} /> : <img key={doc.id} className="doc-img" src={doc.src} alt={doc.title} />}
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
          {pdf && fileUrl && <a className="btn btn-sm" href={fileUrl} target="_blank" rel="noreferrer"><Icon name="file" size={15} /> Open</a>}
          <a className="btn btn-sm" href={fileUrl || doc.src} download={`${pet.name} - ${doc.title}${pdf ? ".pdf" : ""}`}><Icon name="download" size={15} /> Save</a>
          <button className="btn btn-sm" onClick={() => openModal(<DocForm petId={pet.id} doc={doc} />)}><Icon name="edit" /> Edit details</button>
          <button className="btn btn-sm dang" onClick={() => deleteDoc(pet, doc)}><Icon name="trash" /> Delete</button>
        </div>
      </div>
    </div>
  );
}
