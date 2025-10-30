-- ═══════════════════════════════════════════════════════════
-- MIGRATION: Refactor Tariff-Zone System
-- Date: 2025-10-15
-- ═══════════════════════════════════════════════════════════

-- Step 1: Create new junction tables
-- ───────────────────────────────────────────────────────────

-- ZoneTariff: Many-to-Many relationship between Zones and Tariffs
CREATE TABLE "zone_tariffs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zoneId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "daysOfWeek" TEXT,
    "timeFrom" TEXT,
    "timeTo" TEXT,

    CONSTRAINT "zone_tariffs_pkey" PRIMARY KEY ("id")
);

-- VehicleZone: Many-to-Many relationship between Vehicles and Zones
CREATE TABLE "vehicle_zones" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "canOperate" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),

    CONSTRAINT "vehicle_zones_pkey" PRIMARY KEY ("id")
);

-- CompanySettings: Store map provider and API keys per company
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "mapProvider" TEXT NOT NULL DEFAULT 'OPENSTREETMAP',
    "googleMapsApiKey" TEXT,
    "placeApiProvider" TEXT NOT NULL DEFAULT 'OPENSTREETMAP',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing data
-- ───────────────────────────────────────────────────────────

-- Migrate Zone.tariffId to ZoneTariff junction table
INSERT INTO "zone_tariffs" ("id", "createdAt", "zoneId", "tariffId", "isDefault", "priority")
SELECT 
    gen_random_uuid()::text,
    NOW(),
    "id" as "zoneId",
    "tariffId",
    true,
    1
FROM "zones"
WHERE "tariffId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Create default settings for all companies
INSERT INTO "company_settings" (
    "id",
    "createdAt",
    "updatedAt",
    "companyId",
    "mapProvider",
    "placeApiProvider",
    "defaultLanguage",
    "defaultCurrency",
    "timezone"
)
SELECT 
    gen_random_uuid()::text,
    NOW(),
    NOW(),
    "id",
    'OPENSTREETMAP',
    'OPENSTREETMAP',
    'en',
    'USD',
    'UTC'
FROM "companies"
ON CONFLICT DO NOTHING;

-- Step 3: Drop old columns
-- ───────────────────────────────────────────────────────────

-- Drop tariffId from zones table
ALTER TABLE "zones" DROP COLUMN IF EXISTS "tariffId";

-- Drop vehicleType from tariffs table  
ALTER TABLE "tariffs" DROP COLUMN IF EXISTS "vehicleType";

-- Step 4: Add constraints and indexes
-- ───────────────────────────────────────────────────────────

-- ZoneTariff constraints
CREATE UNIQUE INDEX "zone_tariffs_zoneId_tariffId_key" ON "zone_tariffs"("zoneId", "tariffId");
CREATE INDEX "zone_tariffs_zoneId_idx" ON "zone_tariffs"("zoneId");
CREATE INDEX "zone_tariffs_tariffId_idx" ON "zone_tariffs"("tariffId");

ALTER TABLE "zone_tariffs" ADD CONSTRAINT "zone_tariffs_zoneId_fkey" 
    FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "zone_tariffs" ADD CONSTRAINT "zone_tariffs_tariffId_fkey" 
    FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleZone constraints
CREATE UNIQUE INDEX "vehicle_zones_vehicleId_zoneId_key" ON "vehicle_zones"("vehicleId", "zoneId");
CREATE INDEX "vehicle_zones_vehicleId_idx" ON "vehicle_zones"("vehicleId");
CREATE INDEX "vehicle_zones_zoneId_idx" ON "vehicle_zones"("zoneId");

ALTER TABLE "vehicle_zones" ADD CONSTRAINT "vehicle_zones_vehicleId_fkey" 
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_zones" ADD CONSTRAINT "vehicle_zones_zoneId_fkey" 
    FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CompanySettings constraints
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" 
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════
