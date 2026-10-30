import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { fakeSupabase } from "./fakeSupabase";

// Every test file gets the fake Supabase client instead of the real one.
vi.mock("../src/lib/supabase", () => ({ supabase: fakeSupabase() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// jsdom has no layout: scrolling does nothing in tests.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
