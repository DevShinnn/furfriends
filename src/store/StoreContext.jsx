import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { uid, hash, isEmail, todayISO } from "../lib/utils";
import { shiftISO } from "../lib/care";
import { demoPets, DEMO_EMAIL, DEMO_PASS } from "../lib/demoData";

/* All data lives in localStorage (demo only — a real deployment would
   authenticate and store data/files on a server). */
const KEY = "pawfile.react.v2";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const EMPTY = { users: [], pets: [], session: null };

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(() => load() || EMPTY);
  const ref = useRef(db);

  // Persist first; only update state if the write succeeded (quota errors on big images).
  const commit = useCallback((updater) => {
    const next = updater(ref.current);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { return false; }
    ref.current = next;
    setDb(next);
    return true;
  }, []);

  const api = useMemo(() => {
    const user = db.users.find((u) => u.id === db.session) || null;
    const pets = db.pets.filter((p) => p.ownerId === db.session);
    const getPet = (id) => pets.find((p) => p.id === id) || null;
    const mapPet = (d, id, fn) => ({ ...d, pets: d.pets.map((p) => (p.id === id ? fn(p) : p)) });

    function withDemo(d, reset) {
      let u = d.users.find((x) => x.email === DEMO_EMAIL);
      let users = d.users;
      if (!u) {
        u = { id: uid(), name: "Alex Rivera", email: DEMO_EMAIL, isDemo: true, createdAt: Date.now() - 400 * 86400000 };
        users = [...users, u];
        reset = true;
      }
      if (!reset) return { d: { ...d, users }, u };
      const fresh = { ...u, name: "Alex Rivera", phone: "0917 123 4567", city: "Quezon City", password: hash(DEMO_PASS) };
      return {
        d: { ...d, users: users.map((x) => (x.id === u.id ? fresh : x)), pets: d.pets.filter((p) => p.ownerId !== u.id).concat(demoPets(u.id)) },
        u: fresh,
      };
    }

    return {
      db, user, pets, getPet,

      demoLogin() { commit((d) => { const r = withDemo(d, false); return { ...r.d, session: r.u.id }; }); },
      resetDemo() { commit((d) => withDemo(d, true).d); },

      login(email, password) {
        email = (email || "").trim().toLowerCase();
        if (!email || !password) return "Please enter your email and password.";
        let d = ref.current;
        if (email === DEMO_EMAIL) d = withDemo(d, false).d;
        const u = d.users.find((x) => x.email === email);
        if (!u || u.password !== hash(password)) return "Incorrect email or password.";
        commit(() => ({ ...d, session: u.id }));
        return null;
      },

      register({ name, email, password, confirm }) {
        email = (email || "").trim().toLowerCase();
        if (!name.trim()) return "Please enter your name.";
        if (!isEmail(email)) return "Please enter a valid email address.";
        if (email === DEMO_EMAIL || ref.current.users.some((x) => x.email === email)) return "An account with this email already exists.";
        if ((password || "").length < 8) return "Password must be at least 8 characters.";
        if (password !== confirm) return "Passwords don't match.";
        const u = { id: uid(), name: name.trim(), email, phone: "", city: "", password: hash(password), createdAt: Date.now() };
        commit((d) => ({ ...d, users: [...d.users, u], session: u.id }));
        return null;
      },

      logout() { commit((d) => ({ ...d, session: null })); },

      updateUser({ name, email, phone, city }) {
        email = (email || "").trim().toLowerCase();
        if (!name.trim()) return "Name can't be empty.";
        if (!isEmail(email)) return "Please enter a valid email address.";
        if (ref.current.users.some((x) => x.email === email && x.id !== user.id)) return "That email is used by another account.";
        if (user.isDemo && email !== DEMO_EMAIL) return "The demo account's email can't be changed.";
        commit((d) => ({ ...d, users: d.users.map((x) => (x.id === user.id ? { ...x, name: name.trim(), email, phone: phone.trim(), city: city.trim() } : x)) }));
        return null;
      },

      changePassword({ current, next, confirm }) {
        if (user.password !== hash(current || "")) return "Current password is incorrect.";
        if ((next || "").length < 8) return "New password must be at least 8 characters.";
        if (next !== confirm) return "New passwords don't match.";
        commit((d) => ({ ...d, users: d.users.map((x) => (x.id === user.id ? { ...x, password: hash(next) } : x)) }));
        return null;
      },

      addPet(fields) {
        const pet = { id: uid(), ownerId: user.id, createdAt: Date.now(), photo: null, medical: [], vaccinations: [], documents: [], feeding: [], care: [], fedLog: {}, ...fields };
        return commit((d) => ({ ...d, pets: [...d.pets, pet] })) ? pet.id : null;
      },
      updatePet(id, fields) { return commit((d) => mapPet(d, id, (p) => ({ ...p, ...fields }))); },
      deletePet(id) { return commit((d) => ({ ...d, pets: d.pets.filter((p) => p.id !== id) })); },

      // list: "medical" | "vaccinations" | "documents" | "feeding" | "care"
      upsertItem(petId, list, item) {
        return commit((d) => mapPet(d, petId, (p) => {
          const cur = p[list] || [];
          const exists = item.id && cur.some((x) => x.id === item.id);
          return { ...p, [list]: exists ? cur.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...cur, { ...item, id: uid() }] };
        }));
      },
      removeItem(petId, list, itemId) {
        return commit((d) => mapPet(d, petId, (p) => ({ ...p, [list]: (p[list] || []).filter((x) => x.id !== itemId) })));
      },

      // Tick a meal as fed (or not) for a given day. Only the last 14 days of log are kept.
      toggleFed(petId, feedId, iso = todayISO()) {
        return commit((d) => mapPet(d, petId, (p) => {
          const log = { ...(p.fedLog || {}) };
          const day = log[iso] || [];
          log[iso] = day.includes(feedId) ? day.filter((x) => x !== feedId) : [...day, feedId];
          const cutoff = shiftISO(todayISO(), -14);
          for (const k of Object.keys(log)) if (k < cutoff) delete log[k];
          return { ...p, fedLog: log };
        }));
      },

      // Mark a care task done: repeating tasks roll forward from today, one-offs are closed.
      completeCare(petId, taskId) {
        const today = todayISO();
        return commit((d) => mapPet(d, petId, (p) => ({
          ...p,
          care: (p.care || []).map((t) => t.id !== taskId ? t
            : Number(t.repeatDays) ? { ...t, lastDone: today, nextDue: shiftISO(today, Number(t.repeatDays)) }
            : { ...t, lastDone: today, done: true }),
        })));
      },
      reopenCare(petId, taskId) {
        return commit((d) => mapPet(d, petId, (p) => ({ ...p, care: (p.care || []).map((t) => (t.id === taskId ? { ...t, done: false } : t)) })));
      },
    };
  }, [db, commit]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
