-- Add unique constraint to prevent duplicate job-driver assignments
-- First, remove duplicate records keeping only the latest one
WITH ranked_assignments AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY "jobId", "driverId" ORDER BY "updatedAt" DESC, "createdAt" DESC) as rn
  FROM assignments
)
DELETE FROM assignments
WHERE id IN (
  SELECT id FROM ranked_assignments WHERE rn > 1
);

-- Add unique constraint
CREATE UNIQUE INDEX "assignments_jobId_driverId_key" ON "assignments"("jobId", "driverId");
