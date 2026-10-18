import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isEmail, todayISO, mimeOf } from "../lib/utils";
import { shiftISO } from "../lib/care";
import { demoPets, DEMO_EMAIL, DEMO_PASS } from "../lib/demoData";

/* Real accounts live in Supabase (Auth + Postgres + Storage, see supabase/migrations).
   The demo account stays in this browser's localStorage so it works without signing up.

   Pet-data mutations stay synchronous for the UI: state updates immediately, and the
   matching Supabase write is queued so writes reach the server in order. If a write
   fails, the error is surfaced and everything is reloaded from the server. */
const DEMO_KEY = "furfriends.demo.v1";
const PHOTOS = "pet-photos";
const DOCS = "pet-documents";
const URL_TTL = 60 * 60 * 24 * 7; // signed file links last a week
const FED_DAYS = 14;              // only the last 2 weeks of feeding log are loaded
const EMPTY = { user: null, pets: [] };

// crypto.randomUUID needs a secure context; fall back for http:// LAN testing on phones.
const newId = () => crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
const redirectTo = () => window.location.origin + window.location.pathname;

/* ---------------------------------------------------------------- row mapping (app camelCase ↔ db snake_case) */
const TABLES = { medical: "medical_records", vaccinations: "vaccinations", documents: "documents", feeding: "feeding_schedules", care: "care_tasks" };
const hhmm = (t) => (t ? t.slice(0, 5) : "");
const orNull = (v) => (v === "" || v == null ? null : v);

const FROM = {
  medical: (r) => ({ id: r.id, date: r.date, type: r.type, title: r.title, vet: r.vet, notes: r.notes }),
  vaccinations: (r) => ({ id: r.id, name: r.name, dateGiven: r.date_given, nextDue: r.next_due || "", vet: r.vet, lot: r.lot }),
  documents: (r) => ({ id: r.id, title: r.title, type: r.type, date: r.date, notes: r.notes, filePath: r.file_path, mimeType: r.mime_type, src: null }),
  feeding: (r) => ({ id: r.id, time: hhmm(r.time), food: r.food, amount: r.amount, days: r.days || [], notes: r.notes }),
  care: (r) => ({ id: r.id, kind: r.kind, title: r.title, nextDue: r.next_due, dueTime: hhmm(r.due_time), repeatDays: r.repeat_days, lastDone: r.last_done, done: r.done, notes: r.notes }),
};
const TO = {
  medical: (x) => ({ date: x.date, type: x.type, title: x.title, vet: x.vet || "", notes: x.notes || "" }),
  vaccinations: (x) => ({ name: x.name, date_given: x.dateGiven, next_due: orNull(x.nextDue), vet: x.vet || "", lot: x.lot || "" }),
  documents: (x) => ({ title: x.title, type: x.type, date: x.date, notes: x.notes || "", file_path: x.filePath, mime_type: x.mimeType || "image/jpeg" }),
  feeding: (x) => ({ time: x.time, food: x.food, amount: x.amount || "", days: x.days || [], notes: x.notes || "" }),
  care: (x) => ({ kind: x.kind, title: x.title, next_due: x.nextDue, due_time: orNull(x.dueTime), repeat_days: Number(x.repeatDays) || 0, last_done: orNull(x.lastDone), done: !!x.done, notes: x.notes || "" }),
};
const petToDb = (p) => ({
  name: p.name, species: p.species, breed: p.breed || "", age_years: Number(p.ageYears) || 0, age_months: Number(p.ageMonths) || 0,
  gender: p.gender || null, weight_kg: orNull(p.weight),
});

/* ---------------------------------------------------------------- server I/O */
const isNewFile = (src) => typeof src === "string" && src.startsWith("data:");

async function upload(bucket, path, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type });
  if (error) throw error;
}

async function removeFolder(bucket, prefix) {
  const { data } = await supabase.storage.from(bucket).list(prefix);
  if (data?.length) await supabase.storage.from(bucket).remove(data.map((f) => `${prefix}/${f.name}`));
}

