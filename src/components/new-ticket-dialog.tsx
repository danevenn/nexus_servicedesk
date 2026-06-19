"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createTicketAction } from "@/app/actions/tickets";
import { KIND_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Ci = { id: string; name: string };
type Props = { canCreateAll: boolean; cis: Ci[] };

const LEVELS = [
  { value: "1", label: "Baja" },
  { value: "2", label: "Media" },
  { value: "3", label: "Alta" },
];
const LEVEL_ITEMS = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]));

export function NewTicketDialog({ canCreateAll, cis }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // El botón global del header y la paleta ⌘K abren el diálogo navegando a
  // /tickets?nuevo=1. Detectamos el flanco de subida del parámetro DURANTE el
  // render (patrón oficial de React para "ajustar estado al cambiar una
  // entrada"): así es determinista —no depende del timing de un evento, clave
  // para CI— y no llama a setState dentro de un efecto.
  const wantOpen = searchParams.get("nuevo") === "1";
  const [open, setOpen] = useState(wantOpen);
  const [seenParam, setSeenParam] = useState(wantOpen);
  if (wantOpen && !seenParam) {
    setSeenParam(true);
    setOpen(true);
  } else if (!wantOpen && seenParam) {
    setSeenParam(false);
  }
  const [loading, setLoading] = useState(false);

  // Una vez consumido, limpiamos ?nuevo=1 de la URL (el efecto solo navega; no
  // toca estado). Deja la URL limpia y permite reabrir con un nuevo push.
  useEffect(() => {
    if (wantOpen) router.replace("/tickets");
  }, [wantOpen, router]);

  const [kind, setKind] = useState("INCIDENT");
  const [impact, setImpact] = useState("2");
  const [urgency, setUrgency] = useState("2");
  const [ciId, setCiId] = useState<string>("NONE");

  const kinds = canCreateAll
    ? (Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[])
    : (["INCIDENT", "REQUEST"] as const);

  const ciItems: Record<string, string> = {
    NONE: "Ninguno",
    ...Object.fromEntries(cis.map((c) => [c.id, c.name])),
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      await createTicketAction({
        kind: kind as keyof typeof KIND_LABEL,
        title: String(form.get("title")),
        description: String(form.get("description")),
        impact: Number(impact),
        urgency: Number(urgency),
        ciId: ciId === "NONE" ? undefined : ciId,
      });
      toast.success("Ticket creado");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("No se pudo crear", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Nuevo ticket</DialogTitle>
            <DialogDescription>
              La prioridad se calcula a partir de impacto y urgencia.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                items={KIND_LABEL}
                value={kind}
                onValueChange={(v) => {
                  if (v) setKind(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" required minLength={3} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" required rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Impacto</Label>
                <Select
                  items={LEVEL_ITEMS}
                  value={impact}
                  onValueChange={(v) => {
                    if (v) setImpact(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Urgencia</Label>
                <Select
                  items={LEVEL_ITEMS}
                  value={urgency}
                  onValueChange={(v) => {
                    if (v) setUrgency(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cis.length > 0 && (
              <div className="grid gap-2">
                <Label>CI afectado (opcional)</Label>
                <Select
                  items={ciItems}
                  value={ciId}
                  onValueChange={(v) => {
                    if (v) setCiId(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Ninguno</SelectItem>
                    {cis.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creando…" : "Crear ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
