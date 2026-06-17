import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { listCategories } from "@/lib/services/kb";
import { listCis } from "@/lib/services/cmdb";
import { ArticleEditor } from "@/components/kb/article-editor";

export default async function NewArticlePage() {
  const ctx = await getSessionCtx();
  if (!can(ctx, "kb:write")) redirect("/kb");

  const [categories, cisRaw] = await Promise.all([
    listCategories(ctx),
    listCis(ctx),
  ]);
  const cis = cisRaw.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <ArticleEditor mode="create" categories={categories} cis={cis} />
    </div>
  );
}
