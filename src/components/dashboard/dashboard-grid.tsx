"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GridStack, type GridStackNode } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { toast } from "sonner";
import type { WidgetData } from "@/lib/services/dashboards";
import { saveLayoutAction } from "@/app/actions/dashboards";
import type { WorkspaceWidget } from "@/components/dashboard/dashboard-workspace";
import { WidgetCard } from "@/components/dashboard/widget-card";

export type GridItem = { widget: WorkspaceWidget; data: WidgetData };

type Props = {
  dashboardId: string;
  items: GridItem[];
  editing: boolean;
  onEditWidget: (widget: WorkspaceWidget) => void;
  onRemoveWidget: (id: string) => void;
  // Alta desde la paleta: tipo soltado y celda calculada.
  onPaletteDrop?: (kind: WorkspaceWidget["kind"], x: number, y: number) => void;
};

export const PALETTE_MIME = "application/nexo-widget";

const COLUMNS = 12;
const CELL_HEIGHT = 44; // px por fila de la cuadrícula
const MARGIN = 8; // px de separación entre celdas

// Mantiene un nodo de portal por widget: GridStack es dueño del DOM del item;
// React solo inyecta el contenido (la tarjeta) dentro de su content-div.
type Portal = { id: string; host: HTMLElement };

export function DashboardGrid({
  dashboardId,
  items,
  editing,
  onEditWidget,
  onRemoveWidget,
  onPaletteDrop,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridStack | null>(null);
  const suppressRef = useRef(false); // evita autoguardar durante cambios programáticos
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [portals, setPortals] = useState<Portal[]>([]);
  const [dropActive, setDropActive] = useState(false);

  // Mapa id→item para que el render de los portales tenga datos frescos.
  const byId = new Map(items.map((it) => [it.widget.id, it]));

  // ── Persistencia (autoguardado al soltar) ──────────────────────────────
  function persist() {
    if (suppressRef.current) return;
    const grid = gridRef.current;
    if (!grid) return;
    const nodes = grid.save(false) as GridStackNode[];
    const payload = nodes
      .filter((n) => n.id != null)
      .map((n) => ({
        id: String(n.id),
        x: n.x ?? 0,
        y: n.y ?? 0,
        w: n.w ?? 4,
        h: n.h ?? 4,
      }));
    if (payload.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveLayoutAction({ dashboardId, items: payload }).catch(() =>
        toast.error("No se pudo guardar el layout"),
      );
    }, 350);
  }

  // ── Init de GridStack (una vez por montaje) ────────────────────────────
  useEffect(() => {
    if (!elRef.current) return;
    const grid = GridStack.init(
      {
        column: COLUMNS,
        cellHeight: CELL_HEIGHT,
        margin: MARGIN,
        float: false, // compacta hacia arriba: layout limpio
        animate: true,
        handle: ".nexo-drag",
        draggable: { handle: ".nexo-drag" },
        resizable: { handles: "se, sw" },
      },
      elRef.current,
    );
    gridRef.current = grid;
    grid.on("change", persist);
    setReady(true);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      grid.off("change");
      grid.destroy(false); // conserva el DOM (React lo desmonta)
      gridRef.current = null;
      setReady(false);
      setPortals([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sincroniza la lista de widgets con la cuadrícula (alta/baja) ────────
  useEffect(() => {
    const grid = gridRef.current;
    if (!ready || !grid) return;
    suppressRef.current = true;
    grid.batchUpdate();

    const want = new Map(items.map((it) => [it.widget.id, it]));
    const have = new Map(
      grid.engine.nodes.map((n) => [String(n.id), n] as const),
    );

    // Baja: widgets que ya no están.
    for (const node of [...grid.engine.nodes]) {
      if (!want.has(String(node.id)) && node.el) {
        grid.removeWidget(node.el, true);
      }
    }

    // Alta: widgets nuevos (recién añadidos desde la paleta o el diálogo).
    const next: Portal[] = portals.filter((p) => want.has(p.id));
    for (const [id, it] of want) {
      if (have.has(id)) continue;
      const el = grid.addWidget({
        id,
        x: it.widget.x,
        y: it.widget.y,
        w: it.widget.w,
        h: it.widget.h,
      });
      const host = el.querySelector<HTMLElement>(".grid-stack-item-content");
      if (host) next.push({ id, host });
    }

    grid.batchUpdate(false); // cierra el lote
    setPortals(next);
    // Libera el guard tras aplicar los cambios programáticos.
    const t = setTimeout(() => {
      suppressRef.current = false;
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);

  // ── Modo edición: activa/desactiva arrastre y redimensionado ───────────
  useEffect(() => {
    const grid = gridRef.current;
    if (!ready || !grid) return;
    grid.setStatic(!editing);
  }, [ready, editing]);

  // ── Caída desde la paleta (drag-in nativo) ─────────────────────────────
  function onDragOver(e: React.DragEvent) {
    if (!editing || !onPaletteDrop) return;
    if (!e.dataTransfer.types.includes(PALETTE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dropActive) setDropActive(true);
  }

  function onDrop(e: React.DragEvent) {
    setDropActive(false);
    if (!editing || !onPaletteDrop) return;
    const kind = e.dataTransfer.getData(PALETTE_MIME) as WorkspaceWidget["kind"];
    if (!kind) return;
    e.preventDefault();
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const colW = rect.width / COLUMNS;
    const rowH = CELL_HEIGHT + MARGIN;
    const size = defaultWidgetSize(kind);
    let x = Math.floor((e.clientX - rect.left) / colW);
    let y = Math.floor((e.clientY - rect.top) / rowH);
    x = Math.max(0, Math.min(x, COLUMNS - size.w));
    y = Math.max(0, y);
    onPaletteDrop(kind, x, y);
  }

  return (
    <div
      className={`nexo-grid-wrap rounded-lg transition-colors ${
        dropActive ? "bg-primary/5 outline-2 outline-dashed outline-primary/40" : ""
      }`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
    >
      <div ref={elRef} className="grid-stack" />
      {editing && portals.length === 0 && (
        <p className="px-1 py-10 text-center text-sm text-muted-foreground">
          Arrastra un widget desde la paleta para empezar.
        </p>
      )}
      {portals.map((p) => {
        const it = byId.get(p.id);
        if (!it) return null;
        return createPortal(
          <WidgetCard
            widget={it.widget}
            data={it.data}
            editing={editing}
            onRemove={() => onRemoveWidget(it.widget.id)}
            onEdit={() => onEditWidget(it.widget)}
          />,
          p.host,
          p.id,
        );
      })}
    </div>
  );
}

// Tamaño por defecto (en cuadrícula 12-col) según el tipo — espejo del servidor.
export function defaultWidgetSize(kind: WorkspaceWidget["kind"]): {
  w: number;
  h: number;
} {
  if (kind === "STAT") return { w: 3, h: 3 };
  if (kind === "LIST") return { w: 6, h: 7 };
  return { w: 4, h: 6 };
}

export { CELL_HEIGHT, COLUMNS };
