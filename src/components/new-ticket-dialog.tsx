"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
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
  DialogTrigger,
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
  // La acción «Crear ticket» de la paleta (⌘K) llega con ?nuevo=1. Lo leemos
  // en el inicializador perezoso para abrir ya al montar (navegación entre
  // páginas) sin un setState síncrono en efecto.
  const [open, setOpen] = useState(() => searchParams.get("nuevo") === "1");
  const [loading, setLoading] = useState(false);

  // Limpia el parámetro de la URL una vez consumido (no toca estado).
  useEffect(() => {
    if (searchParams.get("nuevo") === "1") router.replace("/tickets");
  }, [searchParams, router]);

  // Reabre si la paleta dispara la acción estando ya en /tickets (sin remount).
  useEffect(() => {
    function onNew() {
      setOpen(true);
    }
    window.addEventListener("nexo:new-ticket", onNew);
    return () => window.removeEventListener("nexo:new-ticket", onNew);
  }, []);
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
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Nuevo ticket
      </DialogTrigger>
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
