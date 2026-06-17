// Etiquetas en español y clases de color semánticas para los enums de dominio.

export const KIND_LABEL = {
  INCIDENT: "Incidencia",
  REQUEST: "Solicitud",
  PROBLEM: "Problema",
  CHANGE: "Cambio",
} as const;

export const STATUS_LABEL = {
  NEW: "Nueva",
  ASSIGNED: "Asignada",
  IN_PROGRESS: "En curso",
  ON_HOLD: "En espera",
  RESOLVED: "Resuelta",
  CLOSED: "Cerrada",
} as const;

export const CI_TYPE_LABEL = {
  SERVICE: "Servicio",
  APPLICATION: "Aplicación",
  SERVER: "Servidor",
  DATABASE: "Base de datos",
  NETWORK: "Red",
  HYPERVISOR: "Hipervisor",
  STORAGE: "Almacenamiento",
} as const;

export const ENVIRONMENT_LABEL = {
  PROD: "Producción",
  STAGING: "Preproducción",
  DEV: "Desarrollo",
  DR: "Contingencia",
} as const;

export const CI_STATUS_LABEL = {
  OPERATIONAL: "Operativo",
  DEGRADED: "Degradado",
  DOWN: "Caído",
  RETIRED: "Retirado",
} as const;

export const KB_STATUS_LABEL = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
} as const;

export const CHANGE_TYPE_LABEL = {
  STANDARD: "Estándar",
  NORMAL: "Normal",
  EMERGENCY: "Emergencia",
} as const;

export const RISK_LABEL = {
  LOW: "Bajo",
  MEDIUM: "Medio",
  HIGH: "Alto",
} as const;

export const APPROVAL_STATE_LABEL = {
  NOT_REQUESTED: "Sin solicitar",
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
} as const;

export const APPROVAL_DECISION_LABEL = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
} as const;

export const ROLE_LABEL = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  AGENT: "Técnico",
  REQUESTER: "Solicitante",
  VIEWER: "Invitado (demo)",
} as const;

export const CHANNEL_LABEL = {
  PORTAL: "Portal de autoservicio",
  EMAIL: "Correo electrónico",
  PHONE: "Teléfono",
  CHAT: "Chat",
  MONITORING: "Monitorización",
} as const;

// Clases Tailwind (claro/oscuro) por valor. Tono suave de fondo + texto fuerte.
type ClassMap = Record<string, string>;

export const PRIORITY_CLASS: ClassMap = {
  P1: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  P2: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  P3: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  P4: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
};

export const STATUS_CLASS: ClassMap = {
  NEW: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  ASSIGNED: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  ON_HOLD: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  RESOLVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  CLOSED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500 border-zinc-500/20",
};

export const CI_STATUS_CLASS: ClassMap = {
  OPERATIONAL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  DEGRADED: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  DOWN: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  RETIRED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500 border-zinc-500/20",
};

export const KB_STATUS_CLASS: ClassMap = {
  PUBLISHED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  DRAFT: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  ARCHIVED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500 border-zinc-500/20",
};

export const RISK_CLASS: ClassMap = {
  LOW: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  HIGH: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

export const APPROVAL_STATE_CLASS: ClassMap = {
  NOT_REQUESTED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500 border-zinc-500/20",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

export const KIND_CLASS: ClassMap = {
  INCIDENT: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  REQUEST: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  PROBLEM: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  CHANGE: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
};
