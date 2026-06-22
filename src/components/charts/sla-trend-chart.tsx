"use client";

import { useMounted } from "@/hooks/use-mounted";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

// Tendencia semanal del cumplimiento de resolución (%). Eje fijo 0–100 con una
// línea de objetivo punteada. Mismo patrón anti-warning que widget-chart.

export type TrendPoint = {
  week: string;
  label: string;
  pct: number | null;
  total: number;
};

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

const INITIAL_DIMENSION = { width: 300, height: 150 } as const;

export function SlaTrendChart({
  data,
  target,
}: {
  data: TrendPoint[];
  target: number;
}) {
  const mounted = useMounted();
  const hasData = data.some((d) => d.pct != null);
  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Sin resoluciones en el periodo
      </div>
    );
  }
  if (!mounted) return <div className="h-full w-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={INITIAL_DIMENSION}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="slaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" {...AXIS} minTickGap={16} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          {...AXIS}
          width={40}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => [`${v}%`, "Cumplimiento"]}
        />
        <ReferenceLine
          y={target}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: `objetivo ${target}%`,
            position: "insideTopRight",
            fill: "var(--muted-foreground)",
            fontSize: 11,
          }}
        />
        <Area
          type="monotone"
          dataKey="pct"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#slaFill)"
          connectNulls
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
