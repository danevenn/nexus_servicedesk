"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const ALL = "ALL";
const KIND_ITEMS = { [ALL]: "Todos los tipos", ...KIND_LABEL };
const STATUS_ITEMS = { [ALL]: "Todos los estados", ...STATUS_LABEL };

export function TicketFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = params.get("kind") ?? ALL;
  const status = params.get("status") ?? ALL;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL || value == null) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasFilters = kind !== ALL || status !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={KIND_ITEMS}
        value={kind}
        onValueChange={(v) => setParam("kind", v)}
      >
        <SelectTrigger className="w-40" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los tipos</SelectItem>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={STATUS_ITEMS}
        value={status}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="w-40" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Limpiar
        </Button>
      )}
    </div>
  );
}
