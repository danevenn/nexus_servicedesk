import { defineConfig, devices } from "@playwright/test";

// e2e contra la app real (puerto 3300). En local reutiliza el server que ya
// esté levantado; en CI arranca `pnpm dev`. Un solo worker: los tests mutan
// la misma BD de desarrollo y queremos evitar carreras.
const PORT = 3300;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `pnpm dev` (next dev) arranca en el 3000; forzamos el 3300 que usa la app.
    command: `pnpm exec next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
