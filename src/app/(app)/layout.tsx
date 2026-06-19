import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Ctx } from "@/lib/services/context";
import { countUnreadNotifications } from "@/lib/services/notifications";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { HeaderActions } from "@/components/header-actions";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import type { ROLE_LABEL } from "@/lib/labels";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const role = ((session.user as { role?: string }).role ??
    "REQUESTER") as keyof typeof ROLE_LABEL;

  const ctx: Ctx = {
    actorKind: "USER",
    actorId: session.user.id,
    role: role as Ctx["role"],
  };

  const unread = await countUnreadNotifications(ctx);

  return (
    <SidebarProvider>
      <AppSidebar
        name={session.user.name}
        email={session.user.email}
        role={role}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <CommandPalette role={role} />
          <div className="flex-1" />
          <HeaderActions
            canCreateTicket={can(ctx, "ticket:create")}
            canWriteKb={can(ctx, "kb:write")}
          />
          <NotificationBell initialUnread={unread} />
          <ThemeToggle />
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
