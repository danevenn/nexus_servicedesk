import { describe, it, expect, beforeEach } from "vitest";
import { createTicket, updateTicketStatus } from "@/lib/services/tickets";
import { prisma } from "@/lib/prisma";
import { resetDb, ctxFor, mkUser } from "../helpers/db";

// Flujo real de pausa de SLA a través de updateTicketStatus.
describe("SLA — pausa al pasar por ON_HOLD", () => {
  beforeEach(() => resetDb());

  async function p1TicketWithSla() {
    const user = await mkUser({ role: "AGENT" });
    const ctx = ctxFor("AGENT", user.id);
    // impacto 3 × urgencia 3 → P1 (24×7), con SLA creado por el servicio.
    const t = await createTicket(
      { kind: "INCIDENT", title: "caída total", description: "x", impact: 3, urgency: 3 },
      ctx,
    );
    return { ctx, ticketId: t.id };
  }

  it("entrar en ON_HOLD marca el inicio de pausa", async () => {
    const { ctx, ticketId } = await p1TicketWithSla();
    await updateTicketStatus({ ticketId, status: "ON_HOLD" }, ctx);
    const sla = await prisma.sla.findUnique({ where: { ticketId } });
    expect(sla?.onHoldSince).not.toBeNull();
  });

  it("salir de ON_HOLD desplaza el deadline y acumula el tiempo pausado", async () => {
    const { ctx, ticketId } = await p1TicketWithSla();
    const before = await prisma.sla.findUnique({ where: { ticketId } });

    await updateTicketStatus({ ticketId, status: "ON_HOLD" }, ctx);
    // Simulamos que la pausa empezó hace 2 horas.
    const twoHoursAgo = new Date(Date.now() - 120 * 60000);
    await prisma.sla.update({
      where: { ticketId },
      data: { onHoldSince: twoHoursAgo },
    });

    await updateTicketStatus({ ticketId, status: "IN_PROGRESS" }, ctx);
    const after = await prisma.sla.findUnique({ where: { ticketId } });

    expect(after?.onHoldSince).toBeNull();
    // P1 es 24×7 → reembolso = reloj ≈ 120 min (tolerancia por el tiempo de test).
    expect(after!.pausedMinutes).toBeGreaterThanOrEqual(119);
    const shift =
      (after!.resolveBy.getTime() - before!.resolveBy.getTime()) / 60000;
    expect(shift).toBeGreaterThanOrEqual(119);
    expect(shift).toBeLessThanOrEqual(121);
  });

  it("no acumula pausa en transiciones que no tocan ON_HOLD", async () => {
    const { ctx, ticketId } = await p1TicketWithSla();
    await updateTicketStatus({ ticketId, status: "ASSIGNED" }, ctx);
    const sla = await prisma.sla.findUnique({ where: { ticketId } });
    expect(sla?.pausedMinutes).toBe(0);
    expect(sla?.onHoldSince).toBeNull();
  });
});
