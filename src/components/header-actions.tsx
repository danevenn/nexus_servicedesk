"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Acciones rápidas de creación en el header. Cada acción su propio botón, con
// etiqueta en escritorio y solo icono en pantallas estrechas (no colapsa). Se
// muestran según permisos del rol (gating calculado en el servidor).
export function HeaderActions({
  canCreateTicket,
  canWriteKb,
}: {
  canCreateTicket: boolean;
  canWriteKb: boolean;
}) {
  const router = useRouter();

  // Navega a /tickets?nuevo=1; el NewTicketDialog allí montado reacciona al
  // parámetro y se abre (determinista, sin eventos). Funciona tanto desde otra
  // página como estando ya en /tickets.
  function newTicket() {
    router.push("/tickets?nuevo=1");
  }

  if (!canCreateTicket && !canWriteKb) return null;

  return (
    <div className="flex items-center gap-2">
      {canCreateTicket && (
        <Button size="sm" onClick={newTicket} aria-label="Nuevo ticket" title="Nuevo ticket">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo ticket</span>
        </Button>
      )}
      {canWriteKb && (
        <Button
          variant="outline"
          size="sm"
          aria-label="Nuevo artículo"
          title="Nuevo artículo de la base de conocimiento"
          render={<Link href="/kb/nuevo" />}
        >
          <FilePlus2 className="size-4" />
          <span className="hidden sm:inline">Artículo</span>
        </Button>
      )}
    </div>
  );
}
