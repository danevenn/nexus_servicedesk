import { prisma } from "@/lib/prisma";
import { assertCan, can, type Ctx } from "./context";
import { ForbiddenError, NotFoundError, ValidationError, mapPrismaError } from "./errors";
import {
  addWidgetSchema,
  updateWidgetSchema,
  saveLayoutSchema,
  type WidgetConfig,
} from "./schemas";
import {
  STATUS_LABEL,
  KIND_LABEL,
  CI_TYPE_LABEL,
  CI_STATUS_LABEL,
  ENVIRONMENT_LABEL,
} from "@/lib/labels";
import type { WidgetKind } from "@/generated/prisma/enums";

const OPEN_STATES = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] as const;

// Ver dashboards requiere ver toda la cola (AGENT+ y VIEWER demo).
function assertDashboards(ctx: Ctx) {
  assertCan(ctx, "ticket:read:all");
}

// Crear/editar dashboards y widgets requiere permiso de escritura
// (VIEWER puede ver pero no modificar).
function assertDashboardWrite(ctx: Ctx) {
  assertCan(ctx, "dashboard:write");
}

// ── CRUD de dashboards ───────────────────────────────────────────────────

export async function listDashboards(ctx: Ctx) {
  assertDashboards(ctx);
  return prisma.dashboard.findMany({
    where: { ownerId: ctx.actorId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    // Orden de cuadrícula: arriba-abajo, izquierda-derecha.
    include: { widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] } },
  });
}

// Garantiza que el usuario tiene al menos un dashboard: si no, crea uno
// "General" con una selección de widgets de arranque (panel pulido de serie).
export async function ensureDefaultDashboard(ctx: Ctx) {
  assertDashboards(ctx);
  const existing = await prisma.dashboard.count({ where: { ownerId: ctx.actorId } });
  if (existing > 0) return;

  // Layout de arranque en cuadrícula de 12 col: 4 KPIs arriba, gráficas en
  // medio y una lista ancha al pie. (x,y,w,h en unidades de cuadrícula.)
  const w = (
    kind: WidgetKind,
    title: string,
    config: WidgetConfig,
    x: number,
    y: number,
    gw: number,
    gh: number,
  ) => ({
    kind,
    title,
    config,
    x,
    y,
    w: gw,
    h: gh,
    width: Math.min(3, Math.round(gw / 4)) || 1,
    position: y * 12 + x,
  });

  await prisma.dashboard.create({
    data: {
      name: "General",
      ownerId: ctx.actorId,
      isDefault: true,
      position: 0,
      widgets: {
        create: [
          w("STAT", "Tickets abiertos", { source: "TICKETS", metric: "open" }, 0, 0, 3, 3),
          w("STAT", "SLA incumplidos", { source: "TICKETS", metric: "sla_breached" }, 3, 0, 3, 3),
          w("STAT", "CIs totales", { source: "CIS", metric: "total" }, 6, 0, 3, 3),
          w("STAT", "CIs caídos", { source: "CIS", metric: "down" }, 9, 0, 3, 3),
          w("LINE", "Tickets creados (14 días)", { source: "TICKETS" }, 0, 3, 8, 6),
          w("DONUT", "Abiertos por prioridad", { source: "TICKETS", groupBy: "priority", onlyOpen: true }, 8, 3, 4, 6),
          w("BAR", "Tickets por estado", { source: "TICKETS", groupBy: "status" }, 0, 9, 4, 6),
          w("BAR", "CIs por tipo", { source: "CIS", groupBy: "type" }, 4, 9, 4, 6),
          w("DONUT", "CIs por entorno", { source: "CIS", groupBy: "environment" }, 8, 9, 4, 6),
          w("LIST", "Tickets recientes", { source: "TICKETS" }, 0, 15, 12, 7),
        ],
      },
    },
  });
}

