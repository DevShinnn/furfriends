import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Message } from "../src/pages/Assistant";

/* How an assistant answer is labelled in the chat (pages/Assistant.jsx). */
const show = (m) => render(<MemoryRouter><Message m={m} onRate={() => {}} onExplain={() => {}} onAsk={() => {}} /></MemoryRouter>);
const source = { id: "q7bf34c", q: "Can dogs eat grapes?", source: "FurFriends team", url: "", kind: "qa", score: 0.8 };

describe("AI answers in the chat", () => {
  it("An AI answer names its sources and says it is general information, not veterinary advice", () => {
    show({ id: "1", role: "assistant", content: "No. Grapes can cause kidney failure.", generated: true, sources: [source], match: source });
    expect(screen.getByText(/Written by the FurFriends AI from/)).toBeTruthy();
    expect(screen.getByText(/General pet-care information, not veterinary advice/)).toBeTruthy();
    expect(screen.queryByText(/closest checked information/)).toBeNull();
  });

  it("An AI answer from a less close passage says it's the closest checked information", () => {
    show({ id: "2", role: "assistant", content: "No. Grapes can cause kidney failure.", generated: true, uncertain: true, sources: [source], match: source });
    expect(screen.getByText(/closest checked information FurFriends has/)).toBeTruthy();
  });

  it("A checked answer is labelled the same way; an error message and a reply with no source aren't", () => {
    show({ id: "3", role: "assistant", content: "Grapes are poisonous to dogs.", match: source });
    expect(screen.getByText(/not veterinary advice/)).toBeTruthy();
    show({ id: "4", role: "assistant", content: "Couldn't load the assistant's answers.", error: true });
    show({ id: "5", role: "assistant", content: "I don't have a checked answer for that yet, so I'd rather not guess.", match: null });
    expect(screen.getAllByText(/not veterinary advice/)).toHaveLength(1);
  });
});
