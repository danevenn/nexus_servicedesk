import { describe, it, expect, beforeEach } from "vitest";
import { computeWidget } from "@/lib/services/dashboards";
import { ctxFor, resetDb, mkTicket, mkCi } from "../helpers/db";

const ctx = ctxFor("AGENT");

// Motor de consulta de widgets: traduce {source, kind, config} a datos,
// respetando RBAC. Es el corazón del constructor de dashboards.
describe("computeWidget — tickets", () => {
  beforeEach(() => resetDb());

  it("STAT 'open' cuenta solo estados abiertos", async () => {
    await mkTicket({ status: "NEW" });
    await mkTicket({ status: "IN_PROGRESS" });
    await mkTicket({ status: "ON_HOLD" });
    await mkTicket({ status: "RESOLVED" });
    await mkTicket({ status: "CLOSED" });

    const data = await computeWidget(ctx, "STAT", {
      source: "TICKETS",
      metric: "open",
    });
    expect(data).toEqual({ type: "stat", value: 3 });
  });

  it("BAR agrupa por prioridad con conteos correctos", async () => {
    await mkTicket({ priority: "P1" });
    await mkTicket({ priority: "P2" });
    await mkTicket({ priority: "P2" });

    const data = await computeWidget(ctx, "BAR", {
      source: "TICKETS",
      groupBy: "priority",
    });
    expect(data.type).toBe("series");
    if (data.type !== "series") return;
    const byKey = Object.fromEntries(data.series.map((s) => [s.key, s.value]));
    expect(byKey).toEqual({ P1: 1, P2: 2 });
    // tally ordena por valor descendente.
    expect(data.series[0].key).toBe("P2");
  });

  it("aplica el filtro de prioridad del widget", async () => {
    await mkTicket({ priority: "P1" });
    await mkTicket({ priority: "P3" });
    await mkTicket({ priority: "P3" });

    const data = await computeWidget(ctx, "STAT", {
      source: "TICKETS",
      metric: "open",
      filters: { priority: "P3" },
    });
    expect(data).toEqual({ type: "stat", value: 2 });
  });

  it("LIST devuelve filas de tickets", async () => {
    await mkTicket({ ref: "INC-0777", title: "caída de red" });
    const data = await computeWidget(ctx, "LIST", { source: "TICKETS" });
    expect(data.type).toBe("tickets");
    if (data.type !== "tickets") return;
    expect(data.rows[0]).toMatchObject({ ref: "INC-0777", title: "caída de red" });
  });
});

describe("computeWidget — CIs", () => {
  beforeEach(() => resetDb());

  it("STAT 'total' cuenta todos los CIs", async () => {
    await mkCi({});
    await mkCi({});
    const data = await computeWidget(ctx, "STAT", {
      source: "CIS",
      metric: "total",
    });
    expect(data).toEqual({ type: "stat", value: 2 });
  });

  it("BAR agrupa CIs por tipo", async () => {
    await mkCi({ type: "SERVER" });
    await mkCi({ type: "SERVER" });
    await mkCi({ type: "DATABASE" });

    const data = await computeWidget(ctx, "BAR", {
      source: "CIS",
      groupBy: "type",
    });
    expect(data.type).toBe("series");
    if (data.type !== "series") return;
    const byKey = Object.fromEntries(data.series.map((s) => [s.key, s.value]));
    expect(byKey).toEqual({ SERVER: 2, DATABASE: 1 });
  });
});
