"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/labels";
import { KindBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  Priority,
  TicketKind,
  TicketStatus,
} from "@/generated/prisma/enums";

const ALL = "ALL";

export type TicketRow = {
  id: string;
  ref: string;
  kind: TicketKind;
  title: string;
  ciName: string | null;
  priority: Priority;
  status: TicketStatus;
};

const KIND_ITEMS = { [ALL]: "Todos los tipos", ...KIND_LABEL };
const STATUS_ITEMS = { [ALL]: "Todos los estados", ...STATUS_LABEL };

// Refleja los filtros en la URL (compartible) sin disparar una navegación de
// Next: history.replaceState NO vuelve a renderizar el Server Component, por lo
// que el filtrado es instantáneo y no consulta a la BD.
function syncUrl(kind: string, status: string) {
  const params = new URLSearchParams(window.location.search);
  if (kind === ALL) params.delete("kind");
  else params.set("kind", kind);
  if (status === ALL) params.delete("status");
  else params.set("status", status);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

// Tabla de tickets con filtrado 100% en cliente sobre el conjunto ya cargado.
// El servidor entrega de una vez los tickets visibles (RBAC aplicado allí) y
// aquí solo se filtra por tipo/estado: cambiar de filtro es inmediato.
export function TicketsTable({
  tickets,
  initialKind,
  initialStatus,
}: {
  tickets: TicketRow[];
  initialKind?: string;
  initialStatus?: string;
}) {
  const [kind, setKind] = useState(initialKind ?? ALL);
  const [status, setStatus] = useState(initialStatus ?? ALL);

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) =>
          (kind === ALL || t.kind === kind) &&
          (status === ALL || t.status === status),
      ),
    [tickets, kind, status],
  );

  function update(nextKind: string, nextStatus: string) {
    setKind(nextKind);
    setStatus(nextStatus);
    syncUrl(nextKind, nextStatus);
  }

  const hasFilters = kind !== ALL || status !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={KIND_ITEMS}
          value={kind}
          onValueChange={(v) => update(v ?? ALL, status)}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(v) => update(kind, v ?? ALL)}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => update(ALL, ALL)}>
            Limpiar
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "ticket" : "tickets"}
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ref</TableHead>
              <TableHead className="w-28">Tipo</TableHead>
              <TableHead>Título</TableHead>
              <TableHead className="hidden md:table-cell">CI</TableHead>
              <TableHead className="w-20">Prioridad</TableHead>
              <TableHead className="w-28">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay tickets que coincidan.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t) => (
              <TableRow key={t.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <Link href={`/tickets/${t.id}`} className="block">
                    {t.ref}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/tickets/${t.id}`} className="block">
                    <KindBadge value={t.kind} />
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/tickets/${t.id}`}
                    className="block max-w-md truncate"
                  >
                    {t.title}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  <Link href={`/tickets/${t.id}`} className="block">
                    {t.ciName ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/tickets/${t.id}`} className="block">
                    <PriorityBadge value={t.priority} />
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/tickets/${t.id}`} className="block">
                    <StatusBadge value={t.status} />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
