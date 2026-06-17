import { prisma } from "@/lib/prisma";
import type { Ctx } from "@/lib/services/context";
import type { Role } from "@/generated/prisma/enums";

// Identidad del agente MCP. Es una CUENTA DE SERVICIO real en la BD: así las
// FK de Ticket (requesterId/assigneeId) son válidas, pero TODA acción suya
// queda marcada en la auditoría con `actorKind: AGENT` (la UI la pinta como
// "Agente IA"). El rol se toma de env para poder degradar permisos en prod.
const AGENT_ID = "agent-nexo";
const AGENT_EMAIL = "agent@nexo.dev";
const AGENT_NAME = "Agente IA (MCP)";

const VALID_ROLES: Role[] = ["ADMIN", "MANAGER", "AGENT", "REQUESTER"];

function resolveAgentRole(): Role {
  const raw = process.env.MCP_AGENT_ROLE?.toUpperCase();
  return (VALID_ROLES as string[]).includes(raw ?? "")
    ? (raw as Role)
    : "AGENT";
}

// Garantiza que la cuenta de servicio existe y devuelve el Ctx del agente.
// Es el equivalente a `getSessionCtx()` de la web: el único puente MCP →
// capa de servicios. A partir de aquí, el agente pasa por la MISMA puerta
// (validación zod + RBAC) que la interfaz humana.
export async function getAgentCtx(): Promise<Ctx> {
  const role = resolveAgentRole();
  await prisma.user.upsert({
    where: { id: AGENT_ID },
    update: { role },
    create: {
      id: AGENT_ID,
      name: AGENT_NAME,
      email: AGENT_EMAIL,
      emailVerified: true,
      role,
    },
  });
  return { actorKind: "AGENT", actorId: AGENT_ID, role };
}
