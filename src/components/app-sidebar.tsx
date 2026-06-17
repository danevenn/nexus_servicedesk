"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Boxes, ChartLine, LayoutDashboard, LayoutGrid, Network, Ticket } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import type { ROLE_LABEL } from "@/lib/labels";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type Role = keyof typeof ROLE_LABEL;
type Props = { name: string; email: string; role: Role };

const ALL_ITEMS = [
  { title: "Dashboards", href: "/", icon: LayoutDashboard, agentOnly: true },
  { title: "Tickets", href: "/tickets", icon: Ticket, agentOnly: false },
  // Catálogo de servicios: autoservicio, visible para todos los roles.
  { title: "Catálogo", href: "/catalogo", icon: LayoutGrid, agentOnly: false },
  { title: "CMDB", href: "/cmdb", icon: Network, agentOnly: true },
  // Reportes de SLA: para todos menos el solicitante (mismo criterio que CMDB).
  { title: "Reportes", href: "/reportes", icon: ChartLine, agentOnly: true },
  // La base de conocimiento es de autoservicio: visible para todos los roles.
  { title: "Base de conocimiento", href: "/kb", icon: BookOpen, agentOnly: false },
];

export function AppSidebar({ name, email, role }: Props) {
  const pathname = usePathname();
  // Todos ven Dashboards/CMDB salvo el solicitante (que solo tiene sus tickets).
  const canSeeAll = role !== "REQUESTER";
  const items = ALL_ITEMS.filter((i) => !i.agentOnly || canSeeAll);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Boxes className="size-5" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Nexo</span>
                <span className="truncate text-xs text-muted-foreground">
                  Mesa de servicio
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser name={name} email={email} role={role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
