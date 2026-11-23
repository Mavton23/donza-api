/*
  Warnings:

  - A unique constraint covering the columns `[assignmentId,userId]` on the table `submissions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_REVOKED';

-- DropIndex
DROP INDEX "submissions_assignmentId_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignmentId_userId_key" ON "submissions"("assignmentId", "userId");
