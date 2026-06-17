"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  triageTicketAction,
  updateTicketStatusAction,
} from "@/app/actions/tickets";
import { STATUS_LABEL, ROLE_LABEL } from "@/lib/labels";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type User = { id: string; name: string; role: keyof typeof ROLE_LABEL };
type Props = {
  ticketId: string;
  currentStatus: keyof typeof STATUS_LABEL;
  currentAssigneeId: string | null;
  users: User[];
};

const UNASSIGNED = "UNASSIGNED";

export function TicketActions({
  ticketId,
  currentStatus,
  currentAssigneeId,
  users,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // useOptimistic: el Select refleja el cambio al instante; cuando la acción
  // termina React descarta el valor optimista y vuelve a la prop base. En éxito
  // hacemos router.refresh() → la prop pasa a ser el valor nuevo (se mantiene);
  // en error no refrescamos → revierte solo al valor real, sin rollback manual.
  const [status, setStatus] = useOptimistic<string>(currentStatus);
  const [assignee, setAssignee] = useOptimistic<string>(
    currentAssigneeId ?? UNASSIGNED,
  );

  const assigneeItems: Record<string, string> = {
    [UNASSIGNED]: "Sin asignar",
    ...Object.fromEntries(
      users.map((u) => [u.id, `${u.name} · ${ROLE_LABEL[u.role]}`]),
    ),
  };

  function runStatus(next: string | null) {
    if (next == null) return;
    startTransition(async () => {
      setStatus(next);
      try {
        await updateTicketStatusAction({
          ticketId,
          status: next as keyof typeof STATUS_LABEL,
        });
        toast.success("Estado actualizado");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo cambiar el estado", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  function runAssign(next: string | null) {
    if (next == null) return;
    startTransition(async () => {
      setAssignee(next);
      try {
        await triageTicketAction({
          ticketId,
          assigneeId: next === UNASSIGNED ? undefined : next,
        });
        toast.success("Ticket asignado");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo asignar", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      <div className="grid gap-2">
        <Label>Estado</Label>
        <Select
          items={STATUS_LABEL}
          value={status}
          onValueChange={runStatus}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Asignado a</Label>
        <Select
          items={assigneeItems}
          value={assignee}
          onValueChange={runAssign}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} · {ROLE_LABEL[u.role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
