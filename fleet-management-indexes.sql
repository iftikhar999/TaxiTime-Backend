-- ═══════════════════════════════════════════════════════════════
-- FLEET MANAGEMENT PERFORMANCE OPTIMIZATION
-- ═══════════════════════════════════════════════════════════════
-- Optimized indexes for fast vehicle CRUD operations
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- VEHICLES TABLE - Core fleet data
-- ═══════════════════════════════════════════════════════════════

-- Fast company vehicle listing (most common query)
CREATE INDEX IF NOT EXISTS idx_vehicles_company_active 
ON vehicles(companyId, isActive, updatedAt DESC);

-- Vehicle availability search
CREATE INDEX IF NOT EXISTS idx_vehicles_available_type 
ON vehicles(companyId, isAvailable, vehicleType, isActive) 
WHERE isActive = true;

-- Driver assignment lookup
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_active 
ON vehicles(driverId, isActive, companyId) 
WHERE driverId IS NOT NULL;

-- Vehicle type filtering for fleet reports
CREATE INDEX IF NOT EXISTS idx_vehicles_type_company 
ON vehicles(vehicleType, companyId, isActive, createdAt DESC);

-- Quick license plate search (for dispatch)
CREATE INDEX IF NOT EXISTS idx_vehicles_license_company 
ON vehicles(licensePlate, companyId) 
WHERE isActive = true;

-- Insurance/registration expiry tracking
CREATE INDEX IF NOT EXISTS idx_vehicles_insurance_expiry 
ON vehicles(companyId, ((insurance->>'expiryDate')::date)) 
WHERE insurance IS NOT NULL AND isActive = true;

CREATE INDEX IF NOT EXISTS idx_vehicles_registration_expiry 
ON vehicles(companyId, ((registration->>'expiryDate')::date)) 
WHERE registration IS NOT NULL AND isActive = true;

-- ═══════════════════════════════════════════════════════════════
-- COMPANY_VEHICLES TABLE - Extended fleet data
-- ═══════════════════════════════════════════════════════════════

-- Fast listing by company and status
CREATE INDEX IF NOT EXISTS idx_company_vehicles_status 
ON company_vehicles(companyId, status, updatedAt DESC);

-- Vehicle class and type filtering
CREATE INDEX IF NOT EXISTS idx_company_vehicles_class 
ON company_vehicles(companyId, vehicleClass, bodyType, status);

-- Registration lookup
CREATE INDEX IF NOT EXISTS idx_company_vehicles_registration 
ON company_vehicles(registrationNumber, companyId);

-- Expiry tracking for compliance
CREATE INDEX IF NOT EXISTS idx_company_vehicles_reg_expiry 
ON company_vehicles(companyId, registrationExpiry) 
WHERE registrationExpiry IS NOT NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_company_vehicles_insurance_expiry 
ON company_vehicles(companyId, insuranceExpiry) 
WHERE insuranceExpiry IS NOT NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_company_vehicles_inspection_expiry 
ON company_vehicles(companyId, inspectionExpiry) 
WHERE inspectionExpiry IS NOT NULL AND status = 'ACTIVE';

-- Wheelchair accessible vehicles
CREATE INDEX IF NOT EXISTS idx_company_vehicles_wheelchair 
ON company_vehicles(companyId, wheelchairAccessible, status) 
WHERE wheelchairAccessible = true;

-- Callsign search for dispatch
CREATE INDEX IF NOT EXISTS idx_company_vehicles_callsign 
ON company_vehicles(dispatchCallsign, companyId) 
WHERE dispatchCallsign IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- VEHICLE_ZONES TABLE - Zone assignments
-- ═══════════════════════════════════════════════════════════════

-- Fast zone lookup for vehicles
CREATE INDEX IF NOT EXISTS idx_vehicle_zones_approved 
ON vehicle_zones(vehicleId, isApproved, canOperate);

-- Zone-based vehicle search
CREATE INDEX IF NOT EXISTS idx_vehicle_zones_zone_approved 
ON vehicle_zones(zoneId, isApproved, canOperate, vehicleId);

-- Validity period checks
CREATE INDEX IF NOT EXISTS idx_vehicle_zones_validity 
ON vehicle_zones(vehicleId, validFrom, validTo) 
WHERE validFrom IS NOT NULL AND validTo IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- COMPANY_DRIVERS TABLE - Driver-vehicle relationships
-- ═══════════════════════════════════════════════════════════════

-- Active driver lookup for vehicle assignment
CREATE INDEX IF NOT EXISTS idx_company_drivers_active 
ON company_drivers(companyId, status, userId) 
WHERE status = 'ACTIVE';

