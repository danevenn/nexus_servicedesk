"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { submitCatalogRequestAction } from "@/app/actions/catalog";
import type { CatalogField } from "@/lib/services/schemas";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  slug: string;
  name: string;
  fields: CatalogField[];
  canSubmit: boolean;
};

export function CatalogRequestForm({ slug, name, fields, canSubmit }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Validación rápida de obligatorios en cliente (el servicio revalida).
    const missing = fields.find(
      (f) => f.required && !(answers[f.key]?.trim()),
    );
    if (missing) {
      toast.error(`Falta el campo «${missing.label}»`);
      return;
    }
    startTransition(async () => {
      try {
        const { id, ref } = await submitCatalogRequestAction({ slug, answers });
        toast.success(`Solicitud creada · ${ref}`);
        router.push(`/tickets/${id}`);
        router.refresh();
      } catch (err) {
        toast.error("No se pudo enviar la solicitud", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  if (!canSubmit) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Inicia sesión como solicitante o técnico para pedir «{name}».
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este servicio no requiere datos adicionales.
        </p>
      )}

      {fields.map((f) => (
        <div key={f.key} className="grid gap-2">
          <Label htmlFor={f.key}>
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </Label>

          {f.type === "textarea" ? (
            <Textarea
              id={f.key}
              value={answers[f.key] ?? ""}
              onChange={(e) => setAnswer(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={3}
              disabled={pending}
            />
          ) : f.type === "select" ? (
            <Select
              items={Object.fromEntries((f.options ?? []).map((o) => [o, o]))}
              value={answers[f.key] ?? ""}
              onValueChange={(v) => v && setAnswer(f.key, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={f.placeholder ?? "Selecciona…"} />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={f.key}
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              value={answers[f.key] ?? ""}
              onChange={(e) => setAnswer(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={pending}
            />
          )}

          {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
        </div>
      ))}

      <Button type="submit" disabled={pending}>
        <Send className="size-4" />
        {pending ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
}
