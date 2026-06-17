import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("un técnico crea un ticket (flujo completo del diálogo)", async ({ page }) => {
  await login(page, "agente@nexo.dev");
  await page.goto("/tickets");

  const title = `E2E prueba ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo ticket" }).click();
  await page.fill("#title", title);
  await page.fill("#description", "Ticket creado por la suite e2e de Playwright.");
  await page.getByRole("button", { name: "Crear ticket" }).click();

  // Confirmación del flujo real de creación (toast de éxito + diálogo cerrado).
  // No comprobamos la fila en la cola porque está paginada y ordenada por
  // prioridad (un P3 nuevo cae fuera del corte visible).
  await expect(page.getByText("Ticket creado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuevo ticket" })).toHaveCount(0);
});

test("abrir un ticket muestra su detalle", async ({ page }) => {
  await login(page, "agente@nexo.dev");
  await page.goto("/tickets");
  // El primer enlace de ticket de la tabla lleva al detalle.
  await page.locator('a[href^="/tickets/"]').first().click();
  await expect(page.getByRole("link", { name: /Volver a tickets/ })).toBeVisible();
});
