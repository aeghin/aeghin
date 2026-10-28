-- CreateEnum
CREATE TYPE "VoiceType" AS ENUM ('SOPRANO', 'ALTO', 'TENOR', 'BARITONE', 'BASS');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "voiceType" "VoiceType";

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "voiceType" "VoiceType";
