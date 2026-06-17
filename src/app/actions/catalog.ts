"use server";

import { getSessionCtx } from "@/lib/auth-context";
import { submitCatalogRequest } from "@/lib/services/catalog";
import type { SubmitCatalogRequestInput } from "@/lib/services/schemas";

// Server Action fina: resuelve la sesión y delega en el servicio (RBAC allí).
export async function submitCatalogRequestAction(input: SubmitCatalogRequestInput) {
  const ctx = await getSessionCtx();
  const ticket = await submitCatalogRequest(input, ctx);
  return { id: ticket.id, ref: ticket.ref };
}
