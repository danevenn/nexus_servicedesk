import { prisma } from "@/lib/prisma";
import { assertCan, type Ctx } from "./context";
import { mapPrismaError, NotFoundError } from "./errors";

// Resuelve un CI por id exacto o, si no, por coincidencia de nombre
// (insensible a mayúsculas). Pensado para el MCP: el agente conoce nombres
// ("Postgres Primary"), no cuids. Respeta el permiso de lectura de CMDB.
export async function resolveCi(ctx: Ctx, query: string) {
  assertCan(ctx, "cmdb:read");
  const byId = await prisma.configurationItem.findUnique({ where: { id: query } });
  if (byId) return byId;
  return prisma.configurationItem.findFirst({
    where: { name: { contains: query, mode: "insensitive" } },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
  });
}

import type { CiType, CiStatus, Environment } from "@/generated/prisma/enums";

export type CiFilter = {
  type?: CiType;
  status?: CiStatus;
  environment?: Environment;
  q?: string;
};

// Lista de CIs (con su recuento de tickets) aplicando filtros opcionales.
export async function listCis(ctx: Ctx, filter: CiFilter = {}) {
  assertCan(ctx, "cmdb:read");
  return prisma.configurationItem.findMany({
    where: {
      type: filter.type,
      status: filter.status,
      environment: filter.environment,
      name: filter.q ? { contains: filter.q, mode: "insensitive" } : undefined,
    },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
    include: { _count: { select: { tickets: true } } },
  });
}

export async function getCi(ctx: Ctx, ciId: string) {
  assertCan(ctx, "cmdb:read");
  const ci = await prisma.configurationItem.findUnique({
    where: { id: ciId },
    include: {
      dependsOn: { include: { target: true } },
      dependedBy: { include: { source: true } },
    },
  });
  if (!ci) throw new NotFoundError("CI no encontrado");
  return ci;
}

// Análisis de impacto aguas abajo: si este CI falla, ¿qué CIs se ven
// afectados? Recorre el grafo de dependencias por anchura (source ← target).
// Es la lógica que alimentará la tool `analizar_impacto` del MCP.
export async function getDownstreamImpact(ctx: Ctx, ciId: string) {
  assertCan(ctx, "cmdb:read");
  const root = await prisma.configurationItem.findUnique({ where: { id: ciId } });
  if (!root) throw new NotFoundError("CI no encontrado");

  const impacted = new Set<string>();
  let frontier = [ciId];
  try {
    while (frontier.length > 0) {
      const edges = await prisma.ciDependency.findMany({
        where: { targetId: { in: frontier } },
        select: { sourceId: true },
      });
      const next = edges
        .map((e) => e.sourceId)
        .filter((id) => !impacted.has(id) && id !== ciId);
      next.forEach((id) => impacted.add(id));
      frontier = next;
    }
  } catch (e) {
    throw mapPrismaError(e);
  }

  const cis = await prisma.configurationItem.findMany({
    where: { id: { in: [...impacted] } },
    orderBy: [{ criticality: "desc" }, { name: "asc" }],
  });
  return { root, impacted: cis };
}

// ── Topología del vecindario de un CI (para el grafo de la ficha) ─────────
// Devuelve nodos + aristas alrededor del CI hasta `depth` saltos en ambas
// direcciones (lo que depende de él y aquello de lo que depende), marcando el
// conjunto "impactado" (dependientes, a cualquier profundidad) para resaltarlo.
export type TopologyNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: number;
  openTickets: number;
  isRoot: boolean;
  impacted: boolean; // caería si el root falla (dependiente del root)
};
export type TopologyEdge = { id: string; source: string; target: string };
export type Topology = {
  rootId: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
};

export async function getTopology(
  ctx: Ctx,
  ciId: string,
  depth = 2,
): Promise<Topology> {
  assertCan(ctx, "cmdb:read");
  const root = await prisma.configurationItem.findUnique({ where: { id: ciId } });
  if (!root) throw new NotFoundError("CI no encontrado");

  const nodeIds = new Set<string>([ciId]);
  const edges = new Map<string, TopologyEdge>();

  // Expande el vecindario alternando ambas direcciones, nivel a nivel.
  let frontier = new Set<string>([ciId]);
  try {
    for (let d = 0; d < depth && frontier.size > 0; d++) {
      const ids = [...frontier];
      const links = await prisma.ciDependency.findMany({
        where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] },
        select: { id: true, sourceId: true, targetId: true },
      });
      const next = new Set<string>();
      for (const l of links) {
        edges.set(l.id, { id: l.id, source: l.sourceId, target: l.targetId });
        for (const id of [l.sourceId, l.targetId]) {
          if (!nodeIds.has(id)) next.add(id);
          nodeIds.add(id);
        }
      }
      frontier = next;
    }
  } catch (e) {
    throw mapPrismaError(e);
  }

  // Conjunto de impacto: dependientes del root a cualquier profundidad
  // (source ← target), para el resaltado en rojo.
  const impacted = new Set<string>();
  let imp = [ciId];
  while (imp.length > 0) {
    const up = await prisma.ciDependency.findMany({
      where: { targetId: { in: imp } },
      select: { sourceId: true },
    });
    const nxt = up
      .map((e) => e.sourceId)
      .filter((id) => !impacted.has(id) && id !== ciId);
    nxt.forEach((id) => impacted.add(id));
    imp = nxt;
  }

  const cis = await prisma.configurationItem.findMany({
    where: { id: { in: [...nodeIds] } },
    include: { _count: { select: { tickets: true } } },
  });

  const nodes: TopologyNode[] = cis.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    criticality: c.criticality,
    openTickets: c._count.tickets,
    isRoot: c.id === ciId,
    impacted: impacted.has(c.id),
  }));

  // Solo conservamos aristas cuyos dos extremos están en el vecindario.
  const edgeList = [...edges.values()].filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { rootId: ciId, nodes, edges: edgeList };
}
