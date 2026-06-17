import { prisma } from "@/lib/prisma";
import { assertCan, can, type Ctx } from "./context";
import { ForbiddenError, mapPrismaError, NotFoundError, ValidationError } from "./errors";
import {
  createTicketSchema,
  triageTicketSchema,
  updateStatusSchema,
  queryTicketsSchema,
  addNoteSchema,
} from "./schemas";
import {
  derivePriority,
  slaTargets,
  pauseRefund,
  shiftDeadline,
  REF_PREFIX,
  type ImpactUrgency,
} from "./tickets-domain";
import { emitNotifications } from "./notifications";
import type { Priority, TicketKind } from "@/generated/prisma/enums";

const CLOSED_STATES = new Set(["RESOLVED", "CLOSED"]);

// Referencia secuencial por tipo (INC-0001…). Suficiente a escala de demo.
async function nextRef(kind: TicketKind): Promise<string> {
  const count = await prisma.ticket.count({ where: { kind } });
  return `${REF_PREFIX[kind]}-${String(count + 1).padStart(4, "0")}`;
}

// Crear ticket. REQUESTER solo abre INCIDENT/REQUEST; PROBLEM/CHANGE exigen rol técnico.
export async function createTicket(input: unknown, ctx: Ctx) {
  const data = createTicketSchema.parse(input);

  if (data.kind === "PROBLEM") assertCan(ctx, "problem:create");
  else if (data.kind === "CHANGE") assertCan(ctx, "change:create");
  else assertCan(ctx, "ticket:create");

  const priority = derivePriority(
    data.impact as ImpactUrgency,
    data.urgency as ImpactUrgency,
  );
  const ref = await nextRef(data.kind);
  const now = new Date();
  const { respondBy, resolveBy } = slaTargets(priority, now);

  try {
    return await prisma.ticket.create({
      data: {
        ref,
        kind: data.kind,
        title: data.title,
        description: data.description,
        impact: data.impact,
        urgency: data.urgency,
        priority,
        ciId: data.ciId ?? null,
        requesterId: ctx.actorId,
        // Clasificación/enrutado (p. ej. heredado de un ítem de catálogo).
        ...(data.category ? { category: data.category } : {}),
        ...(data.subcategory ? { subcategory: data.subcategory } : {}),
        ...(data.channel ? { channel: data.channel } : {}),
        ...(data.assignmentGroupId
          ? { assignmentGroupId: data.assignmentGroupId }
          : {}),
        // Atributos de cambio: solo tienen sentido en un CHANGE.
        ...(data.kind === "CHANGE"
          ? {
              changeType: data.changeType ?? null,
              risk: data.risk ?? null,
              plannedStart: data.plannedStart ?? null,
              plannedEnd: data.plannedEnd ?? null,
            }
          : {}),
        sla: { create: { respondBy, resolveBy } },
        events: {
          create: {
            actorKind: ctx.actorKind,
            actorId: ctx.actorId,
            action: "created",
            payload: {
              ref,
              priority,
              ...(data.catalogItemSlug
                ? { catalogItemSlug: data.catalogItemSlug }
                : {}),
              ...(data.formAnswers ? { answers: data.formAnswers } : {}),
            },
          },
        },
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Triaje: asignar técnico y/o recalcular prioridad. Solo AGENT+.
export async function triageTicket(input: unknown, ctx: Ctx) {
  const data = triageTicketSchema.parse(input);
  assertCan(ctx, "ticket:triage");

  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
    include: { sla: true },
  });
  if (!ticket) throw new NotFoundError("Ticket no encontrado");

  // Reasignar a un técnico distinto del actor requiere permiso adicional.
  if (
    data.assigneeId &&
    data.assigneeId !== ctx.actorId &&
    ticket.assigneeId &&
    ticket.assigneeId !== data.assigneeId
  ) {
    assertCan(ctx, "ticket:reassign");
  }

  const impact = (data.impact ?? ticket.impact) as ImpactUrgency;
  const urgency = (data.urgency ?? ticket.urgency) as ImpactUrgency;
  const priority = derivePriority(impact, urgency);

  try {
    // Primera respuesta: si se asigna y aún no hay respondedAt, se marca ahora
    // (alimenta el SLA de respuesta).
    const firstResponse =
      data.assigneeId && ticket.sla && !ticket.sla.respondedAt;

    const updated = await prisma.ticket.update({
      where: { id: data.ticketId },
      data: {
        assigneeId: data.assigneeId ?? ticket.assigneeId,
        impact,
        urgency,
        priority,
        status:
          ticket.status === "NEW" && data.assigneeId ? "ASSIGNED" : ticket.status,
        ...(firstResponse
          ? { sla: { update: { respondedAt: new Date() } } }
          : {}),
        events: {
          create: {
            actorKind: ctx.actorKind,
            actorId: ctx.actorId,
            action: "triaged",
            payload: { assigneeId: data.assigneeId, priority },
          },
        },
      },
    });
    // Notifica al técnico recién asignado (emit excluye al propio actor).
    if (data.assigneeId) {
      await emitNotifications({
        ctx,
        recipientIds: [data.assigneeId],
        kind: "ASSIGNED",
        ticketId: updated.id,
        ticketRef: updated.ref,
      });
    }
    return updated;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Cambiar estado. Solo AGENT+. Marca resolvedAt al resolver/cerrar.
export async function updateTicketStatus(input: unknown, ctx: Ctx) {
  const data = updateStatusSchema.parse(input);
  assertCan(ctx, "ticket:update");

  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
    include: { sla: true },
  });
  if (!ticket) throw new NotFoundError("Ticket no encontrado");
  if (ticket.status === data.status) {
    throw new ValidationError("El ticket ya está en ese estado");
  }

  // Gating ITIL: un cambio no puede entrar en implementación (IN_PROGRESS) sin
  // estar aprobado por el CAB.
  if (
    ticket.kind === "CHANGE" &&
    data.status === "IN_PROGRESS" &&
    ticket.approvalState !== "APPROVED"
  ) {
    throw new ValidationError(
      "El cambio requiere la aprobación del CAB antes de implementarse",
    );
  }

  const resolving = CLOSED_STATES.has(data.status);
  const now = new Date();

  // ── Pausa del SLA al entrar/salir de EN ESPERA (ON_HOLD) ──
  // Entrar: se marca el inicio de pausa. Salir: el tiempo pausado no cuenta
  // contra el SLA → se desplazan los deadlines y se acumula el tiempo pausado.
  let slaUpdate: Record<string, unknown> | undefined;
  if (ticket.sla) {
    const entering = data.status === "ON_HOLD" && ticket.status !== "ON_HOLD";
    const leaving = ticket.status === "ON_HOLD" && data.status !== "ON_HOLD";
    if (entering) {
      slaUpdate = { onHoldSince: now };
    } else if (leaving && ticket.sla.onHoldSince) {
      const priority = ticket.priority as Priority;
      const { wallMinutes, refundMinutes } = pauseRefund(
        priority,
        ticket.sla.onHoldSince,
        now,
      );
      slaUpdate = {
        onHoldSince: null,
        pausedMinutes: { increment: wallMinutes },
        resolveBy: shiftDeadline(ticket.sla.resolveBy, priority, refundMinutes),
        // El objetivo de respuesta solo se desplaza si aún no se ha respondido.
        ...(ticket.sla.respondedAt
          ? {}
          : { respondBy: shiftDeadline(ticket.sla.respondBy, priority, refundMinutes) }),
      };
    }
  }

  let updated;
  try {
    updated = await prisma.ticket.update({
      where: { id: data.ticketId },
      data: {
        status: data.status,
        resolvedAt: resolving ? (ticket.resolvedAt ?? now) : null,
        ...(slaUpdate ? { sla: { update: slaUpdate } } : {}),
        // Documentación de cierre (si se aporta al resolver/cerrar).
        ...(resolving && data.resolutionCode ? { resolutionCode: data.resolutionCode } : {}),
        ...(resolving && data.resolutionNotes ? { resolutionNotes: data.resolutionNotes } : {}),
        events: {
          create: {
            actorKind: ctx.actorKind,
            actorId: ctx.actorId,
            action: resolving ? "resolved" : "status_changed",
            payload: {
              from: ticket.status,
              to: data.status,
              ...(data.resolutionCode ? { code: data.resolutionCode } : {}),
            },
          },
        },
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
  // Avisa al solicitante del avance de su ticket (emit excluye al propio actor).
  await emitNotifications({
    ctx,
    recipientIds: [ticket.requesterId],
    kind: resolving ? "RESOLVED" : "STATUS_CHANGED",
    ticketId: ticket.id,
    ticketRef: ticket.ref,
  });
  return updated;
}

// Añade una nota de trabajo al timeline. Solo AGENT+ (ticket:comment).
export async function addWorkNote(input: unknown, ctx: Ctx) {
  const data = addNoteSchema.parse(input);
  assertCan(ctx, "ticket:comment");
  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
    select: { id: true, ref: true, requesterId: true, assigneeId: true },
  });
  if (!ticket) throw new NotFoundError("Ticket no encontrado");
  const event = await prisma.ticketEvent.create({
    data: {
      ticketId: data.ticketId,
      actorKind: ctx.actorKind,
      actorId: ctx.actorId,
      action: "work_note",
      payload: { text: data.text },
    },
  });
  // Notifica a la contraparte (solicitante y/o asignado; emit excluye al actor).
  await emitNotifications({
    ctx,
    recipientIds: [ticket.requesterId, ticket.assigneeId],
    kind: "WORK_NOTE",
    ticketId: ticket.id,
    ticketRef: ticket.ref,
  });
  return event;
}

// Resuelve un ticket por su referencia legible (INC-0001) o por id, y
// devuelve su id. Pensado para el MCP: el agente cita referencias, no cuids.
// La autorización real la aplica luego el servicio que muta (triage/estado).
export async function resolveTicketId(query: string): Promise<string | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { OR: [{ id: query }, { ref: query.toUpperCase() }] },
    select: { id: true },
  });
  return ticket?.id ?? null;
}

// Búsqueda libre por referencia o título, para la paleta de comandos (⌘K).
// Respeta el scoping por rol: el solicitante solo ve los suyos.
export async function searchTickets(ctx: Ctx, q: string, take = 6) {
  const term = q.trim();
  if (term.length < 2) return [];
  return prisma.ticket.findMany({
    where: {
      requesterId: can(ctx, "ticket:read:all") ? undefined : ctx.actorId,
      OR: [
        { ref: { contains: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, ref: true, title: true, status: true, priority: true, kind: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take,
  });
}

// Detalle de un ticket con su CI, SLA, actores y timeline de auditoría
// (con el nombre del actor resuelto). Respeta el scoping por rol.
export async function getTicket(ctx: Ctx, id: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      ci: true,
      sla: true,
      assignmentGroup: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true, role: true } },
      events: { orderBy: { createdAt: "asc" } },
      // Problema al que pertenece la incidencia (si lo tiene).
      problem: { select: { id: true, ref: true, title: true, status: true } },
      // Incidencias agrupadas bajo este problema.
      linkedIncidents: {
        select: { id: true, ref: true, title: true, status: true, priority: true },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      },
      // Votos del CAB (para cambios), con el nombre del aprobador.
      approvals: {
        select: {
          id: true,
          decision: true,
          comment: true,
          decidedAt: true,
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) throw new NotFoundError("Ticket no encontrado");
  if (!can(ctx, "ticket:read:all") && ticket.requesterId !== ctx.actorId) {
    throw new ForbiddenError();
  }

  const userActorIds = [
    ...new Set(
      ticket.events.filter((e) => e.actorKind === "USER").map((e) => e.actorId),
    ),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: userActorIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const events = ticket.events.map((e) => ({
    ...e,
    actorName:
      e.actorKind === "AGENT" ? "Agente IA" : (nameById.get(e.actorId) ?? "Usuario"),
  }));

  return { ...ticket, events };
}

// Consulta con scoping por rol: quien no tiene 'ticket:read:all' solo ve los suyos.
export async function queryTickets(input: unknown, ctx: Ctx) {
  const data = queryTicketsSchema.parse(input);
  return prisma.ticket.findMany({
    where: {
      kind: data.kind,
      status: data.status,
      ciId: data.ciId,
      requesterId: can(ctx, "ticket:read:all") ? undefined : ctx.actorId,
    },
    include: { ci: true, sla: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: data.take,
  });
}
