import { describe, it, expect } from "vitest";
import { reportToCsv } from "@/lib/reports-csv";
import { parseReportDays } from "@/lib/reports-constants";
import type { SlaReport } from "@/lib/services/reports";

// Informe de ejemplo mínimo para serializar (incluye casos de borde: pct null,
// nombre de grupo con coma y un valor que empieza por "=" para anti-inyección).
const REPORT: SlaReport = {
  days: 90,
  targetPct: 90,
  resolvedCount: 3,
  kpis: {
    resolutionCompliance: 75.5,
    responseCompliance: 93.9,
    breachedCount: 2,
    atRiskCount: 1,
    avgResolutionHours: 12.3,
  },
  trend: [
    { week: "2026-01-05", label: "5 ene", pct: 100, total: 2 },
    { week: "2026-01-12", label: "12 ene", pct: null, total: 0 },
  ],
  byPriority: [
    { priority: "P1", met: 1, total: 1, pct: 100 },
    { priority: "P2", met: 1, total: 2, pct: 50 },
    { priority: "P3", met: 0, total: 0, pct: 100 },
    { priority: "P4", met: 0, total: 0, pct: 100 },
  ],
  byGroup: [
    { group: "Redes, Norte", met: 2, total: 3, pct: 66.7 },
    { group: "=Sospechoso", met: 1, total: 1, pct: 100 },
  ],
  breaches: [
    { id: "t1", ref: "INC-0007", kind: "INCIDENT", priority: "P1", overdueHours: 4.2, resolved: false },
  ],
} as SlaReport;

describe("reportToCsv", () => {
  it("incluye BOM UTF-8 al principio", () => {
    expect(reportToCsv(REPORT, "kpis").charCodeAt(0)).toBe(0xfeff);
  });

  it("serializa los KPIs con sus valores", () => {
    const csv = reportToCsv(REPORT, "kpis");
    expect(csv).toContain("Cumplimiento de resolución (%),75.5");
    expect(csv).toContain("Tickets incumplidos,2");
  });

  it("representa el cumplimiento nulo de una semana como celda vacía", () => {
    const csv = reportToCsv(REPORT, "tendencia");
    expect(csv).toContain("12 ene,,0");
  });

  it("entrecomilla valores con comas (nombre de grupo)", () => {
    const csv = reportToCsv(REPORT, "grupo");
    expect(csv).toContain('"Redes, Norte"');
  });

  it("blinda contra inyección de fórmulas prefijando con apóstrofo", () => {
    const csv = reportToCsv(REPORT, "grupo");
    // "=Sospechoso" → "'=Sospechoso" (y como no tiene coma, sin comillas)
    expect(csv).toContain("'=Sospechoso");
  });

  it("el informe completo concatena las cinco secciones con títulos", () => {
    const csv = reportToCsv(REPORT, "todo");
    expect(csv).toContain("# Indicadores");
    expect(csv).toContain("# Tendencia semanal");
    expect(csv).toContain("# Cumplimiento por prioridad");
    expect(csv).toContain("# Cumplimiento por grupo");
    expect(csv).toContain("# Incumplimientos recientes");
    expect(csv).toContain("INC-0007");
  });
});

describe("parseReportDays", () => {
  it("acepta los periodos válidos", () => {
    expect(parseReportDays("30")).toBe(30);
    expect(parseReportDays("365")).toBe(365);
  });
  it("cae a 90 ante valores inválidos o ausentes", () => {
    expect(parseReportDays("7")).toBe(90);
    expect(parseReportDays(null)).toBe(90);
    expect(parseReportDays("abc")).toBe(90);
  });
});
