const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDrivers() {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: 'DRIVER' },
      take: 3,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyId: true,
        isActive: true
      }
    });

    console.log('\n📋 Drivers in database:');
    console.log(JSON.stringify(drivers, null, 2));

    // Also check if password hash exists
    const driverWithPassword = await prisma.user.findFirst({
      where: { role: 'DRIVER' },
      select: {
        email: true,
        password: true
      }
    });

    console.log('\n🔑 Password hash exists:', driverWithPassword?.password ? 'Yes' : 'No');
    if (driverWithPassword?.password) {
      console.log('   Hash preview:', driverWithPassword.password.substring(0, 20) + '...');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDrivers();
