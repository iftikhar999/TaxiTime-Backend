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

// Get financial reports
router.get('/financial', authorizeRoles(['OWNER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { startDate, endDate, companyId } = req.query;
    const userCompanyId = req.user.companyId;
    const userRole = req.user.role;

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Determine which company to query
    let targetCompanyId;
    if (userRole === 'SUPER_ADMIN' && companyId) {
      targetCompanyId = companyId;
    } else {
      targetCompanyId = userCompanyId;
    }

    // Build where clause
    const whereClause = {
      createdAt: {
        gte: start,
        lte: end
      }
    };

    if (targetCompanyId) {
      whereClause.companyId = targetCompanyId;
    }

    // Get payment statistics
    const payments = await prisma.payments.aggregate({
      where: whereClause,
      _sum: {
        amount: true
      },
      _count: {
        id: true
      }
    });

    // Get completed jobs with fares
    const jobs = await prisma.job.aggregate({
      where: {
        ...whereClause,
        status: 'COMPLETED'
      },
      _sum: {
        actualFare: true,
        estimatedPrice: true
      },
      _count: {
        id: true
      }
    });

    // Get driver earnings
    const driverEarnings = await prisma.driver_earnings.aggregate({
      where: {
        createdAt: {
          gte: start,
          lte: end
        },
        ...(targetCompanyId && { companyId: targetCompanyId })
      },
      _sum: {
        totalEarnings: true,
        baseFare: true,
        tips: true
      }
    });

    // Calculate totals
    const totalRevenue = Number(jobs._sum.actualFare || 0);
    const totalPayments = Number(payments._sum.amount || 0);
    const totalDriverEarnings = Number(driverEarnings._sum.totalEarnings || 0);
    const completedJobs = jobs._count.id;

    res.json({
      success: true,
      data: {
        period: {
          startDate,
          endDate
        },
        totalRevenue,
        totalPayments,
        totalDriverEarnings,
        companyProfit: totalRevenue - totalDriverEarnings,
        completedJobs,
        averageJobValue: completedJobs > 0 ? totalRevenue / completedJobs : 0,
        paymentCount: payments._count.id
      }
    });

  } catch (error) {
    console.error('Error fetching financial reports:', error);
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
      'GET /api/reports/daily-stats?date=YYYY-MM-DD',
      'GET /api/reports/financial?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&companyId=xxx'
    ]
  });
});

module.exports = router;