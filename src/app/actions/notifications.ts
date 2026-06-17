"use server";

import { getSessionCtx } from "@/lib/auth-context";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/services/notifications";

// DTO serializable para el client (fechas como ISO string).
export type NotificationDTO = {
  id: string;
  kind: string;
  ticketId: string;
  ticketRef: string;
  title: string;
  read: boolean;
  createdAt: string;
};

export async function listNotificationsAction(): Promise<NotificationDTO[]> {
  const ctx = await getSessionCtx();
  const items = await listNotifications(ctx, 15);
  return items.map((n) => ({
    id: n.id,
    kind: n.kind,
    ticketId: n.ticketId,
    ticketRef: n.ticketRef,
    title: n.title,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function countUnreadAction(): Promise<number> {
  const ctx = await getSessionCtx();
  return countUnreadNotifications(ctx);
}

export async function markNotificationReadAction(id: string): Promise<number> {
  const ctx = await getSessionCtx();
  return markNotificationRead(ctx, id);
}

export async function markAllNotificationsReadAction(): Promise<number> {
  const ctx = await getSessionCtx();
  return markAllNotificationsRead(ctx);
}
