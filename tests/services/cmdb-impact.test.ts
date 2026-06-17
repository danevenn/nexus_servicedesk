import { describe, it, expect, beforeEach } from "vitest";
import { getDownstreamImpact } from "@/lib/services/cmdb";
import { ForbiddenError } from "@/lib/services/errors";
import { resetDb, ctxFor, mkCi, dependsOn } from "../helpers/db";

// Grafo de prueba (source depende de target):
//   app  ──▶ server ──▶ db
//   web  ──▶ server
// Si cae `db`, impacta server, app y web (transitivo). Si cae `server`, impacta app y web.
describe("getDownstreamImpact — BFS sobre el grafo de CMDB", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("propaga el impacto de forma transitiva aguas arriba", async () => {
    const db = await mkCi({ name: "db", criticality: 5 });
    const server = await mkCi({ name: "server", criticality: 4 });
    const app = await mkCi({ name: "app", criticality: 2 });
    const web = await mkCi({ name: "web", criticality: 3 });
    await dependsOn(server.id, db.id);
    await dependsOn(app.id, server.id);
    await dependsOn(web.id, server.id);

    const { root, impacted } = await getDownstreamImpact(ctxFor("AGENT"), db.id);

    expect(root.id).toBe(db.id);
    expect(impacted.map((c) => c.name).sort()).toEqual(["app", "server", "web"]);
    // El root nunca se incluye a sí mismo.
    expect(impacted.find((c) => c.id === db.id)).toBeUndefined();
    // Orden por criticidad desc (server=4 antes que web=3 antes que app=2).
    expect(impacted.map((c) => c.name)).toEqual(["server", "web", "app"]);
  });

  it("una hoja sin dependientes no impacta a nadie", async () => {
    const db = await mkCi({ name: "db" });
    const app = await mkCi({ name: "app" });
    await dependsOn(app.id, db.id);

    const { impacted } = await getDownstreamImpact(ctxFor("AGENT"), app.id);
    expect(impacted).toHaveLength(0);
  });

  it("no entra en bucle infinito con dependencias cíclicas", async () => {
    const a = await mkCi({ name: "a" });
    const b = await mkCi({ name: "b" });
    await dependsOn(a.id, b.id);
    await dependsOn(b.id, a.id);

    const { impacted } = await getDownstreamImpact(ctxFor("AGENT"), a.id);
    expect(impacted.map((c) => c.name)).toEqual(["b"]);
  });

  it("exige permiso cmdb:read (REQUESTER no puede)", async () => {
    const ci = await mkCi({ name: "x" });
    await expect(
      getDownstreamImpact(ctxFor("REQUESTER"), ci.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
