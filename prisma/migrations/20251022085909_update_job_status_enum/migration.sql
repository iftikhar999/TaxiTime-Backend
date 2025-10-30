-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'UNASSIGNED';
ALTER TYPE "JobStatus" ADD VALUE 'ON_THE_WAY';
ALTER TYPE "JobStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "JobStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "JobStatus" ADD VALUE 'REACHED';
ALTER TYPE "JobStatus" ADD VALUE 'FINISHED';
ALTER TYPE "JobStatus" ADD VALUE 'REJECTED';
ALTER TYPE "JobStatus" ADD VALUE 'NOSHOW';
ALTER TYPE "JobStatus" ADD VALUE 'RECALLED';
