const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkJob() {
  try {
    // Get the most recent job
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: {
        customer: true
      }
    });
    
    if (jobs.length === 0) {
      console.log('❌ No jobs found');
      return;
    }
    
    const job = jobs[0];
    console.log('\n📋 Job from Database:');
    console.log('ID:', job.id);
    console.log('JobId:', job.jobId);
    console.log('ScheduledAt:', job.scheduledAt);
    console.log('\n👤 Customer:');
    console.log(JSON.stringify(job.customer, null, 2));
    console.log('\n📦 Requirements (raw):');
    console.log(typeof job.requirements, job.requirements);
    
    if (job.requirements) {
      console.log('\n📦 Parsed Requirements:');
      const requirements = typeof job.requirements === 'string' 
        ? JSON.parse(job.requirements) 
        : job.requirements;
      console.log(JSON.stringify(requirements, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkJob();
