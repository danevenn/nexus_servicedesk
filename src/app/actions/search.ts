"use server";

import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { searchTickets } from "@/lib/services/tickets";
import { listCis } from "@/lib/services/cmdb";
import { searchArticles } from "@/lib/services/kb";

// Resultado de la búsqueda global de la paleta de comandos (⌘K). Solo datos
// serializables; el RBAC se aplica aquí y en la capa de servicios.
export type CommandSearchResult = {
  tickets: {
    id: string;
    ref: string;
    title: string;
    status: string;
    priority: string;
    kind: string;
  }[];
  cis: {
    id: string;
    name: string;
    type: string;
    status: string;
    criticality: number;
  }[];
  articles: {
    id: string;
    slug: string;
    title: string;
    category: string;
  }[];
};

export async function searchCommandAction(
  query: string,
): Promise<CommandSearchResult> {
  const ctx = await getSessionCtx();
  const q = query.trim();
  if (q.length < 2) return { tickets: [], cis: [], articles: [] };

  const tickets = await searchTickets(ctx, q, 6);

  // Los CIs solo para quien puede leer la CMDB (el solicitante no).
  const cis = can(ctx, "cmdb:read")
    ? (await listCis(ctx, { q })).slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        criticality: c.criticality,
      }))
    : [];

  // La base de conocimiento es de autoservicio: la busca todo el mundo. El
  // servicio ya aplica la visibilidad (los no-editores no ven borradores).
  const articles = (await searchArticles(ctx, q, 6)).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    category: a.category,
  }));

  return { tickets, cis, articles };
}
