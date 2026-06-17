import { redirect } from "next/navigation";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import {
  ensureDefaultDashboard,
  listDashboards,
  computeWidget,
  type WidgetData,
} from "@/lib/services/dashboards";
import type { WidgetConfig } from "@/lib/services/schemas";
import {
  DashboardWorkspace,
  type WorkspaceWidget,
} from "@/components/dashboard/dashboard-workspace";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const ctx = await getSessionCtx();
  if (!can(ctx, "ticket:read:all")) redirect("/tickets");

  await ensureDefaultDashboard(ctx);
  const dashboards = await listDashboards(ctx);

  const { d } = await searchParams;
  const selected = dashboards.find((x) => x.id === d) ?? dashboards[0];

  // Calcula los datos de cada widget en el servidor (respetando RBAC/scoping).
  const data: WidgetData[] = await Promise.all(
    selected.widgets.map((w) =>
      computeWidget(ctx, w.kind, w.config as WidgetConfig),
    ),
  );

  const widgets: WorkspaceWidget[] = selected.widgets.map((w) => ({
    id: w.id,
    kind: w.kind,
    title: w.title,
    width: w.width,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    config: w.config as WorkspaceWidget["config"],
  }));

  return (
    <DashboardWorkspace
      dashboards={dashboards.map((x) => ({ id: x.id, name: x.name }))}
      selectedId={selected.id}
      selectedName={selected.name}
      widgets={widgets}
      data={data}
      canEdit={can(ctx, "dashboard:write")}
    />
  );
}
