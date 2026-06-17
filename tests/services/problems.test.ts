import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  linkIncidents,
  unlinkIncident,
  setKnownError,
  listLinkableIncidents,
} from "@/lib/services/problems";
import { ForbiddenError, ValidationError } from "@/lib/services/errors";
import { resetDb, ctxFor, mkTicket } from "../helpers/db";

beforeEach(resetDb);

describe("gestión de problemas", () => {
  it("vincula incidencias a un problema y deja rastro de auditoría", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    const inc1 = await mkTicket({ ref: "INC-0001" });
    const inc2 = await mkTicket({ ref: "INC-0002" });

    const res = await linkIncidents(
      { problemId: problem.id, incidentIds: [inc1.id, inc2.id] },
      ctxFor("AGENT"),
    );
    expect(res.linked).toBe(2);

    const linked = await prisma.ticket.findMany({
      where: { problemId: problem.id },
      select: { id: true },
    });
    expect(linked.map((t) => t.id).sort()).toEqual([inc1.id, inc2.id].sort());

    const events = await prisma.ticketEvent.findMany({
      where: { action: "linked_to_problem" },
    });
    expect(events).toHaveLength(2);
  });

  it("rechaza vincular algo que no es una incidencia", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    const change = await mkTicket({ kind: "CHANGE", ref: "CHG-0001" });
    await expect(
      linkIncidents(
        { problemId: problem.id, incidentIds: [change.id] },
        ctxFor("AGENT"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("exige que el destino sea un problema", async () => {
    const notProblem = await mkTicket({ ref: "INC-0001" });
    const inc = await mkTicket({ ref: "INC-0002" });
    await expect(
      linkIncidents(
        { problemId: notProblem.id, incidentIds: [inc.id] },
        ctxFor("AGENT"),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("deniega la vinculación a roles sin ticket:update", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    const inc = await mkTicket({ ref: "INC-0001" });
    await expect(
      linkIncidents(
        { problemId: problem.id, incidentIds: [inc.id] },
        ctxFor("VIEWER"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("desvincula una incidencia de su problema", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    const inc = await mkTicket({ ref: "INC-0001" });
    await linkIncidents(
      { problemId: problem.id, incidentIds: [inc.id] },
      ctxFor("AGENT"),
    );

    await unlinkIncident({ incidentId: inc.id }, ctxFor("AGENT"));
    const after = await prisma.ticket.findUnique({
      where: { id: inc.id },
      select: { problemId: true },
    });
    expect(after?.problemId).toBeNull();
  });

  it("documenta el known error (causa raíz + workaround)", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    await setKnownError(
      {
        problemId: problem.id,
        rootCause: "Fuga de conexiones",
        workaround: "Reciclar el pool cada 6h",
      },
      ctxFor("AGENT"),
    );
    const after = await prisma.ticket.findUnique({
      where: { id: problem.id },
      select: { rootCause: true, workaround: true },
    });
    expect(after?.rootCause).toBe("Fuga de conexiones");
    expect(after?.workaround).toBe("Reciclar el pool cada 6h");
  });

  it("solo lista incidencias libres como candidatas a vincular", async () => {
    const problem = await mkTicket({ kind: "PROBLEM", ref: "PRB-0001" });
    const free = await mkTicket({ ref: "INC-0001" });
    const taken = await mkTicket({ ref: "INC-0002" });
    await mkTicket({ kind: "CHANGE", ref: "CHG-0001" }); // no es incidencia
    await linkIncidents(
      { problemId: problem.id, incidentIds: [taken.id] },
      ctxFor("AGENT"),
    );

    const candidates = await listLinkableIncidents(ctxFor("AGENT"));
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(free.id);
    expect(ids).not.toContain(taken.id);
  });
});
