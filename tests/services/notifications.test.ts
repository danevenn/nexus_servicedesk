import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  emitNotifications,
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notificationTitle,
} from "@/lib/services/notifications";
import { triageTicket, updateTicketStatus, addWorkNote } from "@/lib/services/tickets";
import { resetDb, ctxFor, mkTicket, mkUser } from "../helpers/db";

beforeEach(resetDb);

describe("emisión de notificaciones", () => {
  it("compone títulos en español por tipo", () => {
    expect(notificationTitle("ASSIGNED", "INC-0001")).toContain("INC-0001");
    expect(notificationTitle("RESOLVED", "INC-0002")).toContain("resuelto");
  });

  it("excluye al propio actor y deduplica destinatarios", async () => {
    const t = await mkTicket();
    const actor = await mkUser({ role: "AGENT" });
    const other = await mkUser({ role: "AGENT" });
    await emitNotifications({
      ctx: ctxFor("AGENT", actor.id),
      recipientIds: [actor.id, other.id, other.id, null],
      kind: "WORK_NOTE",
      ticketId: t.id,
      ticketRef: t.ref,
    });
    const all = await prisma.notification.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].recipientId).toBe(other.id);
  });

  it("triageTicket notifica ASSIGNED al técnico asignado", async () => {
    const tech = await mkUser({ role: "AGENT" });
    const ticket = await mkTicket();
    await triageTicket(
      { ticketId: ticket.id, assigneeId: tech.id },
      ctxFor("MANAGER", "mgr-1"),
    );
    const notifs = await prisma.notification.findMany({ where: { recipientId: tech.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].kind).toBe("ASSIGNED");
  });

  it("updateTicketStatus avisa al solicitante (RESOLVED al resolver)", async () => {
    const requester = await mkUser({ role: "REQUESTER" });
    const ticket = await mkTicket({ requesterId: requester.id });
    await updateTicketStatus(
      { ticketId: ticket.id, status: "RESOLVED", resolutionNotes: "ok", resolutionCode: "Resuelto" },
      ctxFor("AGENT", "agent-1"),
    );
    const notifs = await prisma.notification.findMany({ where: { recipientId: requester.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].kind).toBe("RESOLVED");
  });

  it("addWorkNote avisa a la contraparte, no al autor", async () => {
    const requester = await mkUser({ role: "REQUESTER" });
    const agent = await mkUser({ role: "AGENT" });
    const ticket = await mkTicket({ requesterId: requester.id });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { assigneeId: agent.id } });

    // El técnico escribe → notifica al solicitante (y no a sí mismo).
    await addWorkNote({ ticketId: ticket.id, text: "avance" }, ctxFor("AGENT", agent.id));
    const toRequester = await prisma.notification.findMany({ where: { recipientId: requester.id } });
    const toAgent = await prisma.notification.findMany({ where: { recipientId: agent.id } });
    expect(toRequester).toHaveLength(1);
    expect(toAgent).toHaveLength(0);
  });
});

describe("lectura/mutación acotada al propio actor", () => {
  it("cuenta solo las no leídas del destinatario", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const t = await mkTicket();
    await emitNotifications({ ctx: ctxFor("AGENT", "x"), recipientIds: [a.id, b.id], kind: "ASSIGNED", ticketId: t.id, ticketRef: t.ref });

    expect(await countUnreadNotifications(ctxFor("AGENT", a.id))).toBe(1);
    expect(await countUnreadNotifications(ctxFor("AGENT", b.id))).toBe(1);
  });

  it("marcar leída solo afecta a la propia (no la de otro)", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const t = await mkTicket();
    await emitNotifications({ ctx: ctxFor("AGENT", "x"), recipientIds: [a.id, b.id], kind: "ASSIGNED", ticketId: t.id, ticketRef: t.ref });
    const aNotif = (await listNotifications(ctxFor("AGENT", a.id)))[0];

    // b intenta marcar leída la de a: no debe cambiar nada.
    const stillUnread = await markNotificationRead(ctxFor("AGENT", b.id), aNotif.id);
    expect(stillUnread).toBe(1); // la de b sigue sin leer
    expect(await countUnreadNotifications(ctxFor("AGENT", a.id))).toBe(1); // la de a intacta

    // a marca la suya.
    const after = await markNotificationRead(ctxFor("AGENT", a.id), aNotif.id);
    expect(after).toBe(0);
  });

  it("marcar todas pone el contador a cero", async () => {
    const a = await mkUser();
    const t = await mkTicket();
    await emitNotifications({ ctx: ctxFor("AGENT", "x"), recipientIds: [a.id], kind: "ASSIGNED", ticketId: t.id, ticketRef: t.ref });
    await emitNotifications({ ctx: ctxFor("AGENT", "y"), recipientIds: [a.id], kind: "WORK_NOTE", ticketId: t.id, ticketRef: t.ref });
    expect(await countUnreadNotifications(ctxFor("AGENT", a.id))).toBe(2);
    await markAllNotificationsRead(ctxFor("AGENT", a.id));
    expect(await countUnreadNotifications(ctxFor("AGENT", a.id))).toBe(0);
  });
});
