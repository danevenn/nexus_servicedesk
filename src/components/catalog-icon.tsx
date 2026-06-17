import {
  Database,
  HardDrive,
  Headset,
  KeyRound,
  Laptop,
  type LucideIcon,
  Mail,
  Package,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Wifi,
} from "lucide-react";

// Mapa de iconos disponibles para los ítems del catálogo (campo `icon`).
// Server-compatible (sin "use client"): se usa en las páginas server.
const ICONS: Record<string, LucideIcon> = {
  UserPlus,
  KeyRound,
  Laptop,
  Smartphone,
  Mail,
  ShieldCheck,
  Database,
  HardDrive,
  Headset,
  Wifi,
  Package,
};

export function CatalogIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && ICONS[name]) || Package;
  return <Icon className={className} />;
}
