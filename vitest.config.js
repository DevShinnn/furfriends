import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Unit tests: npm test. Results for the thesis report: npm run test:report (scripts/test-report.mjs).
   Tests run in a simulated browser (jsdom) against a fake Supabase (tests/fakeSupabase.js), never the live project. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx}"],
    setupFiles: ["tests/setup.js"],
  },
});
