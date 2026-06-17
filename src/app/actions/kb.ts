"use server";

import { revalidatePath } from "next/cache";
import { getSessionCtx } from "@/lib/auth-context";
import {
  createArticle,
  updateArticle,
  archiveArticle,
  type CreateArticleInput,
  type UpdateArticleInput,
} from "@/lib/services/kb";

// Server Actions de la base de conocimiento: resuelven la sesión y delegan en
// la capa de servicios (donde vive el RBAC kb:write). Revalidan las rutas KB.

export async function createArticleAction(input: CreateArticleInput) {
  const ctx = await getSessionCtx();
  const article = await createArticle(input, ctx);
  revalidatePath("/kb");
  revalidatePath(`/kb/${article.slug}`);
  return { slug: article.slug };
}

export async function updateArticleAction(input: UpdateArticleInput) {
  const ctx = await getSessionCtx();
  const article = await updateArticle(input, ctx);
  revalidatePath("/kb");
  revalidatePath(`/kb/${article.slug}`);
  return { slug: article.slug };
}

export async function archiveArticleAction(id: string) {
  const ctx = await getSessionCtx();
  await archiveArticle(id, ctx);
  revalidatePath("/kb");
}
