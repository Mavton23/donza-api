-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LESSON_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'MODULE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_ASSIGNMENT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_ASSIGNMENT_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_ASSIGNMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_ASSIGNMENT_GRADED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'CONTACT_REQUEST_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ALERT';
