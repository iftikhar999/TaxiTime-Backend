-- Rollback script for V2 additions (run in staging only; review before prod).
-- Drops new tables, columns, and enums added by v2_multi_service.

-- Drop junctions and new tables (reverse dependency order)
DROP TABLE IF EXISTS "_routeStops" CASCADE;
DROP TABLE IF EXISTS merchant_operating_exceptions CASCADE;
DROP TABLE IF EXISTS merchant_zones CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS merchant_users CASCADE;
DROP TABLE IF EXISTS job_stop_proofs CASCADE;
DROP TABLE IF EXISTS job_stop_items CASCADE;
DROP TABLE IF EXISTS job_events CASCADE;
DROP TABLE IF EXISTS courier_routes CASCADE;
DROP TABLE IF EXISTS job_stops CASCADE;
DROP TABLE IF EXISTS service_pricing_rules CASCADE;
DROP TABLE IF EXISTS service_pricing_profiles CASCADE;
DROP TABLE IF EXISTS company_services CASCADE;

-- Drop added columns
ALTER TABLE jobs DROP COLUMN IF EXISTS serviceType;
ALTER TABLE jobs DROP COLUMN IF EXISTS channel;
ALTER TABLE jobs DROP COLUMN IF EXISTS pricingProfileId;
ALTER TABLE jobs DROP COLUMN IF EXISTS pickupContactName;
ALTER TABLE jobs DROP COLUMN IF EXISTS pickupContactPhone;
ALTER TABLE jobs DROP COLUMN IF EXISTS pickupWindowStart;
ALTER TABLE jobs DROP COLUMN IF EXISTS pickupWindowEnd;
ALTER TABLE jobs DROP COLUMN IF EXISTS dropoffContactName;
ALTER TABLE jobs DROP COLUMN IF EXISTS dropoffContactPhone;
ALTER TABLE jobs DROP COLUMN IF EXISTS dropoffWindowStart;
ALTER TABLE jobs DROP COLUMN IF EXISTS dropoffWindowEnd;
ALTER TABLE jobs DROP COLUMN IF EXISTS deliveryType;
ALTER TABLE jobs DROP COLUMN IF EXISTS tipAmount;
ALTER TABLE jobs DROP COLUMN IF EXISTS stopCount;
ALTER TABLE jobs DROP COLUMN IF EXISTS proofRequired;
ALTER TABLE jobs DROP COLUMN IF EXISTS podType;
ALTER TABLE jobs DROP COLUMN IF EXISTS returnToSender;
ALTER TABLE jobs DROP COLUMN IF EXISTS tags;
ALTER TABLE jobs DROP COLUMN IF EXISTS serviceMetadata;
ALTER TABLE jobs DROP COLUMN IF EXISTS channelMetadata;

ALTER TABLE delivery_orders DROP COLUMN IF EXISTS itemsStructured;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS pickupWindowStart;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS pickupWindowEnd;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS dropoffWindowStart;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS dropoffWindowEnd;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS failReason;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS attemptCount;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS priority;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS instructions;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS tipAmount;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS merchantStatus;

ALTER TABLE assignments DROP COLUMN IF EXISTS serviceType;
ALTER TABLE offers DROP COLUMN IF EXISTS serviceType;
ALTER TABLE payments DROP COLUMN IF EXISTS serviceType;
ALTER TABLE driver_earnings DROP COLUMN IF EXISTS serviceType;
ALTER TABLE rides DROP COLUMN IF EXISTS serviceType;
ALTER TABLE location_updates DROP COLUMN IF EXISTS serviceType;
ALTER TABLE alarms DROP COLUMN IF EXISTS serviceType;
ALTER TABLE messages DROP COLUMN IF EXISTS serviceType;
ALTER TABLE vehicles DROP COLUMN IF EXISTS supportsTaxi;
ALTER TABLE vehicles DROP COLUMN IF EXISTS supportsDelivery;
ALTER TABLE vehicles DROP COLUMN IF EXISTS supportsCourier;
ALTER TABLE vehicles DROP COLUMN IF EXISTS cargoVolumeCubicCm;
ALTER TABLE vehicles DROP COLUMN IF EXISTS maxLoadKg;
ALTER TABLE vehicles DROP COLUMN IF EXISTS coldChain;
ALTER TABLE companies DROP COLUMN IF EXISTS defaultServiceType;
ALTER TABLE companies DROP COLUMN IF EXISTS serviceModeVersion;
ALTER TABLE merchants DROP COLUMN IF EXISTS latitude;
ALTER TABLE merchants DROP COLUMN IF EXISTS longitude;
ALTER TABLE merchants DROP COLUMN IF EXISTS coverImage;
ALTER TABLE merchants DROP COLUMN IF EXISTS type;
ALTER TABLE merchants DROP COLUMN IF EXISTS avgPrepTimeMinutes;
ALTER TABLE merchants DROP COLUMN IF EXISTS minOrderAmount;
ALTER TABLE merchants DROP COLUMN IF EXISTS autoAcceptOrders;
ALTER TABLE merchants DROP COLUMN IF EXISTS bankDetailsEncrypted;
ALTER TABLE merchants DROP COLUMN IF EXISTS contactName;
ALTER TABLE merchants DROP COLUMN IF EXISTS contactPhone;
ALTER TABLE merchants DROP COLUMN IF EXISTS contactEmail;
ALTER TABLE merchants DROP COLUMN IF EXISTS tags;
ALTER TABLE merchants DROP COLUMN IF EXISTS metadata;

-- Drop enums (only if not used elsewhere)
DROP TYPE IF EXISTS "ServiceType";
DROP TYPE IF EXISTS "CourierStopType";
DROP TYPE IF EXISTS "CourierStopStatus";
DROP TYPE IF EXISTS "ProofType";
DROP TYPE IF EXISTS "JobChannel";
DROP TYPE IF EXISTS "RouteOptimizationStatus";
DROP TYPE IF EXISTS "PodVerificationResult";
DROP TYPE IF EXISTS "MerchantType";
DROP TYPE IF EXISTS "MerchantUserRole";
DROP TYPE IF EXISTS "MerchantOrderStatus";
