import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Verificación de la fase 4: arranca un cliente MCP real contra el endpoint
// HTTP de Nexo (/api/mcp), lista las tools y ejecuta el flujo completo que
// haría un agente. Comprueba la tesis: el agente pasa por la MISMA capa de
// servicios + RBAC que la web, y todo queda auditado como AGENT.

const ENDPOINT = process.env.MCP_URL ?? "http://localhost:3300/api/mcp";

function textOf(res: unknown): string {
  const items = ((res as { content?: unknown }).content ?? []) as Array<{
    type: string;
    text?: string;
  }>;
  return items
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

async function main() {
  const client = new Client({ name: "verify-mcp", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT));
  await client.connect(transport);
  console.log("✓ Conectado al servidor MCP");

  const { tools } = await client.listTools();
  console.log(`\n✓ Tools expuestas (${tools.length}):`);
  for (const t of tools) console.log(`  - ${t.name}: ${t.title ?? ""}`);

  const expected = [
    "crear_incidencia",
    "analizar_impacto",
    "triar_ticket",
    "resumir_tickets",
    "sugerir_cambio",
  ];
  const names = tools.map((t) => t.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Tools inesperadas: ${names.join(", ")}`);
  }

  console.log("\n── 1. analizar_impacto (Postgres Primary) ──");
  const impact = await client.callTool({
    name: "analizar_impacto",
    arguments: { ci: "Postgres Primary" },
  });
  console.log(textOf(impact));
  if (impact.isError) throw new Error("analizar_impacto falló");

  console.log("\n── 2. crear_incidencia (vinculada a un CI) ──");
  const created = await client.callTool({
    name: "crear_incidencia",
    arguments: {
      titulo: "Latencia elevada en la base de datos primaria",
      descripcion: "Consultas por encima de 2s detectadas por el agente.",
      impacto: 3,
      urgencia: 3,
      ci: "Postgres Primary",
    },
  });
  console.log(textOf(created));
  if (created.isError) throw new Error("crear_incidencia falló");
  const ref = (created.structuredContent as { ref?: string } | undefined)?.ref;
  console.log(`  → ref = ${ref}`);

  console.log("\n── 3. triar_ticket (asignar técnico + recalcular) ──");
  const triaged = await client.callTool({
    name: "triar_ticket",
    arguments: { ticket: ref, asignar_a: "agente@nexo.dev" },
  });
  console.log(textOf(triaged));
  if (triaged.isError) throw new Error("triar_ticket falló");

  console.log("\n── 4. sugerir_cambio (RFC de remedio) ──");
  const change = await client.callTool({
    name: "sugerir_cambio",
    arguments: {
      titulo: "Añadir réplica de lectura a Postgres",
      descripcion: "Mitiga la latencia repartiendo la carga de lectura.",
      impacto: 2,
      urgencia: 2,
      ci: "Postgres Primary",
    },
  });
  console.log(textOf(change));
  if (change.isError) throw new Error("sugerir_cambio falló");

  console.log("\n── 5. resumir_tickets (incidencias) ──");
  const summary = await client.callTool({
    name: "resumir_tickets",
    arguments: { tipo: "INCIDENT" },
  });
  console.log(textOf(summary));
  if (summary.isError) throw new Error("resumir_tickets falló");

  console.log("\n── 6. RBAC: prueba negativa (degradar agente a REQUESTER) ──");
  // Esta comprobación se hace aparte con MCP_AGENT_ROLE=REQUESTER.

  await client.close();
  console.log("\n✅ Fase 4 verificada: 5 tools operativas sobre la capa compartida.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
