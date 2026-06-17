"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addWorkNoteAction } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function TicketNoteForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = text.trim();
    if (!value) return;
    startTransition(async () => {
      try {
        await addWorkNoteAction({ ticketId, text: value });
        setText("");
        toast.success("Nota añadida");
        router.refresh();
      } catch (err) {
        toast.error("No se pudo añadir la nota", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Añade una nota de trabajo…"
        rows={2}
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
          {pending ? "Añadiendo…" : "Añadir nota"}
        </Button>
      </div>
    </div>
  );
}
