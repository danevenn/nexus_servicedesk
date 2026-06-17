import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCan, can, type Ctx } from "./context";
import { mapPrismaError, NotFoundError } from "./errors";
import { embed } from "@/lib/embeddings";
import { rankBySimilarity } from "./embeddings-domain";

// Texto que alimenta el embedding de un artículo (título + resumen + cuerpo).
function articleText(title: string, summary: string, body: string): string {
  return `${title}\n${summary}\n${body}`;
}

// Genera el embedding sin romper la operación si el modelo falla (p. ej. en un
// cold-start sin red): el artículo se guarda igual, sin vector, y deja de
// aparecer en sugerencias hasta que se recalcule.
async function safeEmbed(text: string): Promise<number[]> {
  try {
    return await embed(text);
  } catch (e) {
    console.error("No se pudo generar el embedding:", e);
    return [];
  }
}

// Base de conocimiento (KB). Lectura para todos (kb:read, autoservicio);
// escritura solo AGENT+ (kb:write). Los que no pueden escribir solo ven
// artículos PUBLISHED (nunca borradores ni archivados).

export const createArticleSchema = z.object({
  title: z.string().min(3).max(160),
  summary: z.string().min(3).max(300),
  body: z.string().min(1),
  category: z.string().min(2).max(60),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
  slug: z.string().min(2).max(80).optional(),
  relatedCiIds: z.array(z.string()).optional(),
});

export const updateArticleSchema = createArticleSchema.partial().extend({
  id: z.string(),
});

export type CreateArticleInput = z.input<typeof createArticleSchema>;
export type UpdateArticleInput = z.input<typeof updateArticleSchema>;

export type KbFilter = { category?: string; q?: string; includeHidden?: boolean };

// Convierte un título en slug legible para URL (sin acentos ni símbolos).
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // elimina los diacríticos ya separados
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
}

// Filtro de visibilidad: quien no puede escribir solo ve PUBLISHED.
function visibilityWhere(ctx: Ctx) {
  return can(ctx, "kb:write") ? {} : { status: "PUBLISHED" as const };
}

export async function listArticles(ctx: Ctx, filter: KbFilter = {}) {
  assertCan(ctx, "kb:read");
  return prisma.knowledgeArticle.findMany({
    where: {
      ...visibilityWhere(ctx),
      category: filter.category,
      OR: filter.q
        ? [
            { title: { contains: filter.q, mode: "insensitive" } },
            { summary: { contains: filter.q, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      status: true,
      views: true,
      updatedAt: true,
      author: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

// Categorías visibles (para los filtros de la lista). Respeta la visibilidad:
// quien no puede escribir no ve categorías que solo tienen borradores.
export async function listCategories(ctx: Ctx): Promise<string[]> {
  assertCan(ctx, "kb:read");
  const rows = await prisma.knowledgeArticle.findMany({
    where: visibilityWhere(ctx),
    select: { category: true },
    distinct: ["category"],
    orderBy: [{ category: "asc" }],
  });
  return rows.map((r) => r.category);
}

// Búsqueda libre para la paleta de comandos (⌘K) y el buscador de KB.
export async function searchArticles(ctx: Ctx, q: string, take = 6) {
  assertCan(ctx, "kb:read");
  const term = q.trim();
  if (term.length < 2) return [];
  return prisma.knowledgeArticle.findMany({
    where: {
      ...visibilityWhere(ctx),
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { summary: { contains: term, mode: "insensitive" } },
        { body: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, title: true, category: true, status: true },
    orderBy: [{ updatedAt: "desc" }],
    take,
  });
}

export async function getArticleBySlug(ctx: Ctx, slug: string) {
  assertCan(ctx, "kb:read");
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, name: true } },
      relatedCis: {
        select: { id: true, name: true, type: true, status: true },
        orderBy: [{ criticality: "desc" }, { name: "asc" }],
      },
    },
  });
  if (!article) throw new NotFoundError("Artículo no encontrado");
  // Un borrador/archivado solo lo ve quien puede escribir.
  if (article.status !== "PUBLISHED" && !can(ctx, "kb:write")) {
    throw new NotFoundError("Artículo no encontrado");
  }
  return article;
}

export async function createArticle(input: unknown, ctx: Ctx) {
  assertCan(ctx, "kb:write");
  const data = createArticleSchema.parse(input);
  const embedding = await safeEmbed(
    articleText(data.title, data.summary, data.body),
  );
  try {
    return await prisma.knowledgeArticle.create({
      data: {
        slug: data.slug ? slugify(data.slug) : slugify(data.title),
        title: data.title,
        summary: data.summary,
        body: data.body,
        category: data.category,
        status: data.status,
        embedding,
        authorId: ctx.actorId,
        relatedCis: data.relatedCiIds?.length
          ? { connect: data.relatedCiIds.map((id) => ({ id })) }
          : undefined,
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateArticle(input: unknown, ctx: Ctx) {
  assertCan(ctx, "kb:write");
  const { id, relatedCiIds, slug, ...rest } = updateArticleSchema.parse(input);

  // Si cambia el texto del artículo, recalcula el embedding con los valores
  // finales (los del input fusionados con los actuales).
  let embedding: number[] | undefined;
  if (rest.title !== undefined || rest.summary !== undefined || rest.body !== undefined) {
    const current = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { title: true, summary: true, body: true },
    });
    if (current) {
      embedding = await safeEmbed(
        articleText(
          rest.title ?? current.title,
          rest.summary ?? current.summary,
          rest.body ?? current.body,
        ),
      );
    }
  }

  try {
    return await prisma.knowledgeArticle.update({
      where: { id },
      data: {
        ...rest,
        ...(embedding ? { embedding } : {}),
        slug: slug ? slugify(slug) : undefined,
        relatedCis: relatedCiIds
          ? { set: relatedCiIds.map((ciId) => ({ id: ciId })) }
          : undefined,
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Marca un artículo como ARCHIVED (no se borra: conserva histórico).
export async function archiveArticle(id: string, ctx: Ctx) {
  assertCan(ctx, "kb:write");
  try {
    return await prisma.knowledgeArticle.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Sugerencias semánticas: artículos PUBLISHED más parecidos a un texto libre
// (p. ej. el título+descripción de un ticket), por similitud coseno sobre los
// embeddings. Devuelve top-K con su puntuación de relevancia [0..1].
export async function suggestArticles(ctx: Ctx, text: string, limit = 3) {
  assertCan(ctx, "kb:read");
  const query = await safeEmbed(text);
  if (query.length === 0) return [];

  const rows = await prisma.knowledgeArticle.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, category: true, embedding: true },
  });
  const withVector = rows.filter((r) => r.embedding.length > 0);

  return rankBySimilarity(query, withVector, { limit, minScore: 0.25 }).map(
    ({ slug, title, category, score }) => ({ slug, title, category, score }),
  );
}

// Suma una visita (best-effort; no requiere escritura, lo hace la vista pública).
export async function registerView(ctx: Ctx, id: string) {
  assertCan(ctx, "kb:read");
  try {
    await prisma.knowledgeArticle.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  } catch {
    // una visita perdida no debe romper el render
  }
}
