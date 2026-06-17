import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";
import { mapPrismaError, NotFoundError, ValidationError } from "./errors";
import {
  linkIncidentsSchema,
  unlinkIncidentSchema,
  setKnownErrorSchema,
} from "./schemas";

// ─────────────────────────────────────────────
//  Gestión de problemas (PROBLEM): agrupan las incidencias que comparten
//  causa raíz y documentan el known error (causa + solución temporal).
// ─────────────────────────────────────────────

// Vincula una o varias incidencias a un problema (causa raíz común). AGENT+.
export async function linkIncidents(input: unknown, ctx: Ctx) {
  const data = linkIncidentsSchema.parse(input);
  assertCan(ctx, "ticket:update");

  const problem = await prisma.ticket.findUnique({
    where: { id: data.problemId },
    select: { id: true, kind: true },
  });
  if (!problem) throw new NotFoundError("Problema no encontrado");
  if (problem.kind !== "PROBLEM") {
    throw new ValidationError("El ticket destino no es un problema");
  }

  const incidents = await prisma.ticket.findMany({
    where: { id: { in: data.incidentIds } },
    select: { id: true, kind: true },
  });
  if (incidents.length !== data.incidentIds.length) {
    throw new NotFoundError("Alguna incidencia no existe");
  }
  if (incidents.some((i) => i.kind !== "INCIDENT")) {
    throw new ValidationError(
      "Solo se pueden vincular incidencias (INCIDENT) a un problema",
    );
  }

  try {
    await prisma.$transaction([
      prisma.ticket.updateMany({
        where: { id: { in: data.incidentIds } },
        data: { problemId: data.problemId },
      }),
      prisma.ticketEvent.createMany({
        data: data.incidentIds.map((id) => ({
          ticketId: id,
          actorKind: ctx.actorKind,
          actorId: ctx.actorId,
          action: "linked_to_problem",
          payload: { problemId: data.problemId },
        })),
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: data.problemId,
          actorKind: ctx.actorKind,
          actorId: ctx.actorId,
          action: "incidents_linked",
          payload: { incidentIds: data.incidentIds, count: data.incidentIds.length },
        },
      }),
    ]);
    return { linked: data.incidentIds.length };
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Desvincula una incidencia de su problema. AGENT+.
export async function unlinkIncident(input: unknown, ctx: Ctx) {
  const data = unlinkIncidentSchema.parse(input);
  assertCan(ctx, "ticket:update");

  const incident = await prisma.ticket.findUnique({
    where: { id: data.incidentId },
    select: { id: true, problemId: true },
  });
  if (!incident) throw new NotFoundError("Incidencia no encontrada");
  if (!incident.problemId) {
    throw new ValidationError("La incidencia no está vinculada a ningún problema");
  }

  try {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: data.incidentId },
        data: { problemId: null },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: data.incidentId,
          actorKind: ctx.actorKind,
          actorId: ctx.actorId,
          action: "unlinked_from_problem",
          payload: { problemId: incident.problemId },
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Documenta la causa raíz y/o la solución temporal (known error). AGENT+.
export async function setKnownError(input: unknown, ctx: Ctx) {
  const data = setKnownErrorSchema.parse(input);
  assertCan(ctx, "ticket:update");

  const problem = await prisma.ticket.findUnique({
    where: { id: data.problemId },
    select: { id: true, kind: true },
  });
  if (!problem) throw new NotFoundError("Problema no encontrado");
  if (problem.kind !== "PROBLEM") {
    throw new ValidationError("El ticket no es un problema");
  }

  try {
    return await prisma.ticket.update({
      where: { id: data.problemId },
      data: {
        rootCause: data.rootCause ?? null,
        workaround: data.workaround ?? null,
        events: {
          create: {
            actorKind: ctx.actorKind,
            actorId: ctx.actorId,
            action: "known_error_updated",
            payload: {
              hasRootCause: Boolean(data.rootCause),
              hasWorkaround: Boolean(data.workaround),
            },
          },
        },
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Incidencias candidatas a vincular a un problema: INCIDENT aún sin problema.
// Filtra por texto (ref/título) si se aporta. Para el diálogo de vinculación.
export async function listLinkableIncidents(ctx: Ctx, q?: string) {
  assertCan(ctx, "ticket:read:all");
  const term = q?.trim();
  return prisma.ticket.findMany({
    where: {
      kind: "INCIDENT",
      problemId: null,
      ...(term && term.length >= 2
        ? {
            OR: [
              { ref: { contains: term, mode: "insensitive" } },
              { title: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, ref: true, title: true, status: true, priority: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 20,
  });
}
