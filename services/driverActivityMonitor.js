/**
 * Driver Activity Monitor Service
 * 
 * Monitors driver location updates and automatically:
 * - Sets drivers OFFLINE if no location update for 10 minutes
 * - Ends their active shift
 * - Unassigns any jobs they're holding
 * - Emits socket events for real-time updates
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const INACTIVITY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const CRON_FORCE_BUSY_ENABLED = process.env.CRON_FORCE_BUSY_ENABLED === 'true';

/**
 * Check all active drivers for inactivity
 * @param {object} io - Socket.IO instance for emitting events
 */
async function checkDriverActivity(io) {
  if (!CRON_FORCE_BUSY_ENABLED) {
    console.log('[Driver Activity Monitor] Skipped - CRON_FORCE_BUSY_ENABLED=false');
    return {
      checked: new Date(),
      inactiveCount: 0,
      processed: [],
      skipped: true,
    };
  }

  try {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS);

    console.log(`[Driver Activity Monitor] Checking driver activity at ${now.toISOString()}`);
    console.log(`[Driver Activity Monitor] Threshold: ${thresholdTime.toISOString()}`);

    // Find ALL active drivers first, then check their last activity time
    const allDrivers = await prisma.user.findMany({
      where: {
        role: 'DRIVER',
        isActive: true
      },
      include: {
        location_updates: {
          orderBy: [
            { timestamp: 'desc' },
            { createdAt: 'desc' }
          ],
          take: 1
        },
        shifts: {
          where: {
            endTime: null // Active shifts only
          },
          orderBy: {
            startTime: 'desc'
          },
          take: 1
        },
        jobs_jobs_assignedDriverIdTousers: {
          where: {
            status: {
              in: ['ASSIGNED', 'OFFERED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
            }
          }
        }
      }
    });

    console.log(`[Driver Activity Monitor] Found ${allDrivers.length} total active drivers`);

    // Filter drivers who haven't updated in the threshold time
    const inactiveDrivers = [];
    
    for (const driver of allDrivers) {
      const hasActiveJob = driver.jobs_jobs_assignedDriverIdTousers?.length > 0;

      // Check multiple sources for last activity time
      const lastLocationUpdate = driver.location_updates[0];
      const locationUpdateTime = lastLocationUpdate 
        ? (lastLocationUpdate.timestamp || lastLocationUpdate.createdAt)
        : null;
        
      // Check preferences for last location/status update
      const preferences = driver.preferences || {};
      const dispatchMeta = preferences.dispatch || {};
      const lastStatusUpdate = dispatchMeta.lastStatusUpdate ? new Date(dispatchMeta.lastStatusUpdate) : null;
      const lastLocationMeta = dispatchMeta.lastLocation?.timestamp ? new Date(dispatchMeta.lastLocation.timestamp) : null;
      
      // Find the most recent activity from any source
      const activityTimes = [
        locationUpdateTime,
        lastStatusUpdate,
        lastLocationMeta,
        new Date(driver.updatedAt)
      ].filter(Boolean);
      
      const lastActivityTime = activityTimes.length > 0 
        ? new Date(Math.max(...activityTimes.map(t => t.getTime())))
        : null;
      
      const isInactive = (!lastActivityTime || lastActivityTime < thresholdTime) && !hasActiveJob;
      
      console.log(`[Driver Activity Monitor] ${driver.firstName} ${driver.lastName}:`);
      console.log(`  - Location Update: ${locationUpdateTime ? locationUpdateTime.toISOString() : 'Never'}`);
      console.log(`  - Status Update: ${lastStatusUpdate ? lastStatusUpdate.toISOString() : 'Never'}`);
      console.log(`  - Preferences Location: ${lastLocationMeta ? lastLocationMeta.toISOString() : 'Never'}`);
      console.log(`  - User Updated: ${driver.updatedAt}`);
      console.log(`  - Last Activity: ${lastActivityTime ? lastActivityTime.toISOString() : 'Never'}`);
      console.log(`  - Inactive: ${isInactive}`);
      
      if (hasActiveJob) {
        console.log(`[Driver Activity Monitor] Skipping driver ${driver.id} - currently has active job`);
        continue;
      }

      if (isInactive) {
        inactiveDrivers.push(driver);
      }
    }

    if (inactiveDrivers.length === 0) {
      console.log('[Driver Activity Monitor] No inactive drivers found');
      
      // 🚨 DEBUG: Let's see ALL drivers and their last update times
      const allDrivers = await prisma.user.findMany({
        where: {
          role: 'DRIVER',
          isActive: true
        },
        include: {
          locationUpdates: {
            orderBy: [
              { timestamp: 'desc' },
              { createdAt: 'desc' }
            ],
            take: 1
          }
        }
      });
      
      console.log(`[DEBUG] Found ${allDrivers.length} total active drivers:`);
      for (const driver of allDrivers) {
        const lastUpdate = driver.locationUpdates[0];
        const lastUpdateTime = lastUpdate ? (lastUpdate.timestamp || lastUpdate.createdAt) : null;
        const timeSinceUpdate = lastUpdateTime ? Math.floor((now - new Date(lastUpdateTime)) / (1000 * 60)) : 'Never';
        console.log(`  - ${driver.firstName} ${driver.lastName}: Last update ${timeSinceUpdate} minutes ago (${lastUpdateTime ? lastUpdateTime.toISOString() : 'Never'})`);
      }
      
      return {
        checked: now,
        inactiveCount: 0,
        processed: []
      };
    }

    console.log(`[Driver Activity Monitor] Found ${inactiveDrivers.length} inactive drivers`);

    const processed = [];

    for (const driver of inactiveDrivers) {
      try {
        const lastLocationUpdate = driver.location_updates?.[0];
        const lastUpdateTime = lastLocationUpdate 
          ? (lastLocationUpdate.timestamp || lastLocationUpdate.createdAt)
          : null;

        console.log(`[Driver Activity Monitor] Processing driver ${driver.id} (${driver.firstName} ${driver.lastName})`);
        console.log(`  - Last location update: ${lastUpdateTime ? lastUpdateTime.toISOString() : 'Never'}`);
        console.log(`  - Active jobs: ${driver.jobs_jobs_assignedDriverIdTousers.length}`);
        console.log(`  - Active shifts: ${driver.shifts.length}`);

        const activeShift = driver.shifts[0];
        const currentShiftStatus = activeShift ? activeShift.status : 'OFFLINE';
        console.log(`  - Current shift status: ${currentShiftStatus}`);

        // Set shift to OFFLINE (instead of updating driver status directly)
        // ✅ FIX: Don't end the shift - just mark as OFFLINE so driver can resume later
        if (activeShift) {
          await prisma.$queryRaw`
            UPDATE shifts 
            SET status = 'OFFLINE', "updatedAt" = ${now}
            WHERE id = ${activeShift.id}
          `;
          console.log(`  ✓ Set shift ${activeShift.id} to OFFLINE (shift remains active for resume)`);
        }

        // Unassign jobs
        const unassignedJobs = [];
        for (const job of driver.jobs_jobs_assignedDriverIdTousers) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: 'UNASSIGNED',
              assignedDriverId: null,
              updatedAt: now
            }
          });

          await prisma.user.update({
            where: { id: driver.id },
            data: {
              currentJobId: null,
            },
          });

          unassignedJobs.push({
            id: job.id,
            reference: job.jobId || job.rideId,
            previousStatus: job.status
          });

          console.log(`  ✓ Unassigned job ${job.jobId || job.rideId} (was ${job.status})`);

          // Emit socket event to dispatch room about job becoming unassigned
          if (io) {
            io.to('dispatch').emit('job:data:updated', {
              jobId: job.id,
              status: 'UNASSIGNED',
              reason: 'Driver became inactive',
              timestamp: now.toISOString()
            });

            console.log(`  ✓ Emitted job:data:updated for job ${job.id}`);
          }
        }

        // Emit socket event to driver (though they're offline)
        if (io) {
          io.to(`driver:${driver.id}`).emit('driver:forced_offline', {
            reason: 'No location update for 10 minutes',
            timestamp: now.toISOString(),
            unassignedJobs: unassignedJobs.map(j => j.id)
          });
        }

        // Emit to dispatch room about driver going offline
        if (io) {
          io.to('dispatch').emit('driver:status:changed', {
            driverId: driver.id,
            status: 'OFFLINE',
            reason: 'Inactivity detected',
            timestamp: now.toISOString()
          });

          console.log(`  ✓ Emitted driver:status:changed for driver ${driver.id}`);
        }

        processed.push({
          driverId: driver.id,
          name: `${driver.firstName} ${driver.lastName}`,
          previousStatus: currentShiftStatus,
          lastUpdate: lastUpdateTime,
          unassignedJobs: unassignedJobs,
          shiftEnded: driver.shifts.length > 0
        });

      } catch (error) {
        console.error(`[Driver Activity Monitor] Error processing driver ${driver.id}:`, error);
      }
    }

    console.log(`[Driver Activity Monitor] Processed ${processed.length} inactive drivers`);

    return {
      checked: now,
      inactiveCount: inactiveDrivers.length,
      processed
    };

  } catch (error) {
    console.error('[Driver Activity Monitor] Error checking driver activity:', error);
    throw error;
  }
}

