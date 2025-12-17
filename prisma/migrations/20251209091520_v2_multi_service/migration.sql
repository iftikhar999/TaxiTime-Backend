-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TAXI', 'DELIVERY', 'COURIER');

-- CreateEnum
CREATE TYPE "CourierStopType" AS ENUM ('PICKUP', 'DROPOFF', 'RETURN');

-- CreateEnum
CREATE TYPE "CourierStopStatus" AS ENUM ('PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('PHOTO', 'SIGNATURE', 'PIN', 'CODE', 'NOTE');

-- CreateEnum
CREATE TYPE "JobChannel" AS ENUM ('DISPATCH', 'PASSENGER_APP', 'OWNER_API', 'SCHEDULED', 'WEB_WIDGET');

-- CreateEnum
CREATE TYPE "RouteOptimizationStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'OPTIMIZED', 'FAILED');

-- CreateEnum
CREATE TYPE "PodVerificationResult" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MerchantType" AS ENUM ('RESTAURANT', 'GROCERY', 'PHARMACY', 'STORE', 'OTHER');

-- CreateEnum
CREATE TYPE "MerchantUserRole" AS ENUM ('MERCHANT_OWNER', 'MERCHANT_MANAGER', 'MERCHANT_STAFF');

-- CreateEnum
CREATE TYPE "MerchantOrderStatus" AS ENUM ('PENDING_MERCHANT', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'CANCELLED_BY_MERCHANT', 'CANCELLED_BY_CUSTOMER');

-- AlterTable
ALTER TABLE "alarms" ADD COLUMN     "serviceType" "ServiceType";

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "serviceType" "ServiceType" NOT NULL DEFAULT 'TAXI';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultServiceType" "ServiceType",
ADD COLUMN     "serviceModeVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "delivery_orders" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dropoffWindowEnd" TIMESTAMP(3),
ADD COLUMN     "dropoffWindowStart" TIMESTAMP(3),
ADD COLUMN     "failReason" TEXT,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "itemsStructured" JSONB,
ADD COLUMN     "merchantStatus" "MerchantOrderStatus",
ADD COLUMN     "pickupWindowEnd" TIMESTAMP(3),
ADD COLUMN     "pickupWindowStart" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "tipAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "driver_earnings" ADD COLUMN     "serviceType" "ServiceType" DEFAULT 'TAXI';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "channel" "JobChannel" NOT NULL DEFAULT 'DISPATCH',
ADD COLUMN     "channelMetadata" JSONB,
ADD COLUMN     "deliveryType" "DeliveryType",
ADD COLUMN     "dropoffContactName" TEXT,
ADD COLUMN     "dropoffContactPhone" TEXT,
ADD COLUMN     "dropoffWindowEnd" TIMESTAMP(3),
ADD COLUMN     "dropoffWindowStart" TIMESTAMP(3),
ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupContactPhone" TEXT,
ADD COLUMN     "pickupWindowEnd" TIMESTAMP(3),
ADD COLUMN     "pickupWindowStart" TIMESTAMP(3),
ADD COLUMN     "podType" "ProofType",
ADD COLUMN     "pricingProfileId" TEXT,
ADD COLUMN     "proofRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnToSender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceMetadata" JSONB,
ADD COLUMN     "serviceType" "ServiceType" NOT NULL DEFAULT 'TAXI',
ADD COLUMN     "stopCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "tipAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "location_updates" ADD COLUMN     "serviceType" "ServiceType";

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "autoAcceptOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avgPrepTimeMinutes" INTEGER DEFAULT 15,
ADD COLUMN     "bankDetailsEncrypted" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "minOrderAmount" DECIMAL(10,2),
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "type" "MerchantType";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "serviceType" "ServiceType";

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "serviceType" "ServiceType" NOT NULL DEFAULT 'TAXI';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "serviceType" "ServiceType" DEFAULT 'TAXI';

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "serviceType" "ServiceType" DEFAULT 'TAXI';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "cargoVolumeCubicCm" INTEGER,
ADD COLUMN     "coldChain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxLoadKg" DOUBLE PRECISION,
ADD COLUMN     "supportsCourier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportsDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supportsTaxi" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "company_services" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pricingProfileId" TEXT,
    "autoDispatch" BOOLEAN NOT NULL DEFAULT false,
    "maxParallelOffers" INTEGER NOT NULL DEFAULT 3,
    "slaSeconds" INTEGER NOT NULL DEFAULT 300,
    "dispatchRadiusKm" DOUBLE PRECISION,
    "operatingHoursJson" JSONB,
    "geoFenceJson" JSONB,
    "metadata" JSONB,

    CONSTRAINT "company_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pricing_profiles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "baseFare" DECIMAL(10,2) NOT NULL,
    "perKm" DECIMAL(10,2) NOT NULL,
    "perMinute" DECIMAL(10,2) NOT NULL,
    "minFare" DECIMAL(10,2) NOT NULL,
    "pickupFee" DECIMAL(10,2),
    "dropoffFee" DECIMAL(10,2),
    "stopFee" DECIMAL(10,2),
    "waitingPerMin" DECIMAL(10,2),
    "surgeJson" JSONB,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "service_pricing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pricing_rules" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pricingProfileId" TEXT NOT NULL,
    "zoneId" TEXT,
    "vehicleType" "VehicleType",
    "timeWindowJson" JSONB,
    "multiplier" DOUBLE PRECISION,
    "flatAdjustment" DECIMAL(10,2),
    "metadata" JSONB,

    CONSTRAINT "service_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_stops" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "CourierStopType" NOT NULL,
    "status" "CourierStopStatus" NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "eta" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "proofRequired" BOOLEAN NOT NULL DEFAULT false,
    "proofType" "ProofType",
    "pincode" TEXT,
    "instructions" TEXT,
    "metadata" JSONB,

    CONSTRAINT "job_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_stop_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "weightGrams" INTEGER,
    "volumeCubicCm" INTEGER,
    "price" DECIMAL(10,2),
    "metadata" JSONB,

    CONSTRAINT "job_stop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_stop_proofs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "ProofType" NOT NULL,
    "photoUrls" TEXT[],
    "signatureUrl" TEXT,
    "note" TEXT,
    "recipientName" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "verificationResult" "PodVerificationResult",
    "metadata" JSONB,

    CONSTRAINT "job_stop_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_routes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "completedStops" INTEGER NOT NULL DEFAULT 0,
    "returnRequired" BOOLEAN NOT NULL DEFAULT false,
    "returnStopId" TEXT,
    "routeOptimized" BOOLEAN NOT NULL DEFAULT false,
    "optimizationStatus" "RouteOptimizationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "routePlanJson" JSONB,
    "metadata" JSONB,

    CONSTRAINT "courier_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "stopId" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "event" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MerchantUserRole" NOT NULL,
    "permissions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "merchant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sequence" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TEXT,
    "availableTo" TEXT,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "discountPrice" DECIMAL(10,2),
    "discountValidUntil" TIMESTAMP(3),
    "imageUrl" TEXT,
    "prepTimeMinutes" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "modifiersJson" JSONB,
    "tags" TEXT[],
    "allergens" TEXT[],
    "calories" INTEGER,
    "nutritionJson" JSONB,
    "maxQuantity" INTEGER NOT NULL DEFAULT 99,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_zones" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "minOrderAmount" DECIMAL(10,2) NOT NULL,
    "maxDeliveryRadiusKm" DOUBLE PRECISION,
    "estimatedDeliveryMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priorityOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "merchant_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_operating_exceptions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "reason" TEXT,

    CONSTRAINT "merchant_operating_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_routeStops" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_routeStops_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "company_services_companyId_idx" ON "company_services"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_services_companyId_serviceType_key" ON "company_services"("companyId", "serviceType");

-- CreateIndex
CREATE INDEX "service_pricing_profiles_companyId_serviceType_active_idx" ON "service_pricing_profiles"("companyId", "serviceType", "active");

-- CreateIndex
CREATE INDEX "service_pricing_rules_pricingProfileId_idx" ON "service_pricing_rules"("pricingProfileId");

-- CreateIndex
CREATE INDEX "service_pricing_rules_zoneId_idx" ON "service_pricing_rules"("zoneId");

-- CreateIndex
CREATE INDEX "job_stops_jobId_sequence_idx" ON "job_stops"("jobId", "sequence");

-- CreateIndex
CREATE INDEX "job_stops_jobId_status_idx" ON "job_stops"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "courier_routes_jobId_key" ON "courier_routes"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "courier_routes_returnStopId_key" ON "courier_routes"("returnStopId");

-- CreateIndex
CREATE INDEX "job_events_jobId_createdAt_idx" ON "job_events"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "job_events_stopId_createdAt_idx" ON "job_events"("stopId", "createdAt");

-- CreateIndex
CREATE INDEX "merchant_users_merchantId_idx" ON "merchant_users"("merchantId");

-- CreateIndex
CREATE INDEX "merchant_users_userId_idx" ON "merchant_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_users_merchantId_userId_key" ON "merchant_users"("merchantId", "userId");

-- CreateIndex
CREATE INDEX "menu_categories_merchantId_idx" ON "menu_categories"("merchantId");

-- CreateIndex
CREATE INDEX "menu_categories_merchantId_sequence_idx" ON "menu_categories"("merchantId", "sequence");

-- CreateIndex
CREATE INDEX "menu_items_categoryId_idx" ON "menu_items"("categoryId");

-- CreateIndex
CREATE INDEX "menu_items_merchantId_idx" ON "menu_items"("merchantId");

-- CreateIndex
CREATE INDEX "menu_items_merchantId_isAvailable_idx" ON "menu_items"("merchantId", "isAvailable");

-- CreateIndex
CREATE INDEX "merchant_zones_merchantId_idx" ON "merchant_zones"("merchantId");

-- CreateIndex
CREATE INDEX "merchant_zones_zoneId_idx" ON "merchant_zones"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_zones_merchantId_zoneId_key" ON "merchant_zones"("merchantId", "zoneId");

-- CreateIndex
CREATE INDEX "merchant_operating_exceptions_merchantId_date_idx" ON "merchant_operating_exceptions"("merchantId", "date");

-- CreateIndex
CREATE INDEX "_routeStops_B_index" ON "_routeStops"("B");

-- CreateIndex
CREATE INDEX "assignments_driverId_serviceType_status_idx" ON "assignments"("driverId", "serviceType", "status");

-- CreateIndex
CREATE INDEX "driver_earnings_serviceType_earnedAt_idx" ON "driver_earnings"("serviceType", "earnedAt" DESC);

-- CreateIndex
CREATE INDEX "jobs_serviceType_status_idx" ON "jobs"("serviceType", "status");

-- CreateIndex
CREATE INDEX "jobs_channel_createdAt_idx" ON "jobs"("channel", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "merchants_companyId_idx" ON "merchants"("companyId");

-- CreateIndex
CREATE INDEX "merchants_companyId_isActive_idx" ON "merchants"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "merchants_latitude_longitude_idx" ON "merchants"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "offers_driverId_serviceType_status_idx" ON "offers"("driverId", "serviceType", "status");

-- CreateIndex
CREATE INDEX "payments_serviceType_createdAt_idx" ON "payments"("serviceType", "createdAt");

-- CreateIndex
CREATE INDEX "rides_serviceType_status_idx" ON "rides"("serviceType", "status");

-- AddForeignKey
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_services" ADD CONSTRAINT "company_services_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "service_pricing_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing_profiles" ADD CONSTRAINT "service_pricing_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing_rules" ADD CONSTRAINT "service_pricing_rules_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "service_pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing_rules" ADD CONSTRAINT "service_pricing_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "service_pricing_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stops" ADD CONSTRAINT "job_stops_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stop_items" ADD CONSTRAINT "job_stop_items_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "job_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stop_proofs" ADD CONSTRAINT "job_stop_proofs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stop_proofs" ADD CONSTRAINT "job_stop_proofs_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "job_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_stop_proofs" ADD CONSTRAINT "job_stop_proofs_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_routes" ADD CONSTRAINT "courier_routes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_routes" ADD CONSTRAINT "courier_routes_returnStopId_fkey" FOREIGN KEY ("returnStopId") REFERENCES "job_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "job_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_zones" ADD CONSTRAINT "merchant_zones_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_zones" ADD CONSTRAINT "merchant_zones_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_operating_exceptions" ADD CONSTRAINT "merchant_operating_exceptions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_routeStops" ADD CONSTRAINT "_routeStops_A_fkey" FOREIGN KEY ("A") REFERENCES "courier_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_routeStops" ADD CONSTRAINT "_routeStops_B_fkey" FOREIGN KEY ("B") REFERENCES "job_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

