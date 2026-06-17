"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { updateTicketStatusAction } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CODES = {
  Resuelto: "Resuelto",
  "Solución temporal": "Solución temporal",
  "No reproducible": "No reproducible",
  "Configuración": "Configuración",
  "Cambio aplicado": "Cambio aplicado",
};

export function TicketResolveForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("Resuelto");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function resolve(status: "RESOLVED" | "CLOSED") {
    const value = notes.trim();
    if (!value) {
      toast.error("Documenta la solución antes de resolver");
      return;
    }
    startTransition(async () => {
      try {
        await updateTicketStatusAction({
          ticketId,
          status,
          resolutionCode: code,
          resolutionNotes: value,
        });
        setNotes("");
        toast.success(status === "CLOSED" ? "Ticket cerrado" : "Ticket resuelto");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo resolver", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="grid gap-2">
        <Label>Código de resolución</Label>
        <Select items={CODES} value={code} onValueChange={(v) => v && setCode(v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(CODES).map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Notas de resolución</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe la solución aplicada…"
          rows={3}
          disabled={pending}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => resolve("RESOLVED")} disabled={pending}>
          <CheckCircle2 className="size-4" />
          Resolver
        </Button>
        <Button size="sm" variant="outline" onClick={() => resolve("CLOSED")} disabled={pending}>
          Resolver y cerrar
        </Button>
      </div>
    </div>
  );
}
