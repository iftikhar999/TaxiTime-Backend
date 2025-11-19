const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Find the specific job
    const job = await prisma.job.findUnique({
      where: { id: '11a93145-6289-4a4a-8200-21e81071d2c2' },
      select: {
        id: true,
        status: true
      }
    });
    
    console.log('Job Status:', JSON.stringify(job, null, 2));
    
    // Check all drivers with BUSY status but no active jobs
    const drivers = await prisma.user.findMany({
      where: {
        role: 'DRIVER'
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferences: true
      }
    });
    
    const busyDrivers = [];
    
    for (const driver of drivers) {
      const status = driver.preferences?.driverStatus;
      if (status === 'BUSY') {
        // Check if driver has active jobs
        const activeJobs = await prisma.assignments.findMany({
          where: {
            driverId: driver.id,
            jobs: {
              status: {
                in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'REACHED', 'IN_PROGRESS']
              }
            }
          }
        });
        
        if (activeJobs.length === 0) {
          busyDrivers.push(driver);
        }
      }
    }
    
    console.log('\nDrivers showing BUSY without active jobs:', busyDrivers.length);
    for (const d of busyDrivers) {
      const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown';
      console.log('-', fullName, 'ID:', d.id);
      console.log('  Status:', d.preferences?.driverStatus);
      console.log('  Has vehicle?', !!d.preferences?.selectedVehicleId);
      console.log('  Has tariff?', !!d.preferences?.selectedTariffId);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();