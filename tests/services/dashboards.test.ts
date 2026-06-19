import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, ctxFor, mkUser } from "../helpers/db";
import { prisma } from "@/lib/prisma";
import {
  ensureDefaultDashboard,
  listDashboards,
} from "@/lib/services/dashboards";

describe("ensureDefaultDashboard", () => {
  beforeEach(resetDb);

  it("crea exactamente un dashboard por defecto para un usuario nuevo", async () => {
    const u = await mkUser({ role: "AGENT" });
    const ctx = ctxFor("AGENT", u.id);

    await ensureDefaultDashboard(ctx);

    const ds = await listDashboards(ctx);
    expect(ds).toHaveLength(1);
    expect(ds[0].name).toBe("General");
    expect(ds[0].isDefault).toBe(true);
    expect(ds[0].widgets.length).toBeGreaterThan(0);
  });

  it("colapsa defaults duplicados conservando el más antiguo", async () => {
    const u = await mkUser({ role: "AGENT" });
    const ctx = ctxFor("AGENT", u.id);
    // Simula el artefacto de la carrera: dos "General" (isDefault=true).
    const first = await prisma.dashboard.create({
      data: {
        name: "General",
        ownerId: u.id,
        isDefault: true,
        position: 0,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await prisma.dashboard.create({
      data: {
        name: "General",
        ownerId: u.id,
        isDefault: true,
        position: 0,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    });

    await ensureDefaultDashboard(ctx);

    const ds = await listDashboards(ctx);
    expect(ds).toHaveLength(1);
    expect(ds[0].id).toBe(first.id); // conserva el más antiguo
  });

  it("no toca los dashboards que crea el usuario (isDefault=false)", async () => {
    const u = await mkUser({ role: "AGENT" });
    const ctx = ctxFor("AGENT", u.id);
    await prisma.dashboard.create({
      data: { name: "General", ownerId: u.id, isDefault: true, position: 0 },
    });
    await prisma.dashboard.create({
      data: { name: "Mi panel", ownerId: u.id, isDefault: false, position: 1 },
    });

    await ensureDefaultDashboard(ctx);

    const ds = await listDashboards(ctx);
    expect(ds).toHaveLength(2);
  });
});
