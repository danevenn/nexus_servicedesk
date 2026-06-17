import { describe, it, expect, beforeEach } from "vitest";
import {
  listArticles,
  listCategories,
  searchArticles,
  getArticleBySlug,
  createArticle,
  updateArticle,
  archiveArticle,
  registerView,
} from "@/lib/services/kb";
import { ForbiddenError, NotFoundError } from "@/lib/services/errors";
import { prisma } from "@/lib/prisma";
import { resetDb, ctxFor, mkUser, mkCi } from "../helpers/db";

// Base de conocimiento (KB): lectura de autoservicio (kb:read, todos los
// roles) y escritura solo AGENT+ (kb:write). El contrato clave es la
// VISIBILIDAD: quien no puede escribir solo ve artículos PUBLISHED.

// Crea un artículo directamente en BD (saltándose el servicio) para preparar
// estados que el servicio no permitiría a ciertos roles.
let slugSeq = 0;
async function mkArticle(
  authorId: string,
  overrides: Partial<{
    slug: string;
    title: string;
    category: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    body: string;
  }> = {},
) {
  slugSeq += 1;
  return prisma.knowledgeArticle.create({
    data: {
      slug: overrides.slug ?? `articulo-${slugSeq}`,
      title: overrides.title ?? `Artículo ${slugSeq}`,
      summary: "resumen de prueba",
      body: overrides.body ?? "cuerpo del artículo",
      category: overrides.category ?? "Procedimientos",
      status: overrides.status ?? "PUBLISHED",
      authorId,
    },
  });
}

describe("KB · visibilidad por permiso", () => {
  beforeEach(() => resetDb());

  it("kb:read (REQUESTER) solo ve artículos PUBLISHED", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { status: "PUBLISHED" });
    await mkArticle(author.id, { status: "DRAFT" });
    await mkArticle(author.id, { status: "ARCHIVED" });

    const list = await listArticles(ctxFor("REQUESTER"));
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("PUBLISHED");
  });

  it("kb:write (AGENT) ve todos los estados", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { status: "PUBLISHED" });
    await mkArticle(author.id, { status: "DRAFT" });
    await mkArticle(author.id, { status: "ARCHIVED" });

    const list = await listArticles(ctxFor("AGENT", author.id));
    expect(list).toHaveLength(3);
  });

  it("listArticles filtra por categoría", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { category: "Redes" });
    await mkArticle(author.id, { category: "Sistemas" });

    const list = await listArticles(ctxFor("AGENT", author.id), {
      category: "Redes",
    });
    expect(list).toHaveLength(1);
    expect(list[0].category).toBe("Redes");
  });
});

describe("KB · listCategories", () => {
  beforeEach(() => resetDb());

  it("devuelve las categorías distintas y ordenadas", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { category: "Sistemas" });
    await mkArticle(author.id, { category: "Redes" });
    await mkArticle(author.id, { category: "Sistemas" });

    expect(await listCategories(ctxFor("REQUESTER"))).toEqual([
      "Redes",
      "Sistemas",
    ]);
  });

  it("oculta a los no-editores las categorías con solo borradores", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { category: "Publica", status: "PUBLISHED" });
    await mkArticle(author.id, { category: "Secreta", status: "DRAFT" });

    expect(await listCategories(ctxFor("REQUESTER"))).toEqual(["Publica"]);
    expect(await listCategories(ctxFor("AGENT", author.id))).toEqual([
      "Publica",
      "Secreta",
    ]);
  });
});

describe("KB · getArticleBySlug", () => {
  beforeEach(() => resetDb());

  it("devuelve un PUBLISHED a cualquiera con kb:read", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { slug: "publico", status: "PUBLISHED" });
    const a = await getArticleBySlug(ctxFor("REQUESTER"), "publico");
    expect(a.slug).toBe("publico");
  });

  it("oculta un DRAFT a quien no puede escribir (NotFound)", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { slug: "borrador", status: "DRAFT" });
    await expect(
      getArticleBySlug(ctxFor("REQUESTER"), "borrador"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("muestra un DRAFT a quien puede escribir", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { slug: "borrador", status: "DRAFT" });
    const a = await getArticleBySlug(ctxFor("AGENT", author.id), "borrador");
    expect(a.status).toBe("DRAFT");
  });

  it("lanza NotFound si el slug no existe", async () => {
    await expect(
      getArticleBySlug(ctxFor("AGENT"), "no-existe"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("KB · búsqueda", () => {
  beforeEach(() => resetDb());

  it("encuentra por título, resumen o cuerpo", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, {
      title: "Reiniciar la VPN corporativa",
      status: "PUBLISHED",
    });
    const res = await searchArticles(ctxFor("REQUESTER"), "vpn");
    expect(res).toHaveLength(1);
  });

  it("ignora consultas de menos de 2 caracteres", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, { title: "algo", status: "PUBLISHED" });
    expect(await searchArticles(ctxFor("AGENT", author.id), "a")).toEqual([]);
  });

  it("respeta la visibilidad: REQUESTER no ve borradores en la búsqueda", async () => {
    const author = await mkUser({ role: "AGENT" });
    await mkArticle(author.id, {
      title: "Secreto en borrador",
      status: "DRAFT",
    });
    expect(await searchArticles(ctxFor("REQUESTER"), "secreto")).toEqual([]);
  });
});

