"use client";

import {
  BarChart3,
  Hash,
  LineChart,
  List,
  PieChart,
  GripVertical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PALETTE_MIME } from "@/components/dashboard/dashboard-grid";
import type { WorkspaceWidget } from "@/components/dashboard/dashboard-workspace";

type PaletteEntry = {
  kind: WorkspaceWidget["kind"];
  label: string;
  hint: string;
  icon: LucideIcon;
};

const ENTRIES: PaletteEntry[] = [
  { kind: "STAT", label: "Indicador", hint: "Un número clave (KPI)", icon: Hash },
  { kind: "BAR", label: "Barras", hint: "Comparativa por categoría", icon: BarChart3 },
  { kind: "DONUT", label: "Anillo", hint: "Reparto proporcional", icon: PieChart },
  { kind: "LINE", label: "Serie temporal", hint: "Evolución en el tiempo", icon: LineChart },
  { kind: "LIST", label: "Lista", hint: "Tickets o CIs recientes", icon: List },
];

type Props = {
  onPick: (kind: WorkspaceWidget["kind"]) => void;
};

// Paleta de widgets: cada tarjeta se arrastra al lienzo (drag-in nativo) o se
// pulsa para añadir el widget en una fila nueva al pie.
export function WidgetPalette({ onPick }: Props) {
  return (
    <aside className="w-full shrink-0 space-y-2 lg:w-56">
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Arrastra al panel o pulsa para añadir
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {ENTRIES.map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.kind}
                type="button"
                draggable
                onClick={() => onPick(e.kind)}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(PALETTE_MIME, e.kind);
                  ev.dataTransfer.effectAllowed = "copy";
                }}
                className="group flex cursor-grab items-center gap-2 rounded-md border border-dashed bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent active:cursor-grabbing"
              >
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.hint}
                  </span>
                </span>
                <GripVertical className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
