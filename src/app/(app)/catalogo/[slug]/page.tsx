import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getCatalogItemBySlug } from "@/lib/services/catalog";
import { NotFoundError } from "@/lib/services/errors";
import { CatalogIcon } from "@/components/catalog-icon";
import { CatalogRequestForm } from "@/components/catalog-request-form";

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getSessionCtx();

  let item;
  try {
    item = await getCatalogItemBySlug(ctx, slug);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const canSubmit = can(ctx, "ticket:create");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al catálogo
      </Link>

      <header className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CatalogIcon name={item.icon} className="size-6" />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {item.category}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-muted-foreground">{item.description}</p>
        </div>
      </header>

      <CatalogRequestForm
        slug={item.slug}
        name={item.name}
        fields={item.fields}
        canSubmit={canSubmit}
      />
    </div>
  );
}
