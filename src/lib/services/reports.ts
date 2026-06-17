import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";
import {
  REPORT_DAYS,
  SLA_TARGET_PCT,
  type ReportDays,
} from "@/lib/reports-constants";
import type { Priority, TicketKind } from "@/generated/prisma/enums";

export { REPORT_DAYS, SLA_TARGET_PCT, type ReportDays };

// ─────────────────────────────────────────────
//  Analítica de SLA. Deriva el cumplimiento de respuesta y resolución a partir
//  del modelo Sla (respondBy/resolveBy/respondedAt) y el resolvedAt del ticket.
//  Lectura para AGENT+ y los roles de solo lectura (VIEWER): ticket:read:all.
// ─────────────────────────────────────────────

const OPEN_STATES = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] as const;
const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

// Ventana, en horas, para considerar un ticket abierto "en riesgo" de incumplir.
const AT_RISK_HOURS = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Porcentaje con 1 decimal. Sin datos = 100% (no hay incumplimientos).
function pct(met: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((met / total) * 1000) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Lunes (UTC) de la semana de `d`. Sirve para agrupar la tendencia semanal.
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const offset = (x.getUTCDay() + 6) % 7; // días desde el lunes
  x.setUTCDate(x.getUTCDate() - offset);
  return x;
}

const weekFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

export type SlaReport = Awaited<ReturnType<typeof getSlaReport>>;

export async function getSlaReport(ctx: Ctx, days: ReportDays = 90) {
  assertCan(ctx, "ticket:read:all");
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const [resolvedRaw, openRaw] = await Promise.all([
    // Cohorte del periodo: tickets RESUELTOS dentro de la ventana, con SLA.
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: since }, sla: { isNot: null } },
      select: {
        id: true,
        ref: true,
        kind: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        assignmentGroup: { select: { name: true } },
        sla: { select: { respondBy: true, resolveBy: true, respondedAt: true } },
      },
    }),
    // Tickets ABIERTOS con SLA: alimentan los incumplidos vivos y los "en riesgo".
    prisma.ticket.findMany({
      where: { status: { in: [...OPEN_STATES] }, sla: { isNot: null } },
      select: {
        id: true,
        ref: true,
        kind: true,
        priority: true,
        assignmentGroup: { select: { name: true } },
        sla: { select: { resolveBy: true } },
      },
    }),
  ]);

  // Normaliza a una forma con sla/resolvedAt garantizados (el where ya lo asegura).
  const resolved = resolvedRaw.flatMap((t) =>
    t.sla && t.resolvedAt
      ? [{
          id: t.id,
          ref: t.ref,
          kind: t.kind,
          priority: t.priority,
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt,
          group: t.assignmentGroup?.name ?? "Sin grupo",
          respondBy: t.sla.respondBy,
          resolveBy: t.sla.resolveBy,
          respondedAt: t.sla.respondedAt,
          metResolution: t.resolvedAt <= t.sla.resolveBy,
        }]
      : [],
  );
  const open = openRaw.flatMap((t) =>
    t.sla
      ? [{
          id: t.id,
          ref: t.ref,
          kind: t.kind,
          priority: t.priority,
          resolveBy: t.sla.resolveBy,
        }]
      : [],
  );

  // ── KPIs ──
  const resMet = resolved.filter((t) => t.metResolution).length;
  const resolutionCompliance = pct(resMet, resolved.length);

  const responded = resolved.filter((t) => t.respondedAt != null);
  const respMet = responded.filter(
    (t) => t.respondedAt != null && t.respondedAt <= t.respondBy,
  ).length;
  const responseCompliance = pct(respMet, responded.length);

  const resolvedLate = resolved.filter((t) => !t.metResolution);
  const openOverdue = open.filter((t) => t.resolveBy < now);
  const breachedCount = resolvedLate.length + openOverdue.length;

  const riskLimit = new Date(now.getTime() + AT_RISK_HOURS * HOUR_MS);
  const atRiskCount = open.filter(
    (t) => t.resolveBy >= now && t.resolveBy <= riskLimit,
  ).length;

  const avgResolutionHours =
    resolved.length === 0
      ? 0
      : round1(
          resolved.reduce(
            (s, t) => s + (t.resolvedAt.getTime() - t.createdAt.getTime()),
            0,
          ) /
            resolved.length /
            HOUR_MS,
        );

  // ── Tendencia semanal de cumplimiento de resolución ──
  const buckets = new Map<string, { met: number; total: number }>();
  for (const t of resolved) {
    const key = weekStart(t.resolvedAt).toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { met: 0, total: 0 };
    b.total += 1;
    if (t.metResolution) b.met += 1;
    buckets.set(key, b);
  }
  const trend: { week: string; label: string; pct: number | null; total: number }[] = [];
  for (
    let w = weekStart(since);
    w <= now;
    w = new Date(w.getTime() + 7 * DAY_MS)
  ) {
    const key = w.toISOString().slice(0, 10);
    const b = buckets.get(key);
    trend.push({
      week: key,
      label: weekFmt.format(w),
      pct: b ? pct(b.met, b.total) : null,
      total: b?.total ?? 0,
    });
  }

  // ── Cumplimiento por prioridad ──
  const byPriority = PRIORITIES.map((priority) => {
    const items = resolved.filter((t) => t.priority === priority);
    const met = items.filter((t) => t.metResolution).length;
    return { priority, met, total: items.length, pct: pct(met, items.length) };
  });

  // ── Cumplimiento por grupo de asignación ──
  const groupMap = new Map<string, { met: number; total: number }>();
  for (const t of resolved) {
    const g = groupMap.get(t.group) ?? { met: 0, total: 0 };
    g.total += 1;
    if (t.metResolution) g.met += 1;
    groupMap.set(t.group, g);
  }
  const byGroup = [...groupMap.entries()]
    .map(([group, { met, total }]) => ({ group, met, total, pct: pct(met, total) }))
    .sort((a, b) => b.total - a.total);

  // ── Incumplidos recientes (resueltos tarde + abiertos vencidos) ──
  type Breach = {
    id: string;
    ref: string;
    kind: TicketKind;
    priority: Priority;
    overdueHours: number;
    resolved: boolean;
  };
  const breaches: Breach[] = [
    ...resolvedLate.map((t) => ({
      id: t.id,
      ref: t.ref,
      kind: t.kind,
      priority: t.priority,
      overdueHours: round1((t.resolvedAt.getTime() - t.resolveBy.getTime()) / HOUR_MS),
      resolved: true,
    })),
    ...openOverdue.map((t) => ({
      id: t.id,
      ref: t.ref,
      kind: t.kind,
      priority: t.priority,
      overdueHours: round1((now.getTime() - t.resolveBy.getTime()) / HOUR_MS),
      resolved: false,
    })),
  ]
    .sort((a, b) => b.overdueHours - a.overdueHours)
    .slice(0, 8);

  return {
    days,
    targetPct: SLA_TARGET_PCT,
    resolvedCount: resolved.length,
    kpis: {
      resolutionCompliance,
      responseCompliance,
      breachedCount,
      atRiskCount,
      avgResolutionHours,
    },
    trend,
    byPriority,
    byGroup,
    breaches,
  };
}
