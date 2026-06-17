import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listCatalog,
  getCatalogItemBySlug,
  submitCatalogRequest,
} from "@/lib/services/catalog";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/services/errors";
import { resetDb, ctxFor, mkUser } from "../helpers/db";

beforeEach(resetDb);

// Crea un ítem de catálogo mínimo. `fields` y `group` ajustables.
async function mkItem(overrides: Partial<{
  slug: string;
  category: string;
  active: boolean;
  assignmentGroupId: string | null;
  fields: unknown;
}> = {}) {
  return prisma.serviceCatalogItem.create({
    data: {
      slug: overrides.slug ?? "alta-usuario",
      name: "Alta de usuario",
      shortDescription: "corto",
      description: "Detalle del servicio",
      category: overrides.category ?? "Accesos",
      active: overrides.active ?? true,
      assignmentGroupId: overrides.assignmentGroupId ?? null,
      impactDefault: 2,
      urgencyDefault: 3,
      fields:
        overrides.fields ??
        [
          { key: "nombre", label: "Nombre", type: "text", required: true },
          { key: "dpto", label: "Departamento", type: "select", required: true, options: ["Ops", "Dev"] },
        ],
    },
  });
}

describe("catálogo de servicios", () => {
  it("lista solo ítems activos y exige catalog:read", async () => {
    await mkItem({ slug: "activo" });
    await mkItem({ slug: "inactivo", active: false });

    const items = await listCatalog(ctxFor("REQUESTER"));
    expect(items.map((i) => i.slug)).toEqual(["activo"]);
  });

  it("getCatalogItemBySlug devuelve los campos parseados; NotFound si inactivo", async () => {
    await mkItem({ slug: "x" });
    const item = await getCatalogItemBySlug(ctxFor("VIEWER"), "x");
    expect(item.fields).toHaveLength(2);
    expect(item.fields[1].options).toEqual(["Ops", "Dev"]);

    await mkItem({ slug: "oculto", active: false });
    await expect(
      getCatalogItemBySlug(ctxFor("VIEWER"), "oculto"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("crea un REQUEST heredando categoría, grupo y prioridad del ítem", async () => {
    const group = await prisma.assignmentGroup.create({ data: { name: "Service Desk N1" } });
    await mkItem({ slug: "alta", category: "Accesos", assignmentGroupId: group.id });
    const req = await mkUser({ role: "REQUESTER" });

    const ticket = await submitCatalogRequest(
      { slug: "alta", answers: { nombre: "Ada Lovelace", dpto: "Dev" } },
      ctxFor("REQUESTER", req.id),
    );

    expect(ticket.kind).toBe("REQUEST");
    expect(ticket.category).toBe("Accesos");
    expect(ticket.assignmentGroupId).toBe(group.id);
    expect(ticket.channel).toBe("PORTAL");
    // impact 2 × urgency 3 → P2
    expect(ticket.priority).toBe("P2");
    // Las respuestas quedan volcadas en la descripción legible.
    expect(ticket.description).toContain("Ada Lovelace");
    expect(ticket.description).toContain("Departamento: Dev");

    // Y en el payload del evento de creación (trazabilidad estructurada).
    const created = await prisma.ticketEvent.findFirst({
      where: { ticketId: ticket.id, action: "created" },
    });
    const payload = created?.payload as { catalogItemSlug?: string; answers?: Record<string, string> };
    expect(payload.catalogItemSlug).toBe("alta");
    expect(payload.answers?.nombre).toBe("Ada Lovelace");
  });

  it("rechaza si falta un campo obligatorio", async () => {
    await mkItem({ slug: "alta" });
    await expect(
      submitCatalogRequest(
        { slug: "alta", answers: { nombre: "" } },
        ctxFor("REQUESTER", "req-1"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza un valor fuera de las opciones de un select", async () => {
    await mkItem({ slug: "alta" });
    await expect(
      submitCatalogRequest(
        { slug: "alta", answers: { nombre: "Ada", dpto: "Marketing" } },
        ctxFor("REQUESTER", "req-1"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("deniega el envío a un rol sin ticket:create (VIEWER)", async () => {
    await mkItem({ slug: "alta" });
    await expect(
      submitCatalogRequest(
        { slug: "alta", answers: { nombre: "Ada", dpto: "Dev" } },
        ctxFor("VIEWER", "viewer-1"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
