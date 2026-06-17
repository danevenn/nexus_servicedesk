import { Priority } from "@/generated/prisma/enums";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  BUSINESS_HOURS,
  type WorkingCalendar,
} from "./sla-calendar";

// ─────────────────────────────────────────────
//  Lógica de dominio pura (sin BD): la comparten la web, el seed y el MCP.
// ─────────────────────────────────────────────

export type ImpactUrgency = 1 | 2 | 3;

// Matriz ITIL: prioridad derivada de impacto × urgencia (score 1..9).
export function derivePriority(
  impact: ImpactUrgency,
  urgency: ImpactUrgency,
): Priority {
  const score = impact * urgency;
  if (score >= 9) return Priority.P1;
  if (score >= 6) return Priority.P2;
  if (score >= 3) return Priority.P3;
  return Priority.P4;
}

// Objetivos de SLA por prioridad, en horas (respuesta / resolución).
const SLA_HOURS: Record<Priority, { respond: number; resolve: number }> = {
  P1: { respond: 1, resolve: 4 },
  P2: { respond: 2, resolve: 8 },
  P3: { respond: 4, resolve: 24 },
  P4: { respond: 8, resolve: 72 },
};

// P1 corre 24×7 (reloj de pared); P2–P4 solo consumen SLA en horario laboral.
export function is247(priority: Priority): boolean {
  return priority === Priority.P1;
}

export function slaTargets(
  priority: Priority,
  from: Date,
  cal: WorkingCalendar = BUSINESS_HOURS,
) {
  const { respond, resolve } = SLA_HOURS[priority];
  if (is247(priority)) {
    return {
      respondBy: new Date(from.getTime() + respond * 3_600_000),
      resolveBy: new Date(from.getTime() + resolve * 3_600_000),
    };
  }
  return {
    respondBy: addBusinessMinutes(from, respond * 60, cal),
    resolveBy: addBusinessMinutes(from, resolve * 60, cal),
  };
}

// Reanudación tras una pausa (ON_HOLD → otro estado): cuánto tiempo se estuvo
// pausado. `wallMinutes` es el tiempo de reloj (para mostrar); `refundMinutes`
// es lo que NO debe contar contra el SLA y se devuelve al deadline (reloj en
// P1 24×7; minutos laborables en P2–P4).
export function pauseRefund(
  priority: Priority,
  onHoldSince: Date,
  now: Date,
  cal: WorkingCalendar = BUSINESS_HOURS,
): { wallMinutes: number; refundMinutes: number } {
  const wallMinutes = Math.max(
    0,
    Math.round((now.getTime() - onHoldSince.getTime()) / 60000),
  );
  const refundMinutes = is247(priority)
    ? wallMinutes
    : businessMinutesBetween(onHoldSince, now, cal);
  return { wallMinutes, refundMinutes };
}

// Empuja un deadline hacia adelante los `refundMinutes` devueltos por la pausa.
export function shiftDeadline(
  deadline: Date,
  priority: Priority,
  refundMinutes: number,
  cal: WorkingCalendar = BUSINESS_HOURS,
): Date {
  return is247(priority)
    ? new Date(deadline.getTime() + refundMinutes * 60000)
    : addBusinessMinutes(deadline, refundMinutes, cal);
}

// Prefijo de referencia por tipo de ticket (INC-0001, REQ-0001, ...).
export const REF_PREFIX = {
  INCIDENT: "INC",
  REQUEST: "REQ",
  PROBLEM: "PRB",
  CHANGE: "CHG",
} as const;
