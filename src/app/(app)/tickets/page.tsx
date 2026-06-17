import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { queryTickets } from "@/lib/services/tickets";
import { listCis } from "@/lib/services/cmdb";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { TicketsTable, type TicketRow } from "@/components/tickets-table";

const KINDS = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];
const STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const ctx = await getSessionCtx();
  const sp = await searchParams;
  // Los searchParams solo siembran el estado inicial de los filtros; el filtrado
  // posterior es 100% en cliente sobre el conjunto ya cargado.
  const initialKind = sp.kind && KINDS.includes(sp.kind) ? sp.kind : undefined;
  const initialStatus =
    sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;

  // Se cargan de una vez todos los tickets visibles para este usuario (la
  // visibilidad RBAC se aplica en el servicio). El volumen es modesto, así que
  // filtrar por tipo/estado en el cliente es instantáneo y evita ir a la BD.
  const tickets = await queryTickets({}, ctx);
  const rows: TicketRow[] = tickets.map((t) => ({
    id: t.id,
    ref: t.ref,
    kind: t.kind,
    title: t.title,
    ciName: t.ci?.name ?? null,
    priority: t.priority,
    status: t.status,
  }));

  const canCreate = can(ctx, "ticket:create");
  const canCreateAll = can(ctx, "change:create");
  const cis = can(ctx, "cmdb:read")
    ? (await listCis(ctx)).map((c) => ({ id: c.id, name: c.name }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">
            {can(ctx, "ticket:read:all")
              ? "Todas las incidencias, solicitudes, problemas y cambios."
              : "Tus incidencias y solicitudes."}
          </p>
        </div>
        {canCreate && <NewTicketDialog canCreateAll={canCreateAll} cis={cis} />}
      </div>

      <TicketsTable
        tickets={rows}
        initialKind={initialKind}
        initialStatus={initialStatus}
      />
    </div>
  );
}
