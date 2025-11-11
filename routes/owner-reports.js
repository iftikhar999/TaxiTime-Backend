const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const COMPLETED_JOB_STATUSES = new Set(['COMPLETED', 'FINISHED']);
const CANCELLED_JOB_STATUSES = new Set([
    'CANCELLED',
    'REJECTED',
    'NOSHOW',
    'RECALLED',
    'EXPIRED',
]);
const NO_SHOW_STATUSES = new Set(['NOSHOW', 'RECALLED']);
const DRIVER_SHIFT_STATUSES = new Set(['ONLINE', 'BUSY']);
const FINAL_PAYMENT_STATUSES = ['PAID', 'COMPLETED'];

const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * MS_IN_DAY);
    const end = endDate ? new Date(endDate) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Invalid date range');
    }
    return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
};

const resolvePeriodRange = (period = 'current_month') => {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    switch (period) {
        case 'last_30_days': {
            const start = new Date(now.getTime() - 29 * MS_IN_DAY);
            return { startDate: start, endDate: now };
        }
        case 'previous_month': {
            const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
            const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
            return { startDate: start, endDate: end };
        }
        case 'current_month':
        default:
            return { startDate: startOfMonth, endDate: now };
    }
};

const decimalToNumber = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const buildDateBuckets = (start, end, maxDays = 90) => {
    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const span = Math.abs(endDay - startDay) / MS_IN_DAY;
    const totalDays = Math.min(Math.floor(span) + 1, Math.max(maxDays, 1));
    const firstDay =
        span + 1 > maxDays
            ? endDay - (totalDays - 1) * MS_IN_DAY
            : Math.min(startDay, endDay);

    const buckets = [];
    for (let ts = firstDay; ts <= Math.max(startDay, endDay); ts += MS_IN_DAY) {
        buckets.push(new Date(ts));
    }
    return buckets;
};

const buildDateKey = (date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        .toISOString()
        .split('T')[0];

const minutesBetween = (start, end) => {
    if (!start || !end) {
        return null;
    }
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(diff) || diff <= 0) {
        return null;
    }
    return diff / (60 * 1000);
};

const formatHourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

const ensureCompanyContext = (req) => {
    if (!req.companyId) {
        throw new Error('Company context missing');
    }
    return req.companyId;
};

