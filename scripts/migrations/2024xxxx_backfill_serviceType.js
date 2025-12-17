/**
 * Backfill serviceType and related fields from legacy data.
 * Safe-ish: only updates null/undefined serviceType fields.
 */
const prisma = require('../../lib/prisma');

async function backfillJobs() {
  await prisma.$executeRawUnsafe(
    `UPDATE "jobs"
     SET "serviceType" = CASE
       WHEN "type" = 'TAXI' THEN 'TAXI'::"ServiceType"
       WHEN "type" = 'DELIVERY' THEN 'DELIVERY'::"ServiceType"
       WHEN "type" = 'COURIER' THEN 'COURIER'::"ServiceType"
     END
     WHERE "serviceType" IS NULL`
  );
}

async function backfillAssignments() {
  await prisma.$executeRawUnsafe(
    `UPDATE "assignments" SET "serviceType" = 'TAXI' WHERE "serviceType" IS NULL`
  );
}

async function backfillOffers() {
  await prisma.$executeRawUnsafe(
    `UPDATE "offers" SET "serviceType" = 'TAXI' WHERE "serviceType" IS NULL`
  );
}

async function backfillPayments() {
  await prisma.$executeRawUnsafe(
    `UPDATE "payments" SET "serviceType" = 'TAXI' WHERE "serviceType" IS NULL`
  );
}

async function backfillDriverEarnings() {
  await prisma.$executeRawUnsafe(
    `UPDATE "driver_earnings" SET "serviceType" = 'TAXI' WHERE "serviceType" IS NULL`
  );
}

async function backfillRides() {
  await prisma.$executeRawUnsafe(
    `UPDATE "rides" SET "serviceType" = 'TAXI' WHERE "serviceType" IS NULL`
  );
}

async function main() {
  await backfillJobs();
  await backfillAssignments();
  await backfillOffers();
  await backfillPayments();
  await backfillDriverEarnings();
  await backfillRides();
  console.log('serviceType backfill completed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
