import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Network, Pencil } from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getArticleBySlug, registerView } from "@/lib/services/kb";
import { NotFoundError } from "@/lib/services/errors";
import { ArticleBody } from "@/components/kb/article-body";
import { KbStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CI_TYPE_LABEL } from "@/lib/labels";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(d);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getSessionCtx();

  let article;
  try {
    article = await getArticleBySlug(ctx, slug);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  // Suma una visita (best-effort; no rompe el render si falla).
  await registerView(ctx, article.id);

  // Los CIs relacionados enlazan a la CMDB: solo se muestran a quien puede
  // abrirlos (el solicitante no tiene acceso a la CMDB).
  const showRelatedCis =
    can(ctx, "cmdb:read") && article.relatedCis.length > 0;
  const canWrite = can(ctx, "kb:write");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/kb"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a la base de conocimiento
        </Link>
        {canWrite && (
          <Button variant="outline" size="sm" render={<Link href={`/kb/${article.slug}/editar`} />}>
            <Pencil className="size-4" />
            Editar
          </Button>
        )}
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{article.category}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" />
            {article.views} {article.views === 1 ? "vista" : "vistas"}
          </span>
          <span>·</span>
          <span>Actualizado el {fmtDate(article.updatedAt)}</span>
          {article.status !== "PUBLISHED" && (
            <KbStatusBadge value={article.status} />
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {article.title}
        </h1>
        <p className="text-muted-foreground">{article.summary}</p>
        {article.author?.name && (
          <p className="text-xs text-muted-foreground">
            Por {article.author.name}
          </p>
        )}
      </header>

      <ArticleBody body={article.body} />

      {showRelatedCis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="size-4 text-muted-foreground" />
              Elementos de configuración relacionados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {article.relatedCis.map((ci) => (
                <Link
                  key={ci.id}
                  href={`/cmdb/${ci.id}`}
                  className="rounded-md border bg-background px-2.5 py-1 text-sm transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-[13px]">{ci.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {CI_TYPE_LABEL[ci.type]}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
