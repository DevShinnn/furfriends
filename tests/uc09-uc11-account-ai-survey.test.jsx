import { beforeEach, describe, expect, it } from "vitest";
import { supabase } from "../src/lib/supabase";
import { DEMO_EMAIL, DEMO_PASS } from "../src/lib/demoData";
import { DOSE_REPLY, INTRO, chatReply, safetyReply, withEnglish } from "../src/lib/knowledge";
import { SUS_ITEMS, susScore } from "../src/lib/survey";
import { withAccount } from "./fakeSupabase";
import { calls, renderStore, run } from "./store";

beforeEach(() => supabase.reset());

async function loggedIn(account) {
  const a = withAccount(supabase, account);
  const s = await renderStore();
  await run(() => s.current.login(a.email, a.password));
  return s;
}
const info = (o = {}) => ({ name: "Owner Test", email: "owner@example.com", phone: "0917 000 0000", city: "Lipa City", address: "", ...o });

describe("UC9 Manage Account Settings", () => {
  it("[FR9.1] Saving the profile with an empty name shows 'Name can't be empty.'", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.updateUser(info({ name: " " })))).toEqual({ error: "Name can't be empty." });
  });

  it("[FR9.1] Saving the profile with an invalid email shows 'Please enter a valid email address.'", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.updateUser(info({ email: "owner@" })))).toEqual({ error: "Please enter a valid email address." });
  });

  it("[FR9.1] Name, phone, city and address are saved (trimmed) to the owner's profile", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.updateUser(info({ name: " Ana Reyes ", address: " 12 Rizal St, Poblacion, Lipa City " })))).toEqual({ notice: null });
    expect(calls("profiles", "update").at(-1)).toMatchObject({
      payload: { name: "Ana Reyes", phone: "0917 000 0000", city: "Lipa City", address: "12 Rizal St, Poblacion, Lipa City" }, filters: [["id", "user-1"]],
    });
    expect(s.current.user).toMatchObject({ name: "Ana Reyes", address: "12 Rizal St, Poblacion, Lipa City" });
  });

  it("[FR9.1] Changing the email sends a confirmation link to the new address first", async () => {
    const s = await loggedIn();
    const r = await run(() => s.current.updateUser(info({ email: "new@example.com" })));
    expect(r.notice).toBe("We sent a confirmation link to new@example.com. Your email changes once you click it.");
    expect(calls("auth", "updateUser")[0].payload).toEqual({ email: "new@example.com" });
  });

  it("[FR9.2] A new password under 8 characters, or not matching, is refused", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.changePassword({ current: "secret123", next: "short", confirm: "short" }))).toBe("New password must be at least 8 characters.");
    expect(await run(() => s.current.changePassword({ current: "secret123", next: "newpass123", confirm: "newpass124" }))).toBe("New passwords don't match.");
  });

  it("[FR9.2] A wrong current password shows 'Current password is incorrect.'", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.changePassword({ current: "nope", next: "newpass123", confirm: "newpass123" }))).toBe("Current password is incorrect.");
    expect(calls("auth", "updateUser")).toHaveLength(0);
  });

  it("[FR9.2] With the right current password, the new password is saved", async () => {
    const s = await loggedIn();
    expect(await run(() => s.current.changePassword({ current: "secret123", next: "newpass123", confirm: "newpass123" }))).toBeNull();
    expect(calls("auth", "updateUser")[0].payload).toEqual({ password: "newpass123" });
  });

  it("[FR9.3] The shared demo account can't change its password or email", async () => {
    const s = await loggedIn({ email: DEMO_EMAIL, password: DEMO_PASS, id: "demo", name: "Alex Rivera" });
    expect(await run(() => s.current.changePassword({ current: DEMO_PASS, next: "newpass123", confirm: "newpass123" }))).toBe("This shared account's password can't be changed.");
    expect(await run(() => s.current.updateUser(info({ name: "Alex Rivera", email: "mine@example.com" })))).toEqual({ error: "This shared account's email can't be changed." });
  });
});

it("[FR9.3] The sample accounts (sample.*@example.com) are shared too and can't change their password", async () => {
  const s = await loggedIn({ email: "sample.maria@example.com", password: "FurFriends2026", id: "sample-1", name: "Maria Santos" });
  expect(s.current.user.isShared).toBe(true);
  expect(await run(() => s.current.changePassword({ current: "FurFriends2026", next: "newpass123", confirm: "newpass123" }))).toBe("This shared account's password can't be changed.");
});

describe("UC10 Ask FurFriends (AI assistant, added beyond Figure 2.2)", () => {
  it("[FR10.1] Questions asking for a medicine dose are refused with 'see a vet' advice, whatever the wording", () => {
    for (const q of ["How many mg of amoxicillin for my 10 kg dog?", "what dose of paracetamol can my cat have", "ibuprofen dosage for dogs"]) {
      expect(safetyReply(q)?.reply, q).toBe(DOSE_REPLY);
    }
    expect(DOSE_REPLY).toMatch(/only a vet can prescribe/);
  });

  it("[FR10.1] Ordinary care questions are not blocked by the dose rule", () => {
    expect(safetyReply("How often should I bathe my dog?")).toBeNull();
  });

  it("[FR10.2] Greetings and thanks (English or Tagalog) get a short reply instead of a search", () => {
    expect(chatReply("Hello!").reply).toBe(INTRO);
    expect(chatReply("kumusta po").reply).toBe(INTRO);
    expect(chatReply("salamat po").reply).toBe("You're welcome! Ask me anything else about your pet's care.");
  });

  it("[FR10.2] Tagalog words are turned into English before searching", () => {
    expect(withEnglish("Ayaw kumain ng pusa ko")).toMatch(/cat/);
    expect(withEnglish("My dog is vomiting")).toBe("My dog is vomiting");
  });
});

describe("UC11 Usability survey (added beyond Figure 2.2)", () => {
  it("[FR11.1] The survey has the 10 standard SUS statements", () => {
    expect(SUS_ITEMS).toHaveLength(10);
  });

  it("[FR11.1] The SUS score is computed the standard way (all 3s = 50; best answers = 100; worst = 0)", () => {
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBe(75);
  });

  it("[FR11.1] Shared demo accounts can't send survey answers", async () => {
    const s = await loggedIn({ email: DEMO_EMAIL, password: DEMO_PASS, id: "demo", name: "Alex Rivera" });
    expect(await run(() => s.current.submitSurvey({ sus: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] })))
      .toBe("This shared account can't send survey answers. Log in with your own account to take part.");
  });
});
