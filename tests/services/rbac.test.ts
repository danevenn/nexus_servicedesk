import { describe, it, expect } from "vitest";
import { can, assertCan, type Ctx, type Permission } from "@/lib/services/context";
import { ForbiddenError } from "@/lib/services/errors";
import type { Role } from "@/generated/prisma/enums";

// Matriz RBAC: la verdad sobre qué puede hacer cada rol. Es el contrato que
// comparten la web y el servidor MCP, así que lo fijamos explícitamente aquí.
const ctx = (role: Role): Ctx => ({ role, actorKind: "USER", actorId: "u1" });

// Permiso → roles que DEBEN tenerlo. Cualquier otro rol NO debe tenerlo.
const EXPECTED: Record<Permission, Role[]> = {
  "ticket:create": ["REQUESTER", "AGENT", "MANAGER", "ADMIN"],
  "ticket:read:all": ["VIEWER", "AGENT", "MANAGER", "ADMIN"],
  "ticket:triage": ["AGENT", "MANAGER", "ADMIN"],
  "ticket:update": ["AGENT", "MANAGER", "ADMIN"],
  "ticket:comment": ["AGENT", "MANAGER", "ADMIN"],
  "ticket:reassign": ["MANAGER", "ADMIN"],
  "problem:create": ["AGENT", "MANAGER", "ADMIN"],
  "change:create": ["AGENT", "MANAGER", "ADMIN"],
  "change:approve": ["MANAGER", "ADMIN"],
  "cmdb:read": ["VIEWER", "AGENT", "MANAGER", "ADMIN"],
  "cmdb:write": ["ADMIN"],
  "dashboard:write": ["AGENT", "MANAGER", "ADMIN"],
  // La base de conocimiento es de autoservicio: la lee todo el mundo.
  "kb:read": ["REQUESTER", "VIEWER", "AGENT", "MANAGER", "ADMIN"],
  "kb:write": ["AGENT", "MANAGER", "ADMIN"],
  "catalog:read": ["REQUESTER", "VIEWER", "AGENT", "MANAGER", "ADMIN"],
};

const ALL_ROLES: Role[] = ["REQUESTER", "VIEWER", "AGENT", "MANAGER", "ADMIN"];

describe("RBAC — matriz de permisos por rol", () => {
  for (const [permission, allowed] of Object.entries(EXPECTED) as [
    Permission,
    Role[],
  ][]) {
    for (const role of ALL_ROLES) {
      const shouldAllow = allowed.includes(role);
      it(`${role} ${shouldAllow ? "puede" : "NO puede"} '${permission}'`, () => {
        expect(can(ctx(role), permission)).toBe(shouldAllow);
      });
    }
  }

  it("VIEWER (demo) es estrictamente de solo lectura", () => {
    const v = ctx("VIEWER");
    const writes: Permission[] = [
      "ticket:create",
      "ticket:triage",
      "ticket:update",
      "ticket:comment",
      "dashboard:write",
      "cmdb:write",
    ];
    for (const p of writes) expect(can(v, p)).toBe(false);
  });

  it("assertCan lanza ForbiddenError cuando el rol no tiene el permiso", () => {
    expect(() => assertCan(ctx("REQUESTER"), "cmdb:write")).toThrow(ForbiddenError);
  });

  it("assertCan no lanza cuando el rol sí tiene el permiso", () => {
    expect(() => assertCan(ctx("ADMIN"), "cmdb:write")).not.toThrow();
  });
});
