import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  expect: { timeout: 15000 },
  // Desktop and mobile share demo identities; global logout invalidates peer sessions.
  workers: process.env.DEMO_CREDENTIALS_FILE ? 1 : undefined,
  testMatch: "**/*.spec.js",
  use: {
    baseURL: process.env.SUNSYNC_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: process.env.SUNSYNC_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
