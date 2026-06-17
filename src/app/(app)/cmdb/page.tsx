import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { listCis, type CiFilter } from "@/lib/services/cmdb";
import { CiStatusBadge } from "@/components/badges";
import { CmdbFilters } from "@/components/cmdb-filters";
import { CI_TYPE_LABEL, ENVIRONMENT_LABEL } from "@/lib/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CiType,
  CiStatus,
  Environment,
} from "@/generated/prisma/enums";

const TYPES = new Set(Object.keys(CI_TYPE_LABEL));
const ENVS = new Set(Object.keys(ENVIRONMENT_LABEL));
const STATUSES = new Set(["OPERATIONAL", "DEGRADED", "DOWN", "RETIRED"]);
const only = <T extends string>(set: Set<string>, v?: string) =>
  v && set.has(v) ? (v as T) : undefined;

export default async function CmdbPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; environment?: string; status?: string; q?: string }>;
}) {
  const ctx = await getSessionCtx();
  if (!can(ctx, "cmdb:read")) redirect("/tickets");

  const sp = await searchParams;
  const filter: CiFilter = {
    type: only<CiType>(TYPES, sp.type),
    environment: only<Environment>(ENVS, sp.environment),
    status: only<CiStatus>(STATUSES, sp.status),
    q: sp.q?.trim() || undefined,
  };
  const cis = await listCis(ctx, filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CMDB</h1>
        <p className="text-muted-foreground">
          Inventario de elementos de configuración y sus dependencias.
        </p>
      </div>

      <CmdbFilters />

      <p className="text-sm text-muted-foreground">
        {cis.length} {cis.length === 1 ? "elemento" : "elementos"}
      </p>

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
            {cis.map((ci) => (
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
                    {ci._count.tickets}
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
