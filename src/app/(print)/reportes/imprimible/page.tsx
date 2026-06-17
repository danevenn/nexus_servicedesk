import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getSlaReport } from "@/lib/services/reports";
import { parseReportDays } from "@/lib/reports-constants";
import { KIND_LABEL } from "@/lib/labels";
import { PrintButton } from "@/components/print-button";

// Fecha de generación (helper con nombre para no llamar new Date() en el render).
function generatedOn(): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
}

export default async function PrintableReportPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const ctx = await getSessionCtx();
  if (!can(ctx, "ticket:read:all")) redirect("/tickets");

  const sp = await searchParams;
  const days = parseReportDays(sp.dias);
  const report = await getSlaReport(ctx, days);

  return (
    <div className="space-y-6 text-sm text-black">
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Informe de SLA — Nexo</h1>
          <p className="text-muted-foreground">
            Últimos {days} días · generado el {generatedOn()}
          </p>
        </div>
        <PrintButton />
      </header>

      <Section title="Indicadores">
        <Table
          head={["Métrica", "Valor"]}
          rows={[
            ["Cumplimiento de resolución", `${report.kpis.resolutionCompliance}%`],
            ["Cumplimiento de respuesta", `${report.kpis.responseCompliance}%`],
            ["Tickets incumplidos", report.kpis.breachedCount],
            ["Tickets en riesgo", report.kpis.atRiskCount],
            ["Tiempo medio de resolución", `${report.kpis.avgResolutionHours} h`],
            ["Tickets resueltos en el periodo", report.resolvedCount],
            ["Objetivo de cumplimiento", `${report.targetPct}%`],
          ]}
        />
      </Section>

      <Section title="Tendencia semanal de cumplimiento">
        <Table
          head={["Semana", "Cumplimiento", "Resueltos"]}
          rows={report.trend.map((t) => [
            t.label,
            t.pct === null ? "—" : `${t.pct}%`,
            t.total,
          ])}
        />
      </Section>

      <Section title="Cumplimiento por prioridad">
        <Table
          head={["Prioridad", "Cumplidos", "Total", "Cumplimiento"]}
          rows={report.byPriority.map((p) => [
            p.priority,
            p.met,
            p.total,
            `${p.pct}%`,
          ])}
        />
      </Section>

      <Section title="Cumplimiento por grupo">
        <Table
          head={["Grupo", "Cumplidos", "Total", "Cumplimiento"]}
          rows={report.byGroup.map((g) => [g.group, g.met, g.total, `${g.pct}%`])}
        />
      </Section>

      <Section title="Incumplimientos recientes">
        {report.breaches.length === 0 ? (
          <p className="text-muted-foreground">Sin incumplimientos en el periodo.</p>
        ) : (
          <Table
            head={["Referencia", "Tipo", "Prioridad", "Retraso (h)", "Estado"]}
            rows={report.breaches.map((b) => [
              b.ref,
              KIND_LABEL[b.kind],
              b.priority,
              b.overdueHours,
              b.resolved ? "Resuelto tarde" : "Abierto vencido",
            ])}
          />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 break-inside-avoid">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          {head.map((h) => (
            <th key={h} className="py-1.5 pr-4 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-4">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
