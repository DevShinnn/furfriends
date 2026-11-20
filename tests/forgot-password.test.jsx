import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { supabase } from "../src/lib/supabase";
import { StoreProvider, useStore } from "../src/store/StoreContext";
import { UIProvider } from "../src/components/UIContext";
import { ForgotPassword, Login, Register } from "../src/pages/Auth";
import Dashboard from "../src/pages/Dashboard";
import { DEMO_EMAIL, DEMO_PASS } from "../src/lib/demoData";
import { QUESTIONS } from "../src/lib/passwordReset";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

/* Forgot password with a security question, no email. The database functions
   (supabase/migrations/20261120120000_security_questions.sql) are answered here by a small stand-in that follows the
   same rules; the SQL itself is checked on a real PostgreSQL (supabase/tests/security_questions.sql). */
const QUESTION = QUESTIONS[1];   // "What was your childhood nickname?"
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
function securityDb() {
  const saved = {};   // email → { question, answer, failed, locked }
  const me = () => supabase.state.session?.user.email;
  Object.assign(supabase.state.rpc, {
    set_security_question: ({ p_question, p_answer, p_password }) => {
      if (supabase.state.users[me()]?.password !== p_password) return { data: null, error: { message: "Your password is incorrect." } };
      saved[me()] = { question: p_question, answer: norm(p_answer), failed: 0, locked: false };
      return { data: null, error: null };
    },
    my_security_question: () => ({ data: saved[me()]?.question ?? null, error: null }),
    security_question_for: ({ p_email }) => ({ data: saved[norm(p_email)]?.question ?? null, error: null }),
    reset_password_with_answer: ({ p_email, p_answer, p_new_password }) => {
      const s = saved[norm(p_email)];
      if (!s) return { data: { ok: false, error: "no_question" }, error: null };
      if (s.locked) return { data: { ok: false, error: "locked", minutes: 15 }, error: null };
      if (p_new_password.length < 8) return { data: { ok: false, error: "short" }, error: null };
      if (norm(p_answer) !== s.answer) {
        if (++s.failed >= 5) { s.locked = true; return { data: { ok: false, error: "locked", minutes: 15 }, error: null }; }
        return { data: { ok: false, error: "wrong", left: 5 - s.failed }, error: null };
      }
      supabase.state.users[norm(p_email)].password = p_new_password;
      return { data: { ok: true }, error: null };
    },
  });
  return saved;
}
const notSetUp = () => {
  for (const name of ["set_security_question", "my_security_question", "security_question_for", "reset_password_with_answer"]) {
    supabase.state.rpc[name] = () => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${name} in the schema cache` } });
  }
};
const withQuestion = (saved, email = "owner@example.com", answer = "Bo Bo") => { saved[email] = { question: QUESTION, answer: norm(answer), failed: 0, locked: false }; };
const reset = (o = {}) => ({ email: "owner@example.com", answer: "bo bo", next: "newpass123", confirm: "newpass123", ...o });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => supabase.reset());

describe("UC1 Forgot password (security question, no email)", () => {
  it("[FR1.5] An invalid email shows 'Please enter a valid email address.' and asks the database nothing", async () => {
    securityDb();
    const s = await renderStore();
    expect(await run(() => s.current.forgotQuestion("owner@"))).toEqual({ error: "Please enter a valid email address." });
    expect(calls("rpc", "security_question_for")).toHaveLength(0);
  });

  it("[FR1.5] An email with no security question (or no account) says to ask the FurFriends team", async () => {
    securityDb();
    withAccount(supabase);
    const s = await renderStore();
    for (const email of ["owner@example.com", "nobody@example.com"]) {
      expect((await run(() => s.current.forgotQuestion(email))).error).toMatch(/^There's no security question for this email\. If you never set one, ask the FurFriends team/);
    }
  });

  it("[FR1.5] The account's own question is shown for its email, in any letter case", async () => {
    withQuestion(securityDb());
    const s = await renderStore();
    expect(await run(() => s.current.forgotQuestion("  OWNER@Example.com "))).toEqual({ question: QUESTION });
    expect(calls("rpc", "security_question_for")[0].payload).toEqual({ p_email: "owner@example.com" });
  });

  it("[FR1.5] A wrong answer says how many tries are left; the 5th locks the reset for 15 minutes, even for the right answer", async () => {
    withQuestion(securityDb());
    withAccount(supabase);
    const s = await renderStore();
    for (const left of [4, 3, 2, 1]) {
      expect(await run(() => s.current.resetPassword(reset({ answer: "wrong" })))).toBe(`That answer doesn't match. ${left} ${left === 1 ? "try" : "tries"} left before a 15-minute wait.`);
    }
    expect(await run(() => s.current.resetPassword(reset({ answer: "wrong" })))).toBe("Too many wrong answers. Try again in 15 minutes.");
    expect(await run(() => s.current.resetPassword(reset()))).toBe("Too many wrong answers. Try again in 15 minutes.");
    expect(supabase.state.users["owner@example.com"].password).toBe("secret123");
    expect(s.current.user).toBeNull();
  });

  it("[FR1.5] A new password under 8 characters, typed differently twice, or no answer is refused before anything is sent", async () => {
    withQuestion(securityDb());
    const s = await renderStore();
    expect(await run(() => s.current.resetPassword(reset({ next: "1234567", confirm: "1234567" })))).toBe("New password must be at least 8 characters.");
    expect(await run(() => s.current.resetPassword(reset({ confirm: "newpass124" })))).toBe("New passwords don't match.");
    expect(await run(() => s.current.resetPassword(reset({ answer: "  " })))).toBe("Please type your answer.");
    expect(calls("rpc", "reset_password_with_answer")).toHaveLength(0);
  });

  it("[FR1.5] The right answer, in any letter case or spacing, sets the new password and logs the owner in with it", async () => {
    withQuestion(securityDb());
    withAccount(supabase);
    const s = await renderStore();
    expect(await run(() => s.current.resetPassword(reset({ email: "Owner@example.com", answer: "  BO   bo " })))).toBeNull();
    expect(calls("rpc", "reset_password_with_answer")[0].payload).toEqual({ p_email: "owner@example.com", p_answer: "  BO   bo ", p_new_password: "newpass123" });
    expect(s.current.user).toMatchObject({ email: "owner@example.com" });
    await run(() => s.current.logout());
    expect(await run(() => s.current.login("owner@example.com", "secret123"))).toBe("Incorrect email or password.");
    expect(await run(() => s.current.login("owner@example.com", "newpass123"))).toBeNull();
  });

  it("[FR1.5] Before the database has the feature, forgot password says to ask the team", async () => {
    notSetUp();
    const s = await renderStore();
    expect((await run(() => s.current.forgotQuestion("owner@example.com"))).error).toBe("Password reset isn't available yet. Ask the FurFriends team to reset your password.");
  });

  it("[FR1.5] The log-in page links to Forgot password, which goes from the email to the question to the owner's dashboard", async () => {
    withQuestion(securityDb());
    withAccount(supabase);
    render(<StoreProvider><MemoryRouter initialEntries={["/login"]}><UIProvider><Routes>
      <Route path="/login" element={<Login />} /><Route path="/forgot" element={<ForgotPassword />} /><Route path="/app" element={<p>Dashboard</p>} />
    </Routes></UIProvider></MemoryRouter></StoreProvider>);
    fireEvent.click(await screen.findByRole("link", { name: "Forgot password?" }));
    type("Email", "owner@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(QUESTION)).toBeTruthy();
    type("Your answer", "Bo Bo");
    type("New password", "newpass123");
    type("Confirm", "newpass123");
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Dashboard")).toBeTruthy();
    expect(supabase.state.users["owner@example.com"].password).toBe("newpass123");
  });
});

