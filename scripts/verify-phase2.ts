import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createTicket, triageTicket, updateTicketStatus, queryTickets } from "../src/lib/services/tickets";
import { listCis, getDownstreamImpact } from "../src/lib/services/cmdb";
import type { Ctx } from "../src/lib/services/context";
import { ForbiddenError } from "../src/lib/services/errors";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}
async function expectForbidden(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "no lanzó ForbiddenError");
  } catch (e) {
    check(name, e instanceof ForbiddenError);
  }
}

async function main() {
  const agentUser = await prisma.user.findFirstOrThrow({ where: { role: "AGENT" } });
  const requesterUser = await prisma.user.findFirstOrThrow({ where: { role: "REQUESTER" } });
  const pgPrimary = await prisma.configurationItem.findFirstOrThrow({ where: { name: "Postgres Primary" } });

  const agent: Ctx = { actorKind: "USER", actorId: agentUser.id, role: "AGENT" };
  const requester: Ctx = { actorKind: "USER", actorId: requesterUser.id, role: "REQUESTER" };

  // 1) El solicitante abre una incidencia (impacto 3 × urgencia 3 → P1).
  const inc = await createTicket(
    { kind: "INCIDENT", title: "Verificación fase 2", description: "ticket de prueba", impact: 3, urgency: 3 },
    requester,
  );
  check("requester crea INCIDENT", inc.kind === "INCIDENT" && inc.requesterId === requesterUser.id);
  check("prioridad derivada P1 (3×3)", inc.priority === "P1", inc.priority);

  // 2) RBAC: el solicitante NO puede abrir un CHANGE ni triar.
  await expectForbidden("requester NO puede crear CHANGE", () =>
    createTicket({ kind: "CHANGE", title: "cambio prohibido", description: "x", impact: 1, urgency: 1 }, requester),
  );
  await expectForbidden("requester NO puede triar", () =>
    triageTicket({ ticketId: inc.id, assigneeId: agentUser.id }, requester),
  );
  await expectForbidden("requester NO puede leer la CMDB", () => listCis(requester));

  // 3) El técnico tría (asigna + estado) y cambia de estado → auditoría.
  const triaged = await triageTicket({ ticketId: inc.id, assigneeId: agentUser.id }, agent);
  check("agent tría: asignado y estado ASSIGNED", triaged.assigneeId === agentUser.id && triaged.status === "ASSIGNED");
  const progressed = await updateTicketStatus({ ticketId: inc.id, status: "IN_PROGRESS" }, agent);
  check("agent cambia estado a IN_PROGRESS", progressed.status === "IN_PROGRESS");

  const events = await prisma.ticketEvent.findMany({ where: { ticketId: inc.id }, orderBy: { createdAt: "asc" } });
  check("auditoría: 3 eventos (created, triaged, status_changed)", events.length === 3, events.map((e) => e.action).join(", "));
  check("eventos marcados como actor USER", events.every((e) => e.actorKind === "USER"));

  // 4) Scoping de lectura por rol.
  const reqView = await queryTickets({}, requester);
  check("requester solo ve sus tickets", reqView.every((t) => t.requesterId === requesterUser.id), `${reqView.length} tickets`);
  const agentView = await queryTickets({}, agent);
  const total = await prisma.ticket.count();
  check("agent ve todos los tickets", agentView.length === total, `${agentView.length}/${total}`);

  // 5) Análisis de impacto sobre el grafo (la lógica de la tool MCP).
  const impact = await getDownstreamImpact(agent, pgPrimary.id);
  check("impacto de 'Postgres Primary' = 7 CIs", impact.impacted.length === 7, impact.impacted.map((c) => c.name).join(", "));

  // Limpieza del ticket de prueba (cascade borra SLA y eventos).
  await prisma.ticket.delete({ where: { id: inc.id } });

  console.log(`\n${failures === 0 ? "✓ TODO OK" : `✗ ${failures} fallo(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("✗ Error inesperado:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
