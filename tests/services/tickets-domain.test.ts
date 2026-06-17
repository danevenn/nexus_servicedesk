import { describe, it, expect } from "vitest";
import {
  derivePriority,
  slaTargets,
  is247,
  pauseRefund,
  shiftDeadline,
  REF_PREFIX,
  type ImpactUrgency,
} from "@/lib/services/tickets-domain";
import { businessMinutesBetween } from "@/lib/services/sla-calendar";

describe("derivePriority — matriz ITIL impacto × urgencia", () => {
  // score = impacto * urgencia → P1≥9, P2≥6, P3≥3, P4 resto
  const cases: [ImpactUrgency, ImpactUrgency, string][] = [
    [3, 3, "P1"],
    [3, 2, "P2"],
    [2, 3, "P2"],
    [2, 2, "P3"],
    [3, 1, "P3"],
    [1, 3, "P3"],
    [2, 1, "P4"],
    [1, 2, "P4"],
    [1, 1, "P4"],
  ];
  for (const [impact, urgency, expected] of cases) {
    it(`impacto ${impact} × urgencia ${urgency} → ${expected}`, () => {
      expect(derivePriority(impact, urgency)).toBe(expected);
    });
  }

  it("es simétrica respecto a impacto/urgencia", () => {
    expect(derivePriority(3, 1)).toBe(derivePriority(1, 3));
    expect(derivePriority(3, 2)).toBe(derivePriority(2, 3));
  });
});

describe("slaTargets — objetivos por prioridad", () => {
  // Lunes 09:00 UTC (instante laboral): el invariante de horario es limpio.
  const from = new Date("2026-06-15T09:00:00.000Z");
  const H = 3_600_000;

  it("P1 corre 24×7 (reloj de pared): +1h respuesta / +4h resolución", () => {
    expect(is247("P1")).toBe(true);
    const t = slaTargets("P1", from);
    expect(t.respondBy.getTime() - from.getTime()).toBe(1 * H);
    expect(t.resolveBy.getTime() - from.getTime()).toBe(4 * H);
  });

  const businessCases = {
    P2: { respond: 2, resolve: 8 },
    P3: { respond: 4, resolve: 24 },
    P4: { respond: 8, resolve: 72 },
  } as const;

  for (const [priority, { respond, resolve }] of Object.entries(businessCases)) {
    it(`${priority} consume SLA solo en horario laboral (${respond}h/${resolve}h)`, () => {
      expect(is247(priority as keyof typeof businessCases)).toBe(false);
      const t = slaTargets(priority as keyof typeof businessCases, from);
      // Minutos laborables entre el inicio y el deadline == presupuesto.
      expect(businessMinutesBetween(from, t.respondBy)).toBe(respond * 60);
      expect(businessMinutesBetween(from, t.resolveBy)).toBe(resolve * 60);
      expect(t.resolveBy.getTime()).toBeGreaterThan(t.respondBy.getTime());
    });
  }

  it("un objetivo largo (P4, 72h laborables) cae en una jornada futura, no +72h de reloj", () => {
    const t = slaTargets("P4", from);
    // +72h de reloj sería el 18-jun; el calendario lo empuja bastante más allá.
    const naive = new Date(from.getTime() + 72 * H);
    expect(t.resolveBy.getTime()).toBeGreaterThan(naive.getTime());
  });

  it("no muta la fecha de origen", () => {
    const original = from.getTime();
    slaTargets("P1", from);
    expect(from.getTime()).toBe(original);
  });
});

describe("pauseRefund / shiftDeadline — pausa de SLA en ON_HOLD", () => {
  it("P1 (24×7) reembolsa tiempo de reloj, festivos/noches incluidos", () => {
    // Pausa de 3h de reloj un sábado (P1 corre 24×7).
    const onHold = new Date("2026-06-20T02:00:00Z");
    const now = new Date("2026-06-20T05:00:00Z");
    const { wallMinutes, refundMinutes } = pauseRefund("P1", onHold, now);
    expect(wallMinutes).toBe(180);
    expect(refundMinutes).toBe(180); // 24×7: reloj == reembolso
  });

  it("P3 (laborable) reembolsa solo los minutos laborables de la pausa", () => {
    // Pausa de viernes 17:00 a lunes 10:00: reloj enorme, pero solo 120' laborables.
    const onHold = new Date("2026-06-19T17:00:00Z");
    const now = new Date("2026-06-22T10:00:00Z");
    const { wallMinutes, refundMinutes } = pauseRefund("P3", onHold, now);
    expect(wallMinutes).toBeGreaterThan(2000); // reloj: ~65h
    expect(refundMinutes).toBe(120); // laborable: 60' + 60'
  });

  it("shiftDeadline empuja el deadline laborable lo reembolsado", () => {
    const deadline = new Date("2026-06-15T11:00:00Z"); // lunes 11:00
    const shifted = shiftDeadline(deadline, "P3", 120); // +2h laborables
    expect(shifted.toISOString()).toBe("2026-06-15T13:00:00.000Z");
  });

  it("shiftDeadline en P1 empuja en reloj de pared", () => {
    const deadline = new Date("2026-06-20T05:00:00Z");
    const shifted = shiftDeadline(deadline, "P1", 120);
    expect(shifted.toISOString()).toBe("2026-06-20T07:00:00.000Z");
  });
});

describe("REF_PREFIX — prefijo por tipo de ticket", () => {
  it("mapea cada tipo a su prefijo", () => {
    expect(REF_PREFIX).toEqual({
      INCIDENT: "INC",
      REQUEST: "REQ",
      PROBLEM: "PRB",
      CHANGE: "CHG",
    });
  });
});
