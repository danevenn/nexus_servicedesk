"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  LayoutDashboard,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { WidgetData } from "@/lib/services/dashboards";
import {
  createDashboardAction,
  deleteDashboardAction,
  removeWidgetAction,
  renameDashboardAction,
} from "@/app/actions/dashboards";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { WidgetPalette } from "@/components/dashboard/widget-palette";
import {
  AddWidgetDialog,
  type EditingWidget,
} from "@/components/dashboard/add-widget-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WorkspaceWidget = EditingWidget;
type Item = { widget: WorkspaceWidget; data: WidgetData };

type Props = {
  dashboards: { id: string; name: string }[];
  selectedId: string;
  selectedName: string;
  widgets: WorkspaceWidget[];
  data: WidgetData[];
  canEdit: boolean;
};

export function DashboardWorkspace({
  dashboards,
  selectedId,
  selectedName,
  widgets,
  data,
  canEdit,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  // El orden y el contenido vienen del servidor; lo derivamos en render.
  const items: Item[] = widgets.map((w, i) => ({ widget: w, data: data[i] }));

  const [widgetDialog, setWidgetDialog] = useState<{
    open: boolean;
    widget: EditingWidget | null;
    prefillKind: WorkspaceWidget["kind"] | null;
    placement: { x: number; y: number } | null;
  }>({ open: false, widget: null, prefillKind: null, placement: null });

  // Diálogo de nombre reutilizado para crear y renombrar.
  const [nameDialog, setNameDialog] = useState<{
    open: boolean;
    mode: "create" | "rename";
    value: string;
  }>({ open: false, mode: "create", value: "" });

  function switchTo(id: string) {
    if (id !== selectedId) router.push(`/?d=${id}`);
  }

  // ── Alta desde la paleta ──────────────────────────────────────────────
  // Soltar en una celda concreta del lienzo.
  function onPaletteDrop(kind: WorkspaceWidget["kind"], x: number, y: number) {
    setWidgetDialog({ open: true, widget: null, prefillKind: kind, placement: { x, y } });
  }
  // Pulsar en la paleta: lo coloca en una fila nueva al pie (sin posición).
  function onPalettePick(kind: WorkspaceWidget["kind"]) {
    setWidgetDialog({ open: true, widget: null, prefillKind: kind, placement: null });
  }

  async function removeWidget(id: string) {
    try {
      await removeWidgetAction(id);
      toast.success("Widget eliminado");
      router.refresh();
    } catch {
      toast.error("No se pudo eliminar");
    }
  }

  async function submitName() {
    const value = nameDialog.value.trim();
    if (!value) return;
    try {
      if (nameDialog.mode === "create") {
        const dash = await createDashboardAction(value);
        setNameDialog((s) => ({ ...s, open: false }));
        router.push(`/?d=${dash.id}`);
      } else {
        await renameDashboardAction(selectedId, value);
        setNameDialog((s) => ({ ...s, open: false }));
        router.refresh();
      }
    } catch (err) {
      toast.error("No se pudo guardar", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function removeDashboard() {
    try {
      await deleteDashboardAction(selectedId);
      toast.success("Dashboard eliminado");
      setEditing(false);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("No se pudo eliminar el dashboard");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
          <p className="text-muted-foreground">
            Tus paneles personalizados de la mesa de servicio.
          </p>
        </div>
        {canEdit && (
          <Button
            variant={editing ? "default" : "outline"}
            size="sm"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Check className="size-4" /> : <Settings2 className="size-4" />}
            {editing ? "Listo" : "Editar"}
          </Button>
        )}
      </div>

      {/* Pestañas de dashboards + crear */}
      <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
        {dashboards.map((d) => (
          <button
            key={d.id}
            onClick={() => switchTo(d.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              d.id === selectedId
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="size-3.5" />
            {d.name}
          </button>
        ))}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => setNameDialog({ open: true, mode: "create", value: "" })}
          >
            <Plus className="size-4" />
            Nuevo
          </Button>
        )}
      </div>

      {/* Barra de gestión del dashboard activo */}
      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Editando <span className="font-medium text-foreground">{selectedName}</span> · arrastra, redimensiona desde las esquinas y suelta widgets de la paleta. Se guarda solo.
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setNameDialog({ open: true, mode: "rename", value: selectedName })
              }
            >
              <Pencil className="size-3.5" />
              Renombrar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={removeDashboard}
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </Button>
          </div>
        </div>
      )}

      {/* Lienzo de cuadrícula + paleta (en edición) */}
      {items.length === 0 && !editing ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Este dashboard no tiene widgets.{" "}
          {canEdit && (
            <button
              className="font-medium text-primary hover:underline"
              onClick={() => setEditing(true)}
            >
              Edítalo para añadir widgets
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
          {editing && <WidgetPalette onPick={onPalettePick} />}
          <div className="min-w-0 flex-1">
            <DashboardGrid
              key={selectedId}
              dashboardId={selectedId}
              items={items}
              editing={editing}
              onEditWidget={(w) =>
                setWidgetDialog({
                  open: true,
                  widget: w,
                  prefillKind: null,
                  placement: null,
                })
              }
              onRemoveWidget={removeWidget}
              onPaletteDrop={onPaletteDrop}
            />
          </div>
        </div>
      )}

      <AddWidgetDialog
        dashboardId={selectedId}
        open={widgetDialog.open}
        onOpenChange={(open) => setWidgetDialog((s) => ({ ...s, open }))}
        widget={widgetDialog.widget}
        prefillKind={widgetDialog.prefillKind}
        placement={widgetDialog.placement}
      />

      <Dialog
        open={nameDialog.open}
        onOpenChange={(open) => setNameDialog((s) => ({ ...s, open }))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {nameDialog.mode === "create" ? "Nuevo dashboard" : "Renombrar dashboard"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDialog.value}
            maxLength={60}
            placeholder="p. ej. Operaciones, Red, SLAs…"
            onChange={(e) => setNameDialog((s) => ({ ...s, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitName();
              }
            }}
          />
          <DialogFooter>
            <Button onClick={submitName} disabled={!nameDialog.value.trim()}>
              {nameDialog.mode === "create" ? "Crear" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
