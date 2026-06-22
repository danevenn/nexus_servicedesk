"use client";

import { useMounted } from "@/hooks/use-mounted";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

// Gráficas del constructor de dashboards. Usan los tokens `--chart-*` del
// tema (esmeralda) para integrarse con claro/oscuro sin tocar colores.

import { colorFor } from "@/lib/chart-colors";

export type Datum = { key: string; label: string; value: number };

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

const AXIS = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

// Dimensión inicial para ResponsiveContainer: antes de medir el contenedor,
// Recharts arranca en -1 y emite el aviso "width(-1)/height(-1)". Dándole unas
// dimensiones positivas de partida el primer render ya es válido; el observer
// las corrige al tamaño real (sigue siendo 100% responsive).
const INITIAL_DIMENSION = { width: 300, height: 150 } as const;

// Acorta etiquetas largas del eje X para que no se solapen (el tooltip
// muestra el valor completo).
const shortLabel = (v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v);

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sin datos
    </div>
  );
}

export function BarChartViz({ data }: { data: Datum[] }) {
  const mounted = useMounted();
  if (data.length === 0) return <Empty />;
  if (!mounted) return <div className="h-full w-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          {...AXIS}
          tick={{ ...AXIS.tick, fontSize: 10 }}
          interval={0}
          tickFormatter={shortLabel}
        />
        <YAxis allowDecimals={false} {...AXIS} width={40} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={colorFor(d.key, i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChartViz({ data }: { data: Datum[] }) {
  const mounted = useMounted();
  if (data.length === 0) return <Empty />;
  if (!mounted) return <div className="h-full w-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="var(--card)"
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={d.key} fill={colorFor(d.key, i)} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LineChartViz({ data }: { data: Datum[] }) {
  const mounted = useMounted();
  if (data.length === 0) return <Empty />;
  if (!mounted) return <div className="h-full w-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" {...AXIS} minTickGap={16} />
        <YAxis allowDecimals={false} {...AXIS} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Leyenda compacta para donuts (Recharts legend es poco flexible con tokens).
export function DonutLegend({ data }: { data: Datum[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {data.map((d, i) => (
        <li key={d.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2 rounded-full"
            style={{ background: colorFor(d.key, i) }}
          />
          {d.label}
          <span className="font-medium text-foreground tabular-nums">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
