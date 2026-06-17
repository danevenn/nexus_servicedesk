import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/services/errors";
import type { Ctx } from "@/lib/services/context";
import type { Role } from "@/generated/prisma/enums";

// Construye el Ctx de servicio a partir de la sesión better-auth.
// Es el puente web → capa de servicios (el MCP construirá su propio Ctx).
export async function getSessionCtx(): Promise<Ctx> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthorizedError();
  return {
    actorKind: "USER",
    actorId: session.user.id,
    role: ((session.user as { role?: Role }).role ?? "REQUESTER") as Role,
  };
}
