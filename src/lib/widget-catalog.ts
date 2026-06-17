// Catálogo de métricas y dimensiones del constructor de dashboards.
// Módulo PURO (sin imports de servidor) para que lo compartan el motor de
// consulta (servidor) y el formulario "Añadir widget" (cliente) sin desajustes.

export const TICKET_METRICS = {
  total: "Tickets totales",
  open: "Tickets abiertos",
  sla_breached: "SLA incumplidos",
  resolved: "Resueltos / cerrados",
} as const;

export const CI_METRICS = {
  total: "CIs totales",
  operational: "CIs operativos",
  degraded: "CIs degradados",
  down: "CIs caídos",
} as const;

export const TICKET_DIMENSIONS = {
  status: "Estado",
  priority: "Prioridad",
  kind: "Tipo",
  assignee: "Técnico asignado",
} as const;

export const CI_DIMENSIONS = {
  type: "Tipo",
  status: "Estado",
  environment: "Entorno",
  vendor: "Fabricante",
  datacenter: "Datacenter",
  criticality: "Criticidad",
} as const;

export const WIDGET_KIND_LABEL = {
  STAT: "Indicador (número)",
  BAR: "Barras",
  DONUT: "Anillo",
  LINE: "Serie temporal",
  LIST: "Lista",
} as const;

export const SOURCE_LABEL = {
  TICKETS: "Tickets",
  CIS: "CMDB (elementos)",
} as const;
