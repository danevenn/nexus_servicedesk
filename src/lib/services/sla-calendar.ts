// ─────────────────────────────────────────────
//  Calendario laboral para SLA (lógica de dominio pura, sin BD).
//  Nota: opera en horas UTC para que el cálculo sea determinista y testeable;
//  en una instalación real el calendario llevaría zona horaria. P1 corre 24×7;
//  P2–P4 solo consumen SLA en horario laboral (L–V, 9:00–18:00) y festivos no.
// ─────────────────────────────────────────────

export type WorkingCalendar = {
  startHour: number; // hora UTC de inicio de jornada
  endHour: number; // hora UTC de fin de jornada
  workingDays: number[]; // getUTCDay(): 0=Dom … 6=Sáb
  holidays: Set<string>; // fechas YYYY-MM-DD (UTC) no laborables
};

// Festivos nacionales de España 2026 (muestra para la demo).
const HOLIDAYS_ES_2026 = [
  "2026-01-01",
  "2026-01-06",
  "2026-04-03",
  "2026-05-01",
  "2026-08-15",
  "2026-10-12",
  "2026-11-01",
  "2026-12-06",
  "2026-12-08",
  "2026-12-25",
];

export const BUSINESS_HOURS: WorkingCalendar = {
  startHour: 9,
  endHour: 18,
  workingDays: [1, 2, 3, 4, 5],
  holidays: new Set(HOLIDAYS_ES_2026),
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWorkday(d: Date, cal: WorkingCalendar): boolean {
  return cal.workingDays.includes(d.getUTCDay()) && !cal.holidays.has(ymd(d));
}

function workStart(d: Date, cal: WorkingCalendar): Date {
  const s = new Date(d);
  s.setUTCHours(cal.startHour, 0, 0, 0);
  return s;
}
function workEnd(d: Date, cal: WorkingCalendar): Date {
  const e = new Date(d);
  e.setUTCHours(cal.endHour, 0, 0, 0);
  return e;
}
function nextDayStart(d: Date, cal: WorkingCalendar): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  return workStart(n, cal);
}

// Lleva `cur` al siguiente instante laboral válido (o lo deja si ya lo es).
function nextWorkingInstant(cur: Date, cal: WorkingCalendar): Date {
  let c = new Date(cur);
  // Salta días no laborables.
  for (let guard = 0; guard < 3660; guard++) {
    if (!isWorkday(c, cal)) {
      c = nextDayStart(c, cal);
      continue;
    }
    const start = workStart(c, cal);
    const end = workEnd(c, cal);
    if (c < start) return start;
    if (c >= end) {
      c = nextDayStart(c, cal);
      continue;
    }
    return c; // dentro de jornada
  }
  return c;
}

// Suma `minutes` minutos LABORABLES a `from`, devolviendo el instante objetivo.
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  cal: WorkingCalendar = BUSINESS_HOURS,
): Date {
  let cur = nextWorkingInstant(from, cal);
  let remaining = minutes;
  for (let guard = 0; remaining > 0 && guard < 3660; guard++) {
    const end = workEnd(cur, cal);
    const avail = (end.getTime() - cur.getTime()) / 60000;
    if (remaining <= avail) {
      return new Date(cur.getTime() + remaining * 60000);
    }
    remaining -= avail;
    cur = nextWorkingInstant(end, cal); // salta a la siguiente jornada
  }
  return cur;
}

// Minutos LABORABLES transcurridos entre `a` y `b` (0 si b<=a).
export function businessMinutesBetween(
  a: Date,
  b: Date,
  cal: WorkingCalendar = BUSINESS_HOURS,
): number {
  if (b <= a) return 0;
  let total = 0;
  let cur = new Date(a);
  for (let guard = 0; cur < b && guard < 3660; guard++) {
    if (isWorkday(cur, cal)) {
      const ws = workStart(cur, cal);
      const we = workEnd(cur, cal);
      const segStart = cur > ws ? cur : ws;
      const segEnd = b < we ? b : we;
      if (segEnd > segStart) {
        total += (segEnd.getTime() - segStart.getTime()) / 60000;
      }
    }
    cur = nextDayStart(cur, cal); // medianoche → inicio de jornada del día siguiente
    cur.setUTCHours(0, 0, 0, 0);
  }
  return Math.round(total);
}
