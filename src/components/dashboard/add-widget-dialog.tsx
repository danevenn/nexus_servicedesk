"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addWidgetAction, updateWidgetAction } from "@/app/actions/dashboards";
import {
  TICKET_METRICS,
  CI_METRICS,
  TICKET_DIMENSIONS,
  CI_DIMENSIONS,
  WIDGET_KIND_LABEL,
  SOURCE_LABEL,
} from "@/lib/widget-catalog";
import {
  KIND_LABEL,
  STATUS_LABEL,
  CI_TYPE_LABEL,
  CI_STATUS_LABEL,
  ENVIRONMENT_LABEL,
} from "@/lib/labels";
import type { WidgetConfig } from "@/lib/services/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "STAT" | "BAR" | "DONUT" | "LINE" | "LIST";
type Source = "TICKETS" | "CIS";

export type WidgetFilters = {
  priority?: string;
  kind?: string;
  status?: string;
  type?: string;
  ciStatus?: string;
  environment?: string;
};

export type EditingWidget = {
  id: string;
  kind: Kind;
  title: string;
  width: number;
  // Posición/tamaño en la cuadrícula de 12 columnas.
  x: number;
  y: number;
  w: number;
  h: number;
  config: {
    source: Source;
    metric?: string;
    groupBy?: string;
    onlyOpen?: boolean;
    filters?: WidgetFilters;
  };
};

type Props = {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget?: EditingWidget | null;
  // Alta desde la paleta: tipo preseleccionado y celda donde se soltó.
  prefillKind?: Kind | null;
  placement?: { x: number; y: number } | null;
};

const SCOPE_ITEMS = { all: "Todos", open: "Solo abiertos" };
const firstKey = (obj: Record<string, string>) => Object.keys(obj)[0];

// Valor centinela para "sin filtrar" (base-ui Select necesita un string).
const ANY = "__any";

const PRIORITY_ITEMS = {
  P1: "P1 — Crítica",
  P2: "P2 — Alta",
  P3: "P3 — Media",
  P4: "P4 — Baja",
} as const;

// Campos de filtro disponibles según la fuente de datos del widget.
const TICKET_FILTERS = [
  { key: "priority", label: "Prioridad", items: PRIORITY_ITEMS },
  { key: "kind", label: "Tipo", items: KIND_LABEL },
  { key: "status", label: "Estado", items: STATUS_LABEL },
] as const;

const CI_FILTERS = [
  { key: "type", label: "Tipo", items: CI_TYPE_LABEL },
  { key: "ciStatus", label: "Estado", items: CI_STATUS_LABEL },
  { key: "environment", label: "Entorno", items: ENVIRONMENT_LABEL },
] as const;

