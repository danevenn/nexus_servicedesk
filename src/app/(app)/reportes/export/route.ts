import { NextRequest } from "next/server";
import { getSessionCtx } from "@/lib/auth-context";
import { getSlaReport } from "@/lib/services/reports";
import { parseReportDays } from "@/lib/reports-constants";
import { reportToCsv, type CsvBlock } from "@/lib/reports-csv";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/services/errors";

const BLOCKS: CsvBlock[] = [
  "kpis",
  "tendencia",
  "prioridad",
  "grupo",
  "incumplidos",
  "todo",
];

// GET /reportes/export?dias=90&bloque=todo → descarga CSV del informe de SLA.
// RBAC reutilizado de getSlaReport (assertCan ticket:read:all).
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const days = parseReportDays(searchParams.get("dias"));
  const rawBlock = searchParams.get("bloque");
  const block: CsvBlock = BLOCKS.includes(rawBlock as CsvBlock)
    ? (rawBlock as CsvBlock)
    : "todo";

  let ctx;
  try {
    ctx = await getSessionCtx();
  } catch {
    return new Response("No autenticado", { status: 401 });
  }

  let report;
  try {
    report = await getSlaReport(ctx, days);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) {
      return new Response("No autorizado", { status: 403 });
    }
    throw e;
  }

  const csv = reportToCsv(report, block);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `sla-${block}-${days}d-${stamp}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
