import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isEmail, todayISO, mimeOf, newId } from "../lib/utils";
import { shiftISO } from "../lib/care";
import { DEMO_EMAIL, DEMO_PASS, DEMO_PROFILE } from "../lib/demoData";
import { clearChats } from "../lib/assistant";
import { addDemoPets, browserFiles, clearPets } from "../lib/seedDemo";
import { PET_SELECT, TABLES, TO, petFromRow, petToDb, petWeights } from "../lib/petRows";
import { chatOf, chatRoomsOf, chatTableReady, clearChatRows, saveChatRow, updateChatRow } from "../lib/chatHistory";

/* Accounts live in Supabase (Auth + Postgres + Storage, see supabase/migrations).
   The demo account is a real, shared account (made by scripts/seed-sample-accounts.mjs) that
   the demo buttons log into. It and the sample accounts (isShared) can't change their password or
   email, send survey answers or rate the assistant, so the shared logins keep working and the
   research data stays clean. The database enforces the same (20261020000000_protect_shared_accounts.sql).

   Pet-data mutations stay synchronous for the UI: state updates immediately, and the
   matching Supabase write is queued so writes reach the server in order. If a write
   fails, the error is surfaced and everything is reloaded from the server.

   Other devices' changes arrive through Supabase Realtime (see the realtime migration) and
   trigger a reload once this device has no writes waiting. The app also reloads when it comes
   back to the foreground or back online, in case it missed changes while asleep. */
const OLD_DEMO_KEY = "furfriends.demo.v1"; // the browser-only demo used before; cleared on startup
const PHOTOS = "pet-photos";
const DOCS = "pet-documents";
const URL_TTL = 60 * 60 * 24 * 7; // signed file links last a week
const FED_DAYS = 14;              // only the last 2 weeks of feeding log are loaded
const EMPTY = { user: null, pets: [], weightLog: false, chatTable: false };
const SYNC_TABLES = ["profiles", "pets", "medical_records", "vaccinations", "documents", "feeding_schedules", "feeding_log", "care_tasks"];
const SYNC_DELAY = 1200;          // wait for a burst of changes to settle before reloading
const STALE_AFTER = 30 * 1000;    // reload when the app returns after being hidden this long

const redirectTo = () => window.location.origin + window.location.pathname;

/* Row mapping (app camelCase ↔ db snake_case) is in lib/petRows.js, shared with the scripts. */
// A weight history with this day's weight added or replaced, oldest first.
const withWeight = (list, w) => [...(list || []).filter((x) => x.date !== w.date), { id: newId(), ...w }].sort((a, b) => a.date.localeCompare(b.date));

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
// Links are reused while they have over a day left, so reloads don't make every image re-download.
const signed = new Map(); // "bucket/path" → { url, expires }
async function signAll(bucket, paths) {
  paths = [...new Set(paths.filter(Boolean))];
  const out = {};
  const soon = Date.now() + 24 * 3600 * 1000;
  const need = [];
  for (const p of paths) {
    const hit = signed.get(`${bucket}/${p}`);
    if (hit && hit.expires > soon) out[p] = hit.url; else need.push(p);
  }
  if (!need.length) return out;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(need, URL_TTL);
  if (error) throw error;
  const expires = Date.now() + URL_TTL * 1000;
  for (const x of data) {
    if (!x.signedUrl) continue;
    out[x.path] = x.signedUrl;
    signed.set(`${bucket}/${x.path}`, { url: x.signedUrl, expires });
  }
  return out;
}

