import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Prueba negativa de RBAC: con MCP_AGENT_ROLE=REQUESTER el agente solo debe
// poder crear incidencias. analizar_impacto (cmdb:read), triar_ticket
// (ticket:triage) y sugerir_cambio (change:create) deben ser RECHAZADAS por
// la MISMA capa de permisos que protege la web — no por código del MCP.

const ENDPOINT = process.env.MCP_URL ?? "http://localhost:3300/api/mcp";
const textOf = (r: unknown) =>
  (((r as { content?: unknown }).content ?? []) as Array<{ text?: string }>)
    .map((c) => c.text ?? "")
    .join("\n");

async function main() {
  const client = new Client({ name: "verify-rbac", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT)));

  let passed = 0;
  const mustFail = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const denied = r.isError && /FORBIDDEN/.test(textOf(r));
    console.log(`  ${denied ? "✓ DENEGADA" : "✗ NO denegada"} → ${name}: ${textOf(r)}`);
    if (denied) passed++;
    else throw new Error(`${name} debería haber sido denegada por RBAC`);
  };
  const mustPass = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    console.log(`  ${!r.isError ? "✓ PERMITIDA" : "✗ bloqueada"} → ${name}: ${textOf(r)}`);
    if (!r.isError) passed++;
    else throw new Error(`${name} debería haber sido permitida`);
  };

  console.log("RBAC con agente degradado a REQUESTER:");
  await mustPass("crear_incidencia", {
    titulo: "Prueba de permiso de solicitante",
    descripcion: "Un solicitante sí puede abrir incidencias.",
    impacto: 1,
    urgencia: 1,
  });
  await mustFail("analizar_impacto", { ci: "Postgres Primary" });
  await mustFail("triar_ticket", { ticket: "INC-0001", asignar_a: "agente@nexo.dev" });
  await mustFail("sugerir_cambio", {
    titulo: "Cambio no permitido",
    descripcion: "Un solicitante no puede proponer cambios.",
    impacto: 1,
    urgencia: 1,
  });

  await client.close();
  console.log(`\n✅ RBAC verificado: ${passed}/4 comprobaciones correctas.`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
