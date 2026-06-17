import { describe, it, expect, beforeEach } from "vitest";
import { getSlaReport } from "@/lib/services/reports";
import { ForbiddenError } from "@/lib/services/errors";
import { prisma } from "@/lib/prisma";
import { resetDb, ctxFor, mkUser } from "../helpers/db";

// Reportes de SLA: cumplimiento de respuesta/resolución derivado del modelo Sla.
// Lectura para ticket:read:all (VIEWER+). El núcleo a fijar es el CÁLCULO de
// cumplimiento, la cohorte por periodo y la clasificación de incumplidos.

const HOUR = 3_600_000;
const DAY = 86_400_000;
const now = () => Date.now();

let seq = 0;
let requesterId = "";

async function mkSla(opts: {
  priority?: "P1" | "P2" | "P3" | "P4";
  status?: string;
  createdAt?: Date;
  resolvedAt?: Date | null;
  respondBy: Date;
  resolveBy: Date;
  respondedAt?: Date | null;
  groupId?: string;
}) {
  seq += 1;
  return prisma.ticket.create({
    data: {
      ref: `INC-${String(seq).padStart(4, "0")}`,
      kind: "INCIDENT",
      title: `Ticket ${seq}`,
      description: "desc",
      priority: (opts.priority ?? "P3") as never,
      status: (opts.status ?? "RESOLVED") as never,
      requesterId,
      assignmentGroupId: opts.groupId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      resolvedAt: opts.resolvedAt ?? null,
      sla: {
        create: {
          respondBy: opts.respondBy,
          resolveBy: opts.resolveBy,
          respondedAt: opts.respondedAt ?? null,
        },
      },
    },
  });
}

beforeEach(async () => {
  await resetDb();
  seq = 0;
  requesterId = (await mkUser({ role: "REQUESTER" })).id;
});

describe("Reportes SLA · permisos", () => {
  it("REQUESTER no puede ver los reportes (ticket:read:all)", async () => {
    await expect(getSlaReport(ctxFor("REQUESTER"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("VIEWER (solo lectura) sí puede verlos", async () => {
    const r = await getSlaReport(ctxFor("VIEWER"));
    expect(r.kpis.resolutionCompliance).toBe(100); // sin datos = 100%
  });
});

describe("Reportes SLA · cumplimiento", () => {
  it("calcula el % de cumplimiento de resolución", async () => {
    const t = new Date(now() - 1 * DAY);
    // 3 a tiempo, 1 tarde → 75%.
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() - HOUR), respondBy: t });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.resolvedCount).toBe(4);
    expect(r.kpis.resolutionCompliance).toBe(75);
  });

  it("calcula el % de cumplimiento de respuesta solo sobre los respondidos", async () => {
    const t = new Date(now() - 1 * DAY);
    const respBy = new Date(t.getTime() + HOUR);
    // 1 respondido a tiempo, 1 tarde, 1 sin responder (no cuenta) → 50%.
    await mkSla({ resolvedAt: t, resolveBy: t, respondBy: respBy, respondedAt: new Date(respBy.getTime() - HOUR) });
    await mkSla({ resolvedAt: t, resolveBy: t, respondBy: respBy, respondedAt: new Date(respBy.getTime() + HOUR) });
    await mkSla({ resolvedAt: t, resolveBy: t, respondBy: respBy, respondedAt: null });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.kpis.responseCompliance).toBe(50);
  });

  it("cuenta incumplidos: resueltos tarde + abiertos ya vencidos", async () => {
    const t = new Date(now() - 1 * DAY);
    // resuelto tarde
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() - HOUR), respondBy: t });
    // abierto vencido
    await mkSla({
      status: "IN_PROGRESS",
      resolvedAt: null,
      resolveBy: new Date(now() - HOUR),
      respondBy: t,
    });
    // abierto aún en plazo (no cuenta)
    await mkSla({
      status: "IN_PROGRESS",
      resolvedAt: null,
      resolveBy: new Date(now() + 10 * DAY),
      respondBy: t,
    });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.kpis.breachedCount).toBe(2);
  });

  it("cuenta 'en riesgo' los abiertos que vencen dentro de la ventana", async () => {
    const t = new Date(now() - 1 * DAY);
    // vence en 2 h → en riesgo
    await mkSla({ status: "ASSIGNED", resolvedAt: null, resolveBy: new Date(now() + 2 * HOUR), respondBy: t });
    // vence en 10 días → no
    await mkSla({ status: "ASSIGNED", resolvedAt: null, resolveBy: new Date(now() + 10 * DAY), respondBy: t });
    // ya vencido → no es "en riesgo" (es incumplido)
    await mkSla({ status: "ASSIGNED", resolvedAt: null, resolveBy: new Date(now() - HOUR), respondBy: t });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.kpis.atRiskCount).toBe(1);
  });
});

describe("Reportes SLA · cohorte por periodo", () => {
  it("excluye los tickets resueltos fuera de la ventana", async () => {
    const dentro = new Date(now() - 10 * DAY);
    const fuera = new Date(now() - 200 * DAY);
    await mkSla({ resolvedAt: dentro, resolveBy: new Date(dentro.getTime() + HOUR), respondBy: dentro });
    await mkSla({ resolvedAt: fuera, resolveBy: new Date(fuera.getTime() + HOUR), respondBy: fuera });

    const r90 = await getSlaReport(ctxFor("AGENT"), 90);
    expect(r90.resolvedCount).toBe(1);

    const r365 = await getSlaReport(ctxFor("AGENT"), 365);
    expect(r365.resolvedCount).toBe(2);
  });
});

describe("Reportes SLA · desgloses", () => {
  it("desglosa cumplimiento por prioridad", async () => {
    const t = new Date(now() - 1 * DAY);
    await mkSla({ priority: "P1", resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ priority: "P1", resolvedAt: t, resolveBy: new Date(t.getTime() - HOUR), respondBy: t });

    const r = await getSlaReport(ctxFor("AGENT"));
    const p1 = r.byPriority.find((b) => b.priority === "P1");
    expect(p1).toMatchObject({ total: 2, met: 1, pct: 50 });
    // Las 4 prioridades siempre aparecen (aunque sin datos).
    expect(r.byPriority).toHaveLength(4);
  });

  it("desglosa por grupo de asignación y ordena por volumen", async () => {
    const t = new Date(now() - 1 * DAY);
    const g1 = await prisma.assignmentGroup.create({ data: { name: "Redes" } });
    const g2 = await prisma.assignmentGroup.create({ data: { name: "Linux" } });
    await mkSla({ groupId: g1.id, resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ groupId: g1.id, resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });
    await mkSla({ groupId: g2.id, resolvedAt: t, resolveBy: new Date(t.getTime() + HOUR), respondBy: t });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.byGroup[0]).toMatchObject({ group: "Redes", total: 2 });
    expect(r.byGroup.map((g) => g.group)).toContain("Linux");
  });

  it("lista los incumplidos ordenados por horas de retraso", async () => {
    const t = new Date(now() - 1 * DAY);
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() - HOUR), respondBy: t });
    await mkSla({ resolvedAt: t, resolveBy: new Date(t.getTime() - 5 * HOUR), respondBy: t });

    const r = await getSlaReport(ctxFor("AGENT"));
    expect(r.breaches).toHaveLength(2);
    expect(r.breaches[0].overdueHours).toBeGreaterThanOrEqual(
      r.breaches[1].overdueHours,
    );
    expect(r.breaches[0].resolved).toBe(true);
  });
});
