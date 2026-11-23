/*
  Warnings:

  - You are about to drop the column `contentId` on the `content_scan_results` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "content_scan_results_contentType_contentId_idx";

-- AlterTable
ALTER TABLE "content_scan_results" DROP COLUMN "contentId";

-- CreateTable
CREATE TABLE "audit_logs" (
    "auditId" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "method" VARCHAR(10) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER,
    "changes" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("auditId")
);

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "content_scan_results_contentType_idx" ON "content_scan_results"("contentType");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
