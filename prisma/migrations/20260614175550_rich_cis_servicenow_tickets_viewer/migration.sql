-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('PORTAL', 'EMAIL', 'PHONE', 'CHAT', 'MONITORING');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "ConfigurationItem" ADD COLUMN     "capacityTb" INTEGER,
ADD COLUMN     "cpuCores" INTEGER,
ADD COLUMN     "cpuModel" TEXT,
ADD COLUMN     "cpuSockets" INTEGER,
ADD COLUMN     "fqdn" TEXT,
ADD COLUMN     "hostedVms" INTEGER,
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "osVersion" TEXT,
ADD COLUMN     "patchLevel" TEXT,
ADD COLUMN     "rackLocation" TEXT,
ADD COLUMN     "ramGb" INTEGER,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "storageGb" INTEGER;

-- AlterTable
ALTER TABLE "Sla" ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "assignmentGroupId" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "resolutionCode" TEXT,
ADD COLUMN     "resolutionNotes" TEXT,
ADD COLUMN     "subcategory" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "assignmentGroupId" TEXT;

-- CreateTable
CREATE TABLE "AssignmentGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentGroup_name_key" ON "AssignmentGroup"("name");

-- CreateIndex
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");

-- CreateIndex
CREATE INDEX "Ticket_assignmentGroupId_idx" ON "Ticket"("assignmentGroupId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignmentGroupId_fkey" FOREIGN KEY ("assignmentGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_assignmentGroupId_fkey" FOREIGN KEY ("assignmentGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
