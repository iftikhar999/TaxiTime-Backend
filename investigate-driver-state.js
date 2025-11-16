const prisma = require('./lib/prisma');

(async () => {
  try {
    console.log('\n🔍 DEEP INVESTIGATION: Driver State Mismatch\n');
    
    // 1. Find the driver
    const driver = await prisma.users.findFirst({
      where: {
        firstName: { contains: 'Malik', mode: 'insensitive' },
        role: 'DRIVER'
      }
    });
    
    if (!driver) {
      console.log('❌ Driver not found');
      await prisma.$disconnect();
      return;
    }
    
    console.log('👤 DRIVER FOUND:');
    console.log(`   ID: ${driver.id}`);
    console.log(`   Name: ${driver.firstName} ${driver.lastName}`);
    console.log(`   Email: ${driver.email}`);
    
    // 2. Check driver's shift status
    const activeShift = await prisma.shift.findFirst({
      where: {
        driverId: driver.id,
        status: 'ACTIVE'
      },
      orderBy: { startTime: 'desc' }
    });
    
    console.log('\n📋 SHIFT STATUS:');
    if (activeShift) {
      console.log(`   ✅ Active shift: ${activeShift.id}`);
      console.log(`   Started: ${activeShift.startTime}`);
    } else {
      console.log('   ❌ No active shift');
    }
    
    // 3. Check ALL jobs for this driver (any status)
    const allJobs = await prisma.job.findMany({
      where: { assignedDriverId: driver.id },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    console.log(`\n💼 ALL JOBS (last 10): ${allJobs.length} total`);
    allJobs.forEach((job, i) => {
      console.log(`\n   ${i+1}. Job ID: ${job.id}`);
      console.log(`      JobId: ${job.jobId}`);
      console.log(`      Status: ${job.status}`);
      console.log(`      Created: ${job.createdAt}`);
      console.log(`      Updated: ${job.updatedAt}`);
      console.log(`      Pickup: ${job.pickupAddress}`);
    });
    
    // 4. Check specifically for "active" status jobs
    const activeJobs = await prisma.job.findMany({
      where: {
        assignedDriverId: driver.id,
        status: {
          in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'PAUSED', 'PENDING_PAYMENT']
        }
      }
    });
    
    console.log(`\n🚨 ACTIVE STATUS JOBS: ${activeJobs.length}`);
    if (activeJobs.length > 0) {
      activeJobs.forEach(job => {
        console.log(`\n   ⚠️  ACTIVE JOB FOUND:`);
        console.log(`      ID: ${job.id}`);
        console.log(`      Status: ${job.status}`);
        console.log(`      Created: ${job.createdAt}`);
        console.log(`      Updated: ${job.updatedAt}`);
      });
    } else {
      console.log('   ✅ No active jobs (this is correct for "No jobs available")');
    }
    
    // 5. Check the specific job from dispatch screenshot
    const specificJob = await prisma.job.findUnique({
      where: { id: '11a93145-6289-4a4a-8200-21e8107142c2' }
    });
    
    console.log(`\n🎯 SPECIFIC JOB FROM DISPATCH: 11a93145-6289-4a4a-8200-21e8107142c2`);
    if (specificJob) {
      console.log(`   ❌ JOB EXISTS IN DATABASE!`);
      console.log(`      Status: ${specificJob.status}`);
      console.log(`      Assigned to: ${specificJob.assignedDriverId}`);
      console.log(`      Is it THIS driver? ${specificJob.assignedDriverId === driver.id}`);
    } else {
      console.log(`   ✅ Job does NOT exist (dispatch showing stale/production data)`);
    }
    
    // 6. Check driver's last location update
    const driverLocation = await prisma.driverLocation.findUnique({
      where: { driverId: driver.id }
    });
    
    console.log('\n📍 DRIVER LOCATION:');
    if (driverLocation) {
      console.log(`   Lat/Lng: ${driverLocation.latitude}, ${driverLocation.longitude}`);
      console.log(`   Updated: ${driverLocation.updatedAt}`);
      console.log(`   Status: ${driverLocation.status || 'N/A'}`);
      console.log(`   Current Job ID: ${driverLocation.currentJobId || 'NONE'}`);
    } else {
      console.log('   ❌ No location record');
    }
    
    // 7. Check if there's a "currentJobId" mismatch
    if (driverLocation?.currentJobId) {
      const locationJob = await prisma.job.findUnique({
        where: { id: driverLocation.currentJobId }
      });
      
      console.log('\n⚠️  LOCATION TABLE SHOWS CURRENT JOB:');
      console.log(`   Job ID: ${driverLocation.currentJobId}`);
      if (locationJob) {
        console.log(`   Job Status: ${locationJob.status}`);
        console.log(`   Job Assigned to: ${locationJob.assignedDriverId}`);
      } else {
        console.log(`   ❌ Job in location table does NOT exist!`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 DIAGNOSIS:');
    console.log('='.repeat(60));
    
    if (!specificJob && activeJobs.length === 0) {
      console.log('\n✅ CORRECT STATE:');
      console.log('   - No active jobs in database');
      console.log('   - Driver app correctly shows "No jobs available"');
      console.log('   - Dispatch is showing STALE/PRODUCTION data');
      console.log('\n💡 SOLUTION: Refresh dispatch or it\'s connected to production server');
    } else if (specificJob) {
      console.log('\n❌ DATABASE ISSUE:');
      console.log('   - Job exists in database');
      console.log('   - But driver app not showing it');
      console.log('\n💡 SOLUTION: Check socket connection and job fetch logic');
    } else if (activeJobs.length > 0) {
      console.log('\n❌ SYNC ISSUE:');
      console.log('   - Active jobs exist in database');
      console.log('   - Driver app not displaying them');
      console.log('\n💡 SOLUTION: Check /current endpoint and socket events');
    }
    
    if (driverLocation?.currentJobId && !activeJobs.some(j => j.id === driverLocation.currentJobId)) {
      console.log('\n⚠️  LOCATION TABLE DESYNC:');
      console.log('   - driverLocation.currentJobId points to non-existent/completed job');
      console.log('   - This makes dispatch think driver is busy');
      console.log('\n💡 SOLUTION: Clear driverLocation.currentJobId');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
