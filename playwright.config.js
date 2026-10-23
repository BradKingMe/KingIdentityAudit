import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5187", browserName: "chromium", channel: "chrome", headless: true },
  webServer: { command: "pnpm preview --port 5187 --strictPort", url: "http://127.0.0.1:5187", reuseExistingServer: false },
});
