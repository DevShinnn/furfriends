import { expect } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { StoreProvider, useStore } from "../src/store/StoreContext";
import { supabase } from "../src/lib/supabase";

/* Renders the real StoreProvider (on the fake Supabase) and hands back its live API. */
export async function renderStore() {
  const api = { current: null };
  function Probe() { api.current = useStore(); return null; }
  render(<StoreProvider><Probe /></StoreProvider>);
  await waitFor(() => expect(api.current.ready).toBe(true));
  return api;
}

/* Runs a store action and waits for its queued server writes to finish. */
export async function run(fn) {
  let out;
  await act(async () => { out = await fn(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return out;
}

export const calls = (table, op) => supabase.state.calls.filter((c) => c.table === table && (!op || c.op === op));
