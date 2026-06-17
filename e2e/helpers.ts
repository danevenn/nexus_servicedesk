import { expect, type Page } from "@playwright/test";

const PASSWORD = "Password123!";

// Inicia sesión con el formulario y espera a aterrizar en la app.
export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/");
}

// Entra como invitado de solo lectura (rol VIEWER).
export async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver demo (solo lectura)" }).click();
  await page.waitForURL("**/");
}

// Espera a que la cuadrícula de GridStack esté montada y devuelve el nº de widgets.
export async function widgetCount(page: Page): Promise<number> {
  await expect(page.locator(".grid-stack-item").first()).toBeVisible();
  return page.locator(".grid-stack-item").count();
}
