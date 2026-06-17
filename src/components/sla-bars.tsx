// Barras de progreso de SLA (respuesta y resolución), estilo ServiceNow.
// Componente puro (sin estado): el % se calcula desde las fechas.
import { Pause } from "lucide-react";

// Instante de referencia para el progreso (lo invoca la página de servidor por
// petición). Aislado aquí para no ensuciar el render con una llamada impura.
export function slaReferenceNow(): number {
  return Date.now();
}

function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

type BarProps = {
  label: string;
  start: Date;
  target: Date;
  doneAt: Date | null; // momento en que se cumplió el hito (o null si pendiente)
  now: number;
};

function Bar({ label, start, target, doneAt, now }: BarProps) {
  const total = Math.max(1, target.getTime() - start.getTime());
  const reference = (doneAt ?? new Date(now)).getTime();
  const elapsed = reference - start.getTime();
  const pct = Math.min(100, Math.max(2, (elapsed / total) * 100));

  const breached = reference > target.getTime();
  const done = doneAt != null;

  // Color: cumplido→emerald, incumplido→red, en curso→por % consumido.
  const color = done
    ? breached
      ? "bg-red-500"
      : "bg-emerald-500"
    : breached
      ? "bg-red-500"
      : pct < 70
        ? "bg-emerald-500"
        : pct < 90
          ? "bg-amber-500"
          : "bg-red-500";

  const remainingMs = target.getTime() - reference;
  const status = done
    ? breached
      ? `Incumplido (+${fmtDuration(-remainingMs)})`
      : `Cumplido (${fmtDuration(remainingMs)} de margen)`
    : breached
      ? `Vencido hace ${fmtDuration(-remainingMs)}`
      : `Quedan ${fmtDuration(remainingMs)}`;

  const statusColor = breached
    ? "text-red-600 dark:text-red-400"
    : done
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`text-xs ${statusColor}`}>{status}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Props = {
  createdAt: Date;
  respondBy: Date;
  respondedAt: Date | null;
  resolveBy: Date;
  resolvedAt: Date | null;
  now: number; // instante de referencia, calculado en el servidor por petición
  onHold?: boolean; // el ticket está EN ESPERA → el reloj de SLA está pausado
  pausedMinutes?: number; // tiempo total pausado acumulado (minutos)
};

export function SlaBars({
  createdAt,
  respondBy,
  respondedAt,
  resolveBy,
  resolvedAt,
  now,
  onHold = false,
  pausedMinutes = 0,
}: Props) {
  return (
    <div className="space-y-4">
      {onHold && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Pause className="size-3.5" />
          <span className="font-medium">SLA en pausa</span>
          <span className="text-muted-foreground">
            · el ticket está en espera; el reloj no corre
          </span>
        </div>
      )}
      <Bar label="Respuesta" start={createdAt} target={respondBy} doneAt={respondedAt} now={now} />
      <Bar label="Resolución" start={createdAt} target={resolveBy} doneAt={resolvedAt} now={now} />
      {pausedMinutes > 0 && (
        <p className="text-xs text-muted-foreground">
          Tiempo pausado acumulado: {fmtDuration(pausedMinutes * 60000)}
        </p>
      )}
    </div>
  );
}
