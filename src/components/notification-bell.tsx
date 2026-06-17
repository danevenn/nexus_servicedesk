"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import {
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationDTO,
} from "@/app/actions/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICONS: Record<string, LucideIcon> = {
  ASSIGNED: UserCheck,
  STATUS_CHANGED: RefreshCw,
  RESOLVED: CheckCircle2,
  APPROVAL_REQUESTED: ShieldQuestion,
  APPROVAL_DECIDED: ShieldCheck,
  WORK_NOTE: MessageSquare,
};

function fmt(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Carga al abrir (en el handler, no en un efecto).
      setLoading(true);
      startTransition(async () => {
        setItems(await listNotificationsAction());
        setLoading(false);
      });
    }
  }

  function openItem(n: NotificationDTO) {
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1)); // optimista
      setItems((prev) =>
        prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)),
      );
      startTransition(async () => {
        setUnread(await markNotificationReadAction(n.id));
      });
    }
    setOpen(false);
    router.push(`/tickets/${n.ticketId}`);
  }

  function markAll() {
    setUnread(0); // optimista
    setItems((prev) => prev.map((it) => ({ ...it, read: true })));
    startTransition(async () => {
      setUnread(await markAllNotificationsReadAction());
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ""}`}
          />
        }
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notificaciones</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-auto py-1">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No tienes notificaciones.
            </p>
          ) : (
            items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{fmt(n.createdAt)}</span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
