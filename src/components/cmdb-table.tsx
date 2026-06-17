"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  CI_TYPE_LABEL,
  CI_STATUS_LABEL,
  ENVIRONMENT_LABEL,
} from "@/lib/labels";
import { CiStatusBadge } from "@/components/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CiType, CiStatus, Environment } from "@/generated/prisma/enums";

const ALL = "ALL";
const TYPE_ITEMS = { [ALL]: "Todos los tipos", ...CI_TYPE_LABEL };
const STATUS_ITEMS = { [ALL]: "Todos los estados", ...CI_STATUS_LABEL };
const ENV_ITEMS = { [ALL]: "Todos los entornos", ...ENVIRONMENT_LABEL };

export type CiRow = {
  id: string;
  name: string;
  os: string | null;
  type: CiType;
  environment: Environment;
  datacenter: string | null;
  vendor: string | null;
  status: CiStatus;
  criticality: number;
  ticketCount: number;
};

function syncUrl(type: string, environment: string, status: string, q: string) {
  const params = new URLSearchParams(window.location.search);
  const set = (k: string, v: string, empty: string) => {
    if (!v || v === empty) params.delete(k);
    else params.set(k, v);
  };
  set("type", type, ALL);
  set("environment", environment, ALL);
  set("status", status, ALL);
  set("q", q, "");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

// Inventario de CIs con filtrado 100% en cliente sobre el conjunto ya cargado:
// tipo, entorno, estado y búsqueda por nombre, todo instantáneo y sin ir a la BD.
export function CmdbTable({
  cis,
  initial,
}: {
  cis: CiRow[];
  initial: { type?: string; environment?: string; status?: string; q?: string };
}) {
  const [type, setType] = useState(initial.type ?? ALL);
  const [environment, setEnvironment] = useState(initial.environment ?? ALL);
  const [status, setStatus] = useState(initial.status ?? ALL);
  const [q, setQ] = useState(initial.q ?? "");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cis.filter(
      (c) =>
        (type === ALL || c.type === type) &&
        (environment === ALL || c.environment === environment) &&
        (status === ALL || c.status === status) &&
        (needle === "" || c.name.toLowerCase().includes(needle)),
    );
  }, [cis, type, environment, status, q]);

  function update(
    next: Partial<{ type: string; environment: string; status: string; q: string }>,
  ) {
    const t = next.type ?? type;
    const e = next.environment ?? environment;
    const s = next.status ?? status;
    const query = next.q ?? q;
    setType(t);
    setEnvironment(e);
    setStatus(s);
    setQ(query);
    syncUrl(t, e, s, query);
  }

  const hasFilters =
    type !== ALL || environment !== ALL || status !== ALL || q !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            placeholder="Buscar por nombre…"
            className="h-8 w-52 pl-8"
            onChange={(e) => update({ q: e.target.value })}
          />
        </div>

        <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => update({ type: v ?? ALL })}>
          <SelectTrigger className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_ITEMS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={ENV_ITEMS}
          value={environment}
          onValueChange={(v) => update({ environment: v ?? ALL })}
        >
          <SelectTrigger className="w-44" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ENV_ITEMS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(v) => update({ status: v ?? ALL })}
        >
          <SelectTrigger className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_ITEMS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ type: ALL, environment: ALL, status: ALL, q: "" })}
          >
            Limpiar
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "elemento" : "elementos"}
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-32">Tipo</TableHead>
              <TableHead className="w-32">Entorno</TableHead>
              <TableHead className="hidden w-36 lg:table-cell">Datacenter</TableHead>
              <TableHead className="hidden w-32 xl:table-cell">Fabricante</TableHead>
              <TableHead className="w-28">Estado</TableHead>
              <TableHead className="w-20 text-center">Crit.</TableHead>
              <TableHead className="w-20 text-center">Tickets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay elementos que coincidan.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((ci) => (
              <TableRow key={ci.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    <span className="font-mono text-[13px]">{ci.name}</span>
                    {ci.os && (
                      <span className="block text-xs text-muted-foreground">{ci.os}</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {CI_TYPE_LABEL[ci.type]}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {ENVIRONMENT_LABEL[ci.environment]}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {ci.datacenter ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {ci.vendor ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    <CiStatusBadge value={ci.status} />
                  </Link>
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {ci.criticality}/5
                  </Link>
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  <Link href={`/cmdb/${ci.id}`} className="block">
                    {ci.ticketCount}
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
