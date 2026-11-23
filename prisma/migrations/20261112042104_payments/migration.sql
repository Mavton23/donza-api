/*
  Warnings:

  - A unique constraint covering the columns `[groupId,contentType,contentId]` on the table `content_scan_results` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('warn', 'mute', 'unmute', 'ban', 'unban', 'remove_content');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentItemType" AS ENUM ('course', 'event');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MODERATION_NOTICE';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_SUCCEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'KYC_DECISION';
ALTER TYPE "NotificationType" ADD VALUE 'MODERATION_APPEAL_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'MODERATION_APPEAL_DECISION';

-- DropIndex
DROP INDEX "payouts_status_idx";

-- AlterTable
ALTER TABLE "content_scan_results" ADD COLUMN     "authorId" UUID,
ADD COLUMN     "contentId" UUID,
ADD COLUMN     "groupId" UUID,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "holdUntil" TIMESTAMP(3),
ADD COLUMN     "paymentId" UUID,
ALTER COLUMN "invoiceId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "group_moderation_actions" (
    "actionId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "moderatorId" UUID,
    "type" "ModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "contentType" "ScanContentType",
    "contentId" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_moderation_actions_pkey" PRIMARY KEY ("actionId")
);

-- CreateTable
CREATE TABLE "group_appeals" (
    "appealId" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "decidedById" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_appeals_pkey" PRIMARY KEY ("appealId")
);

-- CreateTable
CREATE TABLE "payments" (
    "paymentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemType" "PaymentItemType" NOT NULL,
    "courseId" UUID,
    "eventId" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT,
    "externalId" TEXT,
    "checkoutUrl" TEXT,
    "instructions" JSONB,
    "phoneNumber" TEXT,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "saved_payment_methods" (
    "methodId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "type" "PaymentMethod" NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT,
    "last4" VARCHAR(4),
    "brand" "CardBrand",
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "externalMethodId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_payment_methods_pkey" PRIMARY KEY ("methodId")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateIndex
CREATE INDEX "group_moderation_actions_groupId_createdAt_idx" ON "group_moderation_actions"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "group_moderation_actions_groupId_targetId_type_createdAt_idx" ON "group_moderation_actions"("groupId", "targetId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_appeals_actionId_key" ON "group_appeals"("actionId");

-- CreateIndex
CREATE INDEX "group_appeals_groupId_status_idx" ON "group_appeals"("groupId", "status");

-- CreateIndex
CREATE INDEX "group_appeals_userId_idx" ON "group_appeals"("userId");

-- CreateIndex
CREATE INDEX "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payments_courseId_idx" ON "payments"("courseId");

-- CreateIndex
CREATE INDEX "payments_eventId_idx" ON "payments"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_userId_idempotencyKey_key" ON "payments"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_externalId_key" ON "payments"("provider", "externalId");

-- CreateIndex
CREATE INDEX "saved_payment_methods_userId_idx" ON "saved_payment_methods"("userId");

-- CreateIndex
CREATE INDEX "payment_webhook_events_receivedAt_idx" ON "payment_webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "content_scan_results_groupId_status_idx" ON "content_scan_results"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_scan_results_groupId_contentType_contentId_key" ON "content_scan_results"("groupId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "payouts_paymentId_idx" ON "payouts"("paymentId");

-- CreateIndex
CREATE INDEX "payouts_status_holdUntil_idx" ON "payouts"("status", "holdUntil");

-- AddForeignKey
ALTER TABLE "content_scan_results" ADD CONSTRAINT "content_scan_results_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_moderation_actions" ADD CONSTRAINT "group_moderation_actions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_moderation_actions" ADD CONSTRAINT "group_moderation_actions_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_moderation_actions" ADD CONSTRAINT "group_moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_appeals" ADD CONSTRAINT "group_appeals_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "group_moderation_actions"("actionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_appeals" ADD CONSTRAINT "group_appeals_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_appeals" ADD CONSTRAINT "group_appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_appeals" ADD CONSTRAINT "group_appeals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("courseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_payment_methods" ADD CONSTRAINT "saved_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
