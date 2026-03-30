import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/** Headed browser tests — use for WebGPU (requires visible window with GPU). */
export default defineConfig({
  test: {
    include: ["test/**/*.browser.test.js"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: false,
    },
  },
});
