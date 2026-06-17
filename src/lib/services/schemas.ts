import { z } from "zod";

// Esquemas zod compartidos: validan IGUAL las Server Actions y las tools del MCP.
const impactUrgency = z.coerce.number().int().min(1).max(3);

const changeType = z.enum(["STANDARD", "NORMAL", "EMERGENCY"]);
const riskLevel = z.enum(["LOW", "MEDIUM", "HIGH"]);
const channel = z.enum(["PORTAL", "EMAIL", "PHONE", "CHAT", "MONITORING"]);

export const createTicketSchema = z.object({
  kind: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]),
  title: z.string().min(3).max(160),
  description: z.string().min(1).max(5000),
  impact: impactUrgency,
  urgency: impactUrgency,
  ciId: z.string().min(1).optional(),
  // Atributos de cambio (solo se persisten cuando kind === "CHANGE").
  changeType: changeType.optional(),
  risk: riskLevel.optional(),
  plannedStart: z.coerce.date().optional(),
  plannedEnd: z.coerce.date().optional(),
  // Clasificación/enrutado (los rellena el catálogo; opcionales y
  // retrocompatibles con el diálogo normal y el MCP).
  category: z.string().min(1).max(80).optional(),
  subcategory: z.string().min(1).max(80).optional(),
  channel: channel.optional(),
  assignmentGroupId: z.string().min(1).optional(),
  // Trazabilidad de catálogo (van al payload del evento "created").
  catalogItemSlug: z.string().min(1).optional(),
  formAnswers: z.record(z.string(), z.string()).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// ── Catálogo de servicios ──
// Definición de un campo del formulario guiado de un ítem (validada al leer).
export const catalogFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "textarea", "select", "number", "date"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(), // para type "select"
  placeholder: z.string().max(160).optional(),
  help: z.string().max(300).optional(),
});
export const catalogFieldsSchema = z.array(catalogFieldSchema);
export type CatalogField = z.infer<typeof catalogFieldSchema>;

export const submitCatalogRequestSchema = z.object({
  slug: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});
export type SubmitCatalogRequestInput = z.infer<typeof submitCatalogRequestSchema>;

// ── Gestión de problemas (PROBLEM) ──
export const linkIncidentsSchema = z.object({
  problemId: z.string().min(1),
  incidentIds: z.array(z.string().min(1)).min(1).max(50),
});
export type LinkIncidentsInput = z.infer<typeof linkIncidentsSchema>;

export const unlinkIncidentSchema = z.object({
  incidentId: z.string().min(1),
});
export type UnlinkIncidentInput = z.infer<typeof unlinkIncidentSchema>;

export const setKnownErrorSchema = z.object({
  problemId: z.string().min(1),
  rootCause: z.string().max(4000).optional(),
  workaround: z.string().max(4000).optional(),
});
export type SetKnownErrorInput = z.infer<typeof setKnownErrorSchema>;

// ── Gestión de cambios (CHANGE) — CAB ──
export const requestApprovalsSchema = z.object({
  ticketId: z.string().min(1),
  approverIds: z.array(z.string().min(1)).min(1).max(10),
});
export type RequestApprovalsInput = z.infer<typeof requestApprovalsSchema>;

export const decideApprovalSchema = z.object({
  ticketId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(2000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const triageTicketSchema = z.object({
  ticketId: z.string().min(1),
  assigneeId: z.string().min(1).optional(),
  impact: impactUrgency.optional(),
  urgency: impactUrgency.optional(),
});
export type TriageTicketInput = z.infer<typeof triageTicketSchema>;

export const updateStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum([
    "NEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "ON_HOLD",
    "RESOLVED",
    "CLOSED",
  ]),
  // Documentación de cierre (al resolver/cerrar).
  resolutionCode: z.string().min(1).max(60).optional(),
  resolutionNotes: z.string().min(1).max(4000).optional(),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const addNoteSchema = z.object({
  ticketId: z.string().min(1),
  text: z.string().min(1).max(4000),
});
export type AddNoteInput = z.infer<typeof addNoteSchema>;

// ── Dashboards personalizados ──
const ticketStatus = z.enum(["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"]);
const ticketKind = z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]);
const priority = z.enum(["P1", "P2", "P3", "P4"]);
const ciType = z.enum(["SERVICE", "APPLICATION", "SERVER", "DATABASE", "NETWORK", "HYPERVISOR", "STORAGE"]);
const ciStatus = z.enum(["OPERATIONAL", "DEGRADED", "DOWN", "RETIRED"]);
const environment = z.enum(["PROD", "STAGING", "DEV", "DR"]);

// Filtros opcionales por widget (acota la consulta antes de medir/agrupar).
export const widgetFiltersSchema = z.object({
  // tickets
  priority: priority.optional(),
  kind: ticketKind.optional(),
  status: ticketStatus.optional(),
  // CIs
  type: ciType.optional(),
  ciStatus: ciStatus.optional(),
  environment: environment.optional(),
});
export type WidgetFilters = z.infer<typeof widgetFiltersSchema>;

export const widgetConfigSchema = z.object({
  source: z.enum(["TICKETS", "CIS"]),
  metric: z.string().optional(), // para STAT
  groupBy: z.string().optional(), // para BAR/DONUT/LIST
  onlyOpen: z.boolean().optional(), // filtro de tickets abiertos
  filters: widgetFiltersSchema.optional(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const widgetKindSchema = z.enum(["STAT", "BAR", "DONUT", "LINE", "LIST"]);

// Posición/tamaño en la cuadrícula de 12 columnas.
const gridX = z.coerce.number().int().min(0).max(11);
const gridY = z.coerce.number().int().min(0).max(1000);
const gridW = z.coerce.number().int().min(2).max(12);
const gridH = z.coerce.number().int().min(2).max(40);

export const addWidgetSchema = z.object({
  dashboardId: z.string().min(1),
  kind: widgetKindSchema,
  title: z.string().min(1).max(80),
  width: z.coerce.number().int().min(1).max(3).optional(), // legado
  x: gridX.optional(),
  y: gridY.optional(),
  w: gridW.optional(),
  h: gridH.optional(),
  config: widgetConfigSchema,
});
export type AddWidgetInput = z.infer<typeof addWidgetSchema>;

export const updateWidgetSchema = z.object({
  widgetId: z.string().min(1),
  title: z.string().min(1).max(80).optional(),
  width: z.coerce.number().int().min(1).max(3).optional(),
  config: widgetConfigSchema.optional(),
});
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;

// Guardado del layout completo: lista de posiciones por widget.
export const saveLayoutSchema = z.object({
  dashboardId: z.string().min(1),
  items: z
    .array(
      z.object({ id: z.string().min(1), x: gridX, y: gridY, w: gridW, h: gridH }),
    )
    .max(200),
});
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;

export const queryTicketsSchema = z.object({
  kind: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]).optional(),
  status: z
    .enum(["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"])
    .optional(),
  ciId: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});
export type QueryTicketsInput = z.infer<typeof queryTicketsSchema>;
