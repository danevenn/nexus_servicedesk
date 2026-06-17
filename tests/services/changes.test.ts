import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestApprovals, decideApproval } from "@/lib/services/changes";
import { updateTicketStatus } from "@/lib/services/tickets";
import { aggregateApprovalState } from "@/lib/services/itil-domain";
import { ForbiddenError, ValidationError } from "@/lib/services/errors";
import { ApprovalState, ApprovalDecision } from "@/generated/prisma/enums";
import { resetDb, ctxFor, mkTicket, mkUser } from "../helpers/db";

beforeEach(resetDb);

describe("aggregateApprovalState (dominio puro)", () => {
  it("sin votos → NOT_REQUESTED", () => {
    expect(aggregateApprovalState([])).toBe(ApprovalState.NOT_REQUESTED);
  });
  it("con algún pendiente → PENDING", () => {
    expect(
      aggregateApprovalState([ApprovalDecision.PENDING, ApprovalDecision.APPROVED]),
    ).toBe(ApprovalState.PENDING);
  });
  it("todos aprobados → APPROVED", () => {
    expect(
      aggregateApprovalState([ApprovalDecision.APPROVED, ApprovalDecision.APPROVED]),
    ).toBe(ApprovalState.APPROVED);
  });
  it("un rechazo tumba el cambio → REJECTED", () => {
    expect(
      aggregateApprovalState([ApprovalDecision.APPROVED, ApprovalDecision.REJECTED]),
    ).toBe(ApprovalState.REJECTED);
  });
});

describe("flujo de aprobación del CAB", () => {
  it("solicita aprobación a mánagers y deja el cambio PENDING", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    const m2 = await mkUser({ role: "MANAGER" });

    await requestApprovals(
      { ticketId: change.id, approverIds: [m1.id, m2.id] },
      ctxFor("AGENT"),
    );

    const t = await prisma.ticket.findUnique({
      where: { id: change.id },
      select: { approvalState: true },
    });
    expect(t?.approvalState).toBe("PENDING");
    const votes = await prisma.changeApproval.count({ where: { ticketId: change.id } });
    expect(votes).toBe(2);
  });

  it("rechaza aprobadores que no son mánager/admin", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const agent = await mkUser({ role: "AGENT" });
    await expect(
      requestApprovals(
        { ticketId: change.id, approverIds: [agent.id] },
        ctxFor("AGENT"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("exige que el ticket sea un cambio", async () => {
    const inc = await mkTicket({ ref: "INC-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    await expect(
      requestApprovals(
        { ticketId: inc.id, approverIds: [m1.id] },
        ctxFor("AGENT"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("se aprueba solo cuando TODOS los aprobadores votan a favor", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    const m2 = await mkUser({ role: "MANAGER" });
    await requestApprovals(
      { ticketId: change.id, approverIds: [m1.id, m2.id] },
      ctxFor("AGENT"),
    );

    await decideApproval(
      { ticketId: change.id, decision: "APPROVED" },
      ctxFor("MANAGER", m1.id),
    );
    let t = await prisma.ticket.findUnique({
      where: { id: change.id },
      select: { approvalState: true },
    });
    expect(t?.approvalState).toBe("PENDING"); // falta m2

    await decideApproval(
      { ticketId: change.id, decision: "APPROVED" },
      ctxFor("MANAGER", m2.id),
    );
    t = await prisma.ticket.findUnique({
      where: { id: change.id },
      select: { approvalState: true },
    });
    expect(t?.approvalState).toBe("APPROVED");
  });

  it("un único rechazo deja el cambio en REJECTED", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    const m2 = await mkUser({ role: "MANAGER" });
    await requestApprovals(
      { ticketId: change.id, approverIds: [m1.id, m2.id] },
      ctxFor("AGENT"),
    );

    await decideApproval(
      { ticketId: change.id, decision: "REJECTED", comment: "Riesgo no mitigado" },
      ctxFor("MANAGER", m1.id),
    );
    const t = await prisma.ticket.findUnique({
      where: { id: change.id },
      select: { approvalState: true },
    });
    expect(t?.approvalState).toBe("REJECTED");
  });

  it("solo puede votar un aprobador designado", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    const outsider = await mkUser({ role: "MANAGER" });
    await requestApprovals(
      { ticketId: change.id, approverIds: [m1.id] },
      ctxFor("AGENT"),
    );
    await expect(
      decideApproval(
        { ticketId: change.id, decision: "APPROVED" },
        ctxFor("MANAGER", outsider.id),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deniega votar a quien no tiene change:approve", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    const m1 = await mkUser({ role: "MANAGER" });
    await requestApprovals(
      { ticketId: change.id, approverIds: [m1.id] },
      ctxFor("AGENT"),
    );
    await expect(
      decideApproval(
        { ticketId: change.id, decision: "APPROVED" },
        ctxFor("AGENT", m1.id),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("gating de estado del cambio", () => {
  it("bloquea pasar un cambio a IN_PROGRESS sin aprobación", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    await expect(
      updateTicketStatus(
        { ticketId: change.id, status: "IN_PROGRESS" },
        ctxFor("AGENT"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("permite implementar el cambio una vez aprobado", async () => {
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    await prisma.ticket.update({
      where: { id: change.id },
      data: { approvalState: "APPROVED" },
    });
    await updateTicketStatus(
      { ticketId: change.id, status: "IN_PROGRESS" },
      ctxFor("AGENT"),
    );
    const t = await prisma.ticket.findUnique({
      where: { id: change.id },
      select: { status: true },
    });
    expect(t?.status).toBe("IN_PROGRESS");
  });
});
