import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UIProvider } from "../src/components/UIContext";
import { demoPets } from "../src/lib/demoData";

/* The Ask page keeps one conversation per pet (and one for pets in general): picking a pet opens its own chat,
   and the assistant only ever gets that pet's conversation. */
const pets = demoPets("u1");
const mochi = pets.find((p) => p.name === "Mochi"), bori = pets.find((p) => p.name === "Bori");
const store = { user: { id: "u1" }, pets, rateAnswer: vi.fn(), clearRating: vi.fn() };
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
  await screen.findByText(answer);
};
const chip = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => { sessionStorage.clear(); ask.mockClear(); });

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
    await waitFor(() => expect(Object.keys(sessionStorage).sort()).toEqual([`ff-ai-chat:u1:${bori.id}`, "ff-ai-chat:u1:general"]));
    expect(JSON.parse(sessionStorage.getItem("ff-ai-chat:u1:general")).map((m) => m.content)[0]).toBe("How often should I deworm?");
  });
});
