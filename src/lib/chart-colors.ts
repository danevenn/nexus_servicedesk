// Colores semánticos para las gráficas, indexados por la CLAVE del dato
// (valor de enum). Cuando la dimensión no tiene semántica (fabricante,
// datacenter, técnico…) se cae a la paleta del tema.
//
// Criterio: gravedad creciente = color más cálido.
//   P1 rojo · P2 naranja · P3 amarillo · P4 tono suave (pizarra).

export const SEMANTIC_COLOR: Record<string, string> = {
  // Prioridad
  P1: "#ef4444", // red-500
  P2: "#f97316", // orange-500
  P3: "#eab308", // yellow-500
  P4: "#64748b", // slate-500 (menos agresivo)

  // Estado de ticket
  NEW: "#94a3b8", // slate-400
  ASSIGNED: "#3b82f6", // blue-500
  IN_PROGRESS: "#f59e0b", // amber-500
  ON_HOLD: "#a1a1aa", // zinc-400
  RESOLVED: "#10b981", // emerald-500
  CLOSED: "#71717a", // zinc-500

  // Estado de CI
  OPERATIONAL: "#10b981",
  DEGRADED: "#f59e0b",
  DOWN: "#ef4444",
  RETIRED: "#71717a",

  // Entorno
  PROD: "#10b981", // emerald
  STAGING: "#3b82f6", // blue
  DEV: "#8b5cf6", // violet
  DR: "#f59e0b", // amber
};

// Paleta de respaldo (tokens del tema esmeralda) para dimensiones sin semántica.
export const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function colorFor(key: string, index: number): string {
  return SEMANTIC_COLOR[key] ?? PALETTE[index % PALETTE.length];
}
