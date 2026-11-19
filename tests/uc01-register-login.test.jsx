import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase";
import { DEMO_EMAIL, DEMO_PASS } from "../src/lib/demoData";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

beforeEach(() => supabase.reset());

const form = (o = {}) => ({ name: "Maria Santos", email: "Maria@Example.com ", password: "secret123", confirm: "secret123", ...o });

describe("UC1 Register / Login", () => {
  it("[FR1.1] Register with an empty name shows 'Please enter your name.'", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form({ name: "  " })))).toEqual({ error: "Please enter your name." });
    expect(calls("auth", "signUp")).toHaveLength(0);
  });

  it("[FR1.1] Register with an invalid email shows 'Please enter a valid email address.'", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form({ email: "maria@" })))).toEqual({ error: "Please enter a valid email address." });
  });

  it("[FR1.1] Register with a 7-character password shows 'Password must be at least 8 characters.'", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form({ password: "1234567", confirm: "1234567" }))))
      .toEqual({ error: "Password must be at least 8 characters." });
  });

  it("[FR1.1] Register with passwords that don't match shows 'Passwords don't match.'", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form({ confirm: "secret124" })))).toEqual({ error: "Passwords don't match." });
  });

  it("[FR1.1] Register with valid details creates the account (email trimmed and lowercased) and logs the owner in", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form()))).toEqual({ error: null });
    expect(calls("auth", "signUp")[0].payload).toEqual({ email: "maria@example.com", password: "secret123", name: "Maria Santos" });
    expect(s.current.user).toMatchObject({ email: "maria@example.com", name: "Maria Santos" });
  });

  it("[FR1.1] Register with an email that already has an account shows 'An account with this email already exists.'", async () => {
    withAccount(supabase, { email: "maria@example.com" });
    const s = await renderStore();
    expect(await run(() => s.current.register(form()))).toEqual({ error: "An account with this email already exists." });
  });

  it("[FR1.1] Register when email confirmation is required asks the owner to confirm their email", async () => {
    supabase.state.signUpConfirm = true;
    const s = await renderStore();
    expect(await run(() => s.current.register(form()))).toEqual({ confirmEmail: true });
    expect(s.current.user).toBeNull();
  });

  it("[FR1.2] Log in with an empty email or password shows 'Please enter your email and password.'", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.login("", "secret123"))).toBe("Please enter your email and password.");
    expect(await run(() => s.current.login("owner@example.com", ""))).toBe("Please enter your email and password.");
  });

  it("[FR1.2] Log in with a wrong password shows 'Incorrect email or password.'", async () => {
    withAccount(supabase);
    const s = await renderStore();
    expect(await run(() => s.current.login("owner@example.com", "wrongpass"))).toBe("Incorrect email or password.");
    expect(s.current.user).toBeNull();
  });

  it("[FR1.2] Log in with correct details (any letter case) loads the owner's profile", async () => {
    withAccount(supabase);
    const s = await renderStore();
    expect(await run(() => s.current.login(" OWNER@example.com ", "secret123"))).toBeNull();
    expect(s.current.user).toMatchObject({ id: "user-1", name: "Owner Test", city: "Batangas City" });
    expect(s.current.pets).toEqual([]);
  });

  it("[FR1.3] Log out ends the session and clears the owner's data from the screen", async () => {
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    await run(() => s.current.logout());
    expect(s.current.user).toBeNull();
    expect(supabase.state.session).toBeNull();
  });

  it("[FR1.4] The demo button logs in with the shared demo account, marked as demo and shared", async () => {
    withAccount(supabase, { email: DEMO_EMAIL, password: DEMO_PASS, name: "Alex Rivera", id: "demo" });
    const s = await renderStore();
    expect(await run(() => s.current.demoLogin())).toBeNull();
    expect(s.current.user).toMatchObject({ isDemo: true, isShared: true });
  });

  it("[FR1.4] No one can register a new account with the demo account's email", async () => {
    const s = await renderStore();
    expect(await run(() => s.current.register(form({ email: DEMO_EMAIL })))).toEqual({ error: "An account with this email already exists." });
  });
});
