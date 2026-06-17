"use client";

import Link from "next/link";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { WidgetData } from "@/lib/services/dashboards";
import {
  BarChartViz,
  DonutChartViz,
  DonutLegend,
  LineChartViz,
} from "@/components/charts/widget-chart";
import {
  KindBadge,
  PriorityBadge,
  StatusBadge,
  CiStatusBadge,
} from "@/components/badges";
import { CI_TYPE_LABEL } from "@/lib/labels";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type WidgetView = {
  id: string;
  kind: "STAT" | "BAR" | "DONUT" | "LINE" | "LIST";
  title: string;
  width: number;
};

type Props = {
  widget: WidgetView;
  data: WidgetData;
  editing: boolean;
  onRemove: () => void;
  onEdit: () => void;
};

export function WidgetCard({ widget, data, editing, onRemove, onEdit }: Props) {
  return (
    <Card className="flex h-full flex-col gap-3 overflow-hidden">
      <CardHeader
        className={`flex flex-row items-center justify-between gap-2 space-y-0 ${
          editing ? "nexo-drag cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {editing && (
            <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{widget.title}</span>
        </div>
        {editing && (
          <div
            className="flex shrink-0 items-center gap-1"
            // Los botones no deben iniciar el arrastre de la tarjeta.
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onEdit}
              aria-label="Editar widget"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Eliminar widget"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-hidden">
        <WidgetBody kind={widget.kind} data={data} />
      </CardContent>
    </Card>
  );
}

function WidgetBody({ kind, data }: { kind: WidgetView["kind"]; data: WidgetData }) {
  if (data.type === "error") {
    return <p className="text-sm text-destructive">{data.message}</p>;
  }

  if (data.type === "stat") {
    return (
      <div className="flex h-full min-h-16 items-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight">
          {data.value}
        </span>
      </div>
    );
  }

  if (data.type === "series") {
    const chart =
      kind === "DONUT" ? (
        <DonutChartViz data={data.series} />
      ) : kind === "LINE" ? (
        <LineChartViz data={data.series} />
      ) : (
        <BarChartViz data={data.series} />
      );
    return (
      <div className="flex h-full min-h-44 flex-col">
        <div className="min-h-0 w-full flex-1">{chart}</div>
        {kind === "DONUT" && <DonutLegend data={data.series} />}
      </div>
    );
  }

  if (data.type === "tickets") {
    if (data.rows.length === 0) {
      return <p className="text-sm text-muted-foreground">Sin tickets.</p>;
    }
    return (
      <ul className="h-full space-y-0.5 overflow-auto">
        {data.rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`/tickets/${t.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors"
            >
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {t.ref}
              </span>
              <PriorityBadge value={t.priority as never} />
              <KindBadge value={t.kind} />
              <span className="flex-1 truncate text-sm">{t.title}</span>
              <StatusBadge value={t.status} />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  // data.type === "cis"
  if (data.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin elementos.</p>;
  }
  return (
    <ul className="h-full space-y-0.5 overflow-auto">
      {data.rows.map((c) => (
        <li key={c.id}>
          <Link
            href={`/cmdb/${c.id}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors"
          >
            <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
              {CI_TYPE_LABEL[c.type]}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              crit {c.criticality}/5
            </span>
            <CiStatusBadge value={c.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
