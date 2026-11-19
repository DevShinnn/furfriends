import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { PetForm, MedForm, VaxForm } from "../src/components/Forms";
import { FeedingForm, CareForm, AppointmentForm } from "../src/components/CareForms";
import { addDays, todayISO } from "../src/lib/utils";
import { errorText, renderForm, submit, type } from "./forms";

/* The forms' own checks, with the store replaced by test doubles that record what each form saves. */
const store = vi.hoisted(() => ({}));
vi.mock("../src/store/StoreContext", () => ({ useStore: () => store }));

const pet = { id: "p1", name: "Mochi", species: "Cat" };
beforeEach(() => {
  Object.assign(store, {
    pets: [pet], getPet: () => pet,
    addPet: vi.fn(() => "new-id"), updatePet: vi.fn(() => true), upsertItem: vi.fn(() => true),
  });
});

describe("UC2 Manage Pet Profile (forms)", () => {
  it("[FR2.1] Add pet without a name shows 'Please give your pet a name.' and saves nothing", () => {
    renderForm(<PetForm />);
    submit("Create profile");
    expect(errorText()).toBe("Please give your pet a name.");
    expect(store.addPet).not.toHaveBeenCalled();
  });

  it("[FR2.1] Add pet with age months above 11 shows 'Age months must be between 0 and 11.'", () => {
    renderForm(<PetForm />);
    type("Name *", "Mochi");
    type("Age (months)", "12");
    submit("Create profile");
    expect(errorText()).toBe("Age months must be between 0 and 11.");
  });

  it("[FR2.1] Add pet with weight 0 shows 'Weight must be greater than 0.'", () => {
    renderForm(<PetForm />);
    type("Name *", "Mochi");
    type("Weight (kg)", "0");
    submit("Create profile");
    expect(errorText()).toBe("Weight must be greater than 0.");
  });

  it("[FR2.1] Add pet with valid details saves name, species, breed, age, gender and weight", () => {
    renderForm(<PetForm />);
    type("Name *", "  Bantay ");
    fireEvent.click(screen.getByLabelText("Dog"));
    type("Breed", "Aspin");
    type("Age (years)", "3");
    type("Weight (kg)", "12.5");
    fireEvent.click(screen.getByLabelText("Male"));
    submit("Create profile");
    expect(errorText()).toBeNull();
    expect(store.addPet).toHaveBeenCalledWith({ name: "Bantay", species: "Dog", breed: "Aspin", ageYears: 3, ageMonths: 0, gender: "Male", weight: 12.5, photo: null });
  });

  it("[FR2.2] Edit pet opens with the pet's details and saves the changes to that pet", () => {
    renderForm(<PetForm pet={{ id: "p1", name: "Mochi", species: "Cat", breed: "Puspin", ageYears: 2, ageMonths: 0, gender: "Female", weight: 4 }} />);
    expect(screen.getByLabelText("Name *").value).toBe("Mochi");
    type("Weight (kg)", "4.4");
    submit("Save changes");
    expect(store.updatePet).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Mochi", weight: 4.4 }));
  });

  it("[FR2.4] Medical record without a title shows 'Date and title are required.'", () => {
    renderForm(<MedForm pet={pet} />);
    submit("Add record");
    expect(errorText()).toBe("Date and title are required.");
    expect(store.upsertItem).not.toHaveBeenCalled();
  });

  it("[FR2.4] Medical record with a title is saved to the pet's medical history", () => {
    renderForm(<MedForm pet={pet} />);
    type("Title / diagnosis *", "Ear infection");
    type("Type *", "Illness");
    submit("Add record");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "medical", expect.objectContaining({ title: "Ear infection", type: "Illness", date: todayISO() }));
  });

  it("[FR2.4] Vaccination without a vaccine name shows 'Vaccine name and date given are required.'", () => {
    renderForm(<VaxForm pet={pet} />);
    submit("Add vaccination");
    expect(errorText()).toBe("Vaccine name and date given are required.");
  });

  it("[FR2.4] Vaccination whose next due date is not after the date given is refused", () => {
    renderForm(<VaxForm pet={pet} />);
    type("Vaccine *", "Rabies");
    type("Date given *", "2026-10-01");
    type("Next due", "2026-10-01");
    submit("Add vaccination");
    expect(errorText()).toBe("Next due date must be after the date given.");
  });

  it("[FR2.4] Vaccination with a valid next due date is saved", () => {
    renderForm(<VaxForm pet={pet} />);
    type("Vaccine *", "Rabies");
    type("Date given *", "2026-10-01");
    type("Next due", "2027-10-01");
    submit("Add vaccination");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "vaccinations", expect.objectContaining({ name: "Rabies", dateGiven: "2026-10-01", nextDue: "2027-10-01" }));
  });
});

describe("UC3 Set Care Reminders (forms)", () => {
  it("[FR3.1] Feeding time without food shows 'What are they eating? Add the food.'", () => {
    renderForm(<FeedingForm petId="p1" />);
    submit("Add meal");
    expect(errorText()).toBe("What are they eating? Add the food.");
  });

  it("[FR3.1] Feeding time with all days selected is saved as every day (empty day list)", () => {
    renderForm(<FeedingForm petId="p1" />);
    type("Time *", "18:30");
    type("Food *", "Dry kibble");
    type("Amount", "1/4 cup");
    submit("Add meal");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "feeding", expect.objectContaining({ time: "18:30", food: "Dry kibble", amount: "1/4 cup", days: [] }));
  });

  it("[FR3.1] Unticking Sunday saves the meal for Monday to Saturday only", () => {
    renderForm(<FeedingForm petId="p1" />);
    type("Food *", "Wet food");
    fireEvent.click(screen.getByRole("button", { name: /^S\s*un$/ }));
    submit("Add meal");
    expect(store.upsertItem.mock.calls[0][2].days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("[FR3.2] Grooming task without a name shows 'Give this task a name.'", () => {
    renderForm(<CareForm petId="p1" kind="Grooming" />);
    submit("Schedule");
    expect(errorText()).toBe("Give this task a name.");
  });

  it("[FR3.2] A grooming task repeats every 2 weeks by default, starting today", () => {
    renderForm(<CareForm petId="p1" kind="Grooming" />);
    type("Task *", "Bath");
    submit("Schedule");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "care", expect.objectContaining({ kind: "Grooming", title: "Bath", repeatDays: 14, nextDue: todayISO() }));
  });

  it("[FR3.2] A deworming task repeats every 3 months by default", () => {
    renderForm(<CareForm petId="p1" kind="Deworming" />);
    type("Product / treatment *", "Deworming tablet");
    submit("Schedule");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "care", expect.objectContaining({ kind: "Deworming", title: "Deworming tablet", repeatDays: 90 }));
  });

  it("[FR3.2] Vet appointment without a reason shows 'What's the visit for?'", () => {
    renderForm(<AppointmentForm petId="p1" />);
    submit("Book appointment");
    expect(errorText()).toBe("What's the visit for?");
  });

  it("[FR3.2] Vet appointment is saved as a one-time 'Vet appointment' task, tomorrow at 9:00 AM by default", () => {
    renderForm(<AppointmentForm petId="p1" />);
    type("What's it for? *", "Annual checkup");
    submit("Book appointment");
    expect(store.upsertItem).toHaveBeenCalledWith("p1", "care", expect.objectContaining({
      kind: "Vet appointment", title: "Annual checkup", nextDue: addDays(1), dueTime: "09:00", repeatDays: 0, done: false,
    }));
  });
});
