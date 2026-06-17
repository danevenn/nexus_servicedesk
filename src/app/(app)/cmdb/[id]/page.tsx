import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Network, Zap } from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getCi, getDownstreamImpact, getTopology } from "@/lib/services/cmdb";
import { NotFoundError } from "@/lib/services/errors";
import { CiStatusBadge } from "@/components/badges";
import { TopologyGraph } from "@/components/cmdb/topology-graph";
import { CI_TYPE_LABEL, ENVIRONMENT_LABEL } from "@/lib/labels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CiLink = { id: string; name: string; type: keyof typeof CI_TYPE_LABEL };

type Field = { label: string; value: string | number | null | undefined; mono?: boolean };

// Sección de la ficha técnica: solo se pinta si tiene algún dato.
function SpecSection({ title, fields }: { title: string; fields: Field[] }) {
  const visible = fields.filter((f) => f.value != null && f.value !== "");
  if (visible.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {visible.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className={`mt-0.5 font-medium ${f.mono ? "font-mono text-[13px]" : ""}`}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CiList({ items, empty }: { items: CiLink[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={`/cmdb/${c.id}`}
            className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent transition-colors"
          >
            <span className="text-sm font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              {CI_TYPE_LABEL[c.type]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionCtx();
  if (!can(ctx, "cmdb:read")) redirect("/tickets");

  let ci;
  try {
    ci = await getCi(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { impacted } = await getDownstreamImpact(ctx, id);
  const topology = await getTopology(ctx, id, 2);

  const dependsOn = ci.dependsOn.map((d) => d.target);
  const dependedBy = ci.dependedBy.map((d) => d.source);

  return (
    <div className="space-y-6">
      <Link
        href="/cmdb"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a la CMDB
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{ci.name}</h1>
          <p className="text-muted-foreground">
            {CI_TYPE_LABEL[ci.type]} · Criticidad {ci.criticality}/5
          </p>
        </div>
        <CiStatusBadge value={ci.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ficha técnica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <SpecSection
            title="Identificación"
            fields={[
              { label: "Tipo", value: CI_TYPE_LABEL[ci.type] },
              { label: "Entorno", value: ENVIRONMENT_LABEL[ci.environment] },
              { label: "Criticidad", value: `${ci.criticality}/5` },
              { label: "Fabricante", value: ci.vendor },
              { label: "Modelo", value: ci.model },
              { label: "Nº de serie", value: ci.serialNumber, mono: true },
            ]}
          />
          <SpecSection
            title="Cómputo"
            fields={[
              { label: "Procesador", value: ci.cpuModel },
              { label: "Sockets", value: ci.cpuSockets },
              { label: "Núcleos", value: ci.cpuCores },
              { label: "Memoria RAM", value: ci.ramGb ? `${ci.ramGb} GB` : null },
              { label: "Disco local", value: ci.storageGb ? `${ci.storageGb} GB` : null },
              { label: "Capacidad útil", value: ci.capacityTb ? `${ci.capacityTb} TB` : null },
              { label: "VMs alojadas", value: ci.hostedVms },
            ]}
          />
          <SpecSection
            title="Sistema / firmware"
            fields={[
              { label: "Sistema", value: ci.os },
              { label: "Versión", value: ci.osVersion },
              { label: "Nivel de parche", value: ci.patchLevel },
            ]}
          />
          <SpecSection
            title="Red"
            fields={[
              { label: "Dirección IP", value: ci.ipAddress, mono: true },
              { label: "Hostname", value: ci.hostname, mono: true },
              { label: "FQDN", value: ci.fqdn, mono: true },
            ]}
          />
          <SpecSection
            title="Ubicación"
            fields={[
              { label: "Datacenter", value: ci.datacenter },
              { label: "Ubicación física", value: ci.rackLocation },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            Análisis de impacto
          </CardTitle>
          <CardDescription>
            Si <span className="font-medium text-foreground">{ci.name}</span> falla,{" "}
            {impacted.length === 0
              ? "ningún otro CI se ve afectado."
              : `${impacted.length} CIs se ven afectados aguas abajo.`}
          </CardDescription>
        </CardHeader>
        {impacted.length > 0 && (
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {impacted.map((c) => (
                <Link
                  key={c.id}
                  href={`/cmdb/${c.id}`}
                  className="rounded-md border bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4 text-muted-foreground" />
            Topología de dependencias
          </CardTitle>
          <CardDescription>
            Vecindario del CI (2 saltos). En rojo, el radio de impacto si{" "}
            <span className="font-medium text-foreground">{ci.name}</span> falla.
            Pulsa un nodo para abrir su ficha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TopologyGraph topology={topology} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="size-4 text-muted-foreground" />
              Depende de
            </CardTitle>
            <CardDescription>CIs aguas arriba que necesita para funcionar.</CardDescription>
          </CardHeader>
          <CardContent>
            <CiList items={dependsOn} empty="No depende de ningún otro CI." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownRight className="size-4 text-muted-foreground" />
              Dependen de este
            </CardTitle>
            <CardDescription>CIs que lo usan directamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <CiList items={dependedBy} empty="Ningún CI depende directamente de este." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
