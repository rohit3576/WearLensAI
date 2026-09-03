import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    channel: "chrome",
    baseURL: "http://localhost:3210",
  },
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3210",
    reuseExistingServer: true,
    env: {
      PORT: "3210",
      TRYON_STUB_QUEUED_MS: "150",
      TRYON_STUB_PROCESSING_MS: "600",
    },
  },
});
