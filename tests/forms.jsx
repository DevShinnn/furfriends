import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UIProvider } from "../src/components/UIContext";

/* Renders a form the way the app shows it (inside the router and UI provider). The store is mocked by each test file. */
export const renderForm = (node) => render(<MemoryRouter><UIProvider>{node}</UIProvider></MemoryRouter>);

export const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
export const submit = (button) => fireEvent.click(screen.getByRole("button", { name: button }));
export const errorText = () => document.querySelector(".error-msg")?.textContent || null;
