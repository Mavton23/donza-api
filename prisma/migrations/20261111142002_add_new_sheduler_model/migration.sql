/*
  Warnings:

  - A unique constraint covering the columns `[membershipId,type]` on the table `achievements` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[groupId,type,periodStart]` on the table `group_reports` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ACHIEVEMENT_EARNED';
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_REPORT_READY';

-- DropIndex
DROP INDEX "achievements_membershipId_idx";

-- CreateTable
CREATE TABLE "reminder_dispatches" (
    "kind" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "window" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_dispatches_pkey" PRIMARY KEY ("kind","entityId","userId","window")
);

-- CreateIndex
CREATE INDEX "reminder_dispatches_sentAt_idx" ON "reminder_dispatches"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_membershipId_type_key" ON "achievements"("membershipId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "group_reports_groupId_type_periodStart_key" ON "group_reports"("groupId", "type", "periodStart");
