/**
 * Cron Job Manager
 * 
 * Manages all scheduled background jobs for the application
 */

const cron = require('node-cron');
const { checkDriverActivity } = require('./driverActivityMonitor');

let io = null;
let driverActivityJob = null;

/**
 * Initialize all cron jobs
 * @param {object} socketIO - Socket.IO instance
 */
function initializeCronJobs(socketIO) {
  io = socketIO;
  
  console.log('[Cron Manager] Initializing cron jobs...');

  // Driver Activity Monitor - runs every minute
  driverActivityJob = cron.schedule('* * * * *', async () => {
    try {
      const result = await checkDriverActivity(io);
      
      if (result.processed.length > 0) {
        console.log('[Cron - Driver Activity] Processed inactive drivers:', {
          count: result.processed.length,
          drivers: result.processed.map(d => ({
            id: d.driverId,
            name: d.name,
            unassignedJobs: d.unassignedJobs.length
          }))
        });
      }
    } catch (error) {
      console.error('[Cron - Driver Activity] Error:', error);
    }
  }, {
    scheduled: true,
    timezone: "America/New_York" // Change to your timezone
  });

  console.log('[Cron Manager] ✓ Driver Activity Monitor started (runs every minute)');
  console.log('[Cron Manager] Drivers will be set OFFLINE after 10 minutes of inactivity');
}

/**
 * Stop all cron jobs
 */
function stopAllCronJobs() {
  console.log('[Cron Manager] Stopping all cron jobs...');
  
  if (driverActivityJob) {
    driverActivityJob.stop();
    console.log('[Cron Manager] ✓ Driver Activity Monitor stopped');
  }
}

/**
 * Get status of all cron jobs
 */
function getCronJobsStatus() {
  return {
    driverActivityMonitor: {
      active: driverActivityJob ? true : false,
      schedule: 'Every minute (* * * * *)',
      description: 'Monitors driver location updates and sets inactive drivers offline'
    }
  };
}

module.exports = {
  initializeCronJobs,
  stopAllCronJobs,
  getCronJobsStatus
};
