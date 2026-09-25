-- AlterTable
ALTER TABLE "EventAssignment" ADD COLUMN     "chatPushedAt" TIMESTAMP(3),
ADD COLUMN     "nudgedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PushToken" ADD COLUMN     "timeZone" TEXT;
