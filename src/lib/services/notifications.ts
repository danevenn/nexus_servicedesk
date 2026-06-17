import { prisma } from "@/lib/prisma";
import type { Ctx } from "./context";
import type { NotificationKind } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────
//  Notificaciones in-app. La EMISIÓN se hace desde la capa de servicios al
//  ocurrir eventos (asignación, estado, aprobaciones, notas) — best-effort:
//  un fallo nunca rompe la operación principal. La LECTURA/MUTACIÓN está
//  acotada a las notificaciones del propio actor (recipientId === ctx.actorId),
//  distinto del patrón ticket:read:all (un AGENT no ve las de otros).
// ─────────────────────────────────────────────

const TITLES: Record<NotificationKind, (ref: string) => string> = {
  ASSIGNED: (r) => `Te han asignado ${r}`,
  STATUS_CHANGED: (r) => `${r} cambió de estado`,
  RESOLVED: (r) => `${r} se ha resuelto`,
  APPROVAL_REQUESTED: (r) => `Aprobación solicitada · ${r}`,
  APPROVAL_DECIDED: (r) => `Decisión sobre el cambio ${r}`,
  WORK_NOTE: (r) => `Nueva nota en ${r}`,
};

export function notificationTitle(kind: NotificationKind, ref: string): string {
  return TITLES[kind](ref);
}

type EmitArgs = {
  ctx: Ctx;
  recipientIds: (string | null | undefined)[];
  kind: NotificationKind;
  ticketId: string;
  ticketRef: string;
};

// Emite notificaciones a los destinatarios indicados. Deduplica y excluye al
// propio actor (no te notificas a ti mismo). Best-effort: traga errores.
export async function emitNotifications({
  ctx,
  recipientIds,
  kind,
  ticketId,
  ticketRef,
}: EmitArgs): Promise<void> {
  const unique = [
    ...new Set(recipientIds.filter((id): id is string => Boolean(id))),
  ].filter((id) => !(ctx.actorKind === "USER" && id === ctx.actorId));
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((recipientId) => ({
        recipientId,
        kind,
        ticketId,
        ticketRef,
        title: notificationTitle(kind, ticketRef),
        actorKind: ctx.actorKind,
        actorId: ctx.actorId,
      })),
    });
  } catch (e) {
    console.error("No se pudieron emitir notificaciones:", e);
  }
}

export function countUnreadNotifications(ctx: Ctx): Promise<number> {
  return prisma.notification.count({
    where: { recipientId: ctx.actorId, readAt: null },
  });
}

export function listNotifications(ctx: Ctx, take = 15) {
  return prisma.notification.findMany({
    where: { recipientId: ctx.actorId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// Marca una notificación como leída. Filtra por recipientId además del id para
// que nadie marque leída la de otro pasando un id ajeno. Devuelve el nuevo no-leídas.
export async function markNotificationRead(ctx: Ctx, id: string): Promise<number> {
  await prisma.notification.updateMany({
    where: { id, recipientId: ctx.actorId },
    data: { readAt: new Date() },
  });
  return countUnreadNotifications(ctx);
}

export async function markAllNotificationsRead(ctx: Ctx): Promise<number> {
  await prisma.notification.updateMany({
    where: { recipientId: ctx.actorId, readAt: null },
    data: { readAt: new Date() },
  });
  return 0;
}