describe("UC1 Register with a security question", () => {
  it("[FR1.1] Register with a security question saves it with the new password, so the owner starts with it set", async () => {
    securityDb();
    const s = await renderStore();
    const r = await run(() => s.current.register({ name: "Maria Santos", email: "maria@example.com", password: "secret123", confirm: "secret123", question: QUESTION, answer: "Bo Bo" }));
    expect(r).toEqual({ error: null });
    expect(calls("rpc", "set_security_question")[0].payload).toEqual({ p_question: QUESTION, p_answer: "Bo Bo", p_password: "secret123" });
    expect(s.current.securityQuestion).toBe(QUESTION);
  });

  it("[FR1.1] Register with a security question but no answer shows what to fix and creates nothing", async () => {
    securityDb();
    const s = await renderStore();
    const form = { name: "Maria Santos", email: "maria@example.com", password: "secret123", confirm: "secret123" };
    expect(await run(() => s.current.register({ ...form, question: QUESTION, answer: " " }))).toEqual({ error: "Please type an answer to your security question (at least 2 characters)." });
    expect(await run(() => s.current.register({ ...form, question: "", answer: "Bo Bo" }))).toEqual({ error: "Please choose a security question." });
    expect(calls("auth", "signUp")).toHaveLength(0);
  });

  it("[FR1.1] The sign-up form asks for a security question only once the database has the feature", async () => {
    securityDb();
    const view = render(<StoreProvider><MemoryRouter><UIProvider><Register /></UIProvider></MemoryRouter></StoreProvider>);
    expect(await screen.findByLabelText("Security question")).toBeTruthy();
    view.unmount();
    notSetUp();
    render(<StoreProvider><MemoryRouter><UIProvider><Register /></UIProvider></MemoryRouter></StoreProvider>);
    await screen.findByLabelText("Confirm");
    await run(() => {});
    expect(screen.queryByLabelText("Security question")).toBeNull();
  });
});

