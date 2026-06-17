"use server";

import { revalidatePath } from "next/cache";
import { getSessionCtx } from "@/lib/auth-context";
import {
  createDashboard,
  renameDashboard,
  deleteDashboard,
  addWidget,
  updateWidget,
  removeWidget,
  saveLayout,
} from "@/lib/services/dashboards";
import type {
  AddWidgetInput,
  UpdateWidgetInput,
  SaveLayoutInput,
} from "@/lib/services/schemas";

// Server Actions del constructor de dashboards: resuelven la sesión y delegan
// en la capa de servicios (validación zod + RBAC + propiedad allí, no aquí).

export async function createDashboardAction(name: string) {
  const ctx = await getSessionCtx();
  const dash = await createDashboard(ctx, name);
  revalidatePath("/");
  return dash;
}

export async function renameDashboardAction(id: string, name: string) {
  const ctx = await getSessionCtx();
  await renameDashboard(ctx, id, name);
  revalidatePath("/");
}

export async function deleteDashboardAction(id: string) {
  const ctx = await getSessionCtx();
  await deleteDashboard(ctx, id);
  revalidatePath("/");
}

export async function addWidgetAction(input: AddWidgetInput) {
  const ctx = await getSessionCtx();
  const widget = await addWidget(input, ctx);
  revalidatePath("/");
  return { id: widget.id };
}

export async function updateWidgetAction(input: UpdateWidgetInput) {
  const ctx = await getSessionCtx();
  await updateWidget(input, ctx);
  revalidatePath("/");
}

export async function removeWidgetAction(widgetId: string) {
  const ctx = await getSessionCtx();
  await removeWidget(ctx, widgetId);
  revalidatePath("/");
}

export async function saveLayoutAction(input: SaveLayoutInput) {
  const ctx = await getSessionCtx();
  await saveLayout(input, ctx);
  revalidatePath("/");
}