// Files are private, so stored paths are swapped for signed links when loading.
async function signAll(bucket, paths) {
  paths = [...new Set(paths.filter(Boolean))];
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, URL_TTL);
  if (error) throw error;
  return Object.fromEntries(data.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

async function fetchAll(authUser) {
  const [prof, res] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle(),
    supabase.from("pets")
      .select("*, medical_records(*), vaccinations(*), documents(*), feeding_schedules(*), care_tasks(*), feeding_log(feeding_id, fed_on)")
      .gte("feeding_log.fed_on", shiftISO(todayISO(), -FED_DAYS))
      .order("created_at")
      .order("created_at", { referencedTable: "medical_records" })
      .order("created_at", { referencedTable: "vaccinations" })
      .order("created_at", { referencedTable: "documents" })
      .order("time", { referencedTable: "feeding_schedules" })
      .order("created_at", { referencedTable: "care_tasks" }),
  ]);
  if (prof.error) throw prof.error;
  if (res.error) throw res.error;

  const pets = res.data.map((r) => {
    const fedLog = {};
    for (const l of r.feeding_log) (fedLog[l.fed_on] ||= []).push(l.feeding_id);
    return {
      id: r.id, ownerId: r.owner_id, createdAt: Date.parse(r.created_at),
      name: r.name, species: r.species, breed: r.breed, ageYears: r.age_years, ageMonths: r.age_months,
      gender: r.gender || "", weight: r.weight_kg == null ? "" : Number(r.weight_kg),
      photoPath: r.photo_path, photo: null,
      medical: r.medical_records.map(FROM.medical),
      vaccinations: r.vaccinations.map(FROM.vaccinations),
      documents: r.documents.map(FROM.documents),
      feeding: r.feeding_schedules.map(FROM.feeding),
      care: r.care_tasks.map(FROM.care),
      fedLog,
    };
  });
  const [photoUrls, docUrls] = await Promise.all([
    signAll(PHOTOS, pets.map((p) => p.photoPath)),
    signAll(DOCS, pets.flatMap((p) => p.documents.map((d) => d.filePath))),
  ]);
  for (const p of pets) {
    p.photo = photoUrls[p.photoPath] || null;
    for (const d of p.documents) d.src = docUrls[d.filePath] || null;
  }

  const p = prof.data || {};
  const user = {
    id: authUser.id, email: authUser.email, name: p.name || "", phone: p.phone || "", city: p.city || "",
    notificationsEnabled: p.notifications_enabled ?? true, createdAt: Date.parse(authUser.created_at),
  };
  return { user, pets };
}

function authMessage(error) {
  const c = error.code || "";
  if (c === "invalid_credentials" || /invalid login/i.test(error.message)) return "Incorrect email or password.";
  if (c === "email_not_confirmed") return "Please confirm your email first — check your inbox for the link.";
  if (c === "user_already_exists" || c === "email_exists") return "An account with this email already exists.";
  if (c === "over_email_send_rate_limit") return "Too many emails sent — please wait a minute and try again.";
  return error.message || "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------- demo account (browser only) */
const loadDemo = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || null; } catch { return null; } };
const demoUser = () => ({
  id: "demo", name: "Alex Rivera", email: DEMO_EMAIL, phone: "0917 123 4567", city: "Quezon City",
  isDemo: true, notificationsEnabled: true, createdAt: Date.now() - 400 * 86400000,
});
const freshDemo = () => { const user = demoUser(); return { user, pets: demoPets(user.id) }; };