describe("KB · escritura (create/update/archive)", () => {
  beforeEach(() => resetDb());

  it("AGENT crea un artículo y se le asigna como autor", async () => {
    const author = await mkUser({ role: "AGENT" });
    const created = await createArticle(
      {
        title: "Procedimiento nuevo",
        summary: "un resumen",
        body: "el cuerpo",
        category: "Procedimientos",
      },
      ctxFor("AGENT", author.id),
    );
    expect(created.authorId).toBe(author.id);
    expect(created.status).toBe("PUBLISHED");
    expect(created.slug).toBe("procedimiento-nuevo");
  });

  it("genera el slug sin acentos ni símbolos", async () => {
    const author = await mkUser({ role: "AGENT" });
    const created = await createArticle(
      {
        title: "Configuración de la Red Wi-Fi (¡ágil!)",
        summary: "un resumen",
        body: "el cuerpo",
        category: "Redes",
      },
      ctxFor("AGENT", author.id),
    );
    expect(created.slug).toBe("configuracion-de-la-red-wi-fi-agil");
  });

  it("conecta los CIs relacionados al crear", async () => {
    const author = await mkUser({ role: "AGENT" });
    const ci = await mkCi({ name: "fra1-esxi-01" });
    const created = await createArticle(
      {
        title: "Mantenimiento de ESXi",
        summary: "un resumen",
        body: "el cuerpo",
        category: "Sistemas",
        relatedCiIds: [ci.id],
      },
      ctxFor("AGENT", author.id),
    );
    const full = await getArticleBySlug(
      ctxFor("AGENT", author.id),
      created.slug,
    );
    expect(full.relatedCis.map((c) => c.id)).toContain(ci.id);
  });

  it("REQUESTER no puede crear (kb:write)", async () => {
    await expect(
      createArticle(
        { title: "no permitido", summary: "x", body: "y", category: "X" },
        ctxFor("REQUESTER"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("update cambia el estado a ARCHIVED vía archiveArticle", async () => {
    const author = await mkUser({ role: "AGENT" });
    const art = await mkArticle(author.id, { status: "PUBLISHED" });
    await archiveArticle(art.id, ctxFor("AGENT", author.id));
    const reloaded = await prisma.knowledgeArticle.findUnique({
      where: { id: art.id },
    });
    expect(reloaded?.status).toBe("ARCHIVED");
  });

  it("updateArticle modifica campos y reescribe el slug", async () => {
    const author = await mkUser({ role: "AGENT" });
    const art = await mkArticle(author.id, { slug: "viejo" });
    const updated = await updateArticle(
      { id: art.id, title: "Título nuevo", slug: "Título Nuevo" },
      ctxFor("AGENT", author.id),
    );
    expect(updated.title).toBe("Título nuevo");
    expect(updated.slug).toBe("titulo-nuevo");
  });

  it("VIEWER (solo lectura) no puede archivar", async () => {
    const author = await mkUser({ role: "AGENT" });
    const art = await mkArticle(author.id);
    await expect(
      archiveArticle(art.id, ctxFor("VIEWER")),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("KB · registerView", () => {
  beforeEach(() => resetDb());

  it("incrementa el contador de visitas", async () => {
    const author = await mkUser({ role: "AGENT" });
    const art = await mkArticle(author.id);
    await registerView(ctxFor("REQUESTER"), art.id);
    const reloaded = await prisma.knowledgeArticle.findUnique({
      where: { id: art.id },
    });
    expect(reloaded?.views).toBe(1);
  });

  it("no rompe si el artículo no existe (best-effort)", async () => {
    await expect(
      registerView(ctxFor("REQUESTER"), "id-inexistente"),
    ).resolves.toBeUndefined();
  });
});
