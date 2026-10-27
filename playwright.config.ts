import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "navbar-layout.spec.ts",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000/trending",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        channel: "chrome",
      },
    },
    {
      name: "msedge",
      use: {
        browserName: "chromium",
        channel: "msedge",
      },
    },
  ],
});
