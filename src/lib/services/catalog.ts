import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";
import { NotFoundError, ValidationError } from "./errors";
import {
  catalogFieldsSchema,
  submitCatalogRequestSchema,
  type CatalogField,
} from "./schemas";
import { createTicket } from "./tickets";

// ─────────────────────────────────────────────
//  Catálogo de servicios (portal de autoservicio). Lectura para todos
//  (catalog:read); solicitar un servicio crea un REQUEST vía createTicket
//  (que exige ticket:create), heredando del ítem categoría, grupo y prioridad.
// ─────────────────────────────────────────────

// Ítems activos para la rejilla del portal, ordenados por categoría y posición.
export async function listCatalog(ctx: Ctx) {
  assertCan(ctx, "catalog:read");
  return prisma.serviceCatalogItem.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      name: true,
      shortDescription: true,
      category: true,
      icon: true,
    },
    orderBy: [{ category: "asc" }, { position: "asc" }, { name: "asc" }],
  });
}

// Ficha de un ítem (con sus campos del formulario ya validados).
export async function getCatalogItemBySlug(ctx: Ctx, slug: string) {
  assertCan(ctx, "catalog:read");
  const item = await prisma.serviceCatalogItem.findUnique({ where: { slug } });
  if (!item || !item.active) throw new NotFoundError("Servicio no encontrado");
  const fields = catalogFieldsSchema.parse(item.fields);
  return { ...item, fields };
}

// Valida las respuestas del solicitante contra la definición de campos del ítem.
function validateAnswers(fields: CatalogField[], answers: Record<string, string>) {
  for (const f of fields) {
    const value = answers[f.key]?.trim() ?? "";
    if (f.required && !value) {
      throw new ValidationError(`Falta el campo obligatorio «${f.label}»`);
    }
    if (f.type === "select" && value && !(f.options ?? []).includes(value)) {
      throw new ValidationError(`Valor no válido para «${f.label}»`);
    }
  }
}

// Compone la descripción legible del ticket a partir de las respuestas.
function buildDescription(
  itemDescription: string,
  fields: CatalogField[],
  answers: Record<string, string>,
): string {
  const lines = fields
    .map((f) => `${f.label}: ${answers[f.key]?.trim() || "—"}`)
    .join("\n");
  return lines ? `${itemDescription}\n\n${lines}` : itemDescription;
}

// Envía una petición de catálogo: crea un Ticket REQUEST heredando los
// atributos del ítem. El RBAC de creación lo aplica createTicket (ticket:create).
export async function submitCatalogRequest(input: unknown, ctx: Ctx) {
  const data = submitCatalogRequestSchema.parse(input);
  const item = await getCatalogItemBySlug(ctx, data.slug);
  validateAnswers(item.fields, data.answers);

  return createTicket(
    {
      kind: "REQUEST",
      title: item.name.slice(0, 160),
      description: buildDescription(item.description, item.fields, data.answers),
      impact: item.impactDefault,
      urgency: item.urgencyDefault,
      category: item.category,
      channel: "PORTAL",
      assignmentGroupId: item.assignmentGroupId ?? undefined,
      catalogItemSlug: item.slug,
      formAnswers: data.answers,
    },
    ctx,
  );
}
