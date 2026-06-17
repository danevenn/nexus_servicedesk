import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getSlaReport, REPORT_DAYS, type ReportDays } from "@/lib/services/reports";
import { SlaTrendChart } from "@/components/charts/sla-trend-chart";
import { ReportsPeriod } from "@/components/reports-period";
import { ReportsExport } from "@/components/reports-export";
import { PriorityBadge, KindBadge } from "@/components/badges";
import { SEMANTIC_COLOR } from "@/lib/chart-colors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Priority, TicketKind } from "@/generated/prisma/enums";

// Color del % de cumplimiento según se acerque o no al objetivo.
function complianceClass(pct: number, target: number): string {
  if (pct >= target) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= target - 10) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function pctText(pct: number): string {
  return `${pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const ctx = await getSessionCtx();
  if (!can(ctx, "ticket:read:all")) redirect("/tickets");

  const sp = await searchParams;
  const parsed = Number(sp.dias);
  const days: ReportDays = (REPORT_DAYS as readonly number[]).includes(parsed)
    ? (parsed as ReportDays)
    : 90;

  const report = await getSlaReport(ctx, days);
  const { kpis, targetPct } = report;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes de SLA</h1>
          <p className="text-muted-foreground">
            Cumplimiento de respuesta y resolución · {report.resolvedCount}{" "}
            {report.resolvedCount === 1 ? "ticket resuelto" : "tickets resueltos"}{" "}
            en el periodo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReportsPeriod days={days} />
          <ReportsExport days={days} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Cumplimiento resolución"
          value={pctText(kpis.resolutionCompliance)}
          valueClass={complianceClass(kpis.resolutionCompliance, targetPct)}
        />
        <Kpi
          label="Cumplimiento respuesta"
          value={pctText(kpis.responseCompliance)}
          valueClass={complianceClass(kpis.responseCompliance, targetPct)}
        />
        <Kpi
          label="Incumplidos"
          value={String(kpis.breachedCount)}
          valueClass={kpis.breachedCount > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
        <Kpi
          label="En riesgo (< 4 h)"
          value={String(kpis.atRiskCount)}
          valueClass={kpis.atRiskCount > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <Kpi
          label="T. medio resolución"
          value={`${kpis.avgResolutionHours.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Tendencia de cumplimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <SlaTrendChart data={report.trend} target={targetPct} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cumplimiento por prioridad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.byPriority.map((p) => (
              <div key={p.priority} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.priority}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.total === 0 ? "—" : `${pctText(p.pct)} · ${p.met}/${p.total}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${p.total === 0 ? 0 : p.pct}%`,
                      background: SEMANTIC_COLOR[p.priority],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cumplimiento por grupo</CardTitle>
          </CardHeader>
          <CardContent>
            {report.byGroup.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {report.byGroup.map((g) => (
                    <tr key={g.group} className="border-b last:border-0">
                      <td className="py-2">{g.group}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {g.met}/{g.total}
                      </td>
                      <td
                        className={`w-16 py-2 text-right font-medium tabular-nums ${complianceClass(g.pct, targetPct)}`}
                      >
                        {pctText(g.pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incumplidos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {report.breaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún SLA incumplido en el periodo. 🎉
              </p>
            ) : (
              <ul className="space-y-1">
                {report.breaches.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/tickets/${b.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {b.ref}
                      </span>
                      <PriorityBadge value={b.priority as Priority} />
                      <KindBadge value={b.kind as TicketKind} />
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {b.resolved ? "resuelto tarde" : "abierto vencido"}
                        </span>
                        <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                          +{b.overdueHours.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
