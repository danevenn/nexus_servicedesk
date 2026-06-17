import { test, expect } from "@playwright/test";
import { loginDemo } from "./helpers";

test("el demo (VIEWER) ve el panel pero no puede editarlo", async ({ page }) => {
  await loginDemo(page);
  await expect(page.getByRole("heading", { name: "Dashboards" })).toBeVisible();
  // Solo lectura: sin botón Editar ni paleta de widgets.
  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(page.locator(".grid-stack-item").first()).toBeVisible();
  // Tampoco puede crear tickets.
  await page.goto("/tickets");
  await expect(page.getByRole("button", { name: "Nuevo ticket" })).toHaveCount(0);
});
