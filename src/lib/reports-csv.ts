import type { SlaReport } from "@/lib/services/reports";
import { KIND_LABEL } from "@/lib/labels";

// ─────────────────────────────────────────────
//  Serialización pura de un SlaReport a CSV (sin BD). Cada bloque del informe
//  o un combinado. BOM UTF-8 para que Excel respete los acentos; blindaje
//  contra inyección de fórmulas (=, +, -, @) en celdas de texto.
// ─────────────────────────────────────────────

export type CsvBlock =
  | "kpis"
  | "tendencia"
  | "prioridad"
  | "grupo"
  | "incumplidos"
  | "todo";

export const CSV_BLOCK_LABEL: Record<CsvBlock, string> = {
  kpis: "Indicadores",
  tendencia: "Tendencia semanal",
  prioridad: "Cumplimiento por prioridad",
  grupo: "Cumplimiento por grupo",
  incumplidos: "Incumplimientos recientes",
  todo: "Informe completo",
};

const BOM = "﻿";

function cell(value: string | number): string {
  if (typeof value === "number") return String(value);
  let s = value ?? "";
  // Anti-inyección de fórmulas en Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // Entrecomilla si contiene separadores o saltos.
  if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number)[]): string {
  return cells.map(cell).join(",");
}

function kpisRows(r: SlaReport): string[] {
  return [
    row(["Métrica", "Valor"]),
    row(["Cumplimiento de resolución (%)", r.kpis.resolutionCompliance]),
    row(["Cumplimiento de respuesta (%)", r.kpis.responseCompliance]),
    row(["Tickets incumplidos", r.kpis.breachedCount]),
    row(["Tickets en riesgo", r.kpis.atRiskCount]),
    row(["Tiempo medio de resolución (h)", r.kpis.avgResolutionHours]),
    row(["Tickets resueltos en el periodo", r.resolvedCount]),
    row(["Objetivo de cumplimiento (%)", r.targetPct]),
  ];
}

function trendRows(r: SlaReport): string[] {
  return [
    row(["Semana", "Cumplimiento (%)", "Resueltos"]),
    ...r.trend.map((t) => row([t.label, t.pct ?? "", t.total])),
  ];
}

function priorityRows(r: SlaReport): string[] {
  return [
    row(["Prioridad", "Cumplidos", "Total", "Cumplimiento (%)"]),
    ...r.byPriority.map((p) => row([p.priority, p.met, p.total, p.pct])),
  ];
}

function groupRows(r: SlaReport): string[] {
  return [
    row(["Grupo", "Cumplidos", "Total", "Cumplimiento (%)"]),
    ...r.byGroup.map((g) => row([g.group, g.met, g.total, g.pct])),
  ];
}

function breachRows(r: SlaReport): string[] {
  return [
    row(["Referencia", "Tipo", "Prioridad", "Horas de retraso", "Estado"]),
    ...r.breaches.map((b) =>
      row([
        b.ref,
        KIND_LABEL[b.kind],
        b.priority,
        b.overdueHours,
        b.resolved ? "Resuelto tarde" : "Abierto vencido",
      ]),
    ),
  ];
}

const SECTIONS: Record<Exclude<CsvBlock, "todo">, (r: SlaReport) => string[]> = {
  kpis: kpisRows,
  tendencia: trendRows,
  prioridad: priorityRows,
  grupo: groupRows,
  incumplidos: breachRows,
};

// Devuelve el CSV (con BOM) del bloque pedido, o el informe completo.
export function reportToCsv(report: SlaReport, block: CsvBlock): string {
  if (block !== "todo") {
    return BOM + SECTIONS[block](report).join("\n") + "\n";
  }
  // Combinado: cada sección precedida de un título comentado y separada por
  // una línea en blanco (Excel/Sheets lo abren bien).
  const order: Exclude<CsvBlock, "todo">[] = [
    "kpis",
    "tendencia",
    "prioridad",
    "grupo",
    "incumplidos",
  ];
  const parts = order.map(
    (b) => `# ${CSV_BLOCK_LABEL[b]}\n${SECTIONS[b](report).join("\n")}`,
  );
  return BOM + parts.join("\n\n") + "\n";
}