describe("UC9 Security question in Profile", () => {
  it("[FR9.4] Setting the question needs the current password: a wrong one is refused by the database", async () => {
    securityDb();
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    expect(s.current.securityQuestion).toBeNull();
    expect(await run(() => s.current.saveSecurityQuestion({ question: QUESTION, answer: "Bo Bo", password: "" }))).toBe("Please enter your current password.");
    expect(await run(() => s.current.saveSecurityQuestion({ question: QUESTION, answer: "Bo Bo", password: "wrongpass" }))).toBe("Your password is incorrect.");
    expect(s.current.securityQuestion).toBeNull();
  });

  it("[FR9.4] A saved question shows on the profile and then works for forgot password", async () => {
    securityDb();
    withAccount(supabase);
    const s = await renderStore();
    await run(() => s.current.login("owner@example.com", "secret123"));
    expect(await run(() => s.current.saveSecurityQuestion({ question: QUESTION, answer: "Bo Bo", password: "secret123" }))).toBeNull();
    expect(s.current.securityQuestion).toBe(QUESTION);
    await run(() => s.current.logout());
    expect(await run(() => s.current.forgotQuestion("owner@example.com"))).toEqual({ question: QUESTION });
  });

  it("[FR9.4] The shared demo account can't set a security question, so no one can reset it", async () => {
    securityDb();
    withAccount(supabase, { email: DEMO_EMAIL, password: DEMO_PASS, name: "Alex Rivera", id: "demo" });
    const s = await renderStore();
    await run(() => s.current.demoLogin());
    expect(await run(() => s.current.saveSecurityQuestion({ question: QUESTION, answer: "Bo Bo", password: DEMO_PASS }))).toBe("This shared account can't have a security question.");
    expect(calls("rpc", "set_security_question")).toHaveLength(0);
  });

  it("[FR9.4] Owners without a security question get a reminder on the dashboard; owners with one don't", async () => {
    const saved = securityDb();
    withAccount(supabase);
    await supabase.auth.signInWithPassword({ email: "owner@example.com", password: "secret123" });
    // The app shows the dashboard once the account has loaded (AppShell); this does the same.
    const Loaded = ({ children }) => { const { ready, user } = useStore(); return ready && user ? children : null; };
    const page = () => render(<StoreProvider><MemoryRouter><UIProvider><Loaded><Dashboard /></Loaded></UIProvider></MemoryRouter></StoreProvider>);
    const first = page();
    expect(await screen.findByText("Set a security question")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Set it up/ }).getAttribute("href")).toBe("/app/profile?security=1");
    first.unmount();
    withQuestion(saved);
    page();
    await screen.findByText(/Good (morning|afternoon|evening)/);
    expect(screen.queryByText("Set a security question")).toBeNull();
  });
});
