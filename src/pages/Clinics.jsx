import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useStore } from "../store/StoreContext";
import Icon from "../components/Icon";
import {
  WEEKDAYS, dayText, directionsUrl, distanceKm, is24h, kmText, locate, locationAllowed, openState, searchClinics, telUrl, todayIndex,
} from "../lib/clinics";

/* Vet clinics near the owner: from the phone's location, or the address saved in Profile.
   Loaded on its own (App.jsx lazy-loads it), so the map library only downloads when this page opens. */

let last = null;   // the last search, kept while the app is open so coming back doesn't search again
const KEEP_MS = 10 * 60 * 1000;

export default function Clinics() {
  const { user } = useStore();
  const saved = (user.address || user.city || "").trim();
  const [state, setState] = useState(() => (last && Date.now() - last.at < KEEP_MS ? { status: "done", ...last } : { status: "idle" }));
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const run = async (how) => {
    setSelected(null);
    try {
      let origin, result;
      if (how === "gps") {
        setState({ status: "locating" });
        const at = await locate();
        setState({ status: "loading" });
        result = await searchClinics({ lat: at.lat, lon: at.lon });
        origin = { lat: at.lat, lon: at.lon, kind: "gps", label: "your location" };
      } else {
        setState({ status: "loading" });
        result = await searchClinics({ address: saved });
        origin = { ...result.from, kind: "address", label: result.place || saved };
      }
      last = { origin, result, at: Date.now() };
      setState({ status: "done", ...last });
    } catch (e) {
      setState({ status: "error", error: e.message, how });
    }
  };

  useEffect(() => {
    if (state.status !== "idle") return;
    let off = false;
    locationAllowed().then((ok) => { if (!off) { if (ok) run("gps"); else if (saved) run("address"); } });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { origin, result } = state;
  const clinics = useMemo(() => {
    if (!result) return [];
    return result.clinics
      .map((c) => ({ ...c, km: distanceKm(origin, c), status: openState(c) }))
      .sort((a, b) => a.km - b.km)
      .map((c, i) => ({ ...c, n: i + 1 }));
  }, [result, origin]);
  const shown = clinics.filter((c) => filter === "all" || (filter === "open" ? c.status.open : is24h(c)));
  const counts = { open: clinics.filter((c) => c.status.open).length, h24: clinics.filter(is24h).length };
  const busy = state.status === "locating" || state.status === "loading";

  return (
    <>
      <div className="topbar">
        <div><h1>Find a vet</h1><p>Vet clinics near you, with opening hours, directions and a call button.</p></div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => run("gps")} disabled={busy}><Icon name="locate" /> Use my location</button>
          {saved && <button className="btn btn-soft" onClick={() => run("address")} disabled={busy}><Icon name="home" size={17} /> Use my address</button>}
        </div>
      </div>

      {state.status === "idle" && (
        <div className="card empty">
          <div className="ic"><Icon name="pin" size={32} /></div>
          <h3>Find clinics near you</h3>
          <p>Share your location to see the nearest vet clinics, or {saved ? "search around the address in your profile." : <>add your address in <Link to="/app/profile">Profile</Link>.</>}</p>
          <button className="btn btn-primary" onClick={() => run("gps")}><Icon name="locate" /> Use my location</button>
        </div>
      )}
      {busy && <div className="card empty small"><span className="spinner" /> {state.status === "locating" ? "Finding where you are…" : "Looking for clinics near you…"}</div>}
      {state.status === "error" && (
        <div className="card empty small">
          <p className="error-msg" style={{ marginBottom: 12 }}>{state.error}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-soft btn-sm" onClick={() => run(state.how)}>Try again</button>
            {state.how === "gps" && (saved
              ? <button className="btn btn-soft btn-sm" onClick={() => run("address")}>Use my address</button>
              : <Link className="btn btn-soft btn-sm" to="/app/profile">Add my address</Link>)}
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="clinics">
          <div className="clinic-map-wrap">
            <ClinicMap origin={origin} clinics={shown} selected={selected} onSelect={setSelected} />
          </div>
          <section className="clinic-side">
            <p className="clinic-from">
              <Icon name="pin" size={15} /> {clinics.length ? `${clinics.length} clinic${clinics.length === 1 ? "" : "s"} within ${result.radius / 1000} km of ${origin.label}` : `No clinics found within ${result.radius / 1000} km of ${origin.label}`}
            </p>
            {clinics.length > 0 && (
              <div className="chips" role="group" aria-label="Show">
                <button className={`chip sm ${filter === "all" ? "on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
                <button className={`chip sm ${filter === "open" ? "on" : ""}`} aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Open now ({counts.open})</button>
                {counts.h24 > 0 && <button className={`chip sm ${filter === "24h" ? "on" : ""}`} aria-pressed={filter === "24h"} onClick={() => setFilter("24h")}>24 hours ({counts.h24})</button>}
              </div>
            )}
            {filter === "open" && !shown.length && <p className="clinic-none">No clinic here is listed as open right now. Many have no hours listed, so call them, or try a 24-hour clinic.</p>}
            <ol className="clinic-list">
              {shown.map((c) => <ClinicCard key={c.id} c={c} on={selected === c.id} origin={origin} onSelect={setSelected} />)}
            </ol>
            <p className="clinic-note"><Icon name="info" size={14} /> Clinics and hours come from TomTom and can be out of date. Call before you go, especially in an emergency.</p>
          </section>
        </div>
      )}
    </>
  );
}

function ClinicCard({ c, on, origin, onSelect }) {
  const ref = useRef(null);
  useEffect(() => { if (on) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [on]);
  const today = todayIndex(c);
  const tone = c.status.open === true ? "ok" : c.status.open === false ? "warn" : "neutral";
  return (
    <li ref={ref} className={`clinic${on ? " on" : ""}`}>
      <button className="clinic-main" onClick={() => onSelect(on ? null : c.id)} aria-expanded={on}>
        <span className="clinic-n">{c.n}</span>
        <span className="grow">
          <span className="clinic-top"><b>{c.name}</b><span className="clinic-km">{kmText(c.km)}</span></span>
          {c.address && <span className="clinic-addr">{c.address}</span>}
          <span className={`pill ${tone}`}><span className="dot" />{c.status.text}</span>
        </span>
      </button>
      {on && c.hours && (
        <table className="clinic-hours"><tbody>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => <tr key={d} className={d === today ? "today" : ""}><td>{WEEKDAYS[d]}</td><td>{dayText(c.hours[d])}</td></tr>)}
        </tbody></table>
      )}
      <div className="clinic-actions">
        <a className="btn btn-primary btn-sm" href={directionsUrl(c, origin.kind === "address" ? origin : null)} target="_blank" rel="noopener noreferrer"><Icon name="route" size={15} /> Directions</a>
        {c.phone && <a className="btn btn-soft btn-sm" href={telUrl(c.phone)}><Icon name="phone" size={15} /> Call {c.phone}</a>}
        {!on && c.hours && <button className="btn btn-soft btn-sm" onClick={() => onSelect(c.id)}><Icon name="clock" size={15} /> Hours</button>}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- map (Leaflet + OpenStreetMap tiles) */
function ClinicMap({ origin, clinics, selected, onSelect }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const pins = useRef(new Map());

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · clinics: TomTom',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  useEffect(() => {
    const m = map.current;
    layer.current.clearLayers();
    pins.current.clear();
    const me = L.marker([origin.lat, origin.lon], {
      icon: L.divIcon({ className: "map-me", html: "<span></span>", iconSize: [20, 20] }), title: origin.kind === "gps" ? "You are here" : "Your address", zIndexOffset: 1000,
    }).addTo(layer.current);
    me.bindTooltip(origin.kind === "gps" ? "You are here" : "Your address");
    for (const c of clinics) {
      const pin = L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className: `map-pin${c.status.open ? " open" : ""}`, html: `<span><i>${c.n}</i></span>`, iconSize: [28, 28], iconAnchor: [14, 28] }),
        title: c.name, riseOnHover: true,
      }).addTo(layer.current);
      pin.on("click", () => onSelect(c.id));
      pins.current.set(c.id, pin);
    }
    const near = clinics.slice(0, 8).map((c) => [c.lat, c.lon]);
    m.fitBounds(L.latLngBounds([[origin.lat, origin.lon], ...near]).pad(0.15), { maxZoom: 15 });
  }, [origin, clinics, onSelect]);

  useEffect(() => {
    for (const [id, pin] of pins.current) {
      const el = pin.getElement();
      el?.classList.toggle("on", id === selected);
      pin.setZIndexOffset(id === selected ? 900 : 0);
    }
    const pin = pins.current.get(selected);
    if (pin) map.current.panTo(pin.getLatLng());
  }, [selected, clinics]);

  return <div ref={box} className="clinic-map" role="region" aria-label="Map of nearby clinics" />;
}
