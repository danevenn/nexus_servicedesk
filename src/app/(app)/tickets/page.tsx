import Link from "next/link";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { queryTickets } from "@/lib/services/tickets";
import { listCis } from "@/lib/services/cmdb";
import { TicketFilters } from "@/components/ticket-filters";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { KindBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const KINDS = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];
const STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const ctx = await getSessionCtx();
  const sp = await searchParams;
  const kind = sp.kind && KINDS.includes(sp.kind) ? sp.kind : undefined;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;

  const tickets = await queryTickets({ kind, status }, ctx);
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

      <TicketFilters />

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
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No hay tickets que coincidan.
                </TableCell>
              </TableRow>
            )}
            {tickets.map((t) => (
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
                  <Link href={`/tickets/${t.id}`} className="block truncate max-w-md">
                    {t.title}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  <Link href={`/tickets/${t.id}`} className="block">
                    {t.ci?.name ?? "—"}
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
