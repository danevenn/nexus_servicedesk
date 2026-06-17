import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getAgentCtx } from "@/lib/mcp/agent-context";
import {
  createTicket,
  triageTicket,
  queryTickets,
  resolveTicketId,
} from "@/lib/services/tickets";
import { getDownstreamImpact, resolveCi } from "@/lib/services/cmdb";
import { resolveAssignable } from "@/lib/services/users";
import { ServiceError } from "@/lib/services/errors";
import { KIND_LABEL, STATUS_LABEL, CI_STATUS_LABEL } from "@/lib/labels";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────
//  Servidor MCP de Nexo.
//
//  TESIS DEL PROYECTO: este endpoint y la interfaz web comparten EXACTAMENTE
//  la misma capa de servicios (validación zod + RBAC por rol + lógica de
//  negocio). El agente nunca toca la BD directamente: cada tool construye el
//  `Ctx` del agente (cuenta de servicio, `actorKind: AGENT`) y llama a las
//  mismas funciones que las Server Actions de la web. Toda acción queda
//  registrada como `TicketEvent` con `actorKind: AGENT` — auditable y
//  reversible desde la propia UI.
// ─────────────────────────────────────────────────────────────────────────

const LEVEL = z
  .number()
  .int()
  .min(1)
  .max(3)
  .describe("1 = bajo · 2 = medio · 3 = alto");

// Traduce cualquier error en una respuesta MCP de error legible (sin filtrar
// internals). Los ServiceError ya traen mensaje y código de dominio.
function fail(e: unknown) {
  const msg =
    e instanceof ServiceError
      ? `${e.message} (${e.code})`
      : "Error interno al ejecutar la herramienta";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `❌ ${msg}` }],
  };
}

