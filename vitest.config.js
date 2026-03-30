import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["test/**/*.test.js"],
          exclude: ["test/**/*.browser.test.js"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/**/*.browser.test.js"],
          browser: {
            enabled: true,
            provider: playwright(),
            // WebGPU tests auto-skip when adapter unavailable (headless Chromium)
            instances: [{ browser: "chromium" }],
            headless: true,
          },
        },
      },
    ],
  },
});
