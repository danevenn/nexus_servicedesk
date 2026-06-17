import type { Role, ActorKind } from "@/generated/prisma/enums";
import { ForbiddenError } from "./errors";

// El contexto de actuación: lo rellena la web (sesión better-auth) o el
// servidor MCP (rol asignado al agente). TODO servicio recibe un Ctx y
// decide el permiso aquí — nunca en la UI ni en el handler MCP.
export type Ctx = {
  actorKind: ActorKind;
  actorId: string;
  role: Role;
};

export type Permission =
  | "ticket:create" // abrir incidencia/solicitud
  | "ticket:read:all" // ver todos los tickets (si no, solo los propios)
  | "ticket:triage" // asignar + (re)priorizar
  | "ticket:update" // cambiar estado
  | "ticket:comment" // añadir notas de trabajo
  | "ticket:reassign" // reasignar a otro técnico
  | "problem:create"
  | "change:create"
  | "change:approve" // votar (aprobar/rechazar) un cambio en el CAB
  | "cmdb:read"
  | "cmdb:write"
  | "dashboard:write" // crear/editar dashboards y widgets
  | "kb:read" // leer la base de conocimiento (autoservicio: todos)
  | "kb:write" // crear/editar/archivar artículos de conocimiento
  | "catalog:read"; // navegar el catálogo de servicios (autoservicio: todos)

const AGENT_PERMISSIONS: Permission[] = [
  "ticket:create",
  "ticket:read:all",
  "ticket:triage",
  "ticket:update",
  "ticket:comment",
  "problem:create",
  "change:create",
  "cmdb:read",
  "dashboard:write",
  "kb:read",
  "kb:write",
  "catalog:read",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // La base de conocimiento y el catálogo son de autoservicio: hasta el
  // solicitante los lee.
  REQUESTER: ["ticket:create", "kb:read", "catalog:read"],
  // VIEWER (demo): lo VE todo pero no modifica nada — sin permisos de escritura.
  VIEWER: ["ticket:read:all", "cmdb:read", "kb:read", "catalog:read"],
  AGENT: AGENT_PERMISSIONS,
  // El CAB lo gobiernan los mánagers: aprobar/rechazar cambios es suyo (y de admin).
  MANAGER: [...AGENT_PERMISSIONS, "ticket:reassign", "change:approve"],
  ADMIN: [...AGENT_PERMISSIONS, "ticket:reassign", "cmdb:write", "change:approve"],
};

export function can(ctx: Ctx, permission: Permission): boolean {
  return ROLE_PERMISSIONS[ctx.role].includes(permission);
}

export function assertCan(ctx: Ctx, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new ForbiddenError(
      `El rol ${ctx.role} no puede '${permission}'`,
    );
  }
}
