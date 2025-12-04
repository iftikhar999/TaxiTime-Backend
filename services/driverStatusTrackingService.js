/**
 * Driver Status Tracking Service
 * Tracks all driver status changes with source information for debugging and auditing
 */

const prisma = require('../lib/prisma');

// Status change sources
const STATUS_SOURCES = {
  MOBILE_APP: 'MOBILE_APP',           // Driver changed status from mobile app
  DISPATCH_CONSOLE: 'DISPATCH_CONSOLE', // Dispatcher changed status
  JOB_ASSIGNMENT: 'JOB_ASSIGNMENT',   // Status changed due to job assignment
  JOB_ACCEPTED: 'JOB_ACCEPTED',       // Driver accepted a job
  JOB_STARTED: 'JOB_STARTED',         // Driver started a job
  JOB_COMPLETE: 'JOB_COMPLETE',       // Job completed, status reset
  JOB_COMPLETION: 'JOB_COMPLETION',   // Job completed (alias)
  JOB_CANCELLED: 'JOB_CANCELLED',     // Job cancelled
  JOB_REJECTED: 'JOB_REJECTED',       // Driver rejected job
  NO_SHOW: 'NO_SHOW',                 // Passenger no-show
  JOB_NOSHOW: 'JOB_NOSHOW',           // Passenger no-show (alias)
  JOB_RECALLED: 'JOB_RECALLED',       // Job recalled by dispatcher
  AUTO_BUSY_ACTIVE_JOB: 'AUTO_BUSY_ACTIVE_JOB', // Auto-set to BUSY due to active job
  SERVER_SYNC: 'SERVER_SYNC',         // Server syncing/correcting status
  SHIFT_START: 'SHIFT_START',         // Driver started shift
  SHIFT_END: 'SHIFT_END',             // Driver ended shift
  SOCKET_CONNECT: 'SOCKET_CONNECT',   // Driver socket connected
  SOCKET_DISCONNECT: 'SOCKET_DISCONNECT', // Driver socket disconnected
  QUEUE_MANAGEMENT: 'QUEUE_MANAGEMENT', // Queue management service
  PREFERENCES_UPDATE: 'PREFERENCES_UPDATE', // Preferences update
  API_CALL: 'API_CALL',               // Direct API call
  UNKNOWN: 'UNKNOWN',
};

/**
 * Log a driver status change
 * @param {Object} params
 * @param {string} params.driverId - Driver ID
 * @param {string} params.previousStatus - Previous status (can be null for initial)
 * @param {string} params.newStatus - New status
 * @param {string} params.source - Source of the change (use STATUS_SOURCES)
 * @param {string} [params.triggeredBy] - User ID who triggered the change
 * @param {string} [params.jobId] - Related job ID
 * @param {string} [params.reason] - Additional context
 * @param {Object} [params.metadata] - Any additional data
 * @param {string} [params.ipAddress] - IP address
 * @param {string} [params.userAgent] - User agent string
 */
async function logStatusChange({
  driverId,
  previousStatus,
  newStatus,
  source,
  triggeredBy = null,
  jobId = null,
  reason = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    // Normalize statuses
    const normalizedPrevious = previousStatus ? String(previousStatus).toUpperCase() : null;
    const normalizedNew = String(newStatus).toUpperCase();
    
    // Don't log if status didn't actually change (unless it's a sync operation)
    if (normalizedPrevious === normalizedNew && source !== STATUS_SOURCES.SERVER_SYNC) {
      console.log(`[StatusTracking] Skipping log - status unchanged: ${normalizedNew}`);
      return null;
    }

    const record = await prisma.driver_status_history.create({
      data: {
        driverId,
        previousStatus: normalizedPrevious,
        newStatus: normalizedNew,
        source: source || STATUS_SOURCES.UNKNOWN,
        triggeredBy,
        jobId,
        reason,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        ipAddress,
        userAgent,
      },
    });

    console.log(`📝 [StatusTracking] Logged status change for driver ${driverId}: ${normalizedPrevious || 'NULL'} → ${normalizedNew} (source: ${source})`);
    
    return record;
  } catch (error) {
    // Don't throw - just log the error so it doesn't break the main flow
    console.error(`❌ [StatusTracking] Failed to log status change:`, error.message);
    return null;
  }
}

/**
 * Get recent status history for a driver
 * @param {string} driverId
 * @param {number} limit - Number of records to return (default 50)
 */
async function getDriverStatusHistory(driverId, limit = 50) {
  try {
    const history = await prisma.driver_status_history.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return history;
  } catch (error) {
    console.error(`❌ [StatusTracking] Failed to get history:`, error.message);
    return [];
  }
}

/**
 * Get all status changes in a time range
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Object} [filters] - Optional filters
 */
async function getStatusChangesByTimeRange(startDate, endDate, filters = {}) {
  try {
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };
    
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.source) where.source = filters.source;
    if (filters.newStatus) where.newStatus = filters.newStatus;
    
    const history = await prisma.driver_status_history.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
    });
    return history;
  } catch (error) {
    console.error(`❌ [StatusTracking] Failed to get history by range:`, error.message);
    return [];
  }
}

/**
 * Find suspicious status changes (e.g., status becoming BUSY without a job)
 * @param {string} driverId
 * @param {number} hours - Look back hours
 */
async function findSuspiciousChanges(driverId, hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const history = await prisma.driver_status_history.findMany({
      where: {
        driverId,
        createdAt: { gte: since },
        newStatus: 'BUSY',
        jobId: null, // BUSY without a job is suspicious
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return history;
  } catch (error) {
    console.error(`❌ [StatusTracking] Failed to find suspicious changes:`, error.message);
    return [];
  }
}

module.exports = {
  STATUS_SOURCES,
  logStatusChange,
  getDriverStatusHistory,
  getStatusChangesByTimeRange,
  findSuspiciousChanges,
};
