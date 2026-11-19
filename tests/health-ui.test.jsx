import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { HealthBadge, HealthPanel } from "../src/components/Health";
import { demoPets } from "../src/lib/demoData";
import { addDays, todayISO } from "../src/lib/utils";
import { errorText, renderForm, submit, type } from "./forms";

/* The health indicator on screen: the pet's page panel, the card badge, and the weight history (weight_log). */
const store = {};
vi.mock("../src/store/StoreContext", () => ({ useStore: () => store }));
const bori = demoPets("u")[1];

beforeEach(() => Object.assign(store, { weightLog: true, saveWeight: vi.fn(() => true), removeWeight: vi.fn(() => true) }));

describe("Health indicator on screen", () => {
  it("the panel shows the status, the checks that need a look, and the ring", () => {
    renderForm(<HealthPanel pet={bori} onAction={() => {}} />);
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Needs attention: 3 of 6 checks on track/ })).toBeTruthy();
    expect(screen.getByText(/DHPP overdue by 15 days/)).toBeTruthy();
    expect(screen.getByText(/It isn't a vet exam/)).toBeTruthy();
  });

  it("the weight check shows the saved weights and a trend line, and a weight can be added", () => {
    renderForm(<HealthPanel pet={bori} onAction={() => {}} />);
    fireEvent.click(screen.getByText("Show 3 more checks"));
    expect(screen.getByText(/down 1.8 kg \(6%\) since 10 months ago/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Weight from 31.2 kg/ })).toBeTruthy();
    expect(screen.getAllByText(/^\d+(\.\d)? kg$/).length).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: /Add a weight/ }));
    type("Date weighed *", addDays(1));
    type("Weight (kg) *", "29");
    submit("Save weight");
    expect(errorText()).toMatch(/isn't in the future/);
    type("Date weighed *", addDays(-3));
    submit("Save weight");
    expect(store.saveWeight).toHaveBeenCalledWith(bori.id, { date: addDays(-3), kg: 29 });
  });

  it("without the weight_log table in the database, no weight history is offered", () => {
    store.weightLog = false;
    renderForm(<HealthPanel pet={bori} onAction={() => {}} />);
    fireEvent.click(screen.getByText("Show 3 more checks"));
    expect(screen.queryByRole("button", { name: /Add a weight/ })).toBeNull();
  });

  it("the card badge names the most important thing to look at", () => {
    renderForm(<HealthBadge pet={{ ...bori, weights: [{ date: todayISO(), kg: 29.4 }] }} />);
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/DHPP overdue by 15 days/)).toBeTruthy();
  });
});
