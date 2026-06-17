import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { listArticles, listCategories } from "@/lib/services/kb";
import { KbFilters } from "@/components/kb-filters";
import { KbStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(d);
}

type Article = Awaited<ReturnType<typeof listArticles>>[number];

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const ctx = await getSessionCtx();
  const sp = await searchParams;
  const filter = {
    q: sp.q?.trim() || undefined,
    category: sp.category?.trim() || undefined,
  };

  const [articles, categories] = await Promise.all([
    listArticles(ctx, filter),
    listCategories(ctx),
  ]);

  // Agrupa por categoría preservando el orden (los artículos vienen por fecha).
  const groups = new Map<string, Article[]>();
  for (const a of articles) {
    const list = groups.get(a.category) ?? [];
    list.push(a);
    groups.set(a.category, list);
  }

  const canWrite = can(ctx, "kb:write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Base de conocimiento
          </h1>
          <p className="text-muted-foreground">
            Guías y procedimientos de autoservicio para resolver incidencias
            comunes.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" render={<Link href="/kb/nuevo" />}>
            <Plus className="size-4" />
            Nuevo artículo
          </Button>
        )}
      </div>

      <KbFilters categories={categories} />

      {articles.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No hay artículos que coincidan con la búsqueda.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([category, items]) => (
            <section key={category} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((a) => (
                  <ArticleCard key={a.id} article={a} showStatus={canWrite} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({
  article,
  showStatus,
}: {
  article: Article;
  showStatus: boolean;
}) {
  return (
    <Link
      href={`/kb/${article.slug}`}
      className="group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug group-hover:text-primary">
          {article.title}
        </h3>
        {showStatus && article.status !== "PUBLISHED" && (
          <KbStatusBadge value={article.status} />
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted-foreground">
        {article.summary}
      </p>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Eye className="size-3.5" />
          {article.views}
        </span>
        <span>Actualizado el {fmtDate(article.updatedAt)}</span>
      </div>
    </Link>
  );
}
