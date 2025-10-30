-- Migration: Add Auto-Dispatch Features
-- Date: 2025-10-14

-- Add auto-dispatch settings to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS auto_dispatch_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS dispatch_strategy VARCHAR(20) DEFAULT 'ZONE_QUEUE',
ADD COLUMN IF NOT EXISTS max_dispatch_radius_km DECIMAL(5,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS auto_assign_timeout_seconds INTEGER DEFAULT 30;

COMMENT ON COLUMN companies.auto_dispatch_enabled IS 'Enable automatic driver assignment';
COMMENT ON COLUMN companies.dispatch_strategy IS 'ZONE_QUEUE or CLOSEST';
COMMENT ON COLUMN companies.max_dispatch_radius_km IS 'Maximum search radius in kilometers';
COMMENT ON COLUMN companies.auto_assign_timeout_seconds IS 'Timeout for driver to accept offer';

-- Add queue field to zones table (JSONB array of driver IDs in FIFO order)
ALTER TABLE zones
ADD COLUMN IF NOT EXISTS queue JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN zones.queue IS 'FIFO queue of driver IDs waiting in this zone';

-- Create ride_offers table to track dispatch attempts
CREATE TABLE IF NOT EXISTS ride_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  
  offered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL CHECK (status IN ('OFFERED', 'ACCEPTED', 'REJECTED', 'TIMEOUT')),
  responded_at TIMESTAMP,
  rejection_reason VARCHAR(255),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(ride_id, driver_id)
);

COMMENT ON TABLE ride_offers IS 'Track which drivers were offered which rides';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ride_offers_ride ON ride_offers(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_offers_driver ON ride_offers(driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_offers_status ON ride_offers(status);
CREATE INDEX IF NOT EXISTS idx_ride_offers_offered_at ON ride_offers(offered_at);

-- Add current_zone_id to drivers table if not exists
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS current_zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;

COMMENT ON COLUMN drivers.current_zone_id IS 'Zone where driver is currently located';

CREATE INDEX IF NOT EXISTS idx_drivers_current_zone ON drivers(current_zone_id);

-- Add offered_at timestamp to rides table
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS offered_at TIMESTAMP;

COMMENT ON COLUMN rides.offered_at IS 'When ride was first offered to a driver';

-- Add function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for ride_offers
DROP TRIGGER IF EXISTS update_ride_offers_updated_at ON ride_offers;
CREATE TRIGGER update_ride_offers_updated_at
    BEFORE UPDATE ON ride_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default values for existing companies
UPDATE companies
SET auto_dispatch_enabled = true,
    dispatch_strategy = 'ZONE_QUEUE',
    max_dispatch_radius_km = 5.0,
    auto_assign_timeout_seconds = 30
WHERE auto_dispatch_enabled IS NULL;

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Auto-dispatch migration completed successfully!';
    RAISE NOTICE 'Added columns: companies.auto_dispatch_enabled, dispatch_strategy, max_dispatch_radius_km';
    RAISE NOTICE 'Added table: ride_offers';
    RAISE NOTICE 'Added column: zones.queue, drivers.current_zone_id';
END $$;
