-- CreateEnum
CREATE TYPE "RideOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'TIMEOUT');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "autoAssignTimeoutSeconds" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "autoDispatchEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dispatchStrategy" TEXT NOT NULL DEFAULT 'ZONE_QUEUE',
ADD COLUMN     "maxDispatchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5.0;

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "offeredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "queue" JSONB DEFAULT '[]';

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RideOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "respondedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_offers_rideId_status_idx" ON "ride_offers"("rideId", "status");

-- CreateIndex
CREATE INDEX "ride_offers_driverId_status_idx" ON "ride_offers"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ride_offers_rideId_driverId_key" ON "ride_offers"("rideId", "driverId");

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
