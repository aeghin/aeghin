-- Each person's own order for the service-type pills on Events.

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "serviceTypeOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
