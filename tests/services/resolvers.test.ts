import { describe, it, expect, beforeEach } from "vitest";
import { resolveCi } from "@/lib/services/cmdb";
import { resolveTicketId } from "@/lib/services/tickets";
import { resolveAssignable } from "@/lib/services/users";
import { ForbiddenError } from "@/lib/services/errors";
import { resetDb, ctxFor, mkCi, mkUser, mkTicket } from "../helpers/db";

// Los resolutores traducen lenguaje natural (nombre de CI, ref de ticket,
// email/nombre de técnico) a entidades. Los usan el MCP y la web por igual.
describe("resolveCi", () => {
  beforeEach(() => resetDb());

  it("resuelve por id exacto", async () => {
    const ci = await mkCi({ name: "fra1-esxi-01" });
    expect((await resolveCi(ctxFor("AGENT"), ci.id))?.id).toBe(ci.id);
  });

  it("resuelve por nombre parcial sin distinguir mayúsculas", async () => {
    const ci = await mkCi({ name: "fra1-esxi-01" });
    expect((await resolveCi(ctxFor("AGENT"), "ESXI-01"))?.id).toBe(ci.id);
  });

  it("ante varios nombres coincidentes prefiere el más crítico", async () => {
    await mkCi({ name: "db-replica", criticality: 2 });
    const main = await mkCi({ name: "db-main", criticality: 5 });
    expect((await resolveCi(ctxFor("AGENT"), "db"))?.id).toBe(main.id);
  });

  it("devuelve null si no hay coincidencia", async () => {
    expect(await resolveCi(ctxFor("AGENT"), "no-existe")).toBeNull();
  });

  it("exige cmdb:read", async () => {
    await expect(resolveCi(ctxFor("REQUESTER"), "x")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("resolveTicketId", () => {
  beforeEach(() => resetDb());

  it("resuelve por ref normalizando a mayúsculas", async () => {
    const t = await mkTicket({ ref: "INC-0042" });
    expect(await resolveTicketId("inc-0042")).toBe(t.id);
  });

  it("resuelve por id", async () => {
    const t = await mkTicket({ ref: "REQ-0001" });
    expect(await resolveTicketId(t.id)).toBe(t.id);
  });

  it("devuelve null si no existe", async () => {
    expect(await resolveTicketId("INC-9999")).toBeNull();
  });
});

describe("resolveAssignable", () => {
  beforeEach(() => resetDb());

  it("encuentra un técnico por email (case-insensitive)", async () => {
    const u = await mkUser({ email: "redes@nexo.dev", role: "AGENT" });
    expect((await resolveAssignable(ctxFor("MANAGER"), "REDES@NEXO.DEV"))?.id).toBe(
      u.id,
    );
  });

  it("encuentra por nombre parcial", async () => {
    const u = await mkUser({ name: "Nuria Redes", role: "AGENT" });
    expect((await resolveAssignable(ctxFor("MANAGER"), "Nuria"))?.id).toBe(u.id);
  });

  it("no resuelve a un REQUESTER (no es asignable)", async () => {
    await mkUser({ name: "Rita Cliente", role: "REQUESTER" });
    expect(await resolveAssignable(ctxFor("MANAGER"), "Rita")).toBeNull();
  });

  it("exige ticket:triage", async () => {
    await expect(
      resolveAssignable(ctxFor("REQUESTER"), "x"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
