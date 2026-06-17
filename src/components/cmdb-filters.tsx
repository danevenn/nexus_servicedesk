"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { CI_TYPE_LABEL, CI_STATUS_LABEL, ENVIRONMENT_LABEL } from "@/lib/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ALL = "ALL";
const TYPE_ITEMS = { [ALL]: "Todos los tipos", ...CI_TYPE_LABEL };
const STATUS_ITEMS = { [ALL]: "Todos los estados", ...CI_STATUS_LABEL };
const ENV_ITEMS = { [ALL]: "Todos los entornos", ...ENVIRONMENT_LABEL };

export function CmdbFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const type = params.get("type") ?? ALL;
  const status = params.get("status") ?? ALL;
  const environment = params.get("environment") ?? ALL;
  const q = params.get("q") ?? "";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasFilters = type !== ALL || status !== ALL || environment !== ALL || q !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={q}
          placeholder="Buscar por nombre…"
          className="h-8 w-52 pl-8"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-40" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TYPE_ITEMS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={ENV_ITEMS} value={environment} onValueChange={(v) => setParam("environment", v)}>
        <SelectTrigger className="w-44" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ENV_ITEMS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={STATUS_ITEMS} value={status} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-40" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_ITEMS).map(([k, label]) => (
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
