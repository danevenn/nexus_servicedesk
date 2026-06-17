"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  requestApprovalsAction,
  decideApprovalAction,
} from "@/app/actions/itil";
import { APPROVAL_DECISION_LABEL, APPROVAL_STATE_CLASS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Decision = keyof typeof APPROVAL_DECISION_LABEL;
type Approval = {
  id: string;
  decision: Decision;
  comment: string | null;
  decidedAt: string | Date | null;
  approver: { id: string; name: string };
};
type Manager = { id: string; name: string; role: string };

type Props = {
  ticketId: string;
  approvals: Approval[];
  canApprove: boolean; // el actor tiene change:approve
  canManage: boolean; // el actor puede solicitar aprobaciones
  currentUserId: string;
  managers: Manager[];
};

export function ChangeApprovals({
  ticketId,
  approvals,
  canApprove,
  canManage,
  currentUserId,
  managers,
}: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const myVote = approvals.find((a) => a.approver.id === currentUserId);
  const canVote = canApprove && myVote && myVote.decision === "PENDING";

  const requestedIds = new Set(approvals.map((a) => a.approver.id));
  const candidates = managers.filter(
    (m) =>
      (m.role === "MANAGER" || m.role === "ADMIN") && !requestedIds.has(m.id),
  );

  function decide(decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !comment.trim()) {
      toast.error("Indica el motivo del rechazo");
      return;
    }
    startTransition(async () => {
      try {
        await decideApprovalAction({
          ticketId,
          decision,
          comment: comment.trim() || undefined,
        });
        setComment("");
        toast.success(decision === "APPROVED" ? "Cambio aprobado" : "Cambio rechazado");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo registrar el voto", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no se ha solicitado aprobación.
        </p>
      ) : (
        <ul className="space-y-2">
          {approvals.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.approver.name}</div>
                {a.comment && (
                  <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
                    {a.comment}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                  APPROVAL_STATE_CLASS[a.decision],
                )}
              >
                {APPROVAL_DECISION_LABEL[a.decision]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canVote && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label className="text-xs">Tu voto como aprobador</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario (obligatorio al rechazar)…"
            rows={2}
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide("APPROVED")} disabled={pending}>
              <Check className="size-4" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => decide("REJECTED")}
              disabled={pending}
            >
              <X className="size-4" />
              Rechazar
            </Button>
          </div>
        </div>
      )}

      {canManage && candidates.length > 0 && (
        <RequestApprovalDialog ticketId={ticketId} candidates={candidates} />
      )}
    </div>
  );
}

function RequestApprovalDialog({
  ticketId,
  candidates,
}: {
  ticketId: string;
  candidates: Manager[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un aprobador");
      return;
    }
    startTransition(async () => {
      try {
        await requestApprovalsAction({
          ticketId,
          approverIds: [...selected],
        });
        toast.success("Aprobación solicitada");
        setSelected(new Set());
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error("No se pudo solicitar", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <UserPlus className="size-4" />
        Solicitar aprobación
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar aprobación del CAB</DialogTitle>
          <DialogDescription>
            Designa a los mánagers que deben aprobar el cambio. El cambio se
            aprueba cuando todos votan a favor; un solo rechazo lo tumba.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-auto py-2">
          {candidates.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
                className="size-4 accent-primary"
              />
              {m.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Solicitando…" : "Solicitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
