"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpen,
  ChartLine,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Moon,
  Network,
  Plus,
  SearchIcon,
  Ticket,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import {
  searchCommandAction,
  type CommandSearchResult,
} from "@/app/actions/search";
import { CI_TYPE_LABEL } from "@/lib/labels";
import { useIsMac } from "@/hooks/use-platform";
import { PriorityBadge, StatusBadge, CiStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type {
  Role,
  Priority,
  TicketStatus,
  CiStatus,
  CiType,
} from "@/generated/prisma/enums";

const EMPTY: CommandSearchResult = { tickets: [], cis: [], articles: [] };

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const isMac = useIsMac();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CommandSearchResult>(EMPTY);
  const [, startTransition] = React.useTransition();

  // El solicitante solo ve sus tickets; el resto de roles ve todo.
  const canSeeAll = role !== "REQUESTER";

  // Atajo global ⌘K / Ctrl+K para abrir/cerrar la paleta.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Búsqueda en servidor con debounce (220 ms). El RBAC se aplica en la action.
  // El setState vive dentro del callback del timeout (no en el cuerpo del
  // efecto) para no disparar renders en cascada.
  React.useEffect(() => {
    const q = query.trim();
    const id = setTimeout(() => {
      if (q.length < 2) {
        setResults(EMPTY);
        return;
      }
      startTransition(async () => {
        setResults(await searchCommandAction(q));
      });
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery(""); // limpia la búsqueda al cerrar
  }

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const nav = [
    { label: "Dashboards", href: "/", icon: LayoutDashboard, show: canSeeAll },
    { label: "Tickets", href: "/tickets", icon: Ticket, show: true },
    { label: "Catálogo de servicios", href: "/catalogo", icon: LayoutGrid, show: true },
    { label: "CMDB", href: "/cmdb", icon: Network, show: canSeeAll },
    { label: "Reportes de SLA", href: "/reportes", icon: ChartLine, show: canSeeAll },
    { label: "Base de conocimiento", href: "/kb", icon: BookOpen, show: true },
  ].filter((n) => n.show);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label="Buscar"
        title={`Buscar tickets, CIs y acciones (${isMac ? "⌘K" : "Ctrl K"})`}
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <CommandInput
          placeholder="Buscar o escribe un comando…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>

          <CommandGroup heading="Navegación">
            {nav.map((n) => (
              <CommandItem
                key={n.href}
                value={`ir a ${n.label}`}
                onSelect={() => run(() => router.push(n.href))}
              >
                <n.icon />
                <span>{n.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Acciones">
            <CommandItem
              value="crear nuevo ticket incidencia solicitud"
              onSelect={() =>
                // /tickets?nuevo=1: el NewTicketDialog reacciona al parámetro y
                // se abre (determinista, sin eventos), esté donde esté el usuario.
                run(() => router.push("/tickets?nuevo=1"))
              }
            >
              <Plus />
              <span>Crear ticket</span>
            </CommandItem>
            <CommandItem
              value="alternar cambiar tema claro oscuro modo"
              onSelect={() =>
                run(() => setTheme(theme === "dark" ? "light" : "dark"))
              }
            >
              <Moon />
              <span>Tema {theme === "dark" ? "claro" : "oscuro"}</span>
            </CommandItem>
            <CommandItem
              value="cerrar sesion salir logout"
              onSelect={() =>
                run(async () => {
                  await signOut();
                  router.push("/login");
                  router.refresh();
                })
              }
            >
              <LogOut />
              <span>Cerrar sesión</span>
            </CommandItem>
          </CommandGroup>

          {results.tickets.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Tickets">
                {results.tickets.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`ticket ${t.ref} ${t.title}`}
                    onSelect={() => run(() => router.push(`/tickets/${t.id}`))}
                  >
                    <Ticket />
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.ref}
                    </span>
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <PriorityBadge value={t.priority as Priority} />
                      <StatusBadge value={t.status as TicketStatus} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.cis.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Elementos de configuración">
                {results.cis.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`ci ${c.name}`}
                    onSelect={() => run(() => router.push(`/cmdb/${c.id}`))}
                  >
                    <Network />
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {CI_TYPE_LABEL[c.type as CiType] ?? c.type}
                    </span>
                    <span className="ml-auto shrink-0">
                      <CiStatusBadge value={c.status as CiStatus} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {results.articles.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Base de conocimiento">
                {results.articles.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`articulo ${a.title}`}
                    onSelect={() => run(() => router.push(`/kb/${a.slug}`))}
                  >
                    <BookOpen />
                    <span className="truncate">{a.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {a.category}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
