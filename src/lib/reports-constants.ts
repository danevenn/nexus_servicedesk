// Constantes puras de los reportes de SLA (sin imports de servidor) para que
// las compartan el servicio (servidor) y el selector de periodo (cliente) sin
// arrastrar prisma al bundle del cliente.

export const REPORT_DAYS = [30, 90, 365] as const;
export type ReportDays = (typeof REPORT_DAYS)[number];

// Objetivo de cumplimiento (línea de referencia en la tendencia).
export const SLA_TARGET_PCT = 90;

// Valida un periodo crudo (de ?dias=) contra los permitidos. Un solo sitio,
// reusado por la página y por el Route Handler de export para no divergir.
export function parseReportDays(raw: string | null | undefined): ReportDays {
  const n = Number(raw);
  return (REPORT_DAYS as readonly number[]).includes(n)
    ? (n as ReportDays)
    : 90;
}