async function fetchAll(authUser) {
  const [prof, res] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle(),
    supabase.from("pets")
      .select(PET_SELECT)
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

  const pets = res.data.map(petFromRow);
  const [photoUrls, docUrls, weightLog, chatTable] = await Promise.all([
    signAll(PHOTOS, pets.map((p) => p.photoPath)),
    signAll(DOCS, pets.flatMap((p) => p.documents.map((d) => d.filePath))),
    petWeights(supabase, pets),   // false until the weight_log table exists
    chatTableReady(supabase),     // false until the assistant_messages table exists
  ]);
  for (const p of pets) {
    p.photo = photoUrls[p.photoPath] || null;
    for (const d of p.documents) d.src = docUrls[d.filePath] || null;
  }

  const p = prof.data || {};
  const user = {
    id: authUser.id, email: authUser.email, name: p.name || "", phone: p.phone || "", city: p.city || "", address: p.address || "",
    notificationsEnabled: p.notifications_enabled ?? true, createdAt: Date.parse(authUser.created_at),
    isDemo: authUser.email === DEMO_EMAIL,
    // the demo and sample accounts, whose passwords are public (docs/sample-accounts.md); the database enforces this too
    isShared: authUser.email === DEMO_EMAIL || /^sample\..+@example\.com$/.test(authUser.email || ""),
  };
  return { user, pets, weightLog, chatTable };
}

