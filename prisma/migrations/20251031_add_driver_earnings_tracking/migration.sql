-- Add driver earnings tracking fields to Payment model
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "driverEarnings" DECIMAL(10,2);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "driverId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Add foreign key constraints
ALTER TABLE "payments" ADD CONSTRAINT "payments_driverId_fkey" 
  FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_jobId_fkey" 
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create DriverEarnings table for detailed tracking
CREATE TABLE IF NOT EXISTS "driver_earnings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "paymentId" TEXT,
    "shiftId" TEXT,
    
    -- Earnings details
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "paymentMethod" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Trip breakdown
    "baseFare" DECIMAL(10,2) DEFAULT 0.00,
    "distanceFare" DECIMAL(10,2) DEFAULT 0.00,
    "timeFare" DECIMAL(10,2) DEFAULT 0.00,
    "waitingFare" DECIMAL(10,2) DEFAULT 0.00,
    "extraAmount" DECIMAL(10,2) DEFAULT 0.00,
    "discountAmount" DECIMAL(10,2) DEFAULT 0.00,
    
    -- Commission & splits
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "companyCommission" DECIMAL(10,2) DEFAULT 0.00,
    "driverEarnings" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(5,4) DEFAULT 0.20,
    
    -- Special flags
    "totalMobility" BOOLEAN DEFAULT false,
    "adjustmentReason" TEXT,
    "isAdjustment" BOOLEAN DEFAULT false,
    
    -- Metadata
    "tripDistance" DECIMAL(10,2),
    "tripDuration" INTEGER,
    "pickupAddress" TEXT,
    "dropoffAddress" TEXT,
    "customerName" TEXT,
    "metadata" JSONB,

    CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

-- Create DriverEarningsSummary table for aggregates
CREATE TABLE IF NOT EXISTS "driver_earnings_summaries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    
    -- Time period
    "periodType" TEXT NOT NULL, -- 'DAILY', 'WEEKLY', 'MONTHLY'
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT NOT NULL, -- e.g., '2025-10-31', '2025-W44', '2025-10'
    
    -- Aggregated earnings
    "totalEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "totalDistance" DECIMAL(10,2) DEFAULT 0.00,
    "totalDuration" INTEGER DEFAULT 0,
    
    -- Payment method breakdown
    "cashEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "cashTrips" INTEGER DEFAULT 0,
    "cardEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "cardTrips" INTEGER DEFAULT 0,
    "eftposEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "eftposTrips" INTEGER DEFAULT 0,
    "accountEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "accountTrips" INTEGER DEFAULT 0,
    "giftCardEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "giftCardTrips" INTEGER DEFAULT 0,
    
    -- Special categories
    "totalMobilityEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "totalMobilityTrips" INTEGER DEFAULT 0,
    "adjustmentEarnings" DECIMAL(10,2) DEFAULT 0.00,
    "adjustmentTrips" INTEGER DEFAULT 0,
    
    -- Commission totals
    "totalCompanyCommission" DECIMAL(10,2) DEFAULT 0.00,
    "averageCommissionRate" DECIMAL(5,4) DEFAULT 0.20,
    
    -- Fare breakdown
    "totalBaseFare" DECIMAL(10,2) DEFAULT 0.00,
    "totalDistanceFare" DECIMAL(10,2) DEFAULT 0.00,
    "totalTimeFare" DECIMAL(10,2) DEFAULT 0.00,
    "totalWaitingFare" DECIMAL(10,2) DEFAULT 0.00,
    "totalExtraAmount" DECIMAL(10,2) DEFAULT 0.00,
    "totalDiscountAmount" DECIMAL(10,2) DEFAULT 0.00,
    
    -- Metadata
    "metadata" JSONB,

    CONSTRAINT "driver_earnings_summaries_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_driverId_fkey" 
    FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_jobId_fkey" 
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_paymentId_fkey" 
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_shiftId_fkey" 
    FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driver_earnings_summaries" ADD CONSTRAINT "driver_earnings_summaries_driverId_fkey" 
    FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_earnings_summaries" ADD CONSTRAINT "driver_earnings_summaries_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "driver_earnings_driverId_earnedAt_idx" ON "driver_earnings"("driverId", "earnedAt" DESC);
CREATE INDEX IF NOT EXISTS "driver_earnings_companyId_earnedAt_idx" ON "driver_earnings"("companyId", "earnedAt" DESC);
CREATE INDEX IF NOT EXISTS "driver_earnings_paymentMethod_idx" ON "driver_earnings"("paymentMethod");
CREATE INDEX IF NOT EXISTS "driver_earnings_earnedAt_idx" ON "driver_earnings"("earnedAt" DESC);
CREATE INDEX IF NOT EXISTS "driver_earnings_jobId_idx" ON "driver_earnings"("jobId");

CREATE INDEX IF NOT EXISTS "driver_earnings_summaries_driverId_periodType_periodStart_idx" 
    ON "driver_earnings_summaries"("driverId", "periodType", "periodStart" DESC);
CREATE INDEX IF NOT EXISTS "driver_earnings_summaries_companyId_periodType_periodStart_idx" 
    ON "driver_earnings_summaries"("companyId", "periodType", "periodStart" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "driver_earnings_summaries_unique_period_idx" 
    ON "driver_earnings_summaries"("driverId", "periodType", "periodLabel");

-- Add indexes to payments for earnings queries
CREATE INDEX IF NOT EXISTS "payments_driverId_paidAt_idx" ON "payments"("driverId", "paidAt" DESC);
CREATE INDEX IF NOT EXISTS "payments_jobId_idx" ON "payments"("jobId");

-- Update Job model with additional payment fields
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "actualFare" DECIMAL(10,2);

-- Add actualFare index
CREATE INDEX IF NOT EXISTS "jobs_assignedDriverId_updatedAt_idx" 
    ON "jobs"("assignedDriverId", "updatedAt" DESC);