// El diálogo solo monta el formulario cuando está abierto: así el estado se
// inicializa de las props con `useState` (sin efectos de sincronización).
export function AddWidgetDialog({
  dashboardId,
  open,
  onOpenChange,
  widget,
  prefillKind,
  placement,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <WidgetForm
            dashboardId={dashboardId}
            widget={widget ?? null}
            prefillKind={prefillKind ?? null}
            placement={placement ?? null}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WidgetForm({
  dashboardId,
  widget,
  prefillKind,
  placement,
  onClose,
}: {
  dashboardId: string;
  widget: EditingWidget | null;
  prefillKind: Kind | null;
  placement: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = !!widget;
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState(widget?.title ?? "");
  const [kind, setKind] = useState<Kind>(widget?.kind ?? prefillKind ?? "STAT");
  const [source, setSource] = useState<Source>(
    widget?.config.source ?? "TICKETS",
  );
  const [metric, setMetric] = useState(widget?.config.metric ?? "open");
  const [groupBy, setGroupBy] = useState(widget?.config.groupBy ?? "status");
  const [onlyOpen, setOnlyOpen] = useState(!!widget?.config.onlyOpen);
  const [filters, setFilters] = useState<WidgetFilters>(
    widget?.config.filters ?? {},
  );

  // Solo conserva los filtros aplicables a la fuente actual.
  const filterDefs = source === "TICKETS" ? TICKET_FILTERS : CI_FILTERS;
  function setFilter(key: string, value: string | null) {
    setFilters((cur) => {
      const next = { ...cur };
      if (!value || value === ANY) delete next[key as keyof WidgetFilters];
      else next[key as keyof WidgetFilters] = value;
      return next;
    });
  }

  const metricItems = source === "TICKETS" ? TICKET_METRICS : CI_METRICS;
  const dimItems = source === "TICKETS" ? TICKET_DIMENSIONS : CI_DIMENSIONS;

  // La serie temporal solo tiene sentido sobre tickets.
  function changeKind(next: Kind) {
    setKind(next);
    if (next === "LINE" && source !== "TICKETS") applySource("TICKETS");
  }

  // Al cambiar de fuente, reajusta métrica/dimensión a opciones válidas.
  function applySource(next: Source) {
    setSource(next);
    const m = next === "TICKETS" ? TICKET_METRICS : CI_METRICS;
    const d = next === "TICKETS" ? TICKET_DIMENSIONS : CI_DIMENSIONS;
    setMetric((cur) => (cur in m ? cur : firstKey(m)));
    setGroupBy((cur) => (cur in d ? cur : firstKey(d)));
    // Descarta los filtros que no pertenecen a la nueva fuente.
    const validKeys = (next === "TICKETS" ? TICKET_FILTERS : CI_FILTERS).map(
      (f) => f.key as string,
    );
    setFilters((cur) => {
      const out: WidgetFilters = {};
      for (const k of validKeys) {
        const v = cur[k as keyof WidgetFilters];
        if (v) out[k as keyof WidgetFilters] = v;
      }
      return out;
    });
  }

  const needsMetric = kind === "STAT";
  const needsGroupBy = kind === "BAR" || kind === "DONUT";
  const showScope = source === "TICKETS" && needsGroupBy;
  const kindItems = WIDGET_KIND_LABEL as Record<string, string>;
  const sourceItems = SOURCE_LABEL as Record<string, string>;

  const preview = useMemo(() => {
    if (needsMetric) return metricItems[metric as keyof typeof metricItems];
    if (needsGroupBy) return `por ${dimItems[groupBy as keyof typeof dimItems]?.toLowerCase()}`;
    if (kind === "LINE") return "tickets creados (14 días)";
    return source === "TICKETS" ? "tickets recientes" : "CIs más críticos";
  }, [kind, source, metric, groupBy, needsMetric, needsGroupBy, metricItems, dimItems]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Los valores de filtro provienen de selects acotados a los enums; zod los
    // valida en el servidor, así que casteamos al tipo estricto del esquema.
    const config = {
      source,
      ...(needsMetric ? { metric } : {}),
      ...(needsGroupBy ? { groupBy } : {}),
      ...(showScope && onlyOpen ? { onlyOpen: true } : {}),
      ...(Object.keys(filters).length ? { filters } : {}),
    } as WidgetConfig;
    try {
      if (editing && widget) {
        await updateWidgetAction({
          widgetId: widget.id,
          title: title.trim() || preview,
          config,
        });
        toast.success("Widget actualizado");
      } else {
        await addWidgetAction({
          dashboardId,
          kind,
          title: title.trim() || preview,
          ...(placement ? { x: placement.x, y: placement.y } : {}),
          config,
        });
        toast.success("Widget añadido");
      }
      onClose();
      router.refresh();
    } catch (err) {
      toast.error("No se pudo guardar", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar widget" : "Añadir widget"}</DialogTitle>
        <DialogDescription>
          Elige qué medir y cómo visualizarlo. Se mostrará: {preview}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Visualización</Label>
            <Select items={kindItems} value={kind} onValueChange={(v) => v && changeKind(v as Kind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(kindItems).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Fuente de datos</Label>
            <Select
              items={sourceItems}
              value={source}
              onValueChange={(v) => v && applySource(v as Source)}
              disabled={kind === "LINE"}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sourceItems).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {needsMetric && (
          <div className="grid gap-2">
            <Label>Métrica</Label>
            <Select items={metricItems} value={metric} onValueChange={(v) => v && setMetric(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(metricItems).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {needsGroupBy && (
          <div className="grid gap-2">
            <Label>Agrupar por</Label>
            <Select items={dimItems} value={groupBy} onValueChange={(v) => v && setGroupBy(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(dimItems).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showScope && (
          <div className="grid gap-2">
            <Label>Ámbito</Label>
            <Select
              items={SCOPE_ITEMS}
              value={onlyOpen ? "open" : "all"}
              onValueChange={(v) => setOnlyOpen(v === "open")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPE_ITEMS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Filtros opcionales: acotan la consulta antes de medir/agrupar. */}
        <div className="grid gap-2 rounded-md border border-dashed bg-muted/20 p-3">
          <span className="text-xs font-medium text-muted-foreground">
            Filtros (opcional)
          </span>
          <div className="grid grid-cols-3 gap-3">
            {filterDefs.map((f) => {
              const items = { [ANY]: "Cualquiera", ...f.items } as Record<
                string,
                string
              >;
              const value = filters[f.key as keyof WidgetFilters] ?? ANY;
              return (
                <div key={f.key} className="grid gap-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">
                    {f.label}
                  </Label>
                  <Select
                    items={items}
                    value={value}
                    onValueChange={(v) => setFilter(f.key, v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(items).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="w-title">Título</Label>
          <Input
            id="w-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={preview}
            maxLength={80}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando…" : editing ? "Guardar cambios" : "Añadir widget"}
        </Button>
      </DialogFooter>
    </form>
  );
}
