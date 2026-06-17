import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  GitBranch,
  ListTree,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { getSessionCtx } from "@/lib/auth-context";
import { can } from "@/lib/services/context";
import { getTicket } from "@/lib/services/tickets";
import {
  SuggestedArticles,
  SuggestedArticlesSkeleton,
} from "@/components/suggested-articles";
import { listAssignableUsers } from "@/lib/services/users";
import { NotFoundError } from "@/lib/services/errors";
import {
  ApprovalStateBadge,
  KindBadge,
  PriorityBadge,
  RiskBadge,
  StatusBadge,
} from "@/components/badges";
import { TicketActions } from "@/components/ticket-actions";
import { TicketNoteForm } from "@/components/ticket-note-form";
import { TicketResolveForm } from "@/components/ticket-resolve-form";
import { ChangeApprovals } from "@/components/change-approvals";
import { ProblemLinks } from "@/components/problem-links";
import { SlaBars, slaReferenceNow } from "@/components/sla-bars";
import { CHANNEL_LABEL, CHANGE_TYPE_LABEL } from "@/lib/labels";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const ACTION_LABEL: Record<string, string> = {
  created: "Creó el ticket",
  triaged: "Triaje / asignación",
  assigned: "Asignación",
  status_changed: "Cambió el estado",
  work_note: "Nota de trabajo",
  resolved: "Resolución",
  linked_to_problem: "Vinculada a un problema",
  unlinked_from_problem: "Desvinculada de un problema",
  incidents_linked: "Incidencias vinculadas",
  known_error_updated: "Known error actualizado",
  approval_requested: "Aprobación solicitada",
  approved: "Aprobó el cambio",
  rejected: "Rechazó el cambio",
};

const CLOSED = ["RESOLVED", "CLOSED"];

function fmt(d: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionCtx();

  let ticket;
  try {
    ticket = await getTicket(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const canManage = can(ctx, "ticket:triage");
  const canComment = can(ctx, "ticket:comment");
  const canApprove = can(ctx, "change:approve");
  const users = canManage ? await listAssignableUsers(ctx) : [];
  const now = slaReferenceNow(); // referencia para el progreso de SLA (una por petición)
  const isClosed = CLOSED.includes(ticket.status);

  return (
    <div className="space-y-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{ticket.ref}</span>
            <KindBadge value={ticket.kind} />
            {ticket.category && (
              <span className="text-xs text-muted-foreground">
                {ticket.category}
                {ticket.subcategory && ` · ${ticket.subcategory}`}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge value={ticket.priority} />
          <StatusBadge value={ticket.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Descripción</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            </CardContent>
          </Card>

          {ticket.kind === "CHANGE" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="size-4 text-muted-foreground" />
                    Cambio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Tipo">
                    {ticket.changeType ? CHANGE_TYPE_LABEL[ticket.changeType] : "—"}
                  </Row>
                  <Row label="Riesgo">
                    {ticket.risk ? <RiskBadge value={ticket.risk} /> : "—"}
                  </Row>
                  <Row label="Estado de aprobación">
                    <ApprovalStateBadge value={ticket.approvalState} />
                  </Row>
                  <Row label="Ventana planificada">
                    {ticket.plannedStart && ticket.plannedEnd
                      ? `${fmt(ticket.plannedStart)} – ${fmt(ticket.plannedEnd)}`
                      : "—"}
                  </Row>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    Aprobaciones (CAB)
                    <ApprovalStateBadge value={ticket.approvalState} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChangeApprovals
                    ticketId={ticket.id}
                    approvals={ticket.approvals}
                    canApprove={canApprove}
                    canManage={canManage}
                    currentUserId={ctx.actorId}
                    managers={users}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {ticket.kind === "PROBLEM" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTree className="size-4 text-muted-foreground" />
                  Análisis del problema
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProblemLinks
                  problemId={ticket.id}
                  linkedIncidents={ticket.linkedIncidents}
                  rootCause={ticket.rootCause}
                  workaround={ticket.workaround}
                  canManage={canManage}
                />
              </CardContent>
            </Card>
          )}

          {ticket.sla && (
            <Card>
              <CardHeader>
                <CardTitle>Acuerdo de nivel de servicio (SLA)</CardTitle>
              </CardHeader>
              <CardContent>
                <SlaBars
                  createdAt={ticket.createdAt}
                  respondBy={ticket.sla.respondBy}
                  respondedAt={ticket.sla.respondedAt}
                  resolveBy={ticket.sla.resolveBy}
                  resolvedAt={ticket.resolvedAt}
                  now={now}
                  onHold={ticket.status === "ON_HOLD"}
                  pausedMinutes={ticket.sla.pausedMinutes}
                />
              </CardContent>
            </Card>
          )}

          {ticket.resolutionNotes && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Resolución
                  {ticket.resolutionCode && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {ticket.resolutionCode}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{ticket.resolutionNotes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                Notas y actividad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canComment && <TicketNoteForm ticketId={ticket.id} />}
              <ol className="space-y-3">
                {ticket.events.map((e) => {
                  const note =
                    e.action === "work_note"
                      ? ((e.payload as { text?: string } | null)?.text ?? "")
                      : null;
                  return (
                    <li key={e.id} className="flex gap-3">
                      <div
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          e.action === "resolved"
                            ? "bg-emerald-500"
                            : e.action === "work_note"
                              ? "bg-blue-500"
                              : "bg-primary"
                        }`}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-medium">
                          {ACTION_LABEL[e.action] ?? e.action}
                        </div>
                        {note && <p className="text-sm whitespace-pre-wrap">{note}</p>}
                        <div className="text-xs text-muted-foreground">
                          {e.actorName}
                          {e.actorKind === "AGENT" && " (automático)"} · {fmt(e.createdAt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Detalles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Estado">
                <StatusBadge value={ticket.status} />
              </Row>
              <Row label="Prioridad">
                <PriorityBadge value={ticket.priority} />
              </Row>
              <Row label="Impacto × urgencia">
                {ticket.impact} × {ticket.urgency}
              </Row>
              <Row label="Canal">{CHANNEL_LABEL[ticket.channel]}</Row>
              <Separator />
              <Row label="Grupo de asignación">
                {ticket.assignmentGroup?.name ?? "—"}
              </Row>
              <Row label="Asignado a">{ticket.assignee?.name ?? "Sin asignar"}</Row>
              <Row label="Solicitante">{ticket.requester.name}</Row>
              <Row label="CI afectado">
                {ticket.ci ? (
                  <Link href={`/cmdb/${ticket.ci.id}`} className="text-primary hover:underline">
                    {ticket.ci.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Row>
              {ticket.problem && (
                <Row label="Problema">
                  <Link
                    href={`/tickets/${ticket.problem.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {ticket.problem.ref}
                  </Link>
                </Row>
              )}
              <Separator />
              <Row label="Abierto">{fmt(ticket.createdAt)}</Row>
              {ticket.resolvedAt && <Row label="Resuelto">{fmt(ticket.resolvedAt)}</Row>}
            </CardContent>
          </Card>

          {can(ctx, "kb:read") && (
            <Suspense fallback={<SuggestedArticlesSkeleton />}>
              <SuggestedArticles
                ctx={ctx}
                query={`${ticket.title}. ${ticket.description}`}
              />
            </Suspense>
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Gestión</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <TicketActions
                  ticketId={ticket.id}
                  currentStatus={ticket.status}
                  currentAssigneeId={ticket.assigneeId}
                  users={users}
                />
                {!isClosed && (
                  <>
                    <Separator />
                    <TicketResolveForm ticketId={ticket.id} />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
