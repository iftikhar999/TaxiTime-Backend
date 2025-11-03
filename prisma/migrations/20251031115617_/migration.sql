/*
  Warnings:

  - You are about to drop the `job_audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `totalMobility` on table `driver_earnings` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isAdjustment` on table `driver_earnings` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."job_audit_logs" DROP CONSTRAINT "job_audit_logs_jobId_fkey";

-- DropIndex
DROP INDEX "public"."jobs_assignedDriverId_updatedAt_idx";

-- DropIndex
DROP INDEX "public"."payments_driverId_paidAt_idx";

-- AlterTable
ALTER TABLE "driver_earnings" ALTER COLUMN "totalMobility" SET NOT NULL,
ALTER COLUMN "isAdjustment" SET NOT NULL;

-- DropTable
DROP TABLE "public"."job_audit_logs";

-- CreateIndex
CREATE INDEX "jobs_assignedDriverId_updatedAt_idx" ON "jobs"("assignedDriverId", "updatedAt");

-- CreateIndex
CREATE INDEX "payments_driverId_paidAt_idx" ON "payments"("driverId", "paidAt");

-- RenameIndex
ALTER INDEX "driver_earnings_summaries_unique_period_idx" RENAME TO "driver_earnings_summaries_driverId_periodType_periodLabel_key";