export async function createDashboard(ctx: Ctx, name: string) {
  assertDashboardWrite(ctx);
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) {
    throw new ValidationError("El nombre debe tener entre 1 y 60 caracteres");
  }
  const last = await prisma.dashboard.findFirst({
    where: { ownerId: ctx.actorId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.dashboard.create({
    data: { name: clean, ownerId: ctx.actorId, position: (last?.position ?? -1) + 1 },
  });
}

async function ownedDashboard(ctx: Ctx, id: string) {
  const dash = await prisma.dashboard.findUnique({ where: { id } });
  if (!dash) throw new NotFoundError("Dashboard no encontrado");
  if (dash.ownerId !== ctx.actorId) throw new ForbiddenError();
  return dash;
}

export async function renameDashboard(ctx: Ctx, id: string, name: string) {
  assertDashboardWrite(ctx);
  await ownedDashboard(ctx, id);
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) {
    throw new ValidationError("El nombre debe tener entre 1 y 60 caracteres");
  }
  return prisma.dashboard.update({ where: { id }, data: { name: clean } });
}

export async function deleteDashboard(ctx: Ctx, id: string) {
  assertDashboardWrite(ctx);
  await ownedDashboard(ctx, id);
  await prisma.dashboard.delete({ where: { id } });
}

// ── Widgets ──────────────────────────────────────────────────────────────

// Tamaño por defecto (en cuadrícula 12-col) según el tipo de widget.
function defaultSize(kind: WidgetKind): { w: number; h: number } {
  if (kind === "STAT") return { w: 3, h: 3 };
  if (kind === "LIST") return { w: 6, h: 7 };
  return { w: 4, h: 6 }; // BAR / DONUT / LINE
}

export async function addWidget(input: unknown, ctx: Ctx) {
  assertDashboardWrite(ctx);
  const data = addWidgetSchema.parse(input);
  await ownedDashboard(ctx, data.dashboardId);
  const def = defaultSize(data.kind);
  const w = data.w ?? def.w;
  const h = data.h ?? def.h;

  // Si la paleta no indica posición, lo colocamos en una fila nueva al pie.
  let { x, y } = data;
  if (x == null || y == null) {
    const agg = await prisma.widget.aggregate({
      where: { dashboardId: data.dashboardId },
      _max: { y: true },
    });
    const lastRow = await prisma.widget.findFirst({
      where: { dashboardId: data.dashboardId, y: agg._max.y ?? 0 },
      orderBy: { h: "desc" },
      select: { h: true },
    });
    x = 0;
    y = agg._max.y != null ? agg._max.y + (lastRow?.h ?? 0) : 0;
  }

  const last = await prisma.widget.findFirst({
    where: { dashboardId: data.dashboardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  try {
    return await prisma.widget.create({
      data: {
        dashboardId: data.dashboardId,
        kind: data.kind,
        title: data.title,
        width: data.width ?? (Math.min(3, Math.round(w / 4)) || 1), // legado
        x: Math.min(x, 12 - w),
        y,
        w,
        h,
        position: (last?.position ?? -1) + 1,
        config: data.config,
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

async function ownedWidget(ctx: Ctx, widgetId: string) {
  const widget = await prisma.widget.findUnique({
    where: { id: widgetId },
    include: { dashboard: { select: { ownerId: true } } },
  });
  if (!widget) throw new NotFoundError("Widget no encontrado");
  if (widget.dashboard.ownerId !== ctx.actorId) throw new ForbiddenError();
  return widget;
}

export async function updateWidget(input: unknown, ctx: Ctx) {
  assertDashboardWrite(ctx);
  const data = updateWidgetSchema.parse(input);
  await ownedWidget(ctx, data.widgetId);
  return prisma.widget.update({
    where: { id: data.widgetId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.width !== undefined ? { width: data.width } : {}),
      ...(data.config !== undefined ? { config: data.config } : {}),
    },
  });
}

export async function removeWidget(ctx: Ctx, widgetId: string) {
  assertDashboardWrite(ctx);
  await ownedWidget(ctx, widgetId);
  await prisma.widget.delete({ where: { id: widgetId } });
}

// Guarda el layout de cuadrícula completo (x,y,w,h por widget). Se invoca al
// soltar tras arrastrar o redimensionar (autoguardado).
export async function saveLayout(input: unknown, ctx: Ctx) {
  assertDashboardWrite(ctx);
  const data = saveLayoutSchema.parse(input);
  await ownedDashboard(ctx, data.dashboardId);
  const widgets = await prisma.widget.findMany({
    where: { dashboardId: data.dashboardId },
    select: { id: true },
  });
  const valid = new Set(widgets.map((w) => w.id));
  await prisma.$transaction(
    data.items
      .filter((it) => valid.has(it.id))
      .map((it) =>
        prisma.widget.update({
          where: { id: it.id },
          data: {
            x: it.x,
            y: it.y,
            w: it.w,
            h: it.h,
            position: it.y * 12 + it.x, // mantiene el legado coherente
          },
        }),
      ),
  );
}

// ── Motor de consulta de widgets ─────────────────────────────────────────
// Resuelve los datos de un widget respetando el RBAC y el scoping por rol.
// Mismas reglas que el resto de la capa: un no-AGENT no llegaría aquí, pero
// los widgets de CMDB vuelven a exigir `cmdb:read` por defensa en profundidad.

export type WidgetData =
  | { type: "stat"; value: number }
  | { type: "series"; series: { key: string; label: string; value: number }[] }
  | { type: "tickets"; rows: TicketRow[] }
  | { type: "cis"; rows: CiRow[] }
  | { type: "error"; message: string };

type TicketRow = {
  id: string;
  ref: string;
  title: string;
  kind: keyof typeof KIND_LABEL;
  status: keyof typeof STATUS_LABEL;
  priority: string;
  ciName: string | null;
};
type CiRow = {
  id: string;
  name: string;
  type: keyof typeof CI_TYPE_LABEL;
  status: keyof typeof CI_STATUS_LABEL;
  criticality: number;
  openTickets: number;
};

const TICKET_DIM_LABEL: Record<string, (v: string) => string> = {
  status: (v) => STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v,
  priority: (v) => v,
  kind: (v) => KIND_LABEL[v as keyof typeof KIND_LABEL] ?? v,
  assignee: (v) => v,
};
const CI_DIM_LABEL: Record<string, (v: string) => string> = {
  type: (v) => CI_TYPE_LABEL[v as keyof typeof CI_TYPE_LABEL] ?? v,
  status: (v) => CI_STATUS_LABEL[v as keyof typeof CI_STATUS_LABEL] ?? v,
  environment: (v) => ENVIRONMENT_LABEL[v as keyof typeof ENVIRONMENT_LABEL] ?? v,
  vendor: (v) => v,
  datacenter: (v) => v,
  criticality: (v) => `Criticidad ${v}`,
};

function tally(values: string[], labeler: (v: string) => string) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: labeler(key), value }))
    .sort((a, b) => b.value - a.value);
}

export async function computeWidget(
  ctx: Ctx,
  kind: WidgetKind,
  config: WidgetConfig,
): Promise<WidgetData> {
  try {
    if (config.source === "TICKETS") return await computeTicketWidget(ctx, kind, config);
    if (config.source === "CIS") return await computeCiWidget(ctx, kind, config);
    return { type: "error", message: "Fuente de datos desconocida" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al calcular el widget";
    return { type: "error", message };
  }
}

async function computeTicketWidget(
  ctx: Ctx,
  kind: WidgetKind,
  config: WidgetConfig,
): Promise<WidgetData> {
  const scope = can(ctx, "ticket:read:all") ? undefined : ctx.actorId;
  const f = config.filters ?? {};
  // Filtros explícitos del widget (prioridad/tipo/estado).
  const fWhere: Record<string, unknown> = {};
  if (f.priority) fWhere.priority = f.priority;
  if (f.kind) fWhere.kind = f.kind;
  if (f.status) fWhere.status = f.status;

  if (kind === "STAT") {
    const where = { requesterId: scope, ...fWhere } as Record<string, unknown>;
    switch (config.metric) {
      case "open":
        if (!f.status) where.status = { in: [...OPEN_STATES] };
        break;
      case "resolved":
        if (!f.status) where.status = { in: ["RESOLVED", "CLOSED"] };
        break;
      case "sla_breached":
        if (!f.status) where.status = { in: [...OPEN_STATES] };
        where.sla = { resolveBy: { lt: new Date() } };
        break;
    }
    return { type: "stat", value: await prisma.ticket.count({ where }) };
  }

  // Base común (line/list/agrupación): filtros + onlyOpen.
  const baseWhere: Record<string, unknown> = { requesterId: scope, ...fWhere };
  if (config.onlyOpen && !f.status) baseWhere.status = { in: [...OPEN_STATES] };

  if (kind === "LINE") {
    const since = new Date(Date.now() - 13 * 86400000);
    since.setHours(0, 0, 0, 0);
    const tickets = await prisma.ticket.findMany({
      where: { ...baseWhere, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(since.getTime() + i * 86400000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of tickets) {
      const key = t.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const series = [...buckets.entries()].map(([key, value]) => ({
      key,
      label: key.slice(5), // MM-DD
      value,
    }));
    return { type: "series", series };
  }

  if (kind === "LIST") {
    const tickets = await prisma.ticket.findMany({
      where: baseWhere,
      include: { ci: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return {
      type: "tickets",
      rows: tickets.map((t) => ({
        id: t.id,
        ref: t.ref,
        title: t.title,
        kind: t.kind,
        status: t.status,
        priority: t.priority,
        ciName: t.ci?.name ?? null,
      })),
    };
  }

  // BAR / DONUT → agrupar por dimensión
  const dim = config.groupBy ?? "status";
  const tickets = await prisma.ticket.findMany({
    where: baseWhere,
    include: { assignee: { select: { name: true } } },
  });
  const values = tickets.map((t) => {
    if (dim === "assignee") return t.assignee?.name ?? "Sin asignar";
    return String((t as Record<string, unknown>)[dim] ?? "—");
  });
  return {
    type: "series",
    series: tally(values, TICKET_DIM_LABEL[dim] ?? ((v) => v)),
  };
}

async function computeCiWidget(
  ctx: Ctx,
  kind: WidgetKind,
  config: WidgetConfig,
): Promise<WidgetData> {
  assertCan(ctx, "cmdb:read"); // defensa en profundidad
  const f = config.filters ?? {};
  const fWhere: Record<string, unknown> = {};
  if (f.type) fWhere.type = f.type;
  if (f.ciStatus) fWhere.status = f.ciStatus;
  if (f.environment) fWhere.environment = f.environment;

  if (kind === "STAT") {
    const where: Record<string, unknown> = { ...fWhere };
    switch (config.metric) {
      case "operational":
        if (!f.ciStatus) where.status = "OPERATIONAL";
        break;
      case "degraded":
        if (!f.ciStatus) where.status = "DEGRADED";
        break;
      case "down":
        if (!f.ciStatus) where.status = "DOWN";
        break;
    }
    return { type: "stat", value: await prisma.configurationItem.count({ where }) };
  }

  if (kind === "LIST") {
    const cis = await prisma.configurationItem.findMany({
      where: fWhere,
      include: { _count: { select: { tickets: true } } },
      orderBy: [{ criticality: "desc" }, { name: "asc" }],
      take: 8,
    });
    return {
      type: "cis",
      rows: cis.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        criticality: c.criticality,
        openTickets: c._count.tickets,
      })),
    };
  }

  // BAR / DONUT / (LINE no aplica a CIs) → agrupar por dimensión
  const dim = config.groupBy ?? "type";
  const cis = await prisma.configurationItem.findMany({ where: fWhere });
  const values = cis.map((c) =>
    String((c as Record<string, unknown>)[dim] ?? "—"),
  );
  return {
    type: "series",
    series: tally(values, CI_DIM_LABEL[dim] ?? ((v) => v)),
  };
}
