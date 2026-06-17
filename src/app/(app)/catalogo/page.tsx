import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { listCatalog } from "@/lib/services/catalog";
import { CatalogIcon } from "@/components/catalog-icon";

type Item = Awaited<ReturnType<typeof listCatalog>>[number];

export default async function CatalogPage() {
  const ctx = await getSessionCtx();
  const items = await listCatalog(ctx);

  // Agrupa por categoría preservando el orden (ya viene por categoría/posición).
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const list = groups.get(it.category) ?? [];
    list.push(it);
    groups.set(it.category, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Catálogo de servicios
        </h1>
        <p className="text-muted-foreground">
          Solicita altas, accesos, equipos y otros servicios. Cada petición abre
          un ticket que el equipo correspondiente gestiona según su SLA.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No hay servicios disponibles por ahora.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([category, list]) => (
            <section key={category} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((it) => (
                  <Link
                    key={it.id}
                    href={`/catalogo/${it.slug}`}
                    className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CatalogIcon name={it.icon} className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium leading-snug group-hover:text-primary">
                          {it.name}
                        </h3>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {it.shortDescription}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
