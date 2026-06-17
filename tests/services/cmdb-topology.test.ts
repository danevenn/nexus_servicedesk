import { describe, it, expect, beforeEach } from "vitest";
import { getTopology } from "@/lib/services/cmdb";
import { ForbiddenError } from "@/lib/services/errors";
import { resetDb, ctxFor, mkCi, dependsOn } from "../helpers/db";

// Grafo (source depende de target):
//   app ──▶ server ──▶ db
//   web ──▶ server
describe("getTopology — vecindario de un CI para el grafo", () => {
  beforeEach(() => resetDb());

  async function buildGraph() {
    const db = await mkCi({ name: "db" });
    const server = await mkCi({ name: "server" });
    const app = await mkCi({ name: "app" });
    const web = await mkCi({ name: "web" });
    await dependsOn(server.id, db.id);
    await dependsOn(app.id, server.id);
    await dependsOn(web.id, server.id);
    return { db, server, app, web };
  }

  it("incluye nodos y aristas del vecindario y marca el root", async () => {
    const { server } = await buildGraph();
    const topo = await getTopology(ctxFor("AGENT"), server.id, 2);

    expect(topo.rootId).toBe(server.id);
    expect(topo.nodes.map((n) => n.name).sort()).toEqual([
      "app",
      "db",
      "server",
      "web",
    ]);
    expect(topo.edges).toHaveLength(3);
    expect(topo.nodes.find((n) => n.name === "server")?.isRoot).toBe(true);
  });

  it("marca como impactados solo los dependientes del root (no sus dependencias)", async () => {
    const { server } = await buildGraph();
    const topo = await getTopology(ctxFor("AGENT"), server.id, 2);
    const impacted = topo.nodes.filter((n) => n.impacted).map((n) => n.name).sort();
    // Caen si `server` falla: app y web. `db` es una dependencia, no cae.
    expect(impacted).toEqual(["app", "web"]);
    expect(topo.nodes.find((n) => n.name === "db")?.impacted).toBe(false);
    // El root nunca se marca a sí mismo como impactado.
    expect(topo.nodes.find((n) => n.isRoot)?.impacted).toBe(false);
  });

  it("respeta la profundidad (depth=1 solo vecinos inmediatos)", async () => {
    const { db } = await buildGraph();
    // Desde db con depth 1: solo server (su dependiente directo).
    const topo = await getTopology(ctxFor("AGENT"), db.id, 1);
    expect(topo.nodes.map((n) => n.name).sort()).toEqual(["db", "server"]);
  });

  it("incluye el recuento de tickets abiertos por nodo", async () => {
    const { server } = await buildGraph();
    const topo = await getTopology(ctxFor("AGENT"), server.id, 2);
    expect(topo.nodes.every((n) => typeof n.openTickets === "number")).toBe(true);
  });

  it("exige cmdb:read", async () => {
    const { server } = await buildGraph();
    await expect(
      getTopology(ctxFor("REQUESTER"), server.id, 2),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
