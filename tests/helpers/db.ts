import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/services/context";
import type { CiType, Role } from "@/generated/prisma/enums";

// Helpers de BD para los tests de la capa de servicios. Operan sobre la BD de
// test aislada (nexo_test) que migra el globalSetup de Vitest.

// Vacía todas las tablas (salvo el historial de migraciones) entre tests.
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// Contexto de actuación de prueba para un rol dado.
export const ctxFor = (role: Role, actorId = "tester"): Ctx => ({
  role,
  actorKind: "USER",
  actorId,
});

let ciSeq = 0;
// Crea un CI con valores mínimos válidos; `overrides` ajusta lo que importe.
export function mkCi(overrides: Partial<{
  name: string;
  type: CiType;
  criticality: number;
  status: string;
}> = {}) {
  ciSeq += 1;
  return prisma.configurationItem.create({
    data: {
      name: overrides.name ?? `ci-${ciSeq}`,
      type: (overrides.type ?? "SERVER") as CiType,
      criticality: overrides.criticality ?? 3,
      ...(overrides.status ? { status: overrides.status as never } : {}),
    },
  });
}

// `source` depende de `target` (una arista del grafo de dependencias).
export function dependsOn(sourceId: string, targetId: string) {
  return prisma.ciDependency.create({ data: { sourceId, targetId } });
}

let userSeq = 0;
// Crea un usuario (User no tiene default de id: lo da better-auth en runtime).
export function mkUser(overrides: Partial<{ name: string; email: string; role: Role }> = {}) {
  userSeq += 1;
  const id = `user-${userSeq}`;
  return prisma.user.create({
    data: {
      id,
      name: overrides.name ?? `Usuario ${userSeq}`,
      email: overrides.email ?? `${id}@test.local`,
      role: (overrides.role ?? "AGENT") as never,
    },
  });
}

let ticketSeq = 0;
// Crea un ticket mínimo válido (campos no nulos: ref/kind/title/description/priority/requester).
export async function mkTicket(overrides: Partial<{
  ref: string;
  title: string;
  priority: string;
  status: string;
  kind: string;
  requesterId: string;
}> = {}) {
  ticketSeq += 1;
  const requesterId = overrides.requesterId ?? (await mkUser({ role: "REQUESTER" })).id;
  return prisma.ticket.create({
    data: {
      ref: overrides.ref ?? `INC-${String(ticketSeq).padStart(4, "0")}`,
      kind: (overrides.kind ?? "INCIDENT") as never,
      title: overrides.title ?? `Ticket ${ticketSeq}`,
      description: "desc",
      priority: (overrides.priority ?? "P3") as never,
      ...(overrides.status ? { status: overrides.status as never } : {}),
      requesterId,
    },
  });
}
