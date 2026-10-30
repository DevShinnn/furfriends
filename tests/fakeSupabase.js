/* A stand-in for the Supabase client (src/lib/supabase.js), so tests never reach the live project.
   Every database call is recorded in `calls`, and answers come from `rows` and `users` set by each test. */
export function fakeSupabase() {
  const state = {
    users: {},            // email → { password, id }
    session: null,
    rows: { profiles: [], pets: [] },
    calls: [],            // { table, op, payload, filters }
    storage: [],          // { bucket, op, args }
    signUpConfirm: false, // true: sign-up needs email confirmation (no session)
  };

  const builder = (table) => {
    const q = { table, op: "select", payload: null, filters: [], single: false };
    const result = () => {
      state.calls.push({ table: q.table, op: q.op, payload: q.payload, filters: q.filters });
      if (q.op === "select") {
        let data = state.rows[q.table] || [];
        for (const [col, val] of q.filters) data = data.filter((r) => r[col] === val);
        return { data: q.single ? data[0] ?? null : data, error: null };
      }
      return { data: [], error: null };
    };
    const chain = {
      select() { return chain; },
      insert(p) { q.op = "insert"; q.payload = p; return chain; },
      update(p) { q.op = "update"; q.payload = p; return chain; },
      upsert(p) { q.op = "upsert"; q.payload = p; return chain; },
      delete() { q.op = "delete"; return chain; },
      eq(col, val) { q.filters.push([col, val]); return chain; },
      match(obj) { q.filters.push(...Object.entries(obj)); return chain; },
      gte() { return chain; },
      order() { return chain; },
      maybeSingle() { q.single = true; return chain; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return chain;
  };

  const userFor = (email) => ({ id: state.users[email].id, email, created_at: "2026-10-01T00:00:00Z", identities: [{}] });

  const client = {
    state,
    reset() {
      Object.assign(state, { users: {}, session: null, rows: { profiles: [], pets: [] }, calls: [], storage: [], signUpConfirm: false });
    },
    from: (table) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    storage: {
      from: (bucket) => ({
        upload: async (...args) => { state.storage.push({ bucket, op: "upload", args }); return { error: null }; },
        remove: async (...args) => { state.storage.push({ bucket, op: "remove", args }); return { error: null }; },
        list: async (...args) => { state.storage.push({ bucket, op: "list", args }); return { data: [{ name: "a.jpg" }], error: null }; },
        createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
      }),
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      async signInWithPassword({ email, password }) {
        const u = state.users[email];
        if (!u || u.password !== password) return { data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } };
        state.session = { user: userFor(email) };
        return { data: { user: state.session.user, session: state.session }, error: null };
      },
      async signUp({ email, password, options }) {
        state.calls.push({ table: "auth", op: "signUp", payload: { email, password, name: options?.data?.name } });
        if (state.users[email]) return { data: {}, error: { code: "user_already_exists", message: "User already registered" } };
        state.users[email] = { password, id: `user-${Object.keys(state.users).length + 1}` };
        state.rows.profiles.push({ id: state.users[email].id, name: options?.data?.name || "", phone: "", city: "", address: "", notifications_enabled: true });
        if (state.signUpConfirm) return { data: { user: userFor(email), session: null }, error: null };
        state.session = { user: userFor(email) };
        return { data: { user: state.session.user, session: state.session }, error: null };
      },
      async signOut() { state.session = null; return { error: null }; },
      async updateUser(p) { state.calls.push({ table: "auth", op: "updateUser", payload: p }); return { data: {}, error: null }; },
    },
  };
  return client;
}

/* One account with a profile, ready to log in. */
export function withAccount(sb, { email = "owner@example.com", password = "secret123", name = "Owner Test", id = "user-1" } = {}) {
  sb.state.users[email] = { password, id };
  sb.state.rows.profiles.push({ id, name, phone: "", city: "Batangas City", address: "", notifications_enabled: true });
  return { email, password, name, id };
}
