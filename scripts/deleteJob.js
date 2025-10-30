const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteJobAndFreeDriver() {
  try {
    const jobId = 'WALKIN-1761753391630-ssks2q6n3';
    
    console.log(`🔍 Searching for job: ${jobId}...`);
    
    // Find the job first
    const job = await prisma.job.findUnique({
      where: { jobId: jobId },
      select: { 
        id: true, 
        jobId: true,
        assignedDriverId: true,
        status: true,
        companyId: true 
      }
    });
    
    if (!job) {
      console.log('❌ Job not found:', jobId);
      return;
    }
    
    console.log('📋 Job found:');
    console.log(`   Internal ID: ${job.id}`);
    console.log(`   Job ID: ${job.jobId}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Assigned Driver: ${job.assignedDriverId || 'None'}`);
    console.log(`   Company: ${job.companyId}`);
    
    const driverId = job.assignedDriverId;
    
    // Delete related records first
    console.log('\n🗑️  Deleting related records...');
    
    const offersDeleted = await prisma.offer.deleteMany({ where: { jobId: job.id } });
    console.log(`   - Deleted ${offersDeleted.count} offer(s)`);
    
    const assignmentsDeleted = await prisma.assignment.deleteMany({ where: { jobId: job.id } });
    console.log(`   - Deleted ${assignmentsDeleted.count} assignment(s)`);
    
    const locationsDeleted = await prisma.locationUpdate.deleteMany({ where: { jobId: job.id } });
    console.log(`   - Deleted ${locationsDeleted.count} location update(s)`);
    
    // Delete the job
    await prisma.job.delete({ where: { id: job.id } });
    console.log('\n✅ Job deleted successfully!');
    
    if (driverId) {
      // Check if driver has any other active jobs
      const activeJobs = await prisma.job.count({
        where: {
          assignedDriverId: driverId,
          status: { in: ['ASSIGNED', 'OFFERED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS', 'ON_THE_WAY', 'ARRIVED'] }
        }
      });
      
      console.log(`\n👤 Driver Status (${driverId}):`);
      console.log(`   Active jobs remaining: ${activeJobs}`);
      
      if (activeJobs === 0) {
        console.log('   ✅ Driver is now AVAILABLE for new jobs!');
      } else {
        console.log(`   ⚠️  Driver still has ${activeJobs} active job(s)`);
      }
    } else {
      console.log('\n👤 No driver was assigned to this job');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteJobAndFreeDriver();
