-- Three new roles, and a Media team for Projection.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VolunteerRole" ADD VALUE 'CHOIR';
ALTER TYPE "VolunteerRole" ADD VALUE 'CAMERA';
ALTER TYPE "VolunteerRole" ADD VALUE 'LIGHTING';

-- AlterEnum
ALTER TYPE "RoleCategory" ADD VALUE 'MEDIA';
