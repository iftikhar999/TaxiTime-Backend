const prisma = require('./lib/prisma');

async function checkDriverJobSync() {
  try {
    // From the screenshot, we can see driver: Malik Ahmad Malik Ahmad
    // Find this driver
    const driver = await prisma.users.findFirst({
      where: {
        OR: [
          { firstName: { contains: 'Malik', mode: 'insensitive' } },
          { lastName: { contains: 'Ahmad', mode: 'insensitive' } }
        ],
        role: 'DRIVER'
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (!driver) {
      console.log('❌ Driver not found');
      return;
    }

    console.log('\n📋 Driver Info:');
    console.log(JSON.stringify(driver, null, 2));

    // Check driver's current jobs
    const jobs = await prisma.job.findMany({
      where: {
        assignedDriverId: driver.id,
        status: {
          in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'PAUSED', 'PENDING_PAYMENT']
        }
      },
      include: {
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        rides: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    console.log(`\n🔍 Active Jobs Count: ${jobs.length}`);
    if (jobs.length > 0) {
      console.log('\nActive Jobs:');
      jobs.forEach(job => {
        console.log(`- Job ID: ${job.id}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  JobId: ${job.jobId}`);
        console.log(`  Customer: ${job.users_jobs_customerIdTousers?.firstName} ${job.users_jobs_customerIdTousers?.lastName}`);
        console.log(`  Pickup: ${job.pickupAddress}`);
        console.log(`  Created: ${job.createdAt}`);
        console.log('');
      });
    }

    // Check the specific job from screenshot: 11a93145-6289-4a4a-8200-21e8107142c2
    const specificJob = await prisma.job.findUnique({
      where: { id: '11a93145-6289-4a4a-8200-21e8107142c2' },
      include: {
        users_jobs_customerIdTousers: true,
        users_jobs_assignedDriverIdTousers: true,
        rides: true
      }
    });

    if (specificJob) {
      console.log('\n🎯 Specific Job from Dispatch Screenshot:');
      console.log(`ID: ${specificJob.id}`);
      console.log(`JobId: ${specificJob.jobId}`);
      console.log(`Status: ${specificJob.status}`);
      console.log(`Assigned Driver: ${specificJob.users_jobs_assignedDriverIdTousers?.firstName} ${specificJob.users_jobs_assignedDriverIdTousers?.lastName}`);
      console.log(`Assigned Driver ID: ${specificJob.assignedDriverId}`);
      console.log(`Customer: ${specificJob.users_jobs_customerIdTousers?.firstName} ${specificJob.users_jobs_customerIdTousers?.lastName}`);
      console.log(`Pickup: ${specificJob.pickupAddress}`);
      console.log(`Dropoff: ${specificJob.dropoffAddress}`);
      console.log(`Created: ${specificJob.createdAt}`);
      console.log(`Updated: ${specificJob.updatedAt}`);
    } else {
      console.log('\n❌ Specific job not found in database');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDriverJobSync();
