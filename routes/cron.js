/**
 * Cron Management Routes
 * 
 * API endpoints for monitoring and managing cron jobs
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getCronJobsStatus } = require('../services/cronManager');
const { checkDriverActivity, getMonitoringStatus } = require('../services/driverActivityMonitor');

// Get cron jobs status
router.get(
  '/status',
  authenticateToken,
  authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'),
  async (req, res) => {
    try {
      const cronStatus = getCronJobsStatus();
      const monitoringStatus = await getMonitoringStatus();

      res.json({
        success: true,
        data: {
          cronJobs: cronStatus,
          driverMonitoring: monitoringStatus
        }
      });
    } catch (error) {
      console.error('Error getting cron status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cron status'
      });
    }
  }
);

// Manually trigger driver activity check
router.post(
  '/check-driver-activity',
  authenticateToken,
  authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'),
  async (req, res) => {
    try {
      const io = req.io;
      
      if (!io) {
        return res.status(500).json({
          success: false,
          error: 'Socket.IO not available'
        });
      }

      const result = await checkDriverActivity(io);

      res.json({
        success: true,
        data: result,
        message: `Checked driver activity. ${result.processed.length} inactive drivers processed.`
      });
    } catch (error) {
      console.error('Error checking driver activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check driver activity'
      });
    }
  }
);

module.exports = router;
