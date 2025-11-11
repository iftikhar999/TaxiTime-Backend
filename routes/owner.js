const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');

const router = express.Router();


// Middleware: Require OWNER or COMPANY_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

// GET /api/owner/company - Get company profile
router.get('/company', async (req, res) => {
    try {
        const company = await prisma.companies.findUnique({
            where: { id: req.companyId },
            include: {
                users_companies_ownerIdTousers: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true
                    }
                }
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Transform response for cleaner frontend usage
        const response = {
            ...company,
            owner: company.users_companies_ownerIdTousers || null
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching company:', error);
        res.status(500).json({ error: 'Failed to fetch company information' });
    }
});

// PUT /api/owner/company - Update company profile
router.put('/company', async (req, res) => {
    try {
        const {
            legalName,
            brandName,
            companyType,
            businessModel,
            primaryContactEmail,
            primaryContactPhone,
            primaryContactName,
            primaryContactRole,
            supportEmail,
            supportPhone,
            billingEmail,
            hqAddressLine1,
            hqAddressLine2,
            hqCity,
            hqState,
            hqPostcode,
            hqCountry,
            hqLatitude,
            hqLongitude,
            dispatchMode,
            autoAssignRadiusKm,
            maxParallelOffers,
            operatingHoursJson,
            holidayCalendarJson,
            commissionModel,
            commissionRate,
            driverPayoutFrequency,
            billingCurrency,
            voipProvider,
            cctvProvider,
            telematicsProvider,
            webhookEndpointUrl,
            alertRecipientEmails,
            dataRetentionDays
        } = req.body;

        const updatedCompany = await prisma.companies.update({
            where: { id: req.companyId },
            data: {
                legalName,
                brandName,
                companyType,
                businessModel,
                primaryContactEmail,
                primaryContactPhone,
                primaryContactName,
                primaryContactRole,
                supportEmail,
                supportPhone,
                billingEmail,
                hqAddressLine1,
                hqAddressLine2,
                hqCity,
                hqState,
                hqPostcode,
                hqCountry,
                hqLatitude: hqLatitude ? parseFloat(hqLatitude) : undefined,
                hqLongitude: hqLongitude ? parseFloat(hqLongitude) : undefined,
                dispatchMode,
                autoAssignRadiusKm: autoAssignRadiusKm ? parseFloat(autoAssignRadiusKm) : undefined,
                maxParallelOffers: maxParallelOffers ? parseInt(maxParallelOffers) : undefined,
                operatingHoursJson,
                holidayCalendarJson,
                commissionModel,
                commissionRate: commissionRate ? parseFloat(commissionRate) : undefined,
                driverPayoutFrequency,
                billingCurrency,
                voipProvider,
                cctvProvider,
                telematicsProvider,
                webhookEndpointUrl,
                alertRecipientEmails,
                dataRetentionDays: dataRetentionDays ? parseInt(dataRetentionDays) : undefined,
                updatedAt: new Date()
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true
                    }
                }
            }
        });

        res.json({
            message: 'Company profile updated successfully',
            company: updatedCompany
        });
    } catch (error) {
        console.error('Error updating company:', error);
        res.status(500).json({ error: 'Failed to update company profile' });
    }
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ACCEPTED_RIDE_STATUSES = new Set([
    'ACCEPTED',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVED',
    'PICKED_UP',
    'IN_PROGRESS',
    'COMPLETED'
]);
const ON_TIME_THRESHOLD_MINUTES = 10;
const SHIFT_HOURS_PER_DAY = 8;

const minutesBetween = (start, end) => {
    if (!start || !end) return 0;
    return (end.getTime() - start.getTime()) / (60 * 1000);
};

const average = (values) => {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const formatMetric = (value, decimals = 1) => {
    if (Number.isNaN(value) || value === null || value === undefined) {
        return 0;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};

const computeKpis = ({ rides, activeDrivers, activeVehicles, revenue, daysBack }) => {
    const totalRides = rides.length;
    const completedRides = rides.filter((ride) => ride.status === 'COMPLETED').length;
    const cancelledRides = rides.filter((ride) => ride.status === 'CANCELLED').length;
    const acceptedRides = rides.filter((ride) => ACCEPTED_RIDE_STATUSES.has(ride.status)).length;

    const waitTimes = rides
        .filter((ride) => ride.requestedAt && ride.pickedUpAt)
        .map((ride) => minutesBetween(ride.requestedAt, ride.pickedUpAt))
        .filter((value) => value >= 0);

    const rideDurations = rides
        .filter((ride) => ride.pickedUpAt && ride.completedAt)
        .map((ride) => minutesBetween(ride.pickedUpAt, ride.completedAt))
        .filter((value) => value >= 0);

    const averageWaitTime = average(waitTimes);
    const onTimeCount = waitTimes.filter((value) => value <= ON_TIME_THRESHOLD_MINUTES).length;
    const onTimePercentage = waitTimes.length ? (onTimeCount / waitTimes.length) * 100 : 0;

    const potentialDriverMinutes = activeDrivers && daysBack
        ? activeDrivers * daysBack * SHIFT_HOURS_PER_DAY * 60
        : 0;
    const totalRideMinutes = rideDurations.reduce((sum, value) => sum + value, 0);
    const driverUtilization = potentialDriverMinutes
        ? Math.min(100, (totalRideMinutes / potentialDriverMinutes) * 100)
        : 0;

    const acceptanceRate = totalRides ? (acceptedRides / totalRides) * 100 : 0;
    const cancellationRate = totalRides ? (cancelledRides / totalRides) * 100 : 0;

    return {
        totalRides,
        completedRides,
        cancelledRides,
        revenue,
        activeDrivers,
        activeVehicles,
        acceptanceRate,
        cancellationRate,
        averageWaitTime,
        onTimePercentage,
        driverUtilization
    };
};

const buildKpiResponse = (metrics) => ({
    totalRides: metrics.totalRides,
    completedRides: metrics.completedRides,
    cancelledRides: metrics.cancelledRides,
    revenue: formatMetric(metrics.revenue, 2),
    activeDrivers: metrics.activeDrivers,
    activeVehicles: metrics.activeVehicles,
    acceptanceRate: formatMetric(metrics.acceptanceRate),
    cancellationRate: formatMetric(metrics.cancellationRate),
    averageWaitTime: formatMetric(metrics.averageWaitTime),
    onTimePercentage: formatMetric(metrics.onTimePercentage),
    driverUtilization: formatMetric(metrics.driverUtilization)
});

const resolvePeriod = (period) => {
    if (period === '7d') return 7;
    if (period === '90d') return 90;
    return 30;
};

// GET /api/owner/analytics/kpis - Get KPIs and analytics
router.get('/analytics/kpis', async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const daysBack = resolvePeriod(period);
        const now = new Date();
        const startDate = new Date(now.getTime() - daysBack * DAY_IN_MS);

        const [rides, revenueAggregate, activeDrivers, activeVehicles] = await Promise.all([
            prisma.rides.findMany({
                where: {
                    companyId: req.companyId,
                    requestedAt: { gte: startDate }
                },
                select: {
                    status: true,
                    requestedAt: true,
                    pickedUpAt: true,
                    completedAt: true
                }
            }),
            prisma.payments.aggregate({
                where: {
                    companyId: req.companyId,
                    status: 'COMPLETED',
                    createdAt: { gte: startDate }
                },
                _sum: { amount: true }
            }),
            prisma.user.count({
                where: {
                    companyId: req.companyId,
                    role: 'DRIVER',
                    isActive: true
                }
            }),
            prisma.vehicles.count({
                where: {
                    companyId: req.companyId,
                    isActive: true
                }
            })
        ]);

        const revenue = revenueAggregate._sum.amount ? Number(revenueAggregate._sum.amount) : 0;

        const metrics = computeKpis({
            rides,
            activeDrivers,
            activeVehicles,
            revenue,
            daysBack
        });

        res.json({
            kpis: buildKpiResponse(metrics),
            period,
            dateRange: {
                start: startDate.toISOString(),
                end: now.toISOString()
            }
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
});

// GET /api/owner/analytics/dashboard - Get dashboard data with trends
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        const daysBack = resolvePeriod(period);
        const now = new Date();
        const startDate = new Date(now.getTime() - daysBack * DAY_IN_MS);

        const [rides, payments, activeDrivers, activeVehicles] = await Promise.all([
            prisma.rides.findMany({
                where: {
                    companyId: req.companyId,
                    requestedAt: { gte: startDate }
                },
                select: {
                    status: true,
                    requestedAt: true,
                    pickedUpAt: true,
                    completedAt: true
                }
            }),
            prisma.payments.findMany({
                where: {
                    companyId: req.companyId,
                    status: 'COMPLETED',
                    createdAt: { gte: startDate }
                },
                select: {
                    amount: true,
                    createdAt: true
                }
            }),
            prisma.user.count({
                where: {
                    companyId: req.companyId,
                    role: 'DRIVER',
                    isActive: true
                }
            }),
            prisma.vehicles.count({
                where: {
                    companyId: req.companyId,
                    isActive: true
                }
            })
        ]);

        const revenue = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

        const metrics = computeKpis({
            rides,
            activeDrivers,
            activeVehicles,
            revenue,
            daysBack
        });

        const daySeries = [];
        const ridesByDay = new Map();
        const revenueByDay = new Map();

        for (let i = daysBack - 1; i >= 0; i -= 1) {
            const date = new Date(now.getTime() - i * DAY_IN_MS);
            const key = date.toISOString().slice(0, 10);
            daySeries.push(key);
            ridesByDay.set(key, { date: key, completed: 0, cancelled: 0, total: 0 });
            revenueByDay.set(key, { date: key, revenue: 0 });
        }

        rides.forEach((ride) => {
            const key = ride.requestedAt.toISOString().slice(0, 10);
            if (!ridesByDay.has(key)) {
                ridesByDay.set(key, { date: key, completed: 0, cancelled: 0, total: 0 });
            }
            const entry = ridesByDay.get(key);
            entry.total += 1;
            if (ride.status === 'COMPLETED') {
                entry.completed += 1;
            }
            if (ride.status === 'CANCELLED') {
                entry.cancelled += 1;
            }
        });

        payments.forEach((payment) => {
            const key = payment.createdAt.toISOString().slice(0, 10);
            if (!revenueByDay.has(key)) {
                revenueByDay.set(key, { date: key, revenue: 0 });
            }
            const entry = revenueByDay.get(key);
            entry.revenue += Number(payment.amount);
        });

        const ridesData = Array.from(ridesByDay.values()).sort((a, b) => a.date.localeCompare(b.date));
        const revenueData = Array.from(revenueByDay.values()).sort((a, b) => a.date.localeCompare(b.date));

        const hourlyBuckets = Array.from({ length: 24 }).map((_, hour) => ({
            hour: `${String(hour).padStart(2, '0')}:00`,
            rides: 0
        }));

        rides.forEach((ride) => {
            const hour = ride.requestedAt.getHours();
            hourlyBuckets[hour].rides += 1;
        });

        res.json({
            kpis: buildKpiResponse(metrics),
            trends: {
                ridesData,
                revenueData,
                hourlyData: hourlyBuckets
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

module.exports = router;
