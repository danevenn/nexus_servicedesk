"use server";

import { getSessionCtx } from "@/lib/auth-context";
import {
  createTicket,
  triageTicket,
  updateTicketStatus,
  queryTickets,
  addWorkNote,
} from "@/lib/services/tickets";
import type {
  CreateTicketInput,
  TriageTicketInput,
  UpdateStatusInput,
  QueryTicketsInput,
  AddNoteInput,
} from "@/lib/services/schemas";

// Server Actions: resuelven la sesión y delegan en la capa de servicios.
// Toda la lógica y el RBAC viven en los servicios, no aquí.

export async function createTicketAction(input: CreateTicketInput) {
  const ctx = await getSessionCtx();
  return createTicket(input, ctx);
}

export async function triageTicketAction(input: TriageTicketInput) {
  const ctx = await getSessionCtx();
  return triageTicket(input, ctx);
}

export async function updateTicketStatusAction(input: UpdateStatusInput) {
  const ctx = await getSessionCtx();
  return updateTicketStatus(input, ctx);
}

export async function queryTicketsAction(input: QueryTicketsInput) {
  const ctx = await getSessionCtx();
  return queryTickets(input, ctx);
}

export async function addWorkNoteAction(input: AddNoteInput) {
  const ctx = await getSessionCtx();
  return addWorkNote(input, ctx);
}
