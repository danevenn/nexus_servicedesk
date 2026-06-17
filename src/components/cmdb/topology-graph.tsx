"use client";

import { useMemo, useSyncExternalStore, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import type { Topology, TopologyNode } from "@/lib/services/cmdb";
import { SEMANTIC_COLOR } from "@/lib/chart-colors";
import { CI_TYPE_LABEL } from "@/lib/labels";

const NODE_W = 184;
const NODE_H = 68;
const IMPACT_COLOR = "#ef4444"; // rojo: blast radius

// Render solo en cliente (React Flow mide el contenedor). Mismo patrón que las
// gráficas para no hidratar en SSR con dimensiones a 0.
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

// ── Nodo personalizado: tarjeta con estado, tipo, criticidad y tickets ──
function CiNode({ data }: NodeProps) {
  const d = data as unknown as TopologyNode;
  const color = SEMANTIC_COLOR[d.status] ?? "#64748b";
  const ring = d.isRoot
    ? "ring-2 ring-primary"
    : d.impacted
      ? "ring-2 ring-red-500"
      : "ring-1 ring-border";
  return (
    <div
      className={`rounded-md border bg-card px-3 py-2 shadow-sm ${ring}`}
      style={{ width: NODE_W, height: NODE_H, borderLeft: `4px solid ${color}` }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={d.name}>
          {d.name}
        </span>
        {d.isRoot && (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            CI
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">
          {CI_TYPE_LABEL[d.type as keyof typeof CI_TYPE_LABEL] ?? d.type}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="tabular-nums" title="Criticidad">
            c{d.criticality}
          </span>
          {d.openTickets > 0 && (
            <span
              className="rounded-full bg-amber-500/15 px-1.5 text-amber-700 tabular-nums dark:text-amber-400"
              title="Tickets"
            >
              {d.openTickets}
            </span>
          )}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { ci: CiNode };

// Layout jerárquico (Dagre, top-down): dependientes arriba, dependencias abajo.
function laidOut(topo: Topology): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 64, nodesep: 28 });
  topo.nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  topo.edges.forEach((e) => g.setEdge(e.source, e.target));
  Dagre.layout(g);

  const byId = new Map(topo.nodes.map((n) => [n.id, n]));
  const nodes: Node[] = topo.nodes.map((n) => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "ci",
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: n as unknown as Record<string, unknown>,
    };
  });

  const edges: Edge[] = topo.edges.map((e) => {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    // Arista de impacto: un dependiente afectado apunta a algo que falla.
    const onImpactPath = !!src?.impacted && (!!tgt?.impacted || !!tgt?.isRoot);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      animated: onImpactPath,
      style: onImpactPath ? { stroke: IMPACT_COLOR, strokeWidth: 2 } : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: onImpactPath ? IMPACT_COLOR : undefined,
      },
    };
  });

  return { nodes, edges };
}

export function TopologyGraph({ topology }: { topology: Topology }) {
  const router = useRouter();
  const mounted = useMounted();
  const { nodes, edges } = useMemo(() => laidOut(topology), [topology]);

  if (topology.nodes.length <= 1) {
    return (
      <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
        Este CI no tiene dependencias registradas.
      </p>
    );
  }

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-md border bg-muted/20">
      {mounted && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_: MouseEvent, node: Node) => {
            if (node.id !== topology.rootId) router.push(`/cmdb/${node.id}`);
          }}
        >
          <Background gap={16} className="!bg-transparent" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
      )}
    </div>
  );
}
