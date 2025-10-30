const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require authentication for all routes
router.use(authenticateToken);

// Get daily statistics for dispatch dashboard
router.get('/daily-stats', authorizeRoles(['DISPATCHER', 'OWNER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    const companyId = req.user.companyId;

    // Parse the date and get start/end of day
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    // Get job statistics for the day
    const jobStats = await prisma.job.groupBy({
      by: ['status'],
      where: {
        companyId: companyId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      _count: {
        id: true
      }
    });

    // Calculate totals
    let totalJobs = 0;
    let completedToday = 0;
    let activeJobs = 0;

    jobStats.forEach(stat => {
      totalJobs += stat._count.id;
      if (stat.status === 'COMPLETED') {
        completedToday += stat._count.id;
      }
      if (['PENDING', 'ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS'].includes(stat.status)) {
        activeJobs += stat._count.id;
      }
    });

    // Get available drivers count
    const availableDrivers = await prisma.user.count({
      where: {
        role: 'DRIVER',
        companyId: companyId,
        isActive: true,
        status: 'ONLINE'
      }
    });

    // Calculate average response time (mock calculation for now)
    const avgResponseTime = await prisma.offer.aggregate({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        },
        respondedAt: {
          not: null
        },
        job: {
          companyId: companyId
        }
      },
      _avg: {
        // This would be a calculated field for response time in seconds
        // For now, we'll return a mock value
      }
    });

    res.json({
      success: true,
      data: {
        totalJobs,
        completedToday,
        activeJobs,
        availableDrivers,
        avgResponseTime: 45, // Mock value in seconds
        date: date
      }
    });

  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// General reports endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Reports API',
    endpoints: [
      'GET /api/reports/daily-stats?date=YYYY-MM-DD'
    ]
  });
});

module.exports = router;