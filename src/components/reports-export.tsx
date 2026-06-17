"use client";

import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CSV_BLOCK_LABEL, type CsvBlock } from "@/lib/reports-csv";

const SECTIONS: Exclude<CsvBlock, "todo">[] = [
  "kpis",
  "tendencia",
  "prioridad",
  "grupo",
  "incumplidos",
];

// Menú de descarga del informe de SLA. Hereda el periodo por prop (igual que
// ReportsPeriod): los enlaces llevan ?dias= para exportar lo que se está viendo.
export function ReportsExport({ days }: { days: number }) {
  const csvHref = (block: CsvBlock) =>
    `/reportes/export?dias=${days}&bloque=${block}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-4" />
        Exportar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem render={<a href={csvHref("todo")} download />}>
          <FileText className="size-4" />
          Informe completo (CSV) · {days} d
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Secciones (CSV)
        </DropdownMenuLabel>
        {SECTIONS.map((b) => (
          <DropdownMenuItem key={b} render={<a href={csvHref(b)} download />}>
            {CSV_BLOCK_LABEL[b]}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<a href={`/reportes/imprimible?dias=${days}`} target="_blank" rel="noopener" />}
        >
          <Printer className="size-4" />
          Imprimir / Guardar como PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