function ok(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

const handler = createMcpHandler(
  (server) => {
    // ── 1. crear_incidencia ────────────────────────────────────────────
    server.registerTool(
      "crear_incidencia",
      {
        title: "Crear incidencia",
        description:
          "Abre una INCIDENCIA en Nexo. La prioridad (P1–P4) se deriva del " +
          "impacto × urgencia. Si indicas un CI afectado (por nombre, p.ej. " +
          "'Postgres Primary'), queda vinculado. Devuelve la referencia y el SLA.",
        inputSchema: {
          titulo: z.string().min(3).max(160).describe("Título breve del problema"),
          descripcion: z.string().min(1).max(5000).describe("Detalle de la incidencia"),
          impacto: LEVEL,
          urgencia: LEVEL,
          ci: z
            .string()
            .optional()
            .describe("Nombre o id del Configuration Item afectado (opcional)"),
        },
      },
      async ({ titulo, descripcion, impacto, urgencia, ci }) => {
        try {
          const ctx = await getAgentCtx();
          let ciId: string | undefined;
          if (ci) {
            const found = await resolveCi(ctx, ci);
            if (!found) return fail(new ServiceError(`No encontré ningún CI que coincida con "${ci}"`, 404, "NOT_FOUND"));
            ciId = found.id;
          }
          const ticket = await createTicket(
            { kind: "INCIDENT", title: titulo, description: descripcion, impact: impacto, urgency: urgencia, ciId },
            ctx,
          );
          return ok(
            `✅ Incidencia creada: ${ticket.ref} · prioridad ${ticket.priority}` +
              (ciId ? ` · CI vinculado` : ""),
            { ref: ticket.ref, id: ticket.id, priority: ticket.priority, status: ticket.status },
          );
        } catch (e) {
          return fail(e);
        }
      },
    );

    // ── 2. analizar_impacto ────────────────────────────────────────────
    server.registerTool(
      "analizar_impacto",
      {
        title: "Analizar impacto",
        description:
          "Análisis de impacto aguas abajo sobre la CMDB: dado un CI (por " +
          "nombre o id), recorre el grafo de dependencias y devuelve qué otros " +
          "CIs se verían afectados si este falla. La herramienta estrella para " +
          "causa raíz y evaluación de cambios.",
        inputSchema: {
          ci: z.string().describe("Nombre o id del Configuration Item a analizar"),
        },
      },
      async ({ ci }) => {
        try {
          const ctx = await getAgentCtx();
          const found = await resolveCi(ctx, ci);
          if (!found) return fail(new ServiceError(`No encontré ningún CI que coincida con "${ci}"`, 404, "NOT_FOUND"));
          const { root, impacted } = await getDownstreamImpact(ctx, found.id);
          const lines = impacted.map(
            (c) => `  • ${c.name} (${CI_STATUS_LABEL[c.status]}, criticidad ${c.criticality})`,
          );
          const text =
            impacted.length === 0
              ? `🟢 ${root.name} no tiene CIs dependientes: un fallo aquí no se propaga aguas abajo.`
              : `⚠️ Si **${root.name}** falla, se verían afectados ${impacted.length} CI(s):\n${lines.join("\n")}`;
          return ok(text, {
            root: { id: root.id, name: root.name, criticality: root.criticality },
            impactedCount: impacted.length,
            impacted: impacted.map((c) => ({ id: c.id, name: c.name, status: c.status, criticality: c.criticality })),
          });
        } catch (e) {
          return fail(e);
        }
      },
    );

    // ── 3. triar_ticket ────────────────────────────────────────────────
    server.registerTool(
      "triar_ticket",
      {
        title: "Triar ticket",
        description:
          "Triaje de un ticket: asignar un técnico y/o recalcular la prioridad " +
          "ajustando impacto y urgencia. Identifica el ticket por su referencia " +
          "(p.ej. 'INC-0001') y el técnico por nombre o email.",
        inputSchema: {
          ticket: z.string().describe("Referencia del ticket (INC-0001) o id"),
          asignar_a: z
            .string()
            .optional()
            .describe("Nombre o email del técnico al que asignar (opcional)"),
          impacto: LEVEL.optional(),
          urgencia: LEVEL.optional(),
        },
      },
      async ({ ticket, asignar_a, impacto, urgencia }) => {
        try {
          const ctx = await getAgentCtx();
          const ticketId = await resolveTicketId(ticket);
          if (!ticketId) return fail(new ServiceError(`No encontré el ticket "${ticket}"`, 404, "NOT_FOUND"));
          let assigneeId: string | undefined;
          let assigneeName: string | undefined;
          if (asignar_a) {
            const tech = await resolveAssignable(ctx, asignar_a);
            if (!tech) return fail(new ServiceError(`No encontré ningún técnico que coincida con "${asignar_a}"`, 404, "NOT_FOUND"));
            assigneeId = tech.id;
            assigneeName = tech.name;
          }
          const updated = await triageTicket(
            { ticketId, assigneeId, impact: impacto, urgency: urgencia },
            ctx,
          );
          return ok(
            `✅ Ticket ${updated.ref} triado · prioridad ${updated.priority}` +
              (assigneeName ? ` · asignado a ${assigneeName}` : ""),
            { ref: updated.ref, priority: updated.priority, status: updated.status, assigneeId: updated.assigneeId },
          );
        } catch (e) {
          return fail(e);
        }
      },
    );

    // ── 4. resumir_tickets ─────────────────────────────────────────────
    server.registerTool(
      "resumir_tickets",
      {
        title: "Resumir tickets",
        description:
          "Resumen de la cola de tickets, con filtros opcionales por tipo y " +
          "estado. Devuelve recuentos por prioridad y la lista priorizada " +
          "(P1 primero). Útil para un parte de situación.",
        inputSchema: {
          tipo: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]).optional(),
          estado: z
            .enum(["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"])
            .optional(),
          limite: z.number().int().min(1).max(100).optional().describe("Máximo de tickets (def. 50)"),
        },
      },
      async ({ tipo, estado, limite }) => {
        try {
          const ctx = await getAgentCtx();
          const tickets = await queryTickets(
            { kind: tipo, status: estado, take: limite },
            ctx,
          );
          const byPriority = tickets.reduce<Record<string, number>>((acc, t) => {
            acc[t.priority] = (acc[t.priority] ?? 0) + 1;
            return acc;
          }, {});
          const dist = ["P1", "P2", "P3", "P4"]
            .filter((p) => byPriority[p])
            .map((p) => `${p}:${byPriority[p]}`)
            .join(" · ");
          const lines = tickets
            .slice(0, 25)
            .map(
              (t) =>
                `  ${t.ref} [${t.priority}] ${KIND_LABEL[t.kind]} · ${STATUS_LABEL[t.status]} — ${t.title}`,
            );
          const text =
            tickets.length === 0
              ? "No hay tickets que cumplan esos filtros."
              : `📊 ${tickets.length} ticket(s)${dist ? ` (${dist})` : ""}:\n${lines.join("\n")}` +
                (tickets.length > 25 ? `\n  …y ${tickets.length - 25} más` : "");
          return ok(text, {
            total: tickets.length,
            byPriority,
            tickets: tickets.map((t) => ({ ref: t.ref, kind: t.kind, status: t.status, priority: t.priority, title: t.title })),
          });
        } catch (e) {
          return fail(e);
        }
      },
    );

    // ── 5. sugerir_cambio ──────────────────────────────────────────────
    server.registerTool(
      "sugerir_cambio",
      {
        title: "Sugerir cambio",
        description:
          "Registra una propuesta de CAMBIO (RFC) en Nexo, normalmente como " +
          "remedio tras analizar un incidente o su impacto. Si indicas el CI " +
          "objetivo (por nombre), queda vinculado. Devuelve la referencia CHG.",
        inputSchema: {
          titulo: z.string().min(3).max(160).describe("Título del cambio propuesto"),
          descripcion: z
            .string()
            .min(1)
            .max(5000)
            .describe("Justificación y plan del cambio"),
          impacto: LEVEL,
          urgencia: LEVEL,
          ci: z.string().optional().describe("Nombre o id del CI objetivo (opcional)"),
        },
      },
      async ({ titulo, descripcion, impacto, urgencia, ci }) => {
        try {
          const ctx = await getAgentCtx();
          let ciId: string | undefined;
          if (ci) {
            const found = await resolveCi(ctx, ci);
            if (!found) return fail(new ServiceError(`No encontré ningún CI que coincida con "${ci}"`, 404, "NOT_FOUND"));
            ciId = found.id;
          }
          const ticket = await createTicket(
            { kind: "CHANGE", title: titulo, description: descripcion, impact: impacto, urgency: urgencia, ciId },
            ctx,
          );
          return ok(
            `✅ Cambio propuesto: ${ticket.ref} · prioridad ${ticket.priority}`,
            { ref: ticket.ref, id: ticket.id, priority: ticket.priority, status: ticket.status },
          );
        } catch (e) {
          return fail(e);
        }
      },
    );
  },
  {
    serverInfo: { name: "nexo-itsm", version: "1.0.0" },
    instructions:
      "Nexo es una mesa de servicio ITSM (CMDB + tickets ITIL + SLAs). Usa " +
      "analizar_impacto antes de proponer cambios, y triar_ticket para " +
      "priorizar/asignar. Todas tus acciones quedan auditadas como agente.",
  },
  {
    basePath: "/api",
    disableSse: true,
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

export { handler as GET, handler as POST, handler as DELETE };
