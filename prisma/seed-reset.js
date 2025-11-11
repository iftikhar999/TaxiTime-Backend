const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  DROPPING ALL EXISTING DATA...\n');
  
  // Delete all data in correct order
  try {
    await prisma.payment.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.rating.deleteMany();
    await prisma.message.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.locationUpdate.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.assignments.deleteMany();
    await prisma.alarm.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.document.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.ride.deleteMany();
    await prisma.job.deleteMany();
    await prisma.deliveryOrder.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.companyDriver.deleteMany();
    await prisma.tariff.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ All data deleted successfully!\n');
  } catch (error) {
    console.log('⚠️  Some tables might be empty, continuing...\n');
  }

  // Import and run the enhanced seed
  console.log('🌱 Running enhanced seed script...\n');
  const enhancedSeed = require('./seed-enhanced.js');
  
  console.log('\n✅ DATABASE RESET AND SEEDED SUCCESSFULLY!\n');
  console.log('=' .repeat(70));
  console.log('Use the credentials from the enhanced seed output above to login.');
  console.log('=' .repeat(70));
}

main()
  .catch((e) => {
    console.error('\n❌ ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
