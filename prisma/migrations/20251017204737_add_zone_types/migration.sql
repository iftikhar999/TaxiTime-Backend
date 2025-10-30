-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ZoneType" ADD VALUE 'CITY_CENTER';
ALTER TYPE "ZoneType" ADD VALUE 'BUSINESS_DISTRICT';
ALTER TYPE "ZoneType" ADD VALUE 'RESIDENTIAL';
ALTER TYPE "ZoneType" ADD VALUE 'SUBURB';
ALTER TYPE "ZoneType" ADD VALUE 'COMMERCIAL';
ALTER TYPE "ZoneType" ADD VALUE 'INDUSTRIAL';
ALTER TYPE "ZoneType" ADD VALUE 'CUSTOM';
