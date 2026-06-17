import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const items = (page: import("@playwright/test").Page) =>
  page.locator(".grid-stack-item");

test("añadir un widget desde la paleta persiste y se puede borrar", async ({
  page,
}) => {
  await login(page, "agente@nexo.dev");
  await expect(items(page).first()).toBeVisible();
  const initial = await items(page).count();

  // Entrar en edición → aparece la paleta.
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Arrastra al panel o pulsa para añadir")).toBeVisible();

  // Añadir un Indicador desde la paleta (clic = añadir al pie).
  await page.getByRole("button", { name: /Indicador/ }).click();
  await page.getByRole("button", { name: "Añadir widget" }).click();
  await expect(items(page)).toHaveCount(initial + 1);

  // Persistencia: tras recargar sigue estando.
  await page.reload();
  await expect(items(page)).toHaveCount(initial + 1);

  // Limpieza: borrar el widget recién añadido y dejar el panel como estaba.
  await page.getByRole("button", { name: "Editar" }).click();
  await items(page).last().getByRole("button", { name: "Eliminar widget" }).click();
  await expect(items(page)).toHaveCount(initial);
});
