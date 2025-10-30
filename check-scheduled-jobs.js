const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkScheduledJobs() {
  try {
    console.log("\n🔍 Checking all jobs with their scheduling info...\n");
    
    const jobs = await prisma.job.findMany({
      where: {
        status: {
          notIn: ['CANCELLED', 'FINISHED']
        }
      },
      select: {
        id: true,
        jobId: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
        pickupAddress: true,
        dropoffAddress: true,
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log(`Found ${jobs.length} active jobs:\n`);

    jobs.forEach(job => {
      console.log(`Job: ${job.jobId}`);
      console.log(`  ID: ${job.id}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Scheduled At: ${job.scheduledAt ? job.scheduledAt.toISOString() : 'NULL (NOW job)'}`);
      console.log(`  Created At: ${job.createdAt.toISOString()}`);
      console.log(`  Is Scheduled: ${job.scheduledAt !== null ? 'YES (LATER)' : 'NO (NOW)'}`);
      console.log(`  Pickup: ${job.pickupAddress}`);
      console.log(`  Dropoff: ${job.dropoffAddress}`);
      console.log('---');
    });

    // Check your specific job
    const specificJob = await prisma.job.findFirst({
      where: {
        id: 'cmh8ow6rt000b8o71qvtc738n'
      },
      include: {
        customer: true
      }
    });

    if (specificJob) {
      console.log("\n📋 Your specific job details:");
      console.log(`  Job ID: ${specificJob.jobId}`);
      console.log(`  Scheduled At: ${specificJob.scheduledAt ? specificJob.scheduledAt.toISOString() : 'NULL (NOW job)'}`);
      console.log(`  Should show as: ${specificJob.scheduledAt ? 'LATER with blue badge' : 'NOW (no badge)'}`);
      console.log(`  Requirements:`, JSON.parse(specificJob.requirements || '{}'));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkScheduledJobs();