/**
 * Get current monitoring status
 */
async function getMonitoringStatus() {
  try {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS);

    // Count drivers by status
    const statusCounts = await prisma.driver.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });

    // Find drivers at risk (no recent location update but still active)
    const driversAtRisk = await prisma.driver.findMany({
      where: {
        status: {
          in: ['AVAILABLE', 'BUSY']
        }
      },
      include: {
        locationUpdates: {
          orderBy: [
            { timestamp: 'desc' },
            { createdAt: 'desc' }
          ],
          take: 1
        }
      }
    });

    const atRisk = driversAtRisk.filter(driver => {
      const lastUpdate = driver.locationUpdates[0];
      if (!lastUpdate) return true;
      
      const lastTime = lastUpdate.timestamp || lastUpdate.createdAt;
      return lastTime < thresholdTime;
    });

    return {
      timestamp: now.toISOString(),
      thresholdMinutes: 10,
      statusCounts: Object.fromEntries(
        statusCounts.map(s => [s.status, s._count.id])
      ),
      driversAtRisk: atRisk.map(d => ({
        id: d.id,
        name: `${d.firstName} ${d.lastName}`,
        status: d.status,
        lastUpdate: d.locationUpdates[0] 
          ? (d.locationUpdates[0].timestamp || d.locationUpdates[0].createdAt).toISOString()
          : 'Never'
      }))
    };
  } catch (error) {
    console.error('[Driver Activity Monitor] Error getting monitoring status:', error);
    throw error;
  }
}

module.exports = {
  checkDriverActivity,
  getMonitoringStatus,
  INACTIVITY_THRESHOLD_MS
};
