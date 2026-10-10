import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const external = process.env.BASE_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: external || "http://127.0.0.1:3000",
    proxy:
      external && process.env.HTTPS_PROXY
        ? { server: process.env.HTTPS_PROXY }
        : undefined,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          command:
            ".venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000 --no-access-log",
          url: "http://127.0.0.1:8000/health",
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "npm run start",
          url: "http://127.0.0.1:3000",
          env: { DETECTION_API_URL: "http://127.0.0.1:8000" },
          reuseExistingServer: !process.env.CI,
        },
      ],
});
