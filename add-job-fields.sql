-- Add completedAt and finalAmount fields to Job table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "finalAmount" DECIMAL(10,2);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "jobs_assignedDriverId_completedAt_idx" ON jobs("assignedDriverId", "completedAt");
CREATE INDEX IF NOT EXISTS "jobs_status_completedAt_idx" ON jobs("status", "completedAt");

-- Update existing COMPLETED jobs with updatedAt as completedAt if null
UPDATE jobs 
SET "completedAt" = "updatedAt" 
WHERE status = 'COMPLETED' 
AND "completedAt" IS NULL;

-- Update finalAmount from actualFare if null
UPDATE jobs 
SET "finalAmount" = "actualFare" 
WHERE "actualFare" IS NOT NULL 
AND "finalAmount" IS NULL;
