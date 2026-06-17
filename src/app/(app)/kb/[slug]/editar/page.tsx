import { notFound, redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getArticleBySlug, listCategories } from "@/lib/services/kb";
import { listCis } from "@/lib/services/cmdb";
import { NotFoundError } from "@/lib/services/errors";
import { ArticleEditor } from "@/components/kb/article-editor";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getSessionCtx();
  if (!can(ctx, "kb:write")) redirect("/kb");

  let article;
  try {
    article = await getArticleBySlug(ctx, slug);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [categories, cisRaw] = await Promise.all([
    listCategories(ctx),
    listCis(ctx),
  ]);
  const cis = cisRaw.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <ArticleEditor
        mode="edit"
        articleId={article.id}
        categories={categories}
        cis={cis}
        initial={{
          title: article.title,
          summary: article.summary,
          body: article.body,
          category: article.category,
          status: article.status,
          slug: article.slug,
          relatedCiIds: article.relatedCis.map((c) => c.id),
        }}
      />
    </div>
  );
}
