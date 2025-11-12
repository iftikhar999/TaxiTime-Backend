-- Fleet Management Performance Indexes
-- Fast, targeted indexes for vehicle CRUD operations

-- Vehicles table - most critical for fleet management
CREATE INDEX IF NOT EXISTS idx_vehicles_company_active 
ON vehicles("companyId", "isActive", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_vehicles_available 
ON vehicles("companyId", "isAvailable", "vehicleType", "isActive") 
WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_vehicles_driver 
ON vehicles("driverId", "isActive") 
WHERE "driverId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_type 
ON vehicles("vehicleType", "companyId", "isActive");

CREATE INDEX IF NOT EXISTS idx_vehicles_license 
ON vehicles("licensePlate", "companyId") 
WHERE "isActive" = true;

-- Company vehicles table
CREATE INDEX IF NOT EXISTS idx_company_vehicles_company_status 
ON company_vehicles("companyId", status, "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_company_vehicles_class 
ON company_vehicles("companyId", "vehicleClass", "bodyType", status);

CREATE INDEX IF NOT EXISTS idx_company_vehicles_registration 
ON company_vehicles("registrationNumber", "companyId");

CREATE INDEX IF NOT EXISTS idx_company_vehicles_wheelchair 
ON company_vehicles("companyId", "wheelchairAccessible", status) 
WHERE "wheelchairAccessible" = true;

CREATE INDEX IF NOT EXISTS idx_company_vehicles_callsign 
ON company_vehicles("dispatchCallsign", "companyId") 
WHERE "dispatchCallsign" IS NOT NULL;

-- Vehicle zones
CREATE INDEX IF NOT EXISTS idx_vehicle_zones_vehicle 
ON vehicle_zones("vehicleId", "isApproved", "canOperate");

CREATE INDEX IF NOT EXISTS idx_vehicle_zones_zone 
ON vehicle_zones("zoneId", "isApproved", "canOperate");

-- Company drivers
CREATE INDEX IF NOT EXISTS idx_company_drivers_company_active 
ON company_drivers("companyId", status, "userId") 
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_company_drivers_user 
ON company_drivers("userId", "companyId", status);

-- Update table statistics
VACUUM ANALYZE vehicles;
VACUUM ANALYZE company_vehicles;
VACUUM ANALYZE vehicle_zones;
VACUUM ANALYZE company_drivers;

-- Show results
SELECT 'Fleet indexes created successfully!' as status,
       (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'vehicles') as vehicles_indexes,
       (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'company_vehicles') as company_vehicles_indexes;
