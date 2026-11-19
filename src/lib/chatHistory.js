/* The assistant's chats in Supabase (assistant_messages, supabase/migrations/20261120000000_assistant_messages.sql):
   one conversation per pet, and one about pets in general (pet_id null). One row per message; what the chat shows
   with an answer (sources, model, rating ...) is in `meta`. Until the table exists, chats stay in the browser tab. */
export const CHAT_LIMIT = 60;   // messages loaded per chat: the newest
const META = ["model", "match", "related", "generated", "sources", "uncertain", "q", "petId", "ctx", "convo", "fid",
  "rating", "reason", "comment", "reasonDone", "urgent"];

export const toChatRow = (room, m) => ({
  id: m.id, pet_id: room || null, role: m.role, content: String(m.content || "").slice(0, 8000),
  meta: Object.fromEntries(META.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])),
});
export const fromChatRow = (r) => ({ ...(r.meta || {}), id: r.id, role: r.role, content: r.content });

/* Is the table there? (false until its migration is applied) */
export async function chatTableReady(db) {
  const { error } = await db.from("assistant_messages").select("id").limit(1);
  return !error;
}

/* The rooms ("" = pets in general, else a pet's id) that have a saved chat. */
export async function chatRoomsOf(db) {
  const { data, error } = await db.from("assistant_messages").select("pet_id").limit(1000);
  return error ? new Set() : new Set((data || []).map((r) => r.pet_id || ""));
}

/* A room's newest messages, oldest first, or null if they couldn't be read. */
export async function chatOf(db, room) {
  const base = db.from("assistant_messages").select("id, role, content, meta, created_at");
  const { data, error } = await (room ? base.eq("pet_id", room) : base.is("pet_id", null))
    .order("created_at", { ascending: false }).limit(CHAT_LIMIT);
  if (error) return null;
  return [...(data || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(fromChatRow);
}

export const saveChatRow = (db, room, m) => db.from("assistant_messages").upsert(toChatRow(room, m));
export const updateChatRow = (db, m) => db.from("assistant_messages").update({ meta: toChatRow("", m).meta }).eq("id", m.id);
export const clearChatRows = (db, room) => {
  const rows = db.from("assistant_messages").delete();
  return room ? rows.eq("pet_id", room) : rows.is("pet_id", null);
};
