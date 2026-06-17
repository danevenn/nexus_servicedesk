import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";

const OPEN_STATES = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] as const;

// Métricas para el panel: solo AGENT+ (necesita ver todos los tickets).
export async function getDashboardMetrics(ctx: Ctx) {
  assertCan(ctx, "ticket:read:all");
  const now = new Date();

  const [byStatus, byPriority, totalOpen, slaBreached, topCisRaw, recent] =
    await Promise.all([
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ticket.groupBy({
        by: ["priority"],
        where: { status: { in: [...OPEN_STATES] } },
        _count: { _all: true },
      }),
      prisma.ticket.count({ where: { status: { in: [...OPEN_STATES] } } }),
      prisma.ticket.count({
        where: {
          status: { in: [...OPEN_STATES] },
          sla: { resolveBy: { lt: now } },
        },
      }),
      prisma.ticket.groupBy({
        by: ["ciId"],
        where: { status: { in: [...OPEN_STATES] }, ciId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { ciId: "desc" } },
        take: 5,
      }),
      prisma.ticket.findMany({
        include: { ci: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  const ciIds = topCisRaw
    .map((r) => r.ciId)
    .filter((id): id is string => id != null);
  const cis = await prisma.configurationItem.findMany({
    where: { id: { in: ciIds } },
  });
  const topCis = topCisRaw
    .map((r) => {
      const ci = cis.find((c) => c.id === r.ciId);
      return ci ? { ci, count: r._count._all } : null;
    })
    .filter((x): x is { ci: (typeof cis)[number]; count: number } => x != null);

  const statusCounts = Object.fromEntries(
    byStatus.map((s) => [s.status, s._count._all]),
  );
  const priorityCounts = Object.fromEntries(
    byPriority.map((p) => [p.priority, p._count._all]),
  );

  return { statusCounts, priorityCounts, totalOpen, slaBreached, topCis, recent };
}