function authMessage(error) {
  const c = error.code || "";
  if (c === "invalid_credentials" || /invalid login/i.test(error.message)) return "Incorrect email or password.";
  if (c === "email_not_confirmed") return "Please confirm your email first — check your inbox for the link.";
  if (c === "user_already_exists" || c === "email_exists") return "An account with this email already exists.";
  if (c === "over_email_send_rate_limit") return "Too many emails sent — please wait a minute and try again.";
  return error.message || "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------- provider */
const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDb] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const ref = useRef(db);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);      // queued writes not yet finished
  const dirty = useRef(false);    // a change arrived while writes were pending

  const set = useCallback((next) => { ref.current = next; setDb(next); }, []);

  // Updates the screen right away; the server write goes through `remote` below.
  const commit = useCallback((updater) => {
    set(updater(ref.current));
    return true;
  }, [set]);

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return set(EMPTY);
    try { set(await fetchAll(data.session.user)); } catch (e) { setSyncError(e.message); }
  }, [set]);

  // Reload from the server, but never while this device still has writes on the way:
  // a reload then would briefly drop changes the server hasn't received yet.
  const syncNow = useCallback(() => {
    if (!ref.current.user) return;
    if (pending.current) { dirty.current = true; return; }
    dirty.current = false;
    reload();
  }, [reload]);

  // Queue a server write. Tasks run one at a time, in the order they were made.
  const remote = useCallback((task) => {
    if (!ref.current.user) return;
    pending.current++;
    queue.current = queue.current
      .then(task)
      .then((r) => { if (r?.error) throw r.error; })
      .catch((e) => { console.error(e); setSyncError(e.message || String(e)); dirty.current = true; })
      .finally(() => { if (--pending.current === 0 && dirty.current) syncNow(); });
  }, [syncNow]);

  // Restore the session on startup.
  useEffect(() => {
    let alive = true;
    (async () => {
      try { localStorage.removeItem(OLD_DEMO_KEY); } catch { /* storage blocked */ }
      const { data } = await supabase.auth.getSession();
      let next = EMPTY;
      if (data.session) {
        try { next = await fetchAll(data.session.user); }
        catch (e) { setSyncError(`Couldn't load your data (${e.message}).`); }
      }
      if (!alive) return;
      set(next);
      setReady(true);
    })();
    // Session ended elsewhere (other tab, expired refresh token).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") set(EMPTY);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [set]);

  // Live sync: Realtime changes, returning to the app, and coming back online.
  const userId = db.user ? db.user.id : null;
  const weightLogOn = db.weightLog;   // weight_log joins live sync only once the table exists (one bad table fails the channel)
  useEffect(() => {
    if (!userId) return;
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(syncNow, SYNC_DELAY); };
    const channel = supabase.channel(`sync-${userId}`);
    for (const table of weightLogOn ? [...SYNC_TABLES, "weight_log"] : SYNC_TABLES) channel.on("postgres_changes", { event: "*", schema: "public", table }, soon);
    channel.subscribe();

    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER) soon();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", soon);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", soon);
    };
  }, [userId, weightLogOn, syncNow]);

  const api = useMemo(() => {
    const { user, pets, weightLog, chatTable } = db;
    // Chats are saved to the account once their table exists, except on the shared accounts anyone can log into.
    const chatSaved = !!(chatTable && user && !user.isShared);
    const getPet = (id) => pets.find((p) => p.id === id) || null;
    const setPets = (fn) => commit((d) => ({ ...d, pets: fn(d.pets) }));
    const mapPet = (ps, id, fn) => ps.map((p) => (p.id === id ? fn(p) : p));
    const live = (petId) => ref.current.pets.find((p) => p.id === petId);
    const liveItem = (petId, list, id) => (live(petId)?.[list] || []).find((x) => x.id === id);
    const patchItem = (petId, list, id, fields) =>
      setPets((ps) => mapPet(ps, petId, (p) => ({ ...p, [list]: p[list].map((x) => (x.id === id ? { ...x, ...fields } : x)) })));

    async function enter(authUser) {
      clearChats();
      try { set(await fetchAll(authUser)); return null; }
      catch (e) { await supabase.auth.signOut(); return `Couldn't load your data (${e.message}).`; }
    }
    // Resolves to an error message or null.
    async function login(email, password) {
      email = (email || "").trim().toLowerCase();
      if (!email || !password) return "Please enter your email and password.";
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return email === DEMO_EMAIL ? "The demo account isn't available right now. Please try again later." : authMessage(error);
      return enter(data.user);
    }

    return {
      ready, user, pets, getPet, weightLog,
      syncError, clearSyncError: () => setSyncError(null),

      /* ------------------------------------------------ account */
      login,
      demoLogin: () => login(DEMO_EMAIL, DEMO_PASS),

      // Puts the demo account back to its original pets, profile and records. Resolves to an error message or null.
      async resetDemo() {
        if (!user?.isDemo) return null;
        clearChats();
        try {
          await clearPets(supabase, user.id);
          await addDemoPets(supabase, user.id, browserFiles);
          await supabase.from("profiles").update({ ...DEMO_PROFILE, notifications_enabled: true }).eq("id", user.id);
          await reload();
          return null;
        } catch (e) {
          await reload();
          return e.message || String(e);
        }
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
        supabase.auth.signOut();
        clearChats();
        set(EMPTY);
      },

      // Resolves to { error } or { notice } (email changes need confirming from the new inbox).
      async updateUser({ name, email, phone, city, address = "" }) {
        email = (email || "").trim().toLowerCase();
        name = name.trim(); phone = phone.trim(); city = city.trim(); address = address.trim().slice(0, 200);
        if (!name) return { error: "Name can't be empty." };
        if (!isEmail(email)) return { error: "Please enter a valid email address." };
        if (user.isShared && email !== user.email) return { error: "This shared account's email can't be changed." };
        const r = await supabase.from("profiles").update({ name, phone, city, address }).eq("id", user.id);
        if (r.error) return { error: r.error.message };
        let notice = null;
        if (email !== user.email) {
          const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo() });
          if (error) return { error: authMessage(error) };
          notice = `We sent a confirmation link to ${email}. Your email changes once you click it.`;
        }
        commit((d) => ({ ...d, user: { ...d.user, name, phone, city, address } }));
        return { notice };
      },

      // This device's web-push address, so reminders can arrive when the app is closed.
      // Both resolve to an error message or null.
      async savePushSubscription(s) {
        if (!user) return null;
        const { error } = await supabase.rpc("save_push_subscription", {
          p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_timezone: s.timezone, p_user_agent: s.userAgent,
        });
        return error ? error.message : null;
      },
      async removePushSubscription(endpoint) {
        if (!user || !endpoint) return null;
        const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
        return error ? error.message : null;
      },

      /* ------------------------------------------------ usability survey (thesis)
         Resolves to an error message or null. The demo account can't take part. */
      async submitSurvey({ participantCode, device, tasks, sus, liked, improve }) {
        if (!user || user.isShared) return "This shared account can't send survey answers. Log in with your own account to take part.";
        const { error } = await supabase.from("usability_responses").insert({
          participant_code: participantCode.trim(), device, tasks, sus, liked: liked.trim(), improve: improve.trim(),
        });
        return error ? error.message : null;
      },
      // How many responses this account has sent (0 for the demo, or if the table isn't set up).
      async surveyCount() {
        if (!user || user.isShared) return 0;
        const { count, error } = await supabase.from("usability_responses").select("id", { count: "exact", head: true });
        return error ? 0 : count || 0;
      },

      // Turns reminders on or off for this account (saved to the profile, so it follows the user).
      setNotifications(on) {
        commit((d) => ({ ...d, user: { ...d.user, notificationsEnabled: on } }));
        remote(() => supabase.from("profiles").update({ notifications_enabled: on }).eq("id", user.id));
      },

      async changePassword({ current, next, confirm }) {
        if (user.isShared) return "This shared account's password can't be changed.";
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
        // The weight history starts with today's weight (the database trigger saves the same row).
        const weights = fields.weight ? [{ id: newId(), date: todayISO(), kg: Number(fields.weight) }] : [];
        const pet = { id, ownerId: user.id, createdAt: Date.now(), photo: null, photoPath: null, medical: [], vaccinations: [], documents: [], feeding: [], care: [], fedLog: {}, weights, ...fields };
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
        // A new weight goes into today's place in the history too (the database trigger does the same on the server).
        const logWeight = (p) => ("weight" in fields && fields.weight !== "" && Number(fields.weight) !== Number(p.weight)
          ? { weights: withWeight(p.weights, { date: todayISO(), kg: Number(fields.weight) }) } : {});
        if (!setPets((ps) => mapPet(ps, id, (p) => ({ ...p, ...fields, ...logWeight(p) })))) return false;
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

      /* ------------------------------------------------ weight history (weight_log)
         Adds or corrects the weight on a day (one per day). The newest one is also the pet's current weight. */
      saveWeight(petId, { date, kg }) {
        const pet = live(petId);
        if (!pet || !weightLog) return false;
        const newest = !pet.weights?.some((w) => w.date > date);
        setPets((ps) => mapPet(ps, petId, (p) => ({ ...p, weights: withWeight(p.weights, { date, kg }), ...(newest ? { weight: kg } : {}) })));
        remote(async () => {
          const r = await supabase.from("weight_log").upsert({ pet_id: petId, ...TO.weights({ date, kg }) }, { onConflict: "pet_id,weighed_on" });
          if (r.error || !newest) return r;
          return supabase.from("pets").update({ weight_kg: kg }).eq("id", petId);
        });
        return true;
      },
      // Takes a weight out of the history (the pet's current weight stays as it is).
      removeWeight(petId, date) {
        if (!setPets((ps) => mapPet(ps, petId, (p) => ({ ...p, weights: (p.weights || []).filter((w) => w.date !== date) })))) return false;
        remote(() => supabase.from("weight_log").delete().match({ pet_id: petId, weighed_on: date }));
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
        if (!user || user.isShared) return null;
        const { error } = await supabase.from("assistant_feedback").upsert({
          id: f.id, pet_id: f.petId || null, question: f.question, answer: f.answer,
          conversation: f.conversation || [], pet_context: f.petContext || null, model: f.model || null,
          rating: f.rating, reason: f.reason || null, comment: f.comment || "", updated_at: new Date().toISOString(),
        });
        return error ? error.message : null;
      },
      async clearRating(id) {
        if (!user || user.isShared) return null;
        const { error } = await supabase.from("assistant_feedback").delete().eq("id", id);
        return error ? error.message : null;
      },

      /* ------------------------------------------------ assistant chats (assistant_messages), one per pet
         room: a pet's id, or "" for the chat about pets in general. Off (chats stay in the tab) without the table
         or on a shared account. */
      chatSaved,
      async loadChat(room) { return chatSaved ? chatOf(supabase, room) : null; },
      async chatRooms() { return chatSaved ? chatRoomsOf(supabase) : new Set(); },
      saveChatMessage(room, m) { if (chatSaved && !m.error) remote(() => saveChatRow(supabase, room, m)); },
      updateChatMessage(m) { if (chatSaved) remote(() => updateChatRow(supabase, m)); },
      clearChat(room) { if (chatSaved) remote(() => clearChatRows(supabase, room)); },
    };
  }, [db, ready, syncError, commit, set, remote, reload]);

  return <StoreCtx.Provider value={api}>{ready ? children : null}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
