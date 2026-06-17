import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { listCis } from "@/lib/services/cmdb";
import { CmdbTable, type CiRow } from "@/components/cmdb-table";
import { CI_TYPE_LABEL, ENVIRONMENT_LABEL } from "@/lib/labels";

const TYPES = new Set(Object.keys(CI_TYPE_LABEL));
const ENVS = new Set(Object.keys(ENVIRONMENT_LABEL));
const STATUSES = new Set(["OPERATIONAL", "DEGRADED", "DOWN", "RETIRED"]);
const only = (set: Set<string>, v?: string) =>
  v && set.has(v) ? v : undefined;

export default async function CmdbPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; environment?: string; status?: string; q?: string }>;
}) {
  const ctx = await getSessionCtx();
  if (!can(ctx, "cmdb:read")) redirect("/tickets");

  const sp = await searchParams;
  // Los searchParams solo siembran el estado inicial; el filtrado es en cliente.
  const initial = {
    type: only(TYPES, sp.type),
    environment: only(ENVS, sp.environment),
    status: only(STATUSES, sp.status),
    q: sp.q?.trim() || undefined,
  };

  // Inventario completo de una vez; filtrar por tipo/entorno/estado/nombre en el
  // cliente es instantáneo dado el volumen (~200 CIs) y evita reconsultar la BD.
  const cis = await listCis(ctx);
  const rows: CiRow[] = cis.map((c) => ({
    id: c.id,
    name: c.name,
    os: c.os ?? null,
    type: c.type,
    environment: c.environment,
    datacenter: c.datacenter ?? null,
    vendor: c.vendor ?? null,
    status: c.status,
    criticality: c.criticality,
    ticketCount: c._count.tickets,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CMDB</h1>
        <p className="text-muted-foreground">
          Inventario de elementos de configuración y sus dependencias.
        </p>
      </div>

      <CmdbTable cis={rows} initial={initial} />
    </div>
  );
}