-- User-company relationship
CREATE INDEX IF NOT EXISTS idx_company_drivers_user 
ON company_drivers(userId, companyId, status);

-- ═══════════════════════════════════════════════════════════════
-- USERS TABLE - Driver details for fleet management
-- ═══════════════════════════════════════════════════════════════

-- Available drivers for vehicle assignment
CREATE INDEX IF NOT EXISTS idx_users_drivers_available 
ON users(companyId, role, isActive, updatedAt DESC) 
WHERE role = 'DRIVER';

-- Driver license/document expiry
CREATE INDEX IF NOT EXISTS idx_users_driver_license_expiry
ON users(companyId, ((licenseDetails->>'expiryDate')::date)) 
WHERE role = 'DRIVER' AND licenseDetails IS NOT NULL;-- ═══════════════════════════════════════════════════════════════
-- VACUUM AND ANALYZE - Optimize storage and update statistics
-- ═══════════════════════════════════════════════════════════════

VACUUM ANALYZE vehicles;
VACUUM ANALYZE company_vehicles;
VACUUM ANALYZE vehicle_zones;
VACUUM ANALYZE company_drivers;
VACUUM ANALYZE users;

-- ═══════════════════════════════════════════════════════════════
-- Create helpful database functions for fleet management
-- ═══════════════════════════════════════════════════════════════

-- Function to get available vehicles count
CREATE OR REPLACE FUNCTION get_available_vehicles_count(p_company_id TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM vehicles
        WHERE companyId = p_company_id
        AND isActive = true
        AND isAvailable = true
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get vehicles expiring soon
CREATE OR REPLACE FUNCTION get_expiring_vehicles(
    p_company_id TEXT,
    p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE(
    vehicle_id TEXT,
    license_plate TEXT,
    expiry_type TEXT,
    expiry_date DATE,
    days_until_expiry INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cv.id,
        cv.registrationNumber,
        'REGISTRATION'::TEXT,
        cv.registrationExpiry::DATE,
        (cv.registrationExpiry::DATE - CURRENT_DATE)
    FROM company_vehicles cv
    WHERE cv.companyId = p_company_id
    AND cv.status = 'ACTIVE'
    AND cv.registrationExpiry IS NOT NULL
    AND cv.registrationExpiry::DATE <= (CURRENT_DATE + p_days_ahead)
    
    UNION ALL
    
    SELECT 
        cv.id,
        cv.registrationNumber,
        'INSURANCE'::TEXT,
        cv.insuranceExpiry::DATE,
        (cv.insuranceExpiry::DATE - CURRENT_DATE)
    FROM company_vehicles cv
    WHERE cv.companyId = p_company_id
    AND cv.status = 'ACTIVE'
    AND cv.insuranceExpiry IS NOT NULL
    AND cv.insuranceExpiry::DATE <= (CURRENT_DATE + p_days_ahead)
    
    UNION ALL
    
    SELECT 
        cv.id,
        cv.registrationNumber,
        'INSPECTION'::TEXT,
        cv.inspectionExpiry::DATE,
        (cv.inspectionExpiry::DATE - CURRENT_DATE)
    FROM company_vehicles cv
    WHERE cv.companyId = p_company_id
    AND cv.status = 'ACTIVE'
    AND cv.inspectionExpiry IS NOT NULL
    AND cv.inspectionExpiry::DATE <= (CURRENT_DATE + p_days_ahead)
    ORDER BY expiry_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════════════════════
-- Summary and verification
-- ═══════════════════════════════════════════════════════════════

SELECT 
    'Fleet Management Indexes Created!' as status,
    COUNT(*) FILTER (WHERE tablename = 'vehicles') as vehicles_indexes,
    COUNT(*) FILTER (WHERE tablename = 'company_vehicles') as company_vehicles_indexes,
    COUNT(*) FILTER (WHERE tablename = 'vehicle_zones') as vehicle_zones_indexes,
    COUNT(*) as total_indexes
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('vehicles', 'company_vehicles', 'vehicle_zones', 'company_drivers');

-- Show estimated performance improvement
SELECT 
    'Performance Analysis' as category,
    relname as table_name,
    seq_scan as sequential_scans,
    idx_scan as index_scans,
    CASE 
        WHEN seq_scan > 0 THEN ROUND((idx_scan::numeric / seq_scan::numeric) * 100, 2)
        ELSE 0
    END as index_usage_percentage
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND relname IN ('vehicles', 'company_vehicles', 'vehicle_zones')
ORDER BY relname;
