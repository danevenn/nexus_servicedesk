import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("un técnico inicia sesión y ve sus dashboards", async ({ page }) => {
  await login(page, "agente@nexo.dev");
  await expect(page.getByRole("heading", { name: "Dashboards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
});

test("una ruta protegida redirige a /login sin sesión", async ({ page }) => {
  await page.goto("/tickets");
  await page.waitForURL("**/login**");
  await expect(page.locator("#email")).toBeVisible();
});
