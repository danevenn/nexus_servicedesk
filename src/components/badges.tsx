import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  KIND_LABEL,
  STATUS_LABEL,
  CI_STATUS_LABEL,
  KB_STATUS_LABEL,
  RISK_LABEL,
  APPROVAL_STATE_LABEL,
  PRIORITY_CLASS,
  STATUS_CLASS,
  CI_STATUS_CLASS,
  KB_STATUS_CLASS,
  RISK_CLASS,
  APPROVAL_STATE_CLASS,
  KIND_CLASS,
} from "@/lib/labels";
import type {
  TicketKind,
  TicketStatus,
  Priority,
  CiStatus,
  KbStatus,
  RiskLevel,
  ApprovalState,
} from "@/generated/prisma/enums";

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {children}
    </Badge>
  );
}

export function PriorityBadge({ value }: { value: Priority }) {
  return <Pill className={PRIORITY_CLASS[value]}>{value}</Pill>;
}

export function StatusBadge({ value }: { value: TicketStatus }) {
  return <Pill className={STATUS_CLASS[value]}>{STATUS_LABEL[value]}</Pill>;
}

export function KindBadge({ value }: { value: TicketKind }) {
  return <Pill className={KIND_CLASS[value]}>{KIND_LABEL[value]}</Pill>;
}

export function CiStatusBadge({ value }: { value: CiStatus }) {
  return <Pill className={CI_STATUS_CLASS[value]}>{CI_STATUS_LABEL[value]}</Pill>;
}

export function KbStatusBadge({ value }: { value: KbStatus }) {
  return <Pill className={KB_STATUS_CLASS[value]}>{KB_STATUS_LABEL[value]}</Pill>;
}

export function RiskBadge({ value }: { value: RiskLevel }) {
  return <Pill className={RISK_CLASS[value]}>Riesgo {RISK_LABEL[value].toLowerCase()}</Pill>;
}

export function ApprovalStateBadge({ value }: { value: ApprovalState }) {
  return (
    <Pill className={APPROVAL_STATE_CLASS[value]}>{APPROVAL_STATE_LABEL[value]}</Pill>
  );
}
