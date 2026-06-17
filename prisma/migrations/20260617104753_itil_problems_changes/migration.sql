-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "approvalState" "ApprovalState" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "changeType" "ChangeType",
ADD COLUMN     "plannedEnd" TIMESTAMP(3),
ADD COLUMN     "plannedStart" TIMESTAMP(3),
ADD COLUMN     "problemId" TEXT,
ADD COLUMN     "risk" "RiskLevel",
ADD COLUMN     "rootCause" TEXT,
ADD COLUMN     "workaround" TEXT;

-- CreateTable
CREATE TABLE "ChangeApproval" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeApproval_ticketId_idx" ON "ChangeApproval"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeApproval_ticketId_approverId_key" ON "ChangeApproval"("ticketId", "approverId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeApproval" ADD CONSTRAINT "ChangeApproval_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeApproval" ADD CONSTRAINT "ChangeApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
