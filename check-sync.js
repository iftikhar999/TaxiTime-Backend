const prisma = require('./lib/prisma');

(async () => {
  try {
    // Check job from screenshot
    const job = await prisma.job.findUnique({
      where: { id: '11a93145-6289-4a4a-8200-21e8107142c2' }
    });
    
    if (job) {
      console.log('\n🎯 Job Status:', job.status);
      console.log('Assigned Driver ID:', job.assignedDriverId);
      console.log('JobId:', job.jobId);
    } else {
      console.log('\n❌ Job not found');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
