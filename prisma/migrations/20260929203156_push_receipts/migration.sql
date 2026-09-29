-- Delivery receipts for pushes Expo accepted, read back by the hourly cron so a
-- bad APNs key or FCM credential gets logged instead of failing silently.

-- CreateTable
CREATE TABLE "PushReceipt" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushReceipt_createdAt_idx" ON "PushReceipt"("createdAt");

