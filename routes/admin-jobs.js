const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// GET /api/admin/jobs - List all jobs with filtering
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            service = '',
            company = '',
            startDate,
            endDate
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause
        const where = {};

        if (search) {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { customer: { firstName: { contains: search, mode: 'insensitive' } } },
                { customer: { lastName: { contains: search, mode: 'insensitive' } } },
                { customer: { phone: { contains: search, mode: 'insensitive' } } },
                { driver: { firstName: { contains: search, mode: 'insensitive' } } },
                { driver: { lastName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        if (status) {
            where.status = status.toUpperCase();
        }

        if (service) {
            where.serviceType = service.toUpperCase();
        }

        if (company) {
            where.companyId = company;
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const [jobs, totalCount] = await Promise.all([
            prisma.job.findMany({
                where,
                include: {
                    customer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                            email: true
                        }
                    },
                    driver: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                            email: true
                        }
                    },
                    company: {
                        select: {
                            id: true,
                            legalName: true,
                            brandName: true,
                            name: true
                        }
                    },
                    vehicle: {
                        select: {
                            id: true,
                            make: true,
                            model: true,
                            licensePlate: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.job.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        res.json({
            jobs,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// GET /api/admin/jobs/:id - Get job details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const job = await prisma.job.findUnique({
            where: { id },
            include: {
                customer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        email: true,
                        address: true
                    }
                },
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        email: true,
                        driverProfile: true
                    }
                },
                company: {
                    select: {
                        id: true,
                        legalName: true,
                        brandName: true,
                        name: true,
                        email: true,
                        phone: true
                    }
                },
                vehicle: {
                    select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                        color: true,
                        licensePlate: true,
                        vehicleType: true
                    }
                },
                payment: true,
                ratings: {
                    include: {
                        ratedBy: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            }
        });

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);
    } catch (error) {
        console.error('Error fetching job details:', error);
        res.status(500).json({ error: 'Failed to fetch job details' });
    }
});

// GET /api/admin/jobs/analytics - Get job analytics
router.get('/analytics', async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const now = new Date();
        const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

        // Get analytics data
        const [
            totalJobs,
            completedJobs,
            cancelledJobs,
            activeJobs,
            totalRevenue,
            averageRating,
            popularServices,
            hourlyTrends
        ] = await Promise.all([
            // Total jobs in period
            prisma.job.count({
                where: {
                    createdAt: { gte: startDate }
                }
            }),

            // Completed jobs
            prisma.job.count({
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: startDate }
                }
            }),

            // Cancelled jobs
            prisma.job.count({
                where: {
                    status: 'CANCELLED',
                    createdAt: { gte: startDate }
                }
            }),

            // Active jobs (in progress)
            prisma.job.count({
                where: {
                    status: { in: ['ACCEPTED', 'PICKING_UP', 'IN_PROGRESS'] }
                }
            }),

            // Total revenue
            prisma.payment.aggregate({
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: startDate }
                },
                _sum: { amount: true }
            }),

            // Average rating
            prisma.rating.aggregate({
                where: {
                    createdAt: { gte: startDate }
                },
                _avg: { rating: true }
            }),

            // Popular services
            prisma.job.groupBy({
                by: ['serviceType'],
                where: {
                    createdAt: { gte: startDate }
                },
                _count: true,
                orderBy: {
                    _count: { serviceType: 'desc' }
                },
                take: 5
            }),

            // Hourly trends (last 24 hours)
            prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('hour', "createdAt") as hour,
          COUNT(*) as count
        FROM "Job"
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', "createdAt")
        ORDER BY hour ASC
      `
        ]);

        res.json({
            summary: {
                totalJobs,
                completedJobs,
                cancelledJobs,
                activeJobs,
                completionRate: totalJobs > 0 ? (completedJobs / totalJobs * 100).toFixed(1) : 0,
                cancellationRate: totalJobs > 0 ? (cancelledJobs / totalJobs * 100).toFixed(1) : 0,
                totalRevenue: totalRevenue._sum.amount || 0,
                averageRating: averageRating._avg.rating || 0
            },
            popularServices: popularServices.map(service => ({
                service: service.serviceType,
                count: service._count
            })),
            hourlyTrends: hourlyTrends.map(trend => ({
                hour: trend.hour,
                count: Number(trend.count)
            }))
        });
    } catch (error) {
        console.error('Error fetching job analytics:', error);
        res.status(500).json({ error: 'Failed to fetch job analytics' });
    }
});

// GET /api/admin/jobs/live - Get live/active jobs
router.get('/live', async (req, res) => {
    try {
        const liveJobs = await prisma.job.findMany({
            where: {
                status: { in: ['PENDING', 'ACCEPTED', 'PICKING_UP', 'IN_PROGRESS'] }
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true
                    }
                },
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        currentLocation: true
                    }
                },
                company: {
                    select: {
                        id: true,
                        legalName: true,
                        brandName: true,
                        name: true
                    }
                },
                vehicle: {
                    select: {
                        id: true,
                        make: true,
                        model: true,
                        licensePlate: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(liveJobs);
    } catch (error) {
        console.error('Error fetching live jobs:', error);
        res.status(500).json({ error: 'Failed to fetch live jobs' });
    }
});

module.exports = router;