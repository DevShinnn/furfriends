import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import DocViewer from "./DocViewer";

const UICtx = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [viewer, setViewer] = useState(null); // { items: [{petId, docId}], i }
  const location = useLocation();

  const toast = useCallback((msg, type = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);
  const openModal = useCallback((node) => setModal(node), []);
  const confirm = useCallback((opts) => setModal(<ConfirmDialog {...opts} />), []);
  const openViewer = useCallback((items, i = 0) => items.length && setViewer({ items, i }), []);
  const closeViewer = useCallback(() => setViewer(null), []);

  // Route changes close any overlay and reset scroll.
  useEffect(() => { setModal(null); setViewer(null); window.scrollTo(0, 0); }, [location.pathname]);

  // Escape closes the topmost overlay.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else if (viewer) setViewer(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, viewer]);

  useEffect(() => {
    document.body.style.overflow = viewer ? "hidden" : "";
  }, [viewer]);

  const value = { toast, openModal, closeModal, confirm, openViewer, closeViewer, modalOpen: !!modal };

  return (
    <UICtx.Provider value={value}>
      {children}
      {viewer && <DocViewer state={viewer} setState={setViewer} />}
      {modal}
      <div id="toast-root" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.type === "error" ? " error" : "")}><Icon name="check" /><span>{t.msg}</span></div>
        ))}
      </div>
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);

/* Generic modal shell. `onSubmit` returns an error string to show, or nothing on success. */
export function Modal({ title, size = "", children, footer, onSubmit, error }) {
  const { closeModal } = useUI();
  const formRef = useRef(null);
  useEffect(() => {
    const first = formRef.current?.querySelector(".modal-body input:not([type=radio]):not([type=file]), .modal-body select, .modal-body textarea");
    first?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <form ref={formRef} className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title} noValidate
        onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={closeModal} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          {children}
        </div>
        <div className="modal-foot">{footer}</div>
      </form>
    </div>
  );
}

function ConfirmDialog({ title, text, confirmLabel = "Delete", onConfirm }) {
  const { closeModal } = useUI();
  return (
    <Modal title={title} size="sm" onSubmit={() => { closeModal(); onConfirm(); }}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
        <button className="btn btn-danger" type="submit">{confirmLabel}</button>
      </>}>
      <p style={{ color: "var(--ink-2)" }}>{text}</p>
    </Modal>
  );
}
