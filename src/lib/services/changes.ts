import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";
import {
  ForbiddenError,
  mapPrismaError,
  NotFoundError,
  ValidationError,
} from "./errors";
import { requestApprovalsSchema, decideApprovalSchema } from "./schemas";
import { aggregateApprovalState } from "./itil-domain";
import { emitNotifications } from "./notifications";

// ─────────────────────────────────────────────
//  Gestión de cambios (CHANGE) — flujo de aprobación del CAB.
//  Un cambio reúne votos de varios aprobadores (mánager/admin); el estado
//  agregado se deriva de esos votos (ver itil-domain.aggregateApprovalState).
// ─────────────────────────────────────────────

// Solicita aprobación a uno o varios aprobadores (Change Advisory Board).
// Quien gestiona el cambio (AGENT+) designa a los aprobadores; estos deben ser
// mánager o admin (los únicos con 'change:approve').
export async function requestApprovals(input: unknown, ctx: Ctx) {
  const data = requestApprovalsSchema.parse(input);
  assertCan(ctx, "ticket:update");

  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
    select: { id: true, kind: true, ref: true },
  });
  if (!ticket) throw new NotFoundError("Cambio no encontrado");
  if (ticket.kind !== "CHANGE") {
    throw new ValidationError("El ticket no es un cambio");
  }

  const approvers = await prisma.user.findMany({
    where: { id: { in: data.approverIds } },
    select: { id: true, role: true },
  });
  if (approvers.length !== data.approverIds.length) {
    throw new NotFoundError("Algún aprobador no existe");
  }
  if (approvers.some((a) => a.role !== "MANAGER" && a.role !== "ADMIN")) {
    throw new ValidationError(
      "Los aprobadores deben ser mánager o administrador",
    );
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // Solo añade votos para aprobadores que aún no estén en el CAB; no pisa
      // los votos ya emitidos.
      const existing = await tx.changeApproval.findMany({
        where: { ticketId: data.ticketId },
        select: { approverId: true },
      });
      const existingIds = new Set(existing.map((e) => e.approverId));
      const toAdd = data.approverIds.filter((id) => !existingIds.has(id));
      if (toAdd.length > 0) {
        await tx.changeApproval.createMany({
          data: toAdd.map((approverId) => ({
            ticketId: data.ticketId,
            approverId,
          })),
        });
      }

      const all = await tx.changeApproval.findMany({
        where: { ticketId: data.ticketId },
        select: { decision: true },
      });
      const approvalState = aggregateApprovalState(all.map((a) => a.decision));

      await tx.ticket.update({
        where: { id: data.ticketId },
        data: {
          approvalState,
          events: {
            create: {
              actorKind: ctx.actorKind,
              actorId: ctx.actorId,
              action: "approval_requested",
              payload: { approverIds: data.approverIds },
            },
          },
        },
      });
      return { approvalState, added: toAdd.length };
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
  // Notifica a los aprobadores designados (emit excluye al propio actor).
  await emitNotifications({
    ctx,
    recipientIds: data.approverIds,
    kind: "APPROVAL_REQUESTED",
    ticketId: data.ticketId,
    ticketRef: ticket.ref,
  });
  return result;
}

// Registra el voto del aprobador actual y recalcula el estado del cambio.
// Solo MANAGER/ADMIN (change:approve) y solo si están designados como aprobadores.
export async function decideApproval(input: unknown, ctx: Ctx) {
  const data = decideApprovalSchema.parse(input);
  assertCan(ctx, "change:approve");

  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
    select: { id: true, kind: true, ref: true, assigneeId: true, requesterId: true },
  });
  if (!ticket) throw new NotFoundError("Cambio no encontrado");
  if (ticket.kind !== "CHANGE") {
    throw new ValidationError("El ticket no es un cambio");
  }

  const vote = await prisma.changeApproval.findUnique({
    where: {
      ticketId_approverId: {
        ticketId: data.ticketId,
        approverId: ctx.actorId,
      },
    },
    select: { id: true },
  });
  if (!vote) {
    throw new ForbiddenError(
      "No eres uno de los aprobadores designados de este cambio",
    );
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.changeApproval.update({
        where: { id: vote.id },
        data: {
          decision: data.decision,
          comment: data.comment ?? null,
          decidedAt: new Date(),
        },
      });

      const all = await tx.changeApproval.findMany({
        where: { ticketId: data.ticketId },
        select: { decision: true },
      });
      const approvalState = aggregateApprovalState(all.map((a) => a.decision));

      await tx.ticket.update({
        where: { id: data.ticketId },
        data: {
          approvalState,
          events: {
            create: {
              actorKind: ctx.actorKind,
              actorId: ctx.actorId,
              action: data.decision === "APPROVED" ? "approved" : "rejected",
              payload: { comment: data.comment ?? null },
            },
          },
        },
      });
      return { approvalState };
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
  // Notifica a quien gestiona el cambio (asignado, o solicitante si no hay).
  await emitNotifications({
    ctx,
    recipientIds: [ticket.assigneeId ?? ticket.requesterId],
    kind: "APPROVAL_DECIDED",
    ticketId: ticket.id,
    ticketRef: ticket.ref,
  });
  return result;
}
