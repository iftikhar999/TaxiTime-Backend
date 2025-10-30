/*
  Warnings:

  - You are about to drop the `job_audit_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."job_audit_logs" DROP CONSTRAINT "job_audit_logs_jobId_fkey";

-- DropTable
DROP TABLE "public"."job_audit_logs";
