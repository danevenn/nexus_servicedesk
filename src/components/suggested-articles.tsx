import Link from "next/link";
import { BookOpen } from "lucide-react";
import { suggestArticles } from "@/lib/services/kb";
import type { Ctx } from "@/lib/services/context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Tarjeta de conocimiento relacionado. Es un Server Component asíncrono que se
// renderiza dentro de un <Suspense> en la ficha: el cálculo del embedding de la
// consulta (que en frío puede tardar mientras carga el modelo) NO bloquea el
// render de la ficha, sino que llega por streaming cuando está listo.
export async function SuggestedArticles({
  ctx,
  query,
}: {
  ctx: Ctx;
  query: string;
}) {
  const suggestions = await suggestArticles(ctx, query);
  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4 text-muted-foreground" />
          Conocimiento relacionado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <Link
            key={s.slug}
            href={`/kb/${s.slug}`}
            className="block rounded-md border bg-background p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-snug">{s.title}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {Math.round(s.score * 100)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{s.category}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// Esqueleto sobrio mientras llegan las sugerencias por streaming.
export function SuggestedArticlesSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4 text-muted-foreground" />
          Conocimiento relacionado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-12 animate-pulse rounded-md border bg-muted/40" />
        <div className="h-12 animate-pulse rounded-md border bg-muted/40" />
      </CardContent>
    </Card>
  );
}
