"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Botón de impresión + auto-disparo del diálogo al montar (el usuario guarda
// como PDF desde ahí). Se oculta en la propia impresión (print:hidden).
export function PrintButton() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);

  return (
    <Button
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      Imprimir o guardar como PDF
    </Button>
  );
}
