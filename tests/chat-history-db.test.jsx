import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase";
import { DEMO_EMAIL } from "../src/lib/demoData";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

/* The assistant's chats in the database (assistant_messages): one per pet, and one about pets in general. */
beforeEach(() => supabase.reset());

async function loggedIn(account) {
  const a = withAccount(supabase, account);
  const s = await renderStore();
  await run(() => s.current.login(a.email, a.password));
  return s;
}

describe("Chats saved per pet", () => {
  it("[FR10.7] are on once the table exists, and read per pet (or the general chat), oldest first", async () => {
    supabase.state.rows.assistant_messages = [
      { id: "b", pet_id: "pet-1", role: "assistant", content: "Fine.", meta: { model: "rag-v6", rating: 1 }, created_at: "2026-11-20T01:00:02Z" },
      { id: "a", pet_id: "pet-1", role: "user", content: "How is she?", meta: {}, created_at: "2026-11-20T01:00:01Z" },
      { id: "c", pet_id: null, role: "user", content: "How often to deworm?", meta: {}, created_at: "2026-11-20T01:00:03Z" },
    ];
    const s = await loggedIn();
    expect(s.current.chatSaved).toBe(true);
    expect(await s.current.loadChat("pet-1")).toEqual([
      { id: "a", role: "user", content: "How is she?" },
      { id: "b", role: "assistant", content: "Fine.", model: "rag-v6", rating: 1 },
    ]);
    expect((await s.current.loadChat("")).map((m) => m.id)).toEqual(["c"]);
    expect([...(await s.current.chatRooms())].sort()).toEqual(["", "pet-1"]);
  });

  it("[FR10.7] save each message once (by its id), update a rating, and 'New chat' deletes only that chat", async () => {
    const s = await loggedIn();
    await run(() => s.current.saveChatMessage("pet-1", { id: "m1", role: "assistant", content: "Answer", model: "rag-v6", sources: [], rating: 0, ctx: { name: "Mochi" } }));
    expect(calls("assistant_messages", "upsert").at(-1).payload).toEqual({
      id: "m1", pet_id: "pet-1", role: "assistant", content: "Answer", meta: { model: "rag-v6", sources: [], rating: 0, ctx: { name: "Mochi" } },
    });
    await run(() => s.current.saveChatMessage("", { id: "m2", role: "user", content: "Hi" }));
    expect(calls("assistant_messages", "upsert").at(-1).payload).toMatchObject({ id: "m2", pet_id: null });
    await run(() => s.current.saveChatMessage("pet-1", { id: "e1", role: "assistant", error: true, content: "Network error" }));
    expect(calls("assistant_messages", "upsert")).toHaveLength(2);   // error bubbles aren't kept
    await run(() => s.current.updateChatMessage({ id: "m1", role: "assistant", content: "Answer", rating: -1, reason: "Wrong or inaccurate" }));
    expect(calls("assistant_messages", "update").at(-1)).toMatchObject({ payload: { meta: { rating: -1, reason: "Wrong or inaccurate" } }, filters: [["id", "m1"]] });
    await run(() => s.current.clearChat("pet-1"));
    expect(calls("assistant_messages", "delete").at(-1).filters).toEqual([["pet_id", "pet-1"]]);
    await run(() => s.current.clearChat(""));
    expect(calls("assistant_messages", "delete").at(-1).filters).toEqual([["pet_id", null]]);
  });

  it("[FR10.7] stay in the tab without the table, and on the shared demo account", async () => {
    supabase.state.missingTables = ["assistant_messages"];
    const s = await loggedIn();
    expect(s.current.chatSaved).toBe(false);
    expect(await s.current.loadChat("pet-1")).toBeNull();
    await run(() => s.current.saveChatMessage("pet-1", { id: "m1", role: "user", content: "Hi" }));
    expect(calls("assistant_messages", "upsert")).toHaveLength(0);

    supabase.reset();
    const demo = await loggedIn({ email: DEMO_EMAIL, password: "x" });
    expect(demo.current.chatSaved).toBe(false);
  });
});
