import { describe, it, expect } from "vitest";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  BUSINESS_HOURS,
} from "@/lib/services/sla-calendar";

// Referencias (UTC): 2026-06-15 es lunes; 19=viernes, 20=sáb, 21=dom, 22=lunes.
const at = (iso: string) => new Date(iso);

describe("addBusinessMinutes", () => {
  it("suma dentro de la misma jornada laboral", () => {
    expect(addBusinessMinutes(at("2026-06-15T09:00:00Z"), 60).toISOString()).toBe(
      "2026-06-15T10:00:00.000Z",
    );
  });

  it("arranca a las 9:00 si empieza antes de la jornada", () => {
    expect(addBusinessMinutes(at("2026-06-15T06:00:00Z"), 30).toISOString()).toBe(
      "2026-06-15T09:30:00.000Z",
    );
  });

  it("desborda al día siguiente al pasar de las 18:00", () => {
    // 17:30 + 60' → 30' hoy (hasta 18:00) + 30' mañana desde las 9:00.
    expect(addBusinessMinutes(at("2026-06-15T17:30:00Z"), 60).toISOString()).toBe(
      "2026-06-16T09:30:00.000Z",
    );
  });

  it("salta el fin de semana", () => {
    // Viernes 17:00 + 120' → 60' (hasta 18:00) + 60' el lunes desde las 9:00.
    expect(addBusinessMinutes(at("2026-06-19T17:00:00Z"), 120).toISOString()).toBe(
      "2026-06-22T10:00:00.000Z",
    );
  });
});

describe("businessMinutesBetween", () => {
  it("cuenta minutos dentro de una jornada", () => {
    expect(
      businessMinutesBetween(at("2026-06-15T09:00:00Z"), at("2026-06-15T12:00:00Z")),
    ).toBe(180);
  });

  it("ignora la noche entre dos jornadas", () => {
    // Lun 17:00 → Mar 10:00 = 60' (17-18) + 60' (9-10).
    expect(
      businessMinutesBetween(at("2026-06-15T17:00:00Z"), at("2026-06-16T10:00:00Z")),
    ).toBe(120);
  });

  it("ignora el fin de semana", () => {
    // Vie 17:00 → Lun 10:00 = 60' + 60'.
    expect(
      businessMinutesBetween(at("2026-06-19T17:00:00Z"), at("2026-06-22T10:00:00Z")),
    ).toBe(120);
  });

  it("un fin de semana completo cuenta 0", () => {
    expect(
      businessMinutesBetween(at("2026-06-20T09:00:00Z"), at("2026-06-21T18:00:00Z")),
    ).toBe(0);
  });

  it("un festivo cuenta 0 (Reyes, 6-ene)", () => {
    expect(
      businessMinutesBetween(at("2026-01-06T09:00:00Z"), at("2026-01-06T18:00:00Z")),
    ).toBe(0);
  });

  it("devuelve 0 si el fin es anterior o igual al inicio", () => {
    expect(
      businessMinutesBetween(at("2026-06-15T12:00:00Z"), at("2026-06-15T09:00:00Z")),
    ).toBe(0);
  });
});

describe("calendario por defecto", () => {
  it("usa 9–18 L–V", () => {
    expect(BUSINESS_HOURS.startHour).toBe(9);
    expect(BUSINESS_HOURS.endHour).toBe(18);
    expect(BUSINESS_HOURS.workingDays).toEqual([1, 2, 3, 4, 5]);
  });
});
