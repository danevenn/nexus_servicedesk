"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, X, Search } from "lucide-react";
import { toast } from "sonner";
import {
  linkIncidentsAction,
  unlinkIncidentAction,
  setKnownErrorAction,
  searchLinkableIncidentsAction,
} from "@/app/actions/itil";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import type { Priority, TicketStatus } from "@/generated/prisma/enums";

type Incident = {
  id: string;
  ref: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
};

type Props = {
  problemId: string;
  linkedIncidents: Incident[];
  rootCause: string | null;
  workaround: string | null;
  canManage: boolean;
};

export function ProblemLinks({
  problemId,
  linkedIncidents,
  rootCause,
  workaround,
  canManage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function unlink(incidentId: string) {
    startTransition(async () => {
      try {
        await unlinkIncidentAction({ incidentId });
        toast.success("Incidencia desvinculada");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo desvincular", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <KnownErrorForm
          problemId={problemId}
          rootCause={rootCause}
          workaround={workaround}
        />
      )}

      {!canManage && (rootCause || workaround) && (
        <div className="space-y-2 text-sm">
          {rootCause && (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Causa raíz</div>
              <p className="whitespace-pre-wrap">{rootCause}</p>
            </div>
          )}
          {workaround && (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Solución temporal
              </div>
              <p className="whitespace-pre-wrap">{workaround}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            Incidencias vinculadas ({linkedIncidents.length})
          </Label>
          {canManage && (
            <LinkIncidentsDialog problemId={problemId} />
          )}
        </div>
        {linkedIncidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna incidencia vinculada todavía.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {linkedIncidents.map((inc) => (
              <li
                key={inc.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <Link href={`/tickets/${inc.id}`} className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground">{inc.ref}</span>{" "}
                  <span className="text-sm hover:underline">{inc.title}</span>
                </Link>
                <PriorityBadge value={inc.priority} />
                <StatusBadge value={inc.status} />
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() => unlink(inc.id)}
                    disabled={pending}
                    aria-label="Desvincular"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KnownErrorForm({
  problemId,
  rootCause,
  workaround,
}: {
  problemId: string;
  rootCause: string | null;
  workaround: string | null;
}) {
  const router = useRouter();
  const [rc, setRc] = useState(rootCause ?? "");
  const [wa, setWa] = useState(workaround ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await setKnownErrorAction({
          problemId,
          rootCause: rc.trim() || undefined,
          workaround: wa.trim() || undefined,
        });
        toast.success("Known error actualizado");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo guardar", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label className="text-xs">Causa raíz</Label>
        <Textarea
          value={rc}
          onChange={(e) => setRc(e.target.value)}
          placeholder="Causa raíz identificada…"
          rows={2}
          disabled={pending}
        />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs">Solución temporal (workaround)</Label>
        <Textarea
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          placeholder="Mitigación mientras no hay arreglo definitivo…"
          rows={2}
          disabled={pending}
        />
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={pending}>
        {pending ? "Guardando…" : "Guardar known error"}
      </Button>
    </div>
  );
}

function LinkIncidentsDialog({ problemId }: { problemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function load(q: string) {
    startTransition(async () => {
      const list = await searchLinkableIncidentsAction(q);
      setResults(list);
    });
  }

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
      toast.error("Selecciona al menos una incidencia");
      return;
    }
    startTransition(async () => {
      try {
        await linkIncidentsAction({ problemId, incidentIds: [...selected] });
        toast.success("Incidencias vinculadas");
        setSelected(new Set());
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error("No se pudo vincular", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load(""); // carga incidencias libres al abrir (handler, no efecto)
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Link2 className="size-4" />
        Vincular
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular incidencias al problema</DialogTitle>
          <DialogDescription>
            Solo se listan incidencias que aún no pertenecen a ningún problema.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por referencia o título…"
            onChange={(e) => load(e.target.value)}
          />
        </div>
        <div className="max-h-72 space-y-1 overflow-auto py-2">
          {results.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No hay incidencias disponibles.
            </p>
          ) : (
            results.map((inc) => (
              <label
                key={inc.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={selected.has(inc.id)}
                  onChange={() => toggle(inc.id)}
                  className="size-4 accent-primary"
                />
                <span className="font-mono text-xs text-muted-foreground">{inc.ref}</span>
                <span className="min-w-0 flex-1 truncate">{inc.title}</span>
                <PriorityBadge value={inc.priority} />
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Vinculando…" : `Vincular${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
