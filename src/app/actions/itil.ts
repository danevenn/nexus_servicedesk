"use server";

import { revalidatePath } from "next/cache";
import { getSessionCtx } from "@/lib/auth-context";
import {
  linkIncidents,
  unlinkIncident,
  setKnownError,
  listLinkableIncidents,
} from "@/lib/services/problems";
import { requestApprovals, decideApproval } from "@/lib/services/changes";
import type {
  LinkIncidentsInput,
  UnlinkIncidentInput,
  SetKnownErrorInput,
  RequestApprovalsInput,
  DecideApprovalInput,
} from "@/lib/services/schemas";

// Server Actions del ciclo ITIL (problemas + cambios): resuelven la sesión y
// delegan en la capa de servicios, donde vive el RBAC y la lógica.

// ── Problemas ──
export async function linkIncidentsAction(input: LinkIncidentsInput) {
  const ctx = await getSessionCtx();
  const result = await linkIncidents(input, ctx);
  revalidatePath(`/tickets/${input.problemId}`);
  return result;
}

export async function unlinkIncidentAction(input: UnlinkIncidentInput) {
  const ctx = await getSessionCtx();
  const result = await unlinkIncident(input, ctx);
  revalidatePath(`/tickets/${input.incidentId}`);
  return result;
}

export async function setKnownErrorAction(input: SetKnownErrorInput) {
  const ctx = await getSessionCtx();
  const result = await setKnownError(input, ctx);
  revalidatePath(`/tickets/${input.problemId}`);
  return result;
}

export async function searchLinkableIncidentsAction(q: string) {
  const ctx = await getSessionCtx();
  return listLinkableIncidents(ctx, q);
}

// ── Cambios (CAB) ──
export async function requestApprovalsAction(input: RequestApprovalsInput) {
  const ctx = await getSessionCtx();
  const result = await requestApprovals(input, ctx);
  revalidatePath(`/tickets/${input.ticketId}`);
  return result;
}

export async function decideApprovalAction(input: DecideApprovalInput) {
  const ctx = await getSessionCtx();
  const result = await decideApproval(input, ctx);
  revalidatePath(`/tickets/${input.ticketId}`);
  return result;
}
