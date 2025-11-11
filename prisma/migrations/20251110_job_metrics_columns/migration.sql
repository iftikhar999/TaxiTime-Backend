-- Add canonical meter metrics + started timestamp to jobs
ALTER TABLE "jobs"
    ADD COLUMN "actualDistanceKm" DOUBLE PRECISION,
    ADD COLUMN "actualDurationSeconds" INTEGER,
    ADD COLUMN "startedAt" TIMESTAMP(3);
