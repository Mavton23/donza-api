-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendarTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "modules_creatorId_courseId_idx" ON "modules"("creatorId", "courseId");
