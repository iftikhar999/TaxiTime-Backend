-- Add currentJobId column to users for tracking active job assignment
ALTER TABLE "users"
ADD COLUMN "currentJobId" TEXT;

-- Create foreign key constraint so currentJobId always references an existing job
ALTER TABLE "users"
ADD CONSTRAINT "users_currentJobId_fkey"
FOREIGN KEY ("currentJobId") REFERENCES "jobs"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Helpful index for reconciliation queries
CREATE INDEX "users_currentJobId_idx" ON "users"("currentJobId");
