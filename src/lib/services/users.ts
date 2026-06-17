import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";

// Técnicos asignables (para el desplegable de triaje). Solo AGENT+.
export async function listAssignableUsers(ctx: Ctx) {
  assertCan(ctx, "ticket:triage");
  return prisma.user.findMany({
    where: { role: { in: ["AGENT", "MANAGER", "ADMIN"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

// Resuelve un técnico asignable por email o por coincidencia de nombre.
// Pensado para el MCP: el agente cita "Águeda" o un email, no un cuid.
export async function resolveAssignable(ctx: Ctx, query: string) {
  assertCan(ctx, "ticket:triage");
  return prisma.user.findFirst({
    where: {
      role: { in: ["AGENT", "MANAGER", "ADMIN"] },
      OR: [
        { id: query },
        { email: { equals: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
