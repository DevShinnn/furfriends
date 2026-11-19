import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UIProvider } from "../src/components/UIContext";
import { demoPets } from "../src/lib/demoData";

/* The Ask page keeps one conversation per pet (and one for pets in general): picking a pet opens its own chat,
   and the assistant only ever gets that pet's conversation. */
const pets = demoPets("u1");
const mochi = pets.find((p) => p.name === "Mochi"), bori = pets.find((p) => p.name === "Bori");
const store = {};
const tabStore = () => ({ user: { id: "u1" }, pets, rateAnswer: vi.fn(), clearRating: vi.fn(), chatSaved: false,
  loadChat: vi.fn(async () => null), chatRooms: vi.fn(async () => new Set()), saveChatMessage: vi.fn(), updateChatMessage: vi.fn(), clearChat: vi.fn() });
vi.mock("../src/store/StoreContext", () => ({ useStore: () => store }));
const ask = vi.fn(async ({ messages, pet }) => ({ reply: `Answer about ${pet?.name || "pets"}, after ${messages.filter((m) => m.role === "user").length} question(s)`, model: "test", related: [] }));
vi.mock("../src/lib/assistant", async (importOriginal) => ({
  ...(await importOriginal()), askAssistant: (o) => ask(o), wakeServer: () => {}, chatSupport: async () => false,
}));
const { default: Assistant } = await import("../src/pages/Assistant");

const open = (petId) => render(<MemoryRouter initialEntries={[`/app/assistant${petId ? `?pet=${petId}` : ""}`]}><UIProvider><Assistant /></UIProvider></MemoryRouter>);
const say = async (q, answer) => {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(answer, {}, { timeout: 3000 });   // generous: the full suite runs in parallel
};
const chip = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  sessionStorage.clear(); ask.mockClear();
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, tabStore());
});

describe("One chat per pet on the Ask page", () => {
  it("switching pets opens that pet's own chat, and the assistant only gets that pet's questions", async () => {
    open(mochi.id);
    await say("How is Mochi?", "Answer about Mochi, after 1 question(s)");
    await say("And her vaccines?", "Answer about Mochi, after 2 question(s)");

    fireEvent.click(chip("Bori"));
    expect(screen.queryByText("How is Mochi?")).toBeNull();
    expect(screen.getByText("What would you like to know about Bori?")).toBeTruthy();
    await say("Can Bori eat grapes?", "Answer about Bori, after 1 question(s)");
    expect(ask.mock.calls.at(-1)[0].messages.map((m) => m.content)).toEqual(["Can Bori eat grapes?"]);
    expect(ask.mock.calls.at(-1)[0].pet.name).toBe("Bori");

    fireEvent.click(chip("Mochi"));
    expect(screen.getByText("How is Mochi?")).toBeTruthy();
    expect(screen.queryByText("Can Bori eat grapes?")).toBeNull();
    expect(chip("Bori").querySelector(".chip-dot")).toBeTruthy();   // Bori has a conversation waiting
  });

  it("'New chat' starts only this pet's conversation over", async () => {
    open(mochi.id);
    await say("How is Mochi?", "Answer about Mochi, after 1 question(s)");
    fireEvent.click(chip("Bori"));
    await say("Can Bori eat grapes?", "Answer about Bori, after 1 question(s)");
    fireEvent.click(screen.getByRole("button", { name: /New chat about Bori/ }));
    expect(screen.queryByText("Can Bori eat grapes?")).toBeNull();
    fireEvent.click(chip("Mochi"));
    expect(screen.getByText("How is Mochi?")).toBeTruthy();
  });

  it("the chats are kept per pet in this tab, and the general chat is separate", async () => {
    open("");
    await say("How often should I deworm?", "Answer about pets, after 1 question(s)");
    fireEvent.click(chip("Bori"));
    await say("Can Bori eat grapes?", "Answer about Bori, after 1 question(s)");
    await waitFor(() => expect(Object.keys(sessionStorage).sort()).toEqual([`ff-ai-chat:u1:${bori.id}`, "ff-ai-chat:u1:general"].sort()));
    expect(JSON.parse(sessionStorage.getItem("ff-ai-chat:u1:general")).map((m) => m.content)[0]).toBe("How often should I deworm?");
    expect(store.saveChatMessage).toHaveBeenCalledTimes(4);   // the store saves nothing itself when chatSaved is off
  });
});

describe("Chats saved to the account (assistant_messages)", () => {
  const saved = [
    { id: "m1", role: "user", content: "How is Mochi?" },
    { id: "m2", role: "assistant", content: "Mochi is on track.", fid: "f2", rating: 1, model: "rag-v6", related: [] },
  ];
  beforeEach(() => Object.assign(store, {
    chatSaved: true,
    loadChat: vi.fn(async (room) => (room === mochi.id ? saved : [])),
    chatRooms: vi.fn(async () => new Set([mochi.id])),
  }));

  it("a pet's saved chat opens from the account, on any device, with a dot on pets that have one", async () => {
    open(mochi.id);
    expect(await screen.findByText("Mochi is on track.")).toBeTruthy();
    expect(store.loadChat).toHaveBeenCalledWith(mochi.id);
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(chip("Bori"));
    expect(await screen.findByText("What would you like to know about Bori?")).toBeTruthy();
    expect(chip("Mochi").querySelector(".chip-dot")).toBeTruthy();
    expect(chip("Bori").querySelector(".chip-dot")).toBeNull();
  });

  it("every question and answer is saved to that pet's chat, and 'New chat' deletes only it", async () => {
    open(mochi.id);
    await screen.findByText("Mochi is on track.");
    await say("And her vaccines?", "Answer about Mochi, after 2 question(s)");
    expect(store.saveChatMessage.mock.calls.map(([room, m]) => [room, m.role])).toEqual([[mochi.id, "user"], [mochi.id, "assistant"]]);
    expect(store.saveChatMessage.mock.calls[0][1].id).toMatch(/^[0-9a-f-]{36}$/);   // a uuid, as the table needs
    fireEvent.click(screen.getByRole("button", { name: /New chat about Mochi/ }));
    expect(store.clearChat).toHaveBeenCalledWith(mochi.id);
    expect(screen.queryByText("Mochi is on track.")).toBeNull();
  });
});
