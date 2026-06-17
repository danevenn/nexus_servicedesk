-- AlterTable
ALTER TABLE "Sla" ADD COLUMN     "onHoldSince" TIMESTAMP(3),
ADD COLUMN     "pausedMinutes" INTEGER NOT NULL DEFAULT 0;
