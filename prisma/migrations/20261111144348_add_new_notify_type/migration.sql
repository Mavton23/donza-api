-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INSTITUTION_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'INSTITUTION_INVITE_RESPONSE';

-- CreateIndex
CREATE INDEX "courses_organizerId_idx" ON "courses"("organizerId");

-- CreateIndex
CREATE INDEX "user_relationships_relatedUserId_relationshipType_status_idx" ON "user_relationships"("relatedUserId", "relationshipType", "status");
