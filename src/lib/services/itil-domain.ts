import { ApprovalState, ApprovalDecision } from "@/generated/prisma/enums";

// ─────────────────────────────────────────────
//  Lógica de dominio pura de gestión de cambios (sin BD).
//  La comparten el servicio, el seed y los tests.
// ─────────────────────────────────────────────

// Estado agregado de un cambio a partir de los votos del CAB:
//   - sin votos        → NOT_REQUESTED (aún no se ha pedido aprobación)
//   - algún rechazo    → REJECTED (un solo "no" tumba el cambio)
//   - todos aprobados  → APPROVED
//   - en otro caso     → PENDING (faltan votos)
export function aggregateApprovalState(
  decisions: ApprovalDecision[],
): ApprovalState {
  if (decisions.length === 0) return ApprovalState.NOT_REQUESTED;
  if (decisions.some((d) => d === ApprovalDecision.REJECTED)) {
    return ApprovalState.REJECTED;
  }
  if (decisions.every((d) => d === ApprovalDecision.APPROVED)) {
    return ApprovalState.APPROVED;
  }
  return ApprovalState.PENDING;
}
