const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio'];
const streets = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm St', '654 Maple Dr', '987 Cedar Ln', '246 Birch Way'];

async function addAddressesToDrivers() {
  console.log('🔄 Adding addresses to drivers...\n');
  
  const drivers = await prisma.user.findMany({ 
    where: { role: 'DRIVER' },
    select: { id: true, firstName: true, lastName: true, address: true }
  });
  
  console.log(`Found ${drivers.length} drivers`);
  
  let updated = 0;
  for (const driver of drivers) {
    const hasAddress = driver.address && typeof driver.address === 'object' && driver.address.city;
    
    if (!hasAddress) {
      await prisma.user.update({
        where: { id: driver.id },
        data: {
          address: {
            street: streets[Math.floor(Math.random() * streets.length)],
            city: cities[Math.floor(Math.random() * cities.length)],
            state: 'CA',
            zipCode: '90001'
          }
        }
      });
      console.log(`  ✅ Added address for: ${driver.firstName} ${driver.lastName}`);
      updated++;
    }
  }
  
  console.log(`\n✅ Updated ${updated} drivers with addresses`);
  console.log(`📊 ${drivers.length - updated} drivers already had addresses`);
}

addAddressesToDrivers()
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
