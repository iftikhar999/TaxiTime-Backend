-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('TAXI', 'DELIVERY', 'COURIER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('FOOD', 'GROCERY', 'PHARMACY', 'PACKAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('SERVICE_AREA', 'RESTRICTED', 'HIGH_DEMAND', 'AIRPORT', 'DOWNTOWN');

-- CreateEnum
CREATE TYPE "OfferResponse" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "AlarmSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlarmStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'BONUS', 'PENALTY', 'COMMISSION');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'LOCATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB_ASSIGNED', 'JOB_ACCEPTED', 'JOB_STARTED', 'JOB_COMPLETED', 'PAYMENT_RECEIVED', 'SYSTEM_ALERT', 'PROMOTION');

-- CreateEnum
CREATE TYPE "AlarmType" AS ENUM ('PANIC', 'EMERGENCY', 'MAINTENANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'PERMIT', 'ID_CARD', 'PHOTO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY', 'BREAK');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'DRIVER', 'DISPATCHER', 'OWNER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "RideType" AS ENUM ('TAXI', 'FOOD_DELIVERY', 'COURIER');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'PENDING', 'ACCEPTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'HATCHBACK', 'MOTORCYCLE', 'BICYCLE', 'VAN', 'TRUCK');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'WALLET', 'DIGITAL_WALLET', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CompanyDocumentType" AS ENUM ('CERTIFICATE_OF_INCORPORATION', 'TAX_CERTIFICATE', 'INSURANCE_POLICY', 'OPERATING_LICENSE', 'DATA_PROTECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DispatchMode" AS ENUM ('AUTO', 'MANUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CommissionModel" AS ENUM ('FLAT', 'PERCENTAGE', 'TIERED');

-- CreateEnum
CREATE TYPE "PayoutFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PASSENGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "address" JSONB,
    "preferences" JSONB,
    "rating" JSONB,
    "companyId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "legalName" TEXT,
    "brandName" TEXT,
    "companyCode" TEXT,
    "companyType" TEXT NOT NULL DEFAULT 'TAXI_OPERATOR',
    "businessModel" TEXT NOT NULL DEFAULT 'B2C',
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "primaryLanguage" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activationDate" TIMESTAMP(3),
    "primaryContactName" TEXT,
    "primaryContactRole" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "billingEmail" TEXT,
    "hqAddressLine1" TEXT,
    "hqAddressLine2" TEXT,
    "hqCity" TEXT,
    "hqState" TEXT,
    "hqPostcode" TEXT,
    "hqCountry" TEXT,
    "hqLatitude" DOUBLE PRECISION,
    "hqLongitude" DOUBLE PRECISION,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "kycLastReviewedAt" TIMESTAMP(3),
    "kycExpiryAt" TIMESTAMP(3),
    "docCertificateOfIncorporationUrl" TEXT,
    "docTaxCertificateUrl" TEXT,
    "docInsurancePolicyUrl" TEXT,
    "docOperatingLicenseUrl" TEXT,
    "insurancePolicyNumber" TEXT,
    "insuranceExpiryDate" TIMESTAMP(3),
    "permitNumber" TEXT,
    "permitExpiryDate" TIMESTAMP(3),
    "serviceModes" JSONB,
    "operatingHoursJson" JSONB,
    "holidayCalendarJson" JSONB,
    "dispatchMode" TEXT NOT NULL DEFAULT 'AUTO',
    "autoAssignRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxParallelOffers" INTEGER NOT NULL DEFAULT 3,
    "escalationSlaSeconds" INTEGER NOT NULL DEFAULT 300,
    "driverBreakPolicyJson" JSONB,
    "vehicleAgeLimitYears" INTEGER DEFAULT 15,
    "requiresVehicleInspection" BOOLEAN NOT NULL DEFAULT true,
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "billingStartDate" TIMESTAMP(3),
    "billingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "commissionModel" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "driverPayoutFrequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "settlementThresholdAmount" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "paymentGatewayAccountId" TEXT,
    "stripeConnectedAccountId" TEXT,
    "invoiceDeliveryMethod" TEXT NOT NULL DEFAULT 'EMAIL',
    "latePaymentPolicyJson" JSONB,
    "walletEnabled" BOOLEAN NOT NULL DEFAULT false,
    "walletTopupMinimum" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "subscriptionPlanId" INTEGER,
    "subscriptionStartDate" TIMESTAMP(3),
    "subscriptionEndDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "lastPaymentDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedBy" TEXT,
    "reactivatedAt" TIMESTAMP(3),
    "reactivatedBy" TEXT,
    "subscriptionUpdatedAt" TIMESTAMP(3),
    "subscriptionUpdatedBy" TEXT,
    "fleetSizeTotal" INTEGER NOT NULL DEFAULT 0,
    "fleetCompanyOwnedCount" INTEGER NOT NULL DEFAULT 0,
    "fleetDriverOwnedCount" INTEGER NOT NULL DEFAULT 0,
    "fleetActiveVehicleCount" INTEGER NOT NULL DEFAULT 0,
    "fleetInserviceVehicleCount" INTEGER NOT NULL DEFAULT 0,
    "fleetOutofserviceVehicleCount" INTEGER NOT NULL DEFAULT 0,
    "fleetAvgVehicleAgeYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fleetHasEvCount" INTEGER NOT NULL DEFAULT 0,
    "voipProvider" TEXT,
    "voipAccountId" TEXT,
    "voipMaskingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cctvProvider" TEXT,
    "cctvAccountId" TEXT,
    "telematicsProvider" TEXT,
    "telematicsApiKey" TEXT,
    "smsSenderId" TEXT,
    "emailSenderDomain" TEXT,
    "webhookEndpointUrl" TEXT,
    "webhookSecret" TEXT,
    "apiClientId" TEXT,
    "apiClientSecretHash" TEXT,
    "kpiTargetsJson" JSONB,
    "alertRecipientEmails" TEXT[],
    "alertRecipientSms" TEXT[],
    "panicEscalationContactsJson" JSONB,
    "reportingTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 2555,
    "gdprContactEmail" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "logo" TEXT,
    "website" TEXT,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passengerId" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "companyId" TEXT NOT NULL,
    "rideType" "RideType" NOT NULL DEFAULT 'TAXI',
    "pickup" JSONB NOT NULL,
    "destination" JSONB NOT NULL,
    "stops" JSONB,
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "estimatedDistance" DOUBLE PRECISION,
    "actualDistance" DOUBLE PRECISION,
    "estimatedDuration" INTEGER,
    "actualDuration" INTEGER,
    "estimatedFare" DOUBLE PRECISION,
    "actualFare" DOUBLE PRECISION,
    "fareBreakdown" JSONB,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "requirements" JSONB,
    "passengerRating" JSONB,
    "driverRating" JSONB,
    "route" JSONB,
    "cancellationReason" TEXT,
    "cancelledBy" TEXT,
    "promoCode" TEXT,
    "discountAmount" DOUBLE PRECISION,
    "foodDeliveryDetails" JSONB,
    "courierDetails" JSONB,
    "tariffId" TEXT,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "vin" TEXT,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "companyId" TEXT NOT NULL,
    "driverId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "insurance" JSONB,
    "registration" JSONB,
    "currentLocation" JSONB,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "JobType" NOT NULL DEFAULT 'TAXI',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "tripId" TEXT,
    "deliveryOrderId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "estimatedDuration" INTEGER,
    "customerId" TEXT,
    "vehicleType" "VehicleType",
    "pickupAddress" TEXT,
    "pickupLatitude" DOUBLE PRECISION,
    "pickupLongitude" DOUBLE PRECISION,
    "dropoffAddress" TEXT,
    "dropoffLatitude" DOUBLE PRECISION,
    "dropoffLongitude" DOUBLE PRECISION,
    "estimatedPrice" DOUBLE PRECISION,
    "estimatedDistance" DOUBLE PRECISION,
    "estimatedArrival" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "assignedDriverId" TEXT,
    "requirements" JSONB,
    "instructions" TEXT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "DeliveryType" NOT NULL DEFAULT 'FOOD',
    "merchantId" TEXT,
    "pickupLocation" JSONB NOT NULL,
    "dropoffLocation" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'CREATED',
    "confirmedAt" TIMESTAMP(3),
    "readyForPickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "proofOfDelivery" JSONB,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "logo" TEXT,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "cuisine" TEXT[],
    "priceRange" TEXT,
    "rating" DOUBLE PRECISION DEFAULT 0,
    "ratingCount" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "operatingHours" JSONB,
    "menu" JSONB,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "boundaries" JSONB NOT NULL,
    "type" "ZoneType" NOT NULL DEFAULT 'SERVICE_AREA',
    "tariffId" TEXT,
    "surgeMultiplier" DECIMAL(3,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "specialRules" JSONB,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariffs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "baseFare" DECIMAL(10,2) NOT NULL,
    "perKmRate" DECIMAL(10,2) NOT NULL,
    "perMinuteRate" DECIMAL(10,2) NOT NULL,
    "minimumFare" DECIMAL(10,2) NOT NULL,
    "waitingFee" DECIMAL(10,2),
    "airportFee" DECIMAL(10,2),
    "tollFee" DECIMAL(10,2),
    "extraStopFee" DECIMAL(10,2),
    "peakHourMultiplier" DECIMAL(3,2),
    "nightTimeMultiplier" DECIMAL(3,2),
    "maxSurgeMultiplier" DECIMAL(3,2) DEFAULT 3.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_updates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT NOT NULL,
    "jobId" TEXT,
    "tripId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "batteryLevel" INTEGER,
    "networkType" TEXT,
    "timestamp" TIMESTAMP(3),

    CONSTRAINT "location_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "estimatedFare" DECIMAL(10,2) NOT NULL,
    "estimatedDuration" INTEGER NOT NULL,
    "distanceToPickup" DOUBLE PRECISION NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "response" "OfferResponse",
    "declineReason" TEXT,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT,
    "deliveryOrderId" TEXT,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentProvider" TEXT,
    "providerTransactionId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "baseAmount" DECIMAL(10,2),
    "tips" DECIMAL(10,2),
    "taxes" DECIMAL(10,2),
    "fees" DECIMAL(10,2),
    "discounts" DECIMAL(10,2),
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeCustomerId" TEXT,
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(10,2),
    "refundReason" TEXT,
    "settledAt" TIMESTAMP(3),
    "settlementNotes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "balanceBefore" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tripId" TEXT,
    "deliveryOrderId" TEXT,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "tags" TEXT[],
    "isModerated" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "content" TEXT NOT NULL,
    "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
    "attachments" JSONB,
    "jobId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isEdited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'PUSH',
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarms" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AlarmType" NOT NULL,
    "severity" "AlarmSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "driverId" TEXT,
    "jobId" TEXT,
    "location" JSONB,
    "status" "AlarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "responseNotes" TEXT,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "tripId" TEXT,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "documentNumber" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'OFFLINE',
    "startLocation" JSONB,
    "endLocation" JSONB,
    "totalEarnings" DECIMAL(10,2),
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "totalDistance" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "logo" TEXT,
    "description" TEXT,
    "cuisine" TEXT[],
    "priceRange" TEXT,
    "rating" DOUBLE PRECISION DEFAULT 0,
    "ratingCount" INTEGER DEFAULT 0,
    "operatingHours" JSONB,
    "menu" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_vehicles" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleIdExternal" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "bodyType" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "ownershipType" TEXT NOT NULL,
    "capacityPassengers" INTEGER NOT NULL DEFAULT 4,
    "capacityBags" INTEGER NOT NULL DEFAULT 2,
    "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false,
    "dispatchCallsign" TEXT,
    "registrationNumber" TEXT NOT NULL,
    "registrationExpiry" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "inspectionExpiry" TIMESTAMP(3),
    "gpsProvider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,

    CONSTRAINT "company_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_documents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyDocumentType" NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_drivers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "contractExpiry" TIMESTAMP(3),
    "shiftPattern" TEXT,
    "licenseNumber" TEXT NOT NULL,
    "licenseExpiry" TIMESTAMP(3) NOT NULL,
    "backgroundCheckStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "backgroundCheckExpiry" TIMESTAMP(3),
    "trainingCompletedAt" TIMESTAMP(3),
    "panicContactName" TEXT,
    "panicContactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "company_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_tariffs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "serviceMode" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "zoneId" TEXT,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinuteRate" DOUBLE PRECISION NOT NULL,
    "minimumFare" DOUBLE PRECISION NOT NULL,
    "waitingFeePerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancellationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bookingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airportFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peakHourMultiplier" DOUBLE PRECISION,
    "peakHourStart" TEXT,
    "peakHourEnd" TEXT,
    "peakHour2Start" TEXT,
    "peakHour2End" TEXT,
    "weekendMultiplier" DOUBLE PRECISION,
    "nightMultiplier" DOUBLE PRECISION,
    "nightStart" TEXT,
    "nightEnd" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promoStackRulesJson" JSONB,

    CONSTRAINT "company_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_zones" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL,
    "geometryType" TEXT NOT NULL DEFAULT 'POLYGON',
    "polygonGeojson" JSONB,
    "coordinates" JSONB,
    "centerPoint" JSONB,
    "radius" DOUBLE PRECISION,
    "bounds" JSONB,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "fillOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "strokeWeight" INTEGER NOT NULL DEFAULT 2,
    "icon" TEXT,
    "priceMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "pickupAllowed" BOOLEAN NOT NULL DEFAULT true,
    "dropoffAllowed" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "description" TEXT,
    "area" DOUBLE PRECISION,
    "perimeter" DOUBLE PRECISION,
    "totalRides" INTEGER NOT NULL DEFAULT 0,
    "activeRides" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "company_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_templates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "templateData" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pricing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "vehicleLimit" INTEGER NOT NULL DEFAULT -1,
    "driverLimit" INTEGER NOT NULL DEFAULT -1,
    "rideCommission" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "features" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "setupFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionPlanId" INTEGER NOT NULL,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "basePlanCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "vehicleCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "setupFee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "vehicleCount" INTEGER NOT NULL DEFAULT 0,
    "driverCount" INTEGER NOT NULL DEFAULT 0,
    "ridesCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billingRecordId" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lineItems" JSONB NOT NULL,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "filePath" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_payments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "billingRecordId" INTEGER,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,
    "gatewayProvider" TEXT,
    "gatewayResponse" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "failureReason" TEXT,
    "processedBy" TEXT,
    "notes" TEXT,
    "receiptUrl" TEXT,

    CONSTRAINT "company_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "processedBy" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "stripePayoutId" TEXT,
    "stripeConnectedAccountId" TEXT,
    "description" TEXT,
    "processedBy" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_configurations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "lastUpdatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "global_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_configurations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "globalConfigId" TEXT,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "inheritFromGlobal" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "lastUpdatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "company_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "code3" TEXT,
    "numericCode" TEXT,
    "phoneCode" TEXT,
    "currency" TEXT,
    "flag" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_cities" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "state" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_types" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fare_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "expiryRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "companies_companyCode_key" ON "companies"("companyCode");

-- CreateIndex
CREATE UNIQUE INDEX "companies_ownerId_key" ON "companies"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "rides_rideId_key" ON "rides"("rideId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_licensePlate_key" ON "vehicles"("licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_jobId_key" ON "jobs"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_orderId_key" ON "delivery_orders"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_email_key" ON "restaurants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_drivers_companyId_userId_key" ON "company_drivers"("companyId", "userId");

-- CreateIndex
CREATE INDEX "company_tariffs_companyId_idx" ON "company_tariffs"("companyId");

-- CreateIndex
CREATE INDEX "company_tariffs_zoneId_idx" ON "company_tariffs"("zoneId");

-- CreateIndex
CREATE INDEX "company_tariffs_serviceMode_idx" ON "company_tariffs"("serviceMode");

-- CreateIndex
CREATE INDEX "company_tariffs_vehicleType_idx" ON "company_tariffs"("vehicleType");

-- CreateIndex
CREATE INDEX "company_zones_companyId_idx" ON "company_zones"("companyId");

-- CreateIndex
CREATE INDEX "company_zones_zoneType_idx" ON "company_zones"("zoneType");

-- CreateIndex
CREATE INDEX "pricing_templates_companyId_idx" ON "pricing_templates"("companyId");

-- CreateIndex
CREATE INDEX "pricing_templates_category_idx" ON "pricing_templates"("category");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_billingRecordId_key" ON "invoices"("billingRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_stripePayoutId_key" ON "payouts"("stripePayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "global_configurations_key_key" ON "global_configurations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "company_configurations_companyId_key_key" ON "company_configurations"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code3_key" ON "countries"("code3");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_name_key" ON "currencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_name_key" ON "vehicle_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_cities_code_key" ON "service_cities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_cities_name_countryId_key" ON "service_cities"("name", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "fare_types_name_key" ON "fare_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "fare_types_code_key" ON "fare_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_name_key" ON "document_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_updates" ADD CONSTRAINT "location_updates_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_updates" ADD CONSTRAINT "location_updates_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_updates" ADD CONSTRAINT "location_updates_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_vehicles" ADD CONSTRAINT "company_vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_drivers" ADD CONSTRAINT "company_drivers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_drivers" ADD CONSTRAINT "company_drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tariffs" ADD CONSTRAINT "company_tariffs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tariffs" ADD CONSTRAINT "company_tariffs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "company_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_zones" ADD CONSTRAINT "company_zones_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_templates" ADD CONSTRAINT "pricing_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payments" ADD CONSTRAINT "company_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payments" ADD CONSTRAINT "company_payments_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payments" ADD CONSTRAINT "company_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_configurations" ADD CONSTRAINT "company_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_configurations" ADD CONSTRAINT "company_configurations_globalConfigId_fkey" FOREIGN KEY ("globalConfigId") REFERENCES "global_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cities" ADD CONSTRAINT "service_cities_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
