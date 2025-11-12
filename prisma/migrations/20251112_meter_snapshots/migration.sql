-- Create table for persisted meter snapshots with sampled route segments
CREATE TABLE "job_meter_snapshots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT,
    "reason" TEXT DEFAULT 'interval',
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "waitingSeconds" INTEGER NOT NULL DEFAULT 0,
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentFare" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "isPaused" BOOLEAN NOT NULL DEFAULT FALSE,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "routeSegment" JSONB,
    CONSTRAINT "job_meter_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_meter_snapshots_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_meter_snapshots_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_meter_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "job_meter_snapshots_jobId_recordedAt_idx" ON "job_meter_snapshots"("jobId", "recordedAt");
