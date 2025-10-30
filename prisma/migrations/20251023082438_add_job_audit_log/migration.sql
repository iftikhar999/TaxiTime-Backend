-- CreateTable
CREATE TABLE IF NOT EXISTS "job_audit_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "previousStatus" TEXT,
    "driverId" TEXT,
    "assignedBy" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userRole" TEXT,

    CONSTRAINT "job_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_audit_logs_jobId_idx" ON "job_audit_logs"("jobId");
CREATE INDEX "job_audit_logs_timestamp_idx" ON "job_audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "job_audit_logs" ADD CONSTRAINT "job_audit_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