router.get('/ride-performance', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        const [jobs, ratingsAggregate] = await Promise.all([
            prisma.job.findMany({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                },
                select: {
                    status: true,
                    createdAt: true,
                    estimatedDistance: true,
                    estimatedDuration: true,
                    trip: {
                        select: {
                            actualDistance: true,
                            actualDuration: true,
                            pickedUpAt: true,
                            completedAt: true,
                        },
                    },
                },
            }),
            prisma.ratings.aggregate({
                _avg: { rating: true },
                where: {
                    rides: {
                        companyId,
                        requestedAt: { gte: start, lte: end },
                    },
                },
            }),
        ]);

        const totalRides = jobs.length;
        let completedRides = 0;
        let cancelledRides = 0;
        let noShowRides = 0;
        let durationAccumulator = 0;
        let durationSamples = 0;
        let distanceAccumulator = 0;
        let distanceSamples = 0;

        const peakHourBuckets = new Map();
        const dailyMap = new Map();

        for (const job of jobs) {
            if (COMPLETED_JOB_STATUSES.has(job.status)) {
                completedRides += 1;
            }
            if (CANCELLED_JOB_STATUSES.has(job.status)) {
                cancelledRides += 1;
            }
            if (NO_SHOW_STATUSES.has(job.status)) {
                noShowRides += 1;
            }

            const jobDate = new Date(job.createdAt);
            const hour = jobDate.getUTCHours();
            peakHourBuckets.set(hour, (peakHourBuckets.get(hour) || 0) + 1);

            const dayKey = buildDateKey(jobDate);
            if (!dailyMap.has(dayKey)) {
                dailyMap.set(dayKey, {
                    date: new Date(dayKey),
                    total: 0,
                    completed: 0,
                    cancelled: 0,
                    distanceSum: 0,
                    distanceCount: 0,
                    durationSum: 0,
                    durationCount: 0,
                });
            }
            const bucket = dailyMap.get(dayKey);
            bucket.total += 1;
            if (COMPLETED_JOB_STATUSES.has(job.status)) {
                bucket.completed += 1;
            }
            if (CANCELLED_JOB_STATUSES.has(job.status)) {
                bucket.cancelled += 1;
            }

            const actualDuration = job.trip?.actualDuration ?? job.estimatedDuration;
            const durationMinutes =
                typeof actualDuration === 'number' && Number.isFinite(actualDuration)
                    ? actualDuration
                    : minutesBetween(job.trip?.pickedUpAt, job.trip?.completedAt);
            if (durationMinutes) {
                durationAccumulator += durationMinutes;
                durationSamples += 1;
                bucket.durationSum += durationMinutes;
                bucket.durationCount += 1;
            }

            const actualDistance = job.trip?.actualDistance ?? job.estimatedDistance;
            if (typeof actualDistance === 'number' && Number.isFinite(actualDistance)) {
                distanceAccumulator += actualDistance;
                distanceSamples += 1;
                bucket.distanceSum += actualDistance;
                bucket.distanceCount += 1;
            }
        }

        const peakHours = Array.from(peakHourBuckets.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([hour, rides]) => ({ hour: formatHourLabel(hour), rides }));

        const dateBuckets = buildDateBuckets(start, end, 60);
        const dailyBreakdown = dateBuckets.map((date) => {
            const key = buildDateKey(date);
            const bucket = dailyMap.get(key);
            if (!bucket) {
                return {
                    date,
                    totalRides: 0,
                    completedRides: 0,
                    cancelledRides: 0,
                    avgDuration: 0,
                    avgDistance: 0,
                };
            }
            return {
                date: bucket.date,
                totalRides: bucket.total,
                completedRides: bucket.completed,
                cancelledRides: bucket.cancelled,
                avgDuration: bucket.durationCount
                    ? bucket.durationSum / bucket.durationCount
                    : 0,
                avgDistance: bucket.distanceCount
                    ? bucket.distanceSum / bucket.distanceCount
                    : 0,
            };
        });

        res.json({
            data: {
                totalRides,
                completedRides,
                cancelledRides,
                noShowRides,
                avgDuration: durationSamples ? durationAccumulator / durationSamples : 0,
                avgDistance: distanceSamples ? distanceAccumulator / distanceSamples : 0,
                avgRating: ratingsAggregate._avg.rating ?? 0,
                completionRate: totalRides
                    ? Number(((completedRides / totalRides) * 100).toFixed(1))
                    : 0,
                peakHours,
                dailyBreakdown,
            },
        });
    } catch (error) {
        console.error('Get ride performance error:', error);
        res.status(500).json({ error: 'Failed to fetch ride performance data' });
    }
});