/* ---------------------------------------------------------------- provider */
const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const ref = useRef(db);
  const queue = useRef(Promise.resolve());

  const set = useCallback((next) => { ref.current = next; setDb(next); }, []);

  // Demo data is persisted to localStorage; real accounts persist through `remote` below.
  // Returns false (and changes nothing) if the browser's storage is full.
  const commit = useCallback((updater) => {
    const next = updater(ref.current);
    if (next.user?.isDemo) {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify({ ...next, active: true })); } catch { return false; }
    }
    set(next);
    return true;
  }, [set]);

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return set(EMPTY);
    try { set(await fetchAll(data.session.user)); } catch (e) { setSyncError(e.message); }
  }, [set]);

  // Queue a server write. Tasks run one at a time, in the order they were made.
  const remote = useCallback((task) => {
    if (!ref.current.user || ref.current.user.isDemo) return;
    queue.current = queue.current
      .then(task)
      .then((r) => { if (r?.error) throw r.error; })
      .catch((e) => { console.error(e); setSyncError(e.message || String(e)); return reload(); });
  }, [reload]);

  // Restore the session on startup.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const demo = loadDemo();
      let next = EMPTY;
      if (data.session) {
        try { next = await fetchAll(data.session.user); }
        catch (e) { setSyncError(`Couldn't load your data (${e.message}).`); }
      } else if (demo?.active) {
        next = { user: demo.user, pets: demo.pets };
      }
      if (!alive) return;
      set(next);
      setReady(true);
    })();
    // Session ended elsewhere (other tab, expired refresh token).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !ref.current.user?.isDemo) set(EMPTY);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [set]);

  const api = useMemo(() => {
    const { user, pets } = db;
    const getPet = (id) => pets.find((p) => p.id === id) || null;
    const setPets = (fn) => commit((d) => ({ ...d, pets: fn(d.pets) }));
    const mapPet = (ps, id, fn) => ps.map((p) => (p.id === id ? fn(p) : p));
    const live = (petId) => ref.current.pets.find((p) => p.id === petId);
    const liveItem = (petId, list, id) => (live(petId)?.[list] || []).find((x) => x.id === id);
    const patchItem = (petId, list, id, fields) =>
      setPets((ps) => mapPet(ps, petId, (p) => ({ ...p, [list]: p[list].map((x) => (x.id === id ? { ...x, ...fields } : x)) })));

    async function enter(authUser) {
      try { set(await fetchAll(authUser)); return null; }
      catch (e) { await supabase.auth.signOut(); return `Couldn't load your data (${e.message}).`; }
    }
    function startDemo(reset) {
      const saved = !reset && loadDemo();
      commit(() => (saved?.user ? { user: saved.user, pets: saved.pets } : freshDemo()));
    }

    return {
      ready, user, pets, getPet,
      syncError, clearSyncError: () => setSyncError(null),

      /* ------------------------------------------------ account */
      demoLogin() { startDemo(false); },
      resetDemo() { startDemo(true); },

      async login(email, password) {
        email = (email || "").trim().toLowerCase();
        if (!email || !password) return "Please enter your email and password.";
        if (email === DEMO_EMAIL) {
          if (password !== DEMO_PASS) return "Incorrect email or password.";
          startDemo(false);
          return null;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return authMessage(error);
        return enter(data.user);
      },

      // Resolves to { error } or { confirmEmail: true } when Supabase requires email confirmation.
      async register({ name, email, password, confirm }) {
        email = (email || "").trim().toLowerCase();
        if (!name.trim()) return { error: "Please enter your name." };
        if (!isEmail(email)) return { error: "Please enter a valid email address." };
        if (email === DEMO_EMAIL) return { error: "An account with this email already exists." };
        if ((password || "").length < 8) return { error: "Password must be at least 8 characters." };
        if (password !== confirm) return { error: "Passwords don't match." };
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { name: name.trim() }, emailRedirectTo: redirectTo() },
        });
        if (error) return { error: authMessage(error) };
        // With confirmation on, an existing email comes back as a user with no identities.
        if (data.user && !data.user.identities?.length) return { error: "An account with this email already exists." };
        if (!data.session) return { confirmEmail: true };
        return { error: await enter(data.user) };
      },

      logout() {
        if (ref.current.user?.isDemo) {
          try { localStorage.setItem(DEMO_KEY, JSON.stringify({ ...ref.current, active: false })); } catch { /* ignore */ }
        } else {
          supabase.auth.signOut();
        }
        set(EMPTY);
      },

      // Resolves to { error } or { notice } (email changes need confirming from the new inbox).
      async updateUser({ name, email, phone, city }) {
        email = (email || "").trim().toLowerCase();
        name = name.trim(); phone = phone.trim(); city = city.trim();
        if (!name) return { error: "Name can't be empty." };
        if (!isEmail(email)) return { error: "Please enter a valid email address." };
        if (user.isDemo) {
          if (email !== DEMO_EMAIL) return { error: "The demo account's email can't be changed." };
          commit((d) => ({ ...d, user: { ...d.user, name, phone, city } }));
          return {};
        }
        const r = await supabase.from("profiles").update({ name, phone, city }).eq("id", user.id);
        if (r.error) return { error: r.error.message };
        let notice = null;
        if (email !== user.email) {
          const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() });
          if (error) return { error: authMessage(error) };
          notice = `We sent a confirmation link to ${email}. Your email changes once you click it.`;
        }
        commit((d) => ({ ...d, user: { ...d.user, name, phone, city } }));
        return { notice };
      },

      // Turns reminders on or off for this account (saved to the profile, so it follows the user).
      setNotifications(on) {
        commit((d) => ({ ...d, user: { ...d.user, notificationsEnabled: on } }));
        remote(() => supabase.from("profiles").update({ notifications_enabled: on }).eq("id", user.id));
      },

      async changePassword({ current, next, confirm }) {
        if (user.isDemo) return "The demo account's password can't be changed.";
        if ((next || "").length < 8) return "New password must be at least 8 characters.";
        if (next !== confirm) return "New passwords don't match.";
        const check = await supabase.auth.signInWithPassword({ email: user.email, password: current || "" });
        if (check.error) return "Current password is incorrect.";
        const { error } = await supabase.auth.updateUser({ password: next });
        return error ? authMessage(error) : null;
      },

      /* ------------------------------------------------ pets */
      addPet(fields) {
        const id = newId();
        const pet = { id, ownerId: user.id, createdAt: Date.now(), photo: null, photoPath: null, medical: [], vaccinations: [], documents: [], feeding: [], care: [], fedLog: {}, ...fields };
        if (!setPets((ps) => [...ps, pet])) return null;
        const owner = user.id;
        remote(async () => {
          let photo_path = null;
          if (isNewFile(fields.photo)) { photo_path = `${owner}/${id}/${newId()}.jpg`; await upload(PHOTOS, photo_path, fields.photo); }
          const r = await supabase.from("pets").insert({ id, ...petToDb(pet), photo_path });
          if (!r.error && photo_path) setPets((ps) => mapPet(ps, id, (p) => ({ ...p, photoPath: photo_path })));
          return r;
        });
        return id;
      },

      updatePet(id, fields) {
        if (!setPets((ps) => mapPet(ps, id, (p) => ({ ...p, ...fields })))) return false;
        const owner = user.id;
        remote(async () => {
          const cur = live(id);
          if (!cur) return null;
          const row = petToDb(cur);
          const oldPath = cur.photoPath;
          if (isNewFile(fields.photo)) { row.photo_path = `${owner}/${id}/${newId()}.jpg`; await upload(PHOTOS, row.photo_path, fields.photo); }
          else if ("photo" in fields && !fields.photo) row.photo_path = null;
          const r = await supabase.from("pets").update(row).eq("id", id);
          if (r.error || !("photo_path" in row)) return r;
          setPets((ps) => mapPet(ps, id, (p) => ({ ...p, photoPath: row.photo_path })));
          if (oldPath) await supabase.storage.from(PHOTOS).remove([oldPath]);
          return r;
        });
        return true;
      },

      deletePet(id) {
        if (!setPets((ps) => ps.filter((p) => p.id !== id))) return false;
        const prefix = `${user.id}/${id}`;
        remote(async () => {
          const r = await supabase.from("pets").delete().eq("id", id);
          if (r.error) return r;
          await Promise.all([removeFolder(PHOTOS, prefix), removeFolder(DOCS, prefix)]);
          return r;
        });
        return true;
      },

      /* ------------------------------------------------ records & schedules */
      // list: "medical" | "vaccinations" | "documents" | "feeding" | "care"
      upsertItem(petId, list, item) {
        const prev = item.id && liveItem(petId, list, item.id);
        const next = prev ? { ...prev, ...item } : { ...item, id: newId() };
        if (list === "documents" && isNewFile(next.src)) next.mimeType = mimeOf(next.src); // JPEG from compressImage, or a PDF as-is
        const ok = setPets((ps) => mapPet(ps, petId, (p) => ({
          ...p, [list]: prev ? p[list].map((x) => (x.id === next.id ? next : x)) : [...(p[list] || []), next],
        })));
        if (!ok) return false;
        const owner = user.id;
        remote(async () => {
          const cur = liveItem(petId, list, next.id);
          if (!cur) return null; // deleted before this write ran
          const row = { id: next.id, pet_id: petId, ...TO[list](cur) };
          let oldFile = null;
          if (list === "documents" && isNewFile(next.src)) {
            oldFile = cur.filePath;
            row.file_path = `${owner}/${petId}/${newId()}.${next.mimeType === "application/pdf" ? "pdf" : "jpg"}`;
            await upload(DOCS, row.file_path, next.src);
          }
          const r = await supabase.from(TABLES[list]).upsert(row);
          if (r.error || list !== "documents" || !isNewFile(next.src)) return r;
          patchItem(petId, list, next.id, { filePath: row.file_path });
          if (oldFile) await supabase.storage.from(DOCS).remove([oldFile]);
          return r;
        });
        return true;
      },

      removeItem(petId, list, itemId) {
        if (!setPets((ps) => mapPet(ps, petId, (p) => ({ ...p, [list]: (p[list] || []).filter((x) => x.id !== itemId) })))) return false;
        remote(async () => {
          const r = await supabase.from(TABLES[list]).delete().eq("id", itemId).select(list === "documents" ? "file_path" : "id");
          if (!r.error && list === "documents" && r.data?.[0]?.file_path) await supabase.storage.from(DOCS).remove([r.data[0].file_path]);
          return r;
        });
        return true;
      },

      // Tick a meal as fed (or not) for a given day. Only the last 14 days of log are kept.
      toggleFed(petId, feedId, iso = todayISO()) {
        const was = (live(petId)?.fedLog?.[iso] || []).includes(feedId);
        const ok = setPets((ps) => mapPet(ps, petId, (p) => {
          const log = { ...(p.fedLog || {}) };
          const day = log[iso] || [];
          log[iso] = was ? day.filter((x) => x !== feedId) : [...day, feedId];
          const cutoff = shiftISO(todayISO(), -FED_DAYS);
          for (const k of Object.keys(log)) if (k < cutoff) delete log[k];
          return { ...p, fedLog: log };
        }));
        if (!ok) return false;
        remote(() => was
          ? supabase.from("feeding_log").delete().match({ feeding_id: feedId, fed_on: iso })
          : supabase.from("feeding_log").upsert({ feeding_id: feedId, pet_id: petId, fed_on: iso }));
        return true;
      },

      // Mark a care task done: repeating tasks roll forward from today, one-offs are closed.
      completeCare(petId, taskId) {
        const t = liveItem(petId, "care", taskId);
        if (!t) return false; // e.g. a read-only reminder generated from vaccination records
        const today = todayISO();
        const fields = Number(t.repeatDays)
          ? { lastDone: today, nextDue: shiftISO(today, Number(t.repeatDays)) }
          : { lastDone: today, done: true };
        if (!patchItem(petId, "care", taskId, fields)) return false;
        remote(() => supabase.from("care_tasks").update(TO.care({ ...t, ...fields })).eq("id", taskId));
        return true;
      },
      reopenCare(petId, taskId) {
        const t = liveItem(petId, "care", taskId);
        if (!t || !patchItem(petId, "care", taskId, { done: false })) return false;
        remote(() => supabase.from("care_tasks").update({ done: false }).eq("id", taskId));
        return true;
      },

      /* ------------------------------------------------ assistant feedback
         Ratings on assistant answers, for the team to measure accuracy and retrain.
         Written directly (not through the sync queue) so a failure only affects the rating.
         Demo ratings stay in the chat. Both resolve to an error message or null. */
      async rateAnswer(f) {
        if (!user || user.isDemo) return null;
        const { error } = await supabase.from("assistant_feedback").upsert({
          id: f.id, pet_id: f.petId || null, question: f.question, answer: f.answer,
          conversation: f.conversation || [], pet_context: f.petContext || null, model: f.model || null,
          rating: f.rating, reason: f.reason || null, comment: f.comment || "", updated_at: new Date().toISOString(),
        });
        return error ? error.message : null;
      },
      async clearRating(id) {
        if (!user || user.isDemo) return null;
        const { error } = await supabase.from("assistant_feedback").delete().eq("id", id);
        return error ? error.message : null;
      },
    };
  }, [db, ready, syncError, commit, set, remote]);

  return <StoreCtx.Provider value={api}>{ready ? children : null}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
