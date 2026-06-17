"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// Filtros de la base de conocimiento: buscador (Enter) + chips de categoría.
// Todo el estado vive en la URL (?q= y ?category=), igual que en la CMDB.
export function KbFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={q}
          placeholder="Buscar en la base de conocimiento…"
          className="h-9 pl-8"
          onKeyDown={(e) => {
            if (e.key === "Enter")
              setParam("q", (e.target as HTMLInputElement).value.trim());
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip active={category === ""} onClick={() => setParam("category", null)}>
          Todas
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c}
            active={category === c}
            onClick={() => setParam("category", c)}
          >
            {c}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary/40 bg-primary/10 font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