router.get('/earnings', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        const [payments, subscriptionSum, rideCount] = await Promise.all([
            prisma.payments.findMany({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                    status: { in: FINAL_PAYMENT_STATUSES },
                },
                select: {
                    amount: true,
                    driverEarnings: true,
                    fees: true,
                    taxes: true,
                    createdAt: true,
                    driverId: true,
                },
            }),
            prisma.billing_records.aggregate({
                _sum: { totalAmount: true },
                where: {
                    companyId,
                    billingPeriodStart: { gte: start },
                    billingPeriodEnd: { lte: end },
                },
            }),
            prisma.job.count({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                },
            }),
        ]);

        let totalEarnings = 0;
        let driverPayouts = 0;
        let totalFees = 0;
        let totalTaxes = 0;
        const monthlyMap = new Map();
        const driverBuckets = new Map();

        for (const payment of payments) {
            const amount = decimalToNumber(payment.amount);
            const earnings = decimalToNumber(payment.driverEarnings);
            const fee = decimalToNumber(payment.fees);
            const tax = decimalToNumber(payment.taxes);

            totalEarnings += amount;
            driverPayouts += earnings;
            totalFees += fee;
            totalTaxes += tax;

            const paymentDate = new Date(payment.createdAt);
            const monthKey = `${paymentDate.getUTCFullYear()}-${paymentDate.getUTCMonth()}`;
            if (!monthlyMap.has(monthKey)) {
                monthlyMap.set(monthKey, {
                    date: new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), 1)),
                    earnings: 0,
                    commissions: 0,
                    rides: 0,
                });
            }
            const monthBucket = monthlyMap.get(monthKey);
            monthBucket.earnings += amount;
            monthBucket.commissions += amount - earnings;
            monthBucket.rides += 1;

            if (payment.driverId) {
                if (!driverBuckets.has(payment.driverId)) {
                    driverBuckets.set(payment.driverId, {
                        driverId: payment.driverId,
                        earnings: 0,
                        rides: 0,
                    });
                }
                const stats = driverBuckets.get(payment.driverId);
                stats.earnings += earnings || amount;
                stats.rides += 1;
            }
        }

        const subscriptionFees = decimalToNumber(subscriptionSum._sum.totalAmount);
        const commission = totalEarnings - driverPayouts;
        const netRevenue = totalEarnings - driverPayouts - totalFees - totalTaxes;
        const totalRides = rideCount;
        const averageRideValue = totalRides ? totalEarnings / totalRides : 0;

        const monthlyTrend = Array.from(monthlyMap.values())
            .sort((a, b) => a.date - b.date)
            .slice(-12)
            .map((bucket) => ({
                month: bucket.date.toLocaleDateString('en-US', { month: 'short' }),
                earnings: Number(bucket.earnings.toFixed(2)),
                rides: bucket.rides,
                commission: Number(bucket.commissions.toFixed(2)),
            }));

        const topDrivers = Array.from(driverBuckets.values())
            .sort((a, b) => b.earnings - a.earnings)
            .slice(0, 3);
        const driverIds = topDrivers.map((driver) => driver.driverId);
        const driverProfiles = driverIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: driverIds } },
                  select: { id: true, firstName: true, lastName: true },
              })
            : [];
        const driverNameMap = new Map(
            driverProfiles.map((profile) => [
                profile.id,
                `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Driver',
            ]),
        );

        const topEarningDrivers = topDrivers.map((driver) => ({
            id: driver.driverId,
            name: driverNameMap.get(driver.driverId) || 'Driver',
            earnings: Number(driver.earnings.toFixed(2)),
            rides: driver.rides,
            avgRide: driver.rides ? Number((driver.earnings / driver.rides).toFixed(2)) : 0,
        }));

        res.json({
            data: {
                totalEarnings: Number(totalEarnings.toFixed(2)),
                totalRides,
                averageRideValue: Number(averageRideValue.toFixed(2)),
                commission: Number(commission.toFixed(2)),
                driverPayouts: Number(driverPayouts.toFixed(2)),
                netRevenue: Number(netRevenue.toFixed(2)),
                taxes: Number(totalTaxes.toFixed(2)),
                platformFees: Number(totalFees.toFixed(2)),
                breakdown: {
                    rideRevenue: Number(totalEarnings.toFixed(2)),
                    subscriptionFees: Number(subscriptionFees.toFixed(2)),
                    additionalServices: 0,
                    totalGross: Number((totalEarnings + subscriptionFees).toFixed(2)),
                },
                monthlyTrend,
                topEarningDrivers,
            },
        });
    } catch (error) {
        console.error('Get earnings report error:', error);
        res.status(500).json({ error: 'Failed to fetch earnings report' });
    }
});

router.get('/cancellations', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        const [rides, totalRideRequests] = await Promise.all([
            prisma.rides.findMany({
                where: {
                    companyId,
                    requestedAt: { gte: start, lte: end },
                    status: { in: ['CANCELLED', 'FAILED'] },
                },
                select: {
                    cancellationReason: true,
                    cancelledBy: true,
                    requestedAt: true,
                    cancelledAt: true,
                },
            }),
            prisma.rides.count({
                where: {
                    companyId,
                    requestedAt: { gte: start, lte: end },
                },
            }),
        ]);

        const totalCancellations = rides.length;
        let driverCancellations = 0;
        let passengerCancellations = 0;
        let systemCancellations = 0;
        let cancellationDurationSum = 0;
        let cancellationDurationCount = 0;
        const reasonBuckets = new Map();
        const hourlyBuckets = new Map();
        const dailyBuckets = new Map();

        for (const ride of rides) {
            const reason = ride.cancellationReason || 'Other';
            reasonBuckets.set(reason, (reasonBuckets.get(reason) || 0) + 1);

            const hour = new Date(ride.cancelledAt || ride.requestedAt).getUTCHours();
            hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);

            const dayKey = buildDateKey(new Date(ride.requestedAt));
            if (!dailyBuckets.has(dayKey)) {
                dailyBuckets.set(dayKey, {
                    date: new Date(dayKey),
                    cancellations: 0,
                    driver: 0,
                    passenger: 0,
                });
            }
            const bucket = dailyBuckets.get(dayKey);
            bucket.cancellations += 1;

            if (ride.cancelledBy === 'DRIVER') {
                driverCancellations += 1;
                bucket.driver += 1;
            } else if (ride.cancelledBy === 'PASSENGER') {
                passengerCancellations += 1;
                bucket.passenger += 1;
            } else {
                systemCancellations += 1;
            }

            const cancellationMinutes = minutesBetween(ride.requestedAt, ride.cancelledAt);
            if (cancellationMinutes) {
                cancellationDurationSum += cancellationMinutes;
                cancellationDurationCount += 1;
            }
        }

        const dailyTrend = buildDateBuckets(start, end, 60).map((date) => {
            const key = buildDateKey(date);
            const bucket = dailyBuckets.get(key);
            return {
                date,
                totalRides: bucket ? bucket.cancellations : 0,
                cancellations: bucket ? bucket.cancellations : 0,
                driverCancellations: bucket ? bucket.driver : 0,
                passengerCancellations: bucket ? bucket.passenger : 0,
            };
        });

        const timePatterns = Array.from(hourlyBuckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([hour, cancellations]) => ({
                hour: formatHourLabel(hour),
                cancellations,
            }));

        const reasons = Array.from(reasonBuckets.entries())
            .map(([reason, count]) => ({
                reason,
                count,
                percentage: totalCancellations
                    ? Number(((count / totalCancellations) * 100).toFixed(1))
                    : 0,
            }))
            .sort((a, b) => b.count - a.count);

        res.json({
            data: {
                totalCancellations,
                driverCancellations,
                passengerCancellations,
                systemCancellations,
                cancellationRate: totalRideRequests
                    ? Number(((totalCancellations / totalRideRequests) * 100).toFixed(1))
                    : 0,
                avgCancellationTime: cancellationDurationCount
                    ? Number((cancellationDurationSum / cancellationDurationCount).toFixed(1))
                    : 0,
                reasons,
                timePatterns,
                dailyTrend,
            },
        });
    } catch (error) {
        console.error('Get cancellation report error:', error);
        res.status(500).json({ error: 'Failed to fetch cancellation report' });
    }
});

router.get('/driver-performance', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        const [drivers, activeShifts, jobs, payments, rides] = await Promise.all([
            prisma.user.findMany({
                where: {
                    role: 'DRIVER',
                    companyId,
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                },
            }),
            prisma.shift.findMany({
                where: {
                    companyId,
                    status: { in: Array.from(DRIVER_SHIFT_STATUSES) },
                    endTime: null,
                },
                select: { driverId: true },
            }),
            prisma.job.findMany({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                },
                select: {
                    status: true,
                    assignedDriverId: true,
                    actualFare: true,
                    estimatedPrice: true,
                },
            }),
            prisma.payments.findMany({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                    status: { in: FINAL_PAYMENT_STATUSES },
                },
                select: {
                    driverId: true,
                    driverEarnings: true,
                },
            }),
            prisma.rides.findMany({
                where: {
                    companyId,
                    requestedAt: { gte: start, lte: end },
                },
                select: {
                    requestedAt: true,
                    acceptedAt: true,
                    status: true,
                },
            }),
        ]);

        const totalDrivers = drivers.length;
        const activeDrivers = new Set(activeShifts.map((shift) => shift.driverId)).size;
        let completedRides = 0;
        let totalDistance = 0;

        const driverStats = new Map();
        for (const job of jobs) {
            if (COMPLETED_JOB_STATUSES.has(job.status)) {
                completedRides += 1;
            }
            if (!job.assignedDriverId) {
                continue;
            }
            if (!driverStats.has(job.assignedDriverId)) {
                driverStats.set(job.assignedDriverId, {
                    driverId: job.assignedDriverId,
                    rides: 0,
                    completed: 0,
                    earnings: 0,
                });
            }
            const stats = driverStats.get(job.assignedDriverId);
            stats.rides += 1;
            if (COMPLETED_JOB_STATUSES.has(job.status)) {
                stats.completed += 1;
            }
            const fare = job.actualFare ? Number(job.actualFare) : job.estimatedPrice || 0;
            stats.earnings += fare;
        }

        for (const payment of payments) {
            if (!payment.driverId || !driverStats.has(payment.driverId)) {
                continue;
            }
            const stats = driverStats.get(payment.driverId);
            stats.earnings += decimalToNumber(payment.driverEarnings);
        }

        let responseTimeSum = 0;
        let responseSamples = 0;
        for (const ride of rides) {
            const responseMinutes = minutesBetween(ride.requestedAt, ride.acceptedAt);
            if (responseMinutes) {
                responseTimeSum += responseMinutes;
                responseSamples += 1;
            }
        }

        const topPerformers = Array.from(driverStats.values())
            .sort((a, b) => b.completed - a.completed || b.earnings - a.earnings)
            .slice(0, 3)
            .map((stats) => {
                const profile = drivers.find((driver) => driver.id === stats.driverId);
                const name = profile
                    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Driver'
                    : 'Driver';
                return {
                    id: stats.driverId,
                    name,
                    rides: stats.completed,
                    earnings: Number(stats.earnings.toFixed(2)),
                    rating: 0,
                    completionRate: stats.rides
                        ? Number(((stats.completed / stats.rides) * 100).toFixed(1))
                        : 0,
                    avgResponseTime: responseSamples
                        ? Number((responseTimeSum / responseSamples).toFixed(1))
                        : 0,
                    vehicleType: 'N/A',
                };
            });

        res.json({
            data: {
                totalDrivers,
                activeDrivers,
                avgRating: 0,
                avgRidesPerDriver: totalDrivers ? Number((completedRides / totalDrivers).toFixed(1)) : 0,
                avgEarningsPerDriver: totalDrivers
                    ? Number(
                          (
                              payments.reduce(
                                  (sum, payment) => sum + decimalToNumber(payment.driverEarnings),
                                  0,
                              ) / totalDrivers
                          ).toFixed(2),
                      )
                    : 0,
                topPerformers,
                metrics: {
                    avgCompletionRate: jobs.length
                        ? Number(((completedRides / jobs.length) * 100).toFixed(1))
                        : 0,
                    avgResponseTime: responseSamples
                        ? Number((responseTimeSum / responseSamples).toFixed(1))
                        : 0,
                    totalHoursOnline: 0,
                    totalDistance,
                    fuelEfficiency: 0,
                },
            },
        });
    } catch (error) {
        console.error('Get driver performance error:', error);
        res.status(500).json({ error: 'Failed to fetch driver performance data' });
    }
});

router.get('/fleet-utilization', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        const [vehicles, jobs] = await Promise.all([
            prisma.vehicles.findMany({
                where: { companyId },
                select: {
                    id: true,
                    vehicleType: true,
                    isActive: true,
                    isAvailable: true,
                },
            }),
            prisma.job.findMany({
                where: {
                    companyId,
                    createdAt: { gte: start, lte: end },
                },
                select: {
                    createdAt: true,
                    estimatedPrice: true,
                    assignedDriverId: true,
                },
            }),
        ]);

        const totalVehicles = vehicles.length;
        const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive).length;
        const utilizationRate = totalVehicles
            ? Number(((activeVehicles / totalVehicles) * 100).toFixed(1))
            : 0;

        const revenue = jobs.reduce(
            (sum, job) => sum + (job.estimatedPrice ? Number(job.estimatedPrice) : 0),
            0,
        );

        const vehicleBreakdownMap = new Map();
        for (const vehicle of vehicles) {
            const bucket = vehicleBreakdownMap.get(vehicle.vehicleType) || {
                type: vehicle.vehicleType,
                count: 0,
                active: 0,
            };
            bucket.count += 1;
            if (vehicle.isActive && vehicle.isAvailable) {
                bucket.active += 1;
            }
            vehicleBreakdownMap.set(vehicle.vehicleType, bucket);
        }

        const jobsByDay = new Map();
        for (const job of jobs) {
            const key = buildDateKey(new Date(job.createdAt));
            if (!jobsByDay.has(key)) {
                jobsByDay.set(key, {
                    totalTrips: 0,
                    revenue: 0,
                    drivers: new Set(),
                });
            }
            const bucket = jobsByDay.get(key);
            bucket.totalTrips += 1;
            bucket.revenue += job.estimatedPrice ? Number(job.estimatedPrice) : 0;
            if (job.assignedDriverId) {
                bucket.drivers.add(job.assignedDriverId);
            }
        }

        const dailyUtilization = buildDateBuckets(start, end, 60).map((date) => {
            const key = buildDateKey(date);
            const bucket = jobsByDay.get(key);
            const activeCount = bucket ? Math.min(totalVehicles, bucket.drivers.size) : 0;
            return {
                date,
                activeVehicles: activeCount,
                totalTrips: bucket ? bucket.totalTrips : 0,
                revenue: bucket ? Number(bucket.revenue.toFixed(2)) : 0,
                utilizationRate: totalVehicles
                    ? Number(((activeCount / totalVehicles) * 100).toFixed(1))
                    : 0,
            };
        });

        res.json({
            data: {
                totalVehicles,
                activeVehicles,
                utilizationRate,
                avgTripsPerVehicle: totalVehicles
                    ? Number((jobs.length / totalVehicles).toFixed(1))
                    : 0,
                avgRevenuePerVehicle: totalVehicles
                    ? Number((revenue / totalVehicles).toFixed(2))
                    : 0,
                maintenanceCosts: 0,
                fuelCosts: 0,
                vehicleBreakdown: Array.from(vehicleBreakdownMap.values()).map((bucket) => ({
                    type: bucket.type,
                    count: bucket.count,
                    utilization: bucket.count
                        ? Number(((bucket.active / bucket.count) * 100).toFixed(1))
                        : 0,
                    avgRevenue:
                        bucket.count && totalVehicles
                            ? Number((revenue / totalVehicles).toFixed(2))
                            : 0,
                })),
                dailyUtilization,
            },
        });
    } catch (error) {
        console.error('Get fleet utilization error:', error);
        res.status(500).json({ error: 'Failed to fetch fleet utilization data' });
    }
});

router.get('/financial-summary', async (req, res) => {
    try {
        const companyId = ensureCompanyContext(req);
        const { period = 'current_month' } = req.query;
        const { startDate, endDate } = resolvePeriodRange(period);
        const periodLength = endDate.getTime() - startDate.getTime();
        const previousRange = {
            startDate: new Date(startDate.getTime() - periodLength),
            endDate: new Date(endDate.getTime() - periodLength),
        };

        const aggregateForRange = async ({ startDate: rangeStart, endDate: rangeEnd }) => {
            const [payments, billingSum] = await Promise.all([
                prisma.payments.findMany({
                    where: {
                        companyId,
                        createdAt: { gte: rangeStart, lte: rangeEnd },
                        status: { in: FINAL_PAYMENT_STATUSES },
                    },
                    select: {
                        amount: true,
                        driverEarnings: true,
                        fees: true,
                        taxes: true,
                        customerId: true,
                    },
                }),
                prisma.billing_records.aggregate({
                    _sum: { totalAmount: true },
                    where: {
                        companyId,
                        billingPeriodStart: { gte: rangeStart },
                        billingPeriodEnd: { lte: rangeEnd },
                    },
                }),
            ]);

            let gross = 0;
            let driverPayouts = 0;
            let platformFees = 0;
            let taxes = 0;
            const customers = new Set();
            for (const payment of payments) {
                gross += decimalToNumber(payment.amount);
                driverPayouts += decimalToNumber(payment.driverEarnings);
                platformFees += decimalToNumber(payment.fees);
                taxes += decimalToNumber(payment.taxes);
                if (payment.customerId) {
                    customers.add(payment.customerId);
                }
            }
            const subscriptionRevenue = decimalToNumber(billingSum._sum.totalAmount);
            return {
                payments,
                gross,
                driverPayouts,
                platformFees,
                taxes,
                subscriptionRevenue,
                uniqueCustomers: customers.size,
            };
        };

        const [current, previous] = await Promise.all([
            aggregateForRange({ startDate, endDate }),
            aggregateForRange(previousRange),
        ]);

        const netRevenue =
            current.gross - current.driverPayouts - current.platformFees - current.taxes;
        const totalExpenses =
            current.driverPayouts + current.platformFees + current.taxes;
        const grossProfit = current.gross - totalExpenses;
        const netProfit = netRevenue;

        const growth = (currentValue, previousValue) => {
            if (!previousValue) {
                return currentValue ? 100 : 0;
            }
            return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
        };

        res.json({
            data: {
                period,
                revenue: {
                    gross: Number(current.gross.toFixed(2)),
                    net: Number(netRevenue.toFixed(2)),
                    rides: Number(current.gross.toFixed(2)),
                    subscriptions: Number(current.subscriptionRevenue.toFixed(2)),
                    additionalServices: 0,
                },
                expenses: {
                    driverPayouts: Number(current.driverPayouts.toFixed(2)),
                    platformFees: Number(current.platformFees.toFixed(2)),
                    taxes: Number(current.taxes.toFixed(2)),
                    maintenance: 0,
                    fuel: 0,
                    insurance: 0,
                    other: 0,
                },
                profitability: {
                    grossProfit: Number(grossProfit.toFixed(2)),
                    netProfit: Number(netProfit.toFixed(2)),
                    profitMargin: current.gross
                        ? Number(((netProfit / current.gross) * 100).toFixed(1))
                        : 0,
                    roiPercentage: current.subscriptionRevenue
                        ? Number(((netProfit / current.subscriptionRevenue) * 100).toFixed(1))
                        : 0,
                },
                kpis: {
                    revenuePerRide: current.payments.length
                        ? Number((current.gross / current.payments.length).toFixed(2))
                        : 0,
                    costPerRide: current.payments.length
                        ? Number((current.driverPayouts / current.payments.length).toFixed(2))
                        : 0,
                    profitPerRide: current.payments.length
                        ? Number((netProfit / current.payments.length).toFixed(2))
                        : 0,
                    rideVolume: current.payments.length,
                    avgCustomerValue: current.uniqueCustomers
                        ? Number((current.gross / current.uniqueCustomers).toFixed(2))
                        : 0,
                },
                trends: {
                    revenueGrowth: growth(current.gross, previous.gross),
                    rideGrowth: growth(
                        current.payments.length,
                        previous.payments.length,
                    ),
                    profitGrowth: growth(netProfit, previous.gross - previous.driverPayouts),
                    customerGrowth: growth(
                        current.uniqueCustomers,
                        previous.uniqueCustomers,
                    ),
                },
            },
        });
    } catch (error) {
        console.error('Get financial summary error:', error);
        res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
});

module.exports = router;
