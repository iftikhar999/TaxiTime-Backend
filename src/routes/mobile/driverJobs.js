const express = require('express');
const { randomUUID } = require('crypto');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');
const jobService = require('../../../services/jobService');
const { detectZone, pointInPolygon } = require('../../../services/zoneDetectionService');
const logger = require('../../../utils/logger');

const router = express.Router();

const toNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const parseJson = (value) => {
    if (!value) {
        return {};
    }
    if (typeof value === 'object') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        logger.warn('Failed to parse JSON payload', error?.message || error);
        return {};
    }
};

const filterUndefined = (object = {}) =>
    Object.fromEntries(
        Object.entries(object).filter(([, value]) => value !== undefined)
    );

const buildLocationSummary = (rawLocation) => {
    const location = parseJson(rawLocation);
    const latitude =
        toNumber(location.latitude ?? location.lat ?? location[1]) ?? null;
    const longitude =
        toNumber(location.longitude ?? location.lng ?? location[0]) ?? null;

    return {
        address:
            location.address ??
            location.name ??
            location.label ??
            location.description ??
            null,
        latitude,
        longitude,
    };
};

const toFiniteNumber = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const toNumberSafe = (value, fallback = 0) =>
    value === null || value === undefined ? fallback : Number(value);

const toOptionalNumberValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeLocationPayload = (rawLocation) => {
    if (!rawLocation || typeof rawLocation !== 'object') {
        return null;
    }

    const latitude = toFiniteNumber(rawLocation.latitude ?? rawLocation.lat);
    const longitude = toFiniteNumber(rawLocation.longitude ?? rawLocation.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    const accuracy = toFiniteNumber(rawLocation.accuracy);
    const heading = toFiniteNumber(rawLocation.heading);
    const speed = toFiniteNumber(rawLocation.speed);
    const timestampValue = rawLocation.timestamp && new Date(rawLocation.timestamp);
    const recordedAt =
        timestampValue && !Number.isNaN(timestampValue.getTime())
            ? timestampValue.toISOString()
            : new Date().toISOString();

    return {
        latitude,
        longitude,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        heading: Number.isFinite(heading) ? heading : null,
        speed: Number.isFinite(speed) ? speed : null,
        address:
            typeof rawLocation.address === 'string' && rawLocation.address.trim().length
                ? rawLocation.address.trim()
                : null,
        timestamp: recordedAt,
    };
};

const sanitizeBreakdownPayload = (raw = null) => {
    if (!raw || typeof raw !== 'object') {
        return {
            raw: null,
            metrics: {},
            pricing: null,
        };
    }

    const metricsSource = raw.metrics || raw.rideMetrics || {};
    const totalDistanceMeters =
        toFiniteNumber(raw.totalDistanceMeters) ??
        toFiniteNumber(raw.distanceMeters) ??
        toFiniteNumber(raw.totalDistance) ??
        toFiniteNumber(metricsSource.distanceMeters);
    const totalDurationSeconds =
        toFiniteNumber(raw.totalDurationSeconds) ??
        toFiniteNumber(raw.durationSeconds) ??
        toFiniteNumber(raw.duration) ??
        toFiniteNumber(raw.totalDuration) ??
        toFiniteNumber(metricsSource.elapsedSeconds);
    const waitingSeconds =
        toFiniteNumber(raw.waitingSeconds) ??
        toFiniteNumber(metricsSource.waitingSeconds);

    const pricing =
        raw.pricing && typeof raw.pricing === 'object'
            ? filterUndefined({
                  startingPrice: toFiniteNumber(raw.pricing.startingPrice),
                  distanceCost: toFiniteNumber(raw.pricing.distanceCost),
                  durationCost: toFiniteNumber(raw.pricing.durationCost),
                  waitingCost: toFiniteNumber(raw.pricing.waitingCost),
                  totalCost: toFiniteNumber(raw.pricing.totalCost),
              })
            : null;

    const metricsPayload = filterUndefined({
        totalDistanceMeters,
        totalDistanceKm:
            totalDistanceMeters !== null && totalDistanceMeters !== undefined
                ? Number((totalDistanceMeters / 1000).toFixed(3))
                : undefined,
        totalDurationSeconds,
        totalDurationMinutes:
            totalDurationSeconds !== null && totalDurationSeconds !== undefined
                ? Math.max(Math.round(totalDurationSeconds / 60), 1)
                : undefined,
        waitingSeconds,
    });

    return {
        raw,
        metrics: metricsPayload,
        pricing,
    };
};

const mergeRequirementPayload = (existing, updates = {}) => {
    const base = typeof existing === 'object' && existing !== null ? { ...existing } : {};
    let changed = false;

    if (updates.rideMetrics && Object.keys(updates.rideMetrics).length) {
        base.rideMetrics = {
            ...(base.rideMetrics || {}),
            ...updates.rideMetrics,
        };
        changed = true;
    }

    if (updates.pauseRecords && Array.isArray(updates.pauseRecords)) {
        base.pauseRecords = updates.pauseRecords;
        changed = true;
    }

    if (updates.statusTimeline && typeof updates.statusTimeline === 'object') {
        base.statusTimeline = {
            ...(base.statusTimeline || {}),
            ...updates.statusTimeline,
        };
        changed = true;
    }

    return changed ? base : null;
};

const RECENT_JOB_STATUS_FILTER = ['COMPLETED', 'FINISHED'];

const mapJobToRecentSummary = (job) => {
    const customer = job.users_jobs_customerIdTousers;
    const ride = job.rides;
    const payment = job.payments?.[0] || null;
    const requirementPayload = parseJson(job.requirements);
    const rideMetrics = requirementPayload?.rideMetrics || {};
    const statusTimeline = requirementPayload?.statusTimeline || null;
    const completionDate = job.completedAt ?? ride?.completedAt ?? job.updatedAt;
    const ridePickup = ride?.pickup ? buildLocationSummary(ride.pickup) : null;
    const rideDropoff = ride?.destination ? buildLocationSummary(ride.destination) : null;

    let distanceKm =
        toOptionalNumberValue(job.actualDistanceKm) ??
        toOptionalNumberValue(ride?.actualDistance) ??
        toOptionalNumberValue(rideMetrics.totalDistanceKm);
    if (
        (distanceKm === null || distanceKm === undefined) &&
        rideMetrics.totalDistanceMeters !== undefined
    ) {
        const metersValue = toOptionalNumberValue(rideMetrics.totalDistanceMeters);
        if (metersValue !== null && metersValue !== undefined) {
            distanceKm = metersValue / 1000;
        }
    }

    let durationSeconds = toOptionalNumberValue(job.actualDurationSeconds);
    if (durationSeconds === null || durationSeconds === undefined) {
        const rideDurationMinutes = toOptionalNumberValue(ride?.actualDuration ?? job.estimatedDuration);
        if (rideDurationMinutes !== null && rideDurationMinutes !== undefined) {
            durationSeconds = Math.max(Math.round(rideDurationMinutes * 60), 0);
        }
    }
    if (durationSeconds === null || durationSeconds === undefined) {
        const metricsDurationSeconds = toOptionalNumberValue(rideMetrics.totalDurationSeconds);
        if (metricsDurationSeconds !== null && metricsDurationSeconds !== undefined) {
            durationSeconds = Math.max(Math.round(metricsDurationSeconds), 0);
        }
    }

    const fareActual = toNumberSafe(
        job.actualFare ?? ride?.actualFare ?? payment?.amount ?? job.estimatedPrice,
    );
    const driverEarnings = fareActual;

    return {
        id: job.id,
        jobId: job.jobId,
        status: job.status,
        createdAt: job.createdAt ? job.createdAt.toISOString() : null,
        startedAt: job.startedAt ? job.startedAt.toISOString() : statusTimeline?.STARTED || null,
        completedAt: completionDate ? new Date(completionDate).toISOString() : null,
        pickup: {
            address: ridePickup?.address || job.pickupAddress || 'Pickup pending',
            latitude: ridePickup?.latitude ?? job.pickupLatitude,
            longitude: ridePickup?.longitude ?? job.pickupLongitude,
        },
        dropoff: {
            address: rideDropoff?.address || job.dropoffAddress || 'Destination pending',
            latitude: rideDropoff?.latitude ?? job.dropoffLatitude,
            longitude: rideDropoff?.longitude ?? job.dropoffLongitude,
        },
        distanceKm: typeof distanceKm === 'number' ? Number(distanceKm.toFixed(2)) : null,
        durationSeconds: durationSeconds ?? null,
        fare: {
            currency: 'NZD',
            total: Number(fareActual.toFixed(2)),
            driverEarnings: Number(driverEarnings.toFixed(2)),
        },
        paymentMethod: job.paymentMethod ?? payment?.paymentMethod ?? 'UNKNOWN',
        payment: payment
            ? {
                  amount: Number(toNumberSafe(payment.amount).toFixed(2)),
                  driverEarnings: Number(driverEarnings.toFixed(2)),
                  status: payment.status,
              }
            : null,
        passenger: customer
            ? {
                  id: customer.id,
                  name:
                      `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                      customer.email ||
                      customer.phone ||
                      'Customer',
                  phone: customer.phone || null,
              }
            : null,
        statusTimeline,
    };
};

/**
 * ✅ NEW: Get driver's current active job
 * Called on app restart to restore job state
 */
router.get('/current', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    
    if (!driverId) {
        return res.status(400).json({ 
            success: false,
            error: 'Driver ID required' 
        });
    }

    try {
        logger.info(`🔍 Fetching current job for driver: ${driverId}`);
        
        // Find any active/in-progress job for this driver
        const job = await prisma.job.findFirst({
            where: {
                assignedDriverId: driverId,
                status: {
                    in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'PAUSED', 'PENDING_PAYMENT']
                },
            },
            include: {
                users_jobs_customerIdTousers: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                    },
                },
                rides: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        if (!job) {
            logger.info(`ℹ️ No active job found for driver: ${driverId}`);
            return res.json({
                success: true,
                job: null,
            });
        }

        logger.info(`✅ Found active job for driver: ${job.id}, status: ${job.status}`);

        // Build response
        const customer = job.users_jobs_customerIdTousers;
        const trip = job.rides;

        const jobResponse = {
            id: job.id,
            jobId: job.jobId,
            status: job.status,
            pickupAddress: job.pickupAddress,
            pickupLatitude: job.pickupLatitude,
            pickupLongitude: job.pickupLongitude,
            dropoffAddress: job.dropoffAddress,
            dropoffLatitude: job.dropoffLatitude,
            dropoffLongitude: job.dropoffLongitude,
            estimatedPrice: job.estimatedPrice,
            estimatedFare: job.estimatedPrice, // Alias
            actualFare: job.actualFare,
            createdAt: job.createdAt,
            customer: customer ? {
                id: customer.id,
                name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email,
                phone: customer.phone,
            } : null,
            trip: trip ? {
                id: trip.id,
                status: trip.status,
            } : null,
        };

        res.json({
            success: true,
            job: jobResponse,
        });

    } catch (error) {
        logger.error('❌ Error fetching current job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch current job',
            details: error.message,
        });
    }
});

const buildPassengerSummary = (passenger) => {
    if (!passenger) {
        return null;
    }

    const fullName = [passenger.firstName, passenger.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

    return {
        id: passenger.id,
        name: fullName || passenger.firstName || passenger.lastName || null,
        phone: passenger.phone || null,
        rating: passenger.rating || null,
    };
};

const buildPaymentSummary = (ride, payment) => {
    if (!payment && !ride) {
        return null;
    }

    const fareBreakdown = parseJson(ride?.fareBreakdown);

    const amount =
        toNumber(payment?.amount) ??
        toNumber(payment?.totalFare) ??
        toNumber(ride?.actualFare) ??
        toNumber(ride?.estimatedFare) ??
        null;

    if (amount === null) {
        return null;
    }

    const commission =
        toNumber(payment?.fees) ??
        toNumber(payment?.commission) ??
        toNumber(fareBreakdown?.commission) ??
        null;

    const driverEarnings =
        toNumber(payment?.driverEarnings) ??
        toNumber(fareBreakdown?.driverShare) ??
        (commission !== null ? amount - commission : amount);

    return {
        amount,
        driverEarnings,
        commission,
        method: payment?.paymentMethod || ride?.paymentMethod || null,
    };
};

const normaliseZonePolygons = (rawBoundaries) => {
    if (!rawBoundaries) {
        return [];
    }

    let boundaries = rawBoundaries;
    if (typeof boundaries === 'string') {
        try {
            boundaries = JSON.parse(boundaries);
        } catch (error) {
            return [];
        }
    }

    if (!boundaries) {
        return [];
    }

    const rawPolygons = [];
    const pushPolygon = (coords) => {
        if (!Array.isArray(coords) || coords.length < 3) {
            return;
        }
        rawPolygons.push(coords);
    };

    if (boundaries.type === 'Polygon' && Array.isArray(boundaries.coordinates)) {
        pushPolygon(boundaries.coordinates[0]);
    } else if (boundaries.type === 'MultiPolygon' && Array.isArray(boundaries.coordinates)) {
        boundaries.coordinates.forEach((poly) => pushPolygon(poly?.[0]));
    } else if (Array.isArray(boundaries.coordinates)) {
        pushPolygon(boundaries.coordinates);
    } else if (Array.isArray(boundaries)) {
        pushPolygon(boundaries);
    } else if (boundaries.coordinates && Array.isArray(boundaries.coordinates)) {
        pushPolygon(boundaries.coordinates);
    }

    const normalizePoint = (coord) => {
        if (!coord) {
            return null;
        }

        if (Array.isArray(coord)) {
            const [lng, lat] = coord;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
            return null;
        }

        if (typeof coord === 'object') {
            const lat = toNumber(
                coord.lat ??
                    coord.latitude ??
                    (Array.isArray(coord.coordinates) ? coord.coordinates[1] : undefined)
            );
            const lng = toNumber(
                coord.lng ??
                    coord.longitude ??
                    (Array.isArray(coord.coordinates) ? coord.coordinates[0] : undefined)
            );

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        return null;
    };

    return rawPolygons
        .map((polygon) =>
            polygon
                .map(normalizePoint)
                .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
        )
        .filter((polygon) => polygon.length >= 3);
};

const RIDE_STATUS_ALLOWLIST = new Set([
    'REQUESTED',
    'PENDING',
    'ACCEPTED',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVED',
    'ARRIVED',
    'PICKED_UP',
    'IN_PROGRESS',
    'STARTED',
    'COMPLETED',
    'CANCELLED',
]);

/**
 * GET /api/mobile/driver/jobs/history
 * Get driver's completed jobs (from Job table)
 */
router.get('/history', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const {
        limit = 20,
        page = 1,
        status = 'COMPLETED',
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    const statusFilterValues = String(status || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.replace(/-/g, '_').toUpperCase());
    const statusFilter = statusFilterValues.length ? { in: statusFilterValues } : undefined;
    const historyWhereClause = {
        assignedDriverId: driverId,
        ...(statusFilter ? { status: statusFilter } : {}),
    };

    try {
        logger.info(`📋 [Job History] Request from driver ${driverId}, page ${parsedPage}, limit ${parsedLimit}`);

        // Query completed jobs with safe error handling
        const [jobs, totalCount] = await Promise.all([
            prisma.job.findMany({
                where: historyWhereClause,
                orderBy: [
                    { completedAt: 'desc' },
                    { updatedAt: 'desc' },
                    { createdAt: 'desc' },
                ],
                skip,
                take: parsedLimit,
                include: {
                    users_jobs_customerIdTousers: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                        },
                    },
                    rides: {
                        select: {
                            id: true,
                            actualDistance: true,
                            actualDuration: true,
                            actualFare: true,
                            completedAt: true,
                            payments: {
                                where: {
                                    status: {
                                        in: ['COMPLETED', 'PAID'],
                                    },
                                },
                                select: {
                                    amount: true,
                                    driverEarnings: true,
                                    paymentMethod: true,
                                    status: true,
                                },
                                orderBy: { createdAt: 'desc' },
                                take: 1,
                            },
                        },
                    },
                },
            }).catch(err => {
                logger.error('❌ [Job History] Query error:', err);
                throw new Error('Failed to fetch job history from database');
            }),
            
            prisma.job.count({
                where: historyWhereClause,
            }).catch(err => {
                logger.error('❌ [Job History] Count error:', err);
                return 0; // Return 0 if count fails
            })
        ]);

        logger.info(`✅ [Job History] Found ${jobs?.length || 0} jobs, total count: ${totalCount}`);

        const toNumberSafe = (value, fallback = 0) =>
            value === null || value === undefined ? fallback : Number(value);
        const toOptionalNumber = (value) => {
            if (value === null || value === undefined || value === '') {
                return null;
            }
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        };

        const summaries = (jobs || []).map((job) => {
            try {
                const customer = job.users_jobs_customerIdTousers;
                const ride = job.rides;
                const requirementPayload = parseJson(job.requirements);
                const rideMetrics = requirementPayload?.rideMetrics || {};
                const statusTimeline = requirementPayload?.statusTimeline || null;
                const payment = ride?.payments?.[0] || null;
                const completionDate = ride?.completedAt ?? job.updatedAt;
                const jobFinalAmount = toNumberSafe(job.finalAmount);
                const paymentAmount = toNumberSafe(payment?.amount);
                const paymentDriverEarnings = toNumberSafe(payment?.driverEarnings);
                const actualFare = toNumberSafe(
                    job.actualFare ?? ride?.actualFare ?? job.estimatedPrice,
                );
                const collectedAmount =
                    jobFinalAmount ??
                    paymentDriverEarnings ??
                    paymentAmount ??
                    actualFare ??
                    0;

                const passenger = customer
                    ? {
                        id: customer.id,
                        name:
                            `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                            customer.email ||
                            customer.phone ||
                            'Customer',
                        phone: customer.phone || null,
                        rating: null,
                    }
                    : null;

                const paymentSummary =
                    collectedAmount
                        ? {
                              amount: collectedAmount,
                              driverEarnings: collectedAmount,
                              commission: null,
                              method: job.paymentMethod ?? payment?.paymentMethod ?? 'UNKNOWN',
                          }
                        : null;
                
                let rawDistance =
                    toOptionalNumber(job.actualDistanceKm) ??
                    toOptionalNumber(ride?.actualDistance ?? job.estimatedDistance) ??
                    toOptionalNumber(rideMetrics.totalDistanceKm);
                if (
                    (rawDistance === null || rawDistance === undefined) &&
                    rideMetrics.totalDistanceMeters !== undefined
                ) {
                    const metersValue = toOptionalNumber(rideMetrics.totalDistanceMeters);
                    if (metersValue !== null && metersValue !== undefined) {
                        rawDistance = metersValue / 1000;
                    }
                }

                let durationSeconds = toOptionalNumber(job.actualDurationSeconds);
                if (durationSeconds === null || durationSeconds === undefined) {
                    const rawDurationMinutes = toOptionalNumber(
                        ride?.actualDuration ?? job.estimatedDuration
                    );
                    durationSeconds =
                        rawDurationMinutes !== null && rawDurationMinutes !== undefined
                            ? Math.max(Math.round(rawDurationMinutes * 60), 0)
                            : null;
                }

                if (durationSeconds === null || durationSeconds === undefined) {
                    const fallbackSeconds = toOptionalNumber(rideMetrics.totalDurationSeconds);
                    if (fallbackSeconds !== null && fallbackSeconds !== undefined) {
                        durationSeconds = Math.max(Math.round(fallbackSeconds), 0);
                    }
                }

                return {
                    id: job.id,
                    jobId: job.jobId,
                    status: job.status,
                    completedAt: completionDate ? new Date(completionDate).toISOString() : null,
                    pickup: {
                        address: job.pickupAddress || 'Unknown',
                        latitude: job.pickupLatitude,
                        longitude: job.pickupLongitude,
                    },
                    dropoff: {
                        address: job.dropoffAddress || 'Unknown',
                        latitude: job.dropoffLatitude,
                        longitude: job.dropoffLongitude,
                    },
                    distance:
                        rawDistance !== null && rawDistance !== undefined
                            ? Number(rawDistance.toFixed(2))
                            : null,
                    duration: durationSeconds,
                    fare: {
                        estimated: toNumberSafe(job.estimatedPrice),
                        actual: actualFare,
                        driverEarnings: collectedAmount,
                    },
                    paymentMethod: job.paymentMethod ?? payment?.paymentMethod ?? 'UNKNOWN',
                    customer: customer ? {
                        id: customer.id,
                        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || 'Customer',
                        phone: customer.phone || null,
                    } : null,
                    passenger,
                    payment: paymentSummary,
                    createdAt: job.createdAt ? job.createdAt.toISOString() : completionDate ? new Date(completionDate).toISOString() : null,
                    pickupAddress: job.pickupAddress,
                    pickupLatitude: job.pickupLatitude,
                    pickupLongitude: job.pickupLongitude,
                    dropoffAddress: job.dropoffAddress,
                    dropoffLatitude: job.dropoffLatitude,
                    dropoffLongitude: job.dropoffLongitude,
                    statusTimeline,
                };
            } catch (mapError) {
                logger.error(`❌ [Job History] Error mapping job ${job?.id}:`, mapError);
                return null;
            }
        }).filter(Boolean); // Remove any null entries

        const sortedSummaries = summaries.sort((a, b) => {
            const aTime = new Date(a.completedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.completedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
        });

        res.json({
            success: true,
            data: sortedSummaries,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / parsedLimit),
                hasMore: (parsedPage * parsedLimit) < totalCount,
            },
        });
    } catch (error) {
        logger.error('❌ [Job History] Fatal error:', error);
        logger.error('   Driver ID:', driverId);
        logger.error('   Error details:', error.message);
        logger.error('   Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Unable to load job history. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                type: error.constructor.name
            } : undefined,
        });
    }
});

router.get('/recent', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const { limit = 3 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 3, 1), 10);

    try {
        const jobs = await prisma.job.findMany({
            where: {
                assignedDriverId: driverId,
                status: { in: RECENT_JOB_STATUS_FILTER },
                completedAt: { not: null },
            },
            orderBy: [
                { completedAt: { sort: 'desc', nulls: 'last' } },
                { updatedAt: 'desc' },
                { createdAt: 'desc' },
            ],
            take: parsedLimit,
            include: {
                users_jobs_customerIdTousers: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                    },
                },
                rides: {
                    select: {
                        id: true,
                        actualDistance: true,
                        actualDuration: true,
                        actualFare: true,
                        completedAt: true,
                    },
                },
                payments: {
                    where: {
                        status: {
                            in: ['COMPLETED', 'PAID'],
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        const summaries = jobs.map(mapJobToRecentSummary);

        res.json({
            success: true,
            data: summaries,
        });
    } catch (error) {
        logger.error('❌ [Driver Recent Jobs] Fatal error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load recent jobs. Please try again later.',
        });
    }
});

/**
 * GET /api/mobile/driver/jobs/rides/history
 * Get driver's ride history (from Ride table)
 * Kept for backward compatibility
 */
router.get('/rides/history', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const {
        limit = 10,
        status,
        includeEarnings = 'true',
        before,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    let statusFilter = undefined;
    if (status) {
        const statuses = String(status)
            .split(',')
            .map((value) => value.trim().toUpperCase())
            .filter((value) => RIDE_STATUS_ALLOWLIST.has(value));

        if (statuses.length) {
            statusFilter = { in: Array.from(new Set(statuses)) };
        }
    }

    let beforeCursor = undefined;
    if (before) {
        const cursorDate = new Date(before);
        if (!Number.isNaN(cursorDate.getTime())) {
            beforeCursor = cursorDate;
        }
    }

    try {
        const rides = await prisma.ride.findMany({
            where: {
                driverId,
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(beforeCursor
                    ? {
                          createdAt: {
                              lt: beforeCursor,
                          },
                      }
                    : {}),
            },
            orderBy: [
                { completedAt: 'desc' },
                { updatedAt: 'desc' },
                { createdAt: 'desc' },
            ],
            take: parsedLimit,
            include: {
                passenger: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        rating: true,
                    },
                },
                Payment: {
                    where: {
                        status: {
                            in: ['COMPLETED', 'PAID'],
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        const summaries = rides.map((ride) => {
            const pickup = buildLocationSummary(ride.pickup);
            const destination = buildLocationSummary(ride.destination);
            const paymentRecord = ride.Payment?.[0] || null;
            const paymentSummary =
                includeEarnings === 'false'
                    ? null
                    : buildPaymentSummary(ride, paymentRecord);
            const rideRequirements = parseJson(ride.requirements);

            return {
                id: ride.id,
                status: ride.status,
                createdAt: (ride.completedAt || ride.updatedAt || ride.createdAt)?.toISOString?.() ||
                    new Date(ride.createdAt).toISOString(),
                pickupAddress: pickup.address,
                pickupLatitude: pickup.latitude,
                pickupLongitude: pickup.longitude,
                dropoffAddress: destination.address,
                dropoffLatitude: destination.latitude,
                dropoffLongitude: destination.longitude,
                distance:
                    toNumber(ride.actualDistance) ??
                    toNumber(ride.estimatedDistance) ??
                    null,
                actualFare: toNumber(ride.actualFare),
                estimatedFare: toNumber(ride.estimatedFare),
                notes:
                    rideRequirements.notes ??
                    rideRequirements.specialInstructions ??
                    rideRequirements.comments ??
                    null,
                passenger: buildPassengerSummary(ride.passenger),
                payment: paymentSummary,
            };
        });

        res.json({
            success: true,
            data: summaries,
            pagination: {
                limit: parsedLimit,
                nextBefore:
                    summaries.length === parsedLimit
                        ? summaries[parsedLimit - 1].createdAt
                        : null,
            },
        });
    } catch (error) {
        logger.error('Failed to fetch driver job history:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load ride history',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined,
        });
    }
});

// ✅ Real-time endpoint for upcoming jobs (cache disabled to prevent stale assignments)
router.get('/upcoming', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    try {
        logger.info(`📡 [/upcoming] Request from driver ${driverId}`);
        
        // ✅ OPTIMIZATION: Get driver data from auth token to avoid extra DB query
        const driver = req.user;
        const companyId =
            driver.companyId ||
            driver.company?.id ||
            req.user?.companies_users_companyIdTocompanies?.id ||
            null;

        if (!companyId) {
            logger.warn(`❌ [/upcoming] Unable to resolve company for driver ${driverId}`);
            return res.json({ success: true, data: [] });
        }
        
        // Get zone from query (mobile app should pass this)
        const zoneHint = req.query.zoneId ? String(req.query.zoneId) : null;
        
        // ✅ OPTIMIZATION: If no zone hint, use driver's last known zone from preferences (already in memory)
        let currentZoneId = zoneHint || req.user?.preferences?.dispatch?.currentZone?.id || null;
        let currentZoneName = req.user?.preferences?.dispatch?.currentZone?.name || null;

        // ✅ OPTIMIZATION: Only fetch location if we don't have a zone ID
        if (!currentZoneId) {
            const lastLocation = await prisma.locationUpdate.findFirst({
                where: { driverId },
                orderBy: { timestamp: 'desc' },
                take: 1,
            });

            if (lastLocation?.latitude && lastLocation?.longitude) {
                const detectedZone = await detectZone(
                    Number(lastLocation.latitude),
                    Number(lastLocation.longitude),
                    companyId
                );
                if (detectedZone) {
                    currentZoneId = detectedZone.id;
                    currentZoneName = detectedZone.name || null;
                }
            }
        }

        if (!currentZoneId) {
            logger.info(`📡 [/upcoming] No zone for driver ${driverId}, returning empty`);
            return res.json({ success: true, data: [] });
        }

        // ✅ OPTIMIZATION: Get zone boundaries from cache (zoneCacheService)
        const zoneRecord = await prisma.zones.findUnique({
            where: { id: currentZoneId },
            select: { id: true, name: true, boundaries: true },
        });

        if (!zoneRecord) {
            logger.info(`📡 [/upcoming] Zone ${currentZoneId} not found`);
            return res.json({ success: true, data: [] });
        }

        const zonePolygons = normaliseZonePolygons(zoneRecord.boundaries);

        if (zonePolygons.length === 0) {
            logger.info(`📡 [/upcoming] Zone ${currentZoneId} has no polygons`);
            return res.json({ success: true, data: [] });
        }

        if (!currentZoneName) {
            currentZoneName = zoneRecord.name || null;
        }

        const now = new Date();
        const soon = new Date(now.getTime() + 10 * 60 * 1000);

        const candidates = await prisma.job.findMany({
            where: {
                companyId,
                status: { in: ['UNASSIGNED', 'PENDING'] },
                assignedDriverId: null,
                pickupLatitude: { not: null },
                pickupLongitude: { not: null },
                OR: [{ scheduledAt: null }, { scheduledAt: { lte: soon } }],
            },
            include: {
                users_jobs_customerIdTousers: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                    },
                },
            },
            orderBy: [
                { scheduledAt: 'asc' },
                { createdAt: 'asc' },
            ],
            take: 50,
        });

        const filtered = [];
        const normalizedPolygons = zonePolygons.filter((polygon) => polygon.length >= 3);

        for (const job of candidates) {
            const lat = Number(job.pickupLatitude);
            const lng = Number(job.pickupLongitude);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                continue;
            }

            if (!normalizedPolygons.length) {
                continue;
            }

            const matchesZone = normalizedPolygons.some((polygon) =>
                pointInPolygon({ lat, lng }, polygon)
            );

            if (!matchesZone) {
                continue;
            }

            const scheduledAt = job.scheduledAt ? new Date(job.scheduledAt) : null;
            const isLate = scheduledAt ? scheduledAt < now : false;
            const minutesToPickup = scheduledAt
                ? Math.round((scheduledAt.getTime() - now.getTime()) / 60000)
                : 0;
            const jobCustomer = job.users_jobs_customerIdTousers;

            filtered.push({
                id: job.id,
                jobId: job.jobId,
                status: job.status,
                pickup: {
                    address: job.pickupAddress,
                    latitude: job.pickupLatitude,
                    longitude: job.pickupLongitude,
                },
                dropoff: {
                    address: job.dropoffAddress,
                    latitude: job.dropoffLatitude,
                    longitude: job.dropoffLongitude,
                },
                scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
                estimatedFare: job.estimatedPrice,
                estimatedDistance: job.estimatedDistance,
                estimatedDuration: job.estimatedDuration,
                isLate,
                minutesToPickup,
                customer: jobCustomer
                    ? {
                          id: jobCustomer.id,
                          firstName: jobCustomer.firstName,
                          lastName: jobCustomer.lastName,
                          phone: jobCustomer.phone,
                      }
                    : null,
                zone: { id: zoneRecord.id, name: zoneRecord.name || currentZoneName },
            });
        }

        res.json({
            success: true,
            data: filtered.slice(0, 10),
        });
    } catch (error) {
        logger.error('Failed to fetch upcoming jobs for driver:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load upcoming jobs',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined,
        });
    }
});

router.post('/:jobId/claim', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const { jobId } = req.params;

    logger.info('🚀 [CLAIM JOB ROUTE] Request received', { jobId, driverId, userId: req.user?.id });

    if (!driverId) {
        logger.error('❌ [CLAIM JOB ROUTE] No driver ID found');
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    try {
        logger.info('🚀 [CLAIM JOB ROUTE] Calling jobService.claimJob');
        const result = await jobService.claimJob(jobId, driverId, req.io);
        logger.info('✅ [CLAIM JOB ROUTE] Success, sending response', { hasResult: !!result });
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('❌ [CLAIM JOB ROUTE] Error caught:', {
            message: error?.message,
            stack: error?.stack,
            name: error?.name
        });
        res.status(400).json({
            success: false,
            message: error?.message || 'Unable to claim job',
        });
    }
});

/**
 * POST /api/mobile/driver/jobs/payment
 * Collect payment for a completed job
 */
router.post('/payment', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const { 
        jobId, 
        amount, 
        paymentMethod, 
        customerId, 
        status, 
        collectedAt,
        baseFare = 0,
        extraAmount = 0,
        discountAmount = 0,
        totalMobility = false,
        adjustmentReason = '',
        breakdown = null,
        pauseRecords = null,
        dropoffLocation = null,
    } = req.body;

    logger.info('💰 [PAYMENT COLLECTION] Request received', { 
        jobId, 
        driverId, 
        amount, 
        paymentMethod,
        customerId 
    });

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const normalizedMethod = String(paymentMethod || '').trim().toUpperCase();
    const amountValue = toFiniteNumber(amount);

    if (!jobId || !amountValue || amountValue <= 0 || !normalizedMethod) {
        return res.status(400).json({
            success: false,
            message: 'Missing required payment information',
        });
    }

    const numericBaseFare = toFiniteNumber(baseFare, 0) || 0;
    const numericExtra = toFiniteNumber(extraAmount, 0) || 0;
    const numericDiscount = toFiniteNumber(discountAmount, 0) || 0;
    const breakdownInfo = sanitizeBreakdownPayload(breakdown);
    const dropoffLocationPayload = sanitizeLocationPayload(dropoffLocation);
    const pauseRecordsArray =
        Array.isArray(pauseRecords) && pauseRecords.length ? pauseRecords : null;
    const completedDate = collectedAt ? new Date(collectedAt) : new Date();
    const metricDistanceKm = toFiniteNumber(breakdownInfo.metrics.totalDistanceKm);
    const metricDurationSeconds = toFiniteNumber(
        breakdownInfo.metrics.totalDurationSeconds,
    );
    const metricDurationMinutes =
        toFiniteNumber(breakdownInfo.metrics.totalDurationMinutes) ??
        (Number.isFinite(metricDurationSeconds)
            ? Math.max(Math.round(metricDurationSeconds / 60), 1)
            : null);

    logger.info('🧮 [PAYMENT COLLECTION] Meter payload summary', {
        jobId,
        distanceKm: metricDistanceKm,
        durationSeconds: metricDurationSeconds,
        hasDropoffLocation: Boolean(dropoffLocationPayload),
    });

    try {
        // Verify job exists and belongs to this driver
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: {
                rides: {
                    select: {
                        id: true,
                        actualFare: true,
                        payments: {
                            where: {
                                status: {
                                    in: ['COMPLETED', 'PAID'],
                                },
                            },
                            select: {
                                amount: true,
                                driverEarnings: true,
                                paymentMethod: true,
                                status: true,
                                createdAt: true,
                            },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
                companies: {
                    select: {
                        commissionRate: true,
                    },
                },
            },
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found',
            });
        }

        // More flexible driver assignment check
        // Allow payment collection if:
        // 1. Job is assigned to this driver (assignedDriverId matches)
        // 2. Job status is COMPLETED or FINISHED (completed by this driver)
        // 3. Job has no assignedDriverId but status is COMPLETED (walk-in jobs)
        const isAssignedDriver = job.assignedDriverId === driverId;
        const isCompletedStatus = ['COMPLETED', 'FINISHED'].includes(job.status);
        const isWalkInCompleted = !job.assignedDriverId && isCompletedStatus;

        if (!isAssignedDriver && !isWalkInCompleted) {
            logger.warn('⚠️ [PAYMENT COLLECTION] Driver assignment mismatch', {
                jobId,
                requestedDriverId: driverId,
                assignedDriverId: job.assignedDriverId,
                jobStatus: job.status,
            });
            
            return res.status(403).json({
                success: false,
                message: 'This job is not assigned to you. Please check if you have the correct job selected.',
                details: {
                    jobId,
                    jobStatus: job.status,
                    assigned: job.assignedDriverId ? 'different driver' : 'unassigned',
                },
            });
        }

        logger.info('✅ [PAYMENT COLLECTION] Driver validation passed', {
            jobId,
            driverId,
            assignedDriverId: job.assignedDriverId,
            jobStatus: job.status,
        });

        // Get current shift for driver
        const currentShift = await prisma.shift.findFirst({
            where: {
                driverId,
                status: { in: ['ONLINE', 'BUSY', 'BREAK'] },
                endTime: null,
            },
            orderBy: { startTime: 'desc' },
        });

        // Calculate commission (e.g., 20% for company)
        const rawCommissionRate = job.companies?.commissionRate;
        const commissionRate =
            rawCommissionRate === undefined || rawCommissionRate === null
                ? 0.2
                : rawCommissionRate > 1
                ? rawCommissionRate / 100
                : rawCommissionRate;
        const companyCommission = Number((amountValue * commissionRate).toFixed(2));
        const driverEarnings = Math.max(Number((amountValue - companyCommission).toFixed(2)), 0);

        // Create payment record
        const payment = await prisma.payments.create({
            data: {
                id: randomUUID(),
                jobId,
                tripId: job.tripId,
                customerId: customerId || job.customerId,
                driverId,
                companyId: job.companyId,
                amount: amountValue,
                currency: 'NZD',
                paymentMethod: normalizedMethod,
                status: status || 'COMPLETED',
                paidAt: completedDate,
                createdAt: new Date(),
                updatedAt: new Date(),
                fees: companyCommission,
                driverEarnings,
                metadata: breakdownInfo.raw || undefined,
            },
        });

        const requirementPayload = mergeRequirementPayload(job.requirements, {
            rideMetrics: Object.keys(breakdownInfo.metrics || {}).length
                ? {
                      ...breakdownInfo.metrics,
                      pricing: breakdownInfo.pricing || undefined,
                  }
                : breakdownInfo.pricing
                ? { pricing: breakdownInfo.pricing }
                : {},
            pauseRecords: pauseRecordsArray,
            statusTimeline: {
                COMPLETED: completedDate.toISOString(),
                FINISHED: completedDate.toISOString(),
            },
        });

        const jobUpdateData = {
            actualFare: amountValue,
            finalAmount: amountValue,
            paymentMethod: normalizedMethod,
            completedAt: completedDate,
            actualDistanceKm: Number.isFinite(metricDistanceKm) ? metricDistanceKm : undefined,
            actualDurationSeconds: Number.isFinite(metricDurationSeconds)
                ? Math.max(Math.round(metricDurationSeconds), 0)
                : undefined,
        };

        if (dropoffLocationPayload) {
            jobUpdateData.dropoffLatitude = dropoffLocationPayload.latitude;
            jobUpdateData.dropoffLongitude = dropoffLocationPayload.longitude;
            if (dropoffLocationPayload.address) {
                jobUpdateData.dropoffAddress = dropoffLocationPayload.address;
            }
        }

        if (requirementPayload) {
            jobUpdateData.requirements = requirementPayload;
        }

        await prisma.job.update({
            where: { id: jobId },
            data: jobUpdateData,
        });

        // If there's a trip record, update it too
        if (job.tripId) {
            const fareBreakdownPayload =
                breakdownInfo.raw ||
                (breakdownInfo.pricing || Object.keys(breakdownInfo.metrics || {}).length
                    ? {
                          pricing: breakdownInfo.pricing,
                          metrics: breakdownInfo.metrics,
                      }
                    : null);

            const destinationPayload = dropoffLocationPayload
                ? {
                      address:
                          dropoffLocationPayload.address ||
                          job.dropoffAddress ||
                          'Recorded dropoff',
                      latitude: dropoffLocationPayload.latitude,
                      longitude: dropoffLocationPayload.longitude,
                      recordedAt: dropoffLocationPayload.timestamp,
                  }
                : null;

            await prisma.rides.update({
                where: { id: job.tripId },
                data: {
                    actualFare: amountValue,
                    paymentMethod: normalizedMethod,
                    paymentStatus: 'PAID',
                    completedAt: completedDate,
                    actualDistance: Number.isFinite(metricDistanceKm) ? metricDistanceKm : undefined,
                    actualDuration: Number.isFinite(metricDurationMinutes)
                        ? metricDurationMinutes
                        : undefined,
                    fareBreakdown: fareBreakdownPayload || undefined,
                    ...(destinationPayload
                        ? {
                              destination: {
                                  address: destinationPayload.address,
                                  latitude: destinationPayload.latitude,
                                  longitude: destinationPayload.longitude,
                                  recordedAt: destinationPayload.recordedAt,
                              },
                          }
                        : {}),
                },
            });
        }

        // ✅ NEW: Record earnings with detailed breakdown
        const earningsService = req.earningsService;
        
        if (earningsService) {
            try {
                await earningsService.recordEarning({
                    driverId,
                    companyId: job.companyId,
                    jobId,
                    paymentId: payment.id,
                    shiftId: currentShift?.id,
                    amount: amountValue,
                    currency: 'NZD',
                    paymentMethod: normalizedMethod,
                    earnedAt: completedDate,
                    baseFare: numericBaseFare,
                    distanceFare: breakdownInfo.pricing?.distanceCost || 0,
                    timeFare: breakdownInfo.pricing?.durationCost || 0,
                    waitingFare: breakdownInfo.pricing?.waitingCost || 0,
                    extraAmount: numericExtra,
                    discountAmount: numericDiscount,
                    totalAmount: amountValue,
                    companyCommission,
                    driverEarnings,
                    commissionRate: companyCommissionRate,
                    totalMobility,
                    adjustmentReason: adjustmentReason || null,
                    isAdjustment: !!adjustmentReason,
                    tripDistance:
                        breakdownInfo.metrics.totalDistanceKm ?? job.estimatedDistance,
                    tripDuration:
                        breakdownInfo.metrics.totalDurationMinutes ??
                        (job.estimatedDuration ?? null),
                    pickupAddress: job.pickupAddress,
                    dropoffAddress: job.dropoffAddress,
                    customerName: null, // Could fetch from customer if needed
                    metadata: {
                        breakdown: breakdownInfo.raw,
                        pauseRecords,
                    },
                });
            } catch (earningsError) {
                logger.error('⚠️ [PAYMENT COLLECTION] Failed to record earnings (non-critical):', earningsError);
                // Don't fail the payment if earnings recording fails
            }
        } else {
            logger.warn('⚠️ [PAYMENT COLLECTION] EarningsService not available on request');
        }

        logger.info('✅ [PAYMENT COLLECTION] Payment recorded successfully', {
            paymentId: payment.id,
            amount: amountValue,
            driverEarnings,
            companyCommission,
        });

        logger.info('🧾 [PAYMENT COLLECTION] Persisted completion metrics', {
            jobId,
            actualDistanceKm: jobUpdateData.actualDistanceKm ?? metricDistanceKm ?? null,
            actualDurationSeconds:
                jobUpdateData.actualDurationSeconds ??
                (Number.isFinite(metricDurationSeconds) ? metricDurationSeconds : null),
            dropoffLocation: dropoffLocationPayload || null,
        });

        // ✅ FIX: Clear driver's currentJobId and update status to AVAILABLE after payment
        try {
            // Update user's currentJobId to NULL (job is completed)
            await prisma.user.update({
                where: { id: driverId },
                data: {
                    currentJobId: null,
                },
            });

            // Update driver preferences to set status back to AVAILABLE
            const driverPrefs = await prisma.driver_preferences.findUnique({
                where: { driverId },
            });

            if (driverPrefs) {
                const updatedPreferences = {
                    ...(typeof driverPrefs.preferences === 'object' ? driverPrefs.preferences : {}),
                    driverStatus: 'AVAILABLE',
                };

                await prisma.driver_preferences.update({
                    where: { driverId },
                    data: {
                        preferences: updatedPreferences,
                    },
                });
            }

            // ✅ Emit socket event to dispatch to update driver status in real-time
            if (req.io) {
                const dispatchNamespace = req.io.of('/dispatch');
                const driverStatusPayload = {
                    driverId,
                    companyId: job.companyId,
                    status: 'AVAILABLE',
                    currentJobId: null,
                    timestamp: new Date().toISOString(),
                };

                dispatchNamespace.to(`dispatch_${job.companyId}`).emit('driver:status:updated', driverStatusPayload);
                dispatchNamespace.to(`company_${job.companyId}`).emit('driver:status:updated', driverStatusPayload);
                dispatchNamespace.to('super_admin').emit('driver:status:updated', driverStatusPayload);

                logger.info('📡 [PAYMENT COLLECTION] Driver status updated to AVAILABLE', {
                    driverId,
                    jobId,
                    currentJobId: null,
                });
            }
        } catch (statusUpdateError) {
            logger.error('⚠️ [PAYMENT COLLECTION] Failed to update driver status (non-critical):', statusUpdateError);
            // Don't fail the payment if status update fails
        }

        res.json({
            success: true,
            data: {
                paymentId: payment.id,
                amount: amountValue,
                driverEarnings,
                companyCommission,
                paymentMethod: normalizedMethod,
                status: payment.status,
                rideMetrics: breakdownInfo.metrics || undefined,
            },
            message: 'Payment recorded successfully',
        });
    } catch (error) {
        logger.error('❌ [PAYMENT COLLECTION] Error:', {
            message: error?.message,
            stack: error?.stack,
        });
        res.status(500).json({
            success: false,
            message: error?.message || 'Failed to record payment',
        });
    }
});
/**
 * ✅ NEW: Create a walk-in job (street hail)
 * Driver creates a job when a customer gets in the car without dispatch
 */
router.post('/walk-in/create', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const body = req.body || {};
    
    if (!driverId) {
        return res.status(400).json({ error: 'Driver ID required' });
    }

    try {
        logger.info(`🚶 Creating walk-in job (NOW job) for driver ${driverId}`);
        
        // Get driver details
        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            include: {
                companies_users_companyIdTocompanies: true,
                shifts: {
                    where: {
                        status: { in: ['ONLINE', 'OFFLINE', 'BUSY', 'BREAK'] }, // ✅ FIX: Valid ShiftStatus enum values
                    },
                    orderBy: {
                        startTime: 'desc',
                    },
                    take: 1,
                },
                driver_preferences: true,
            },
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const driverCompany = driver.companies_users_companyIdTocompanies;

        if (!driverCompany) {
            return res.status(400).json({ error: 'Driver not linked to a company' });
        }

        const currentShift = driver.shifts?.[0];
        if (!currentShift) {
            return res.status(400).json({ error: 'No active shift found. Please start your shift first.' });
        }
        
        // ✅ FIX: Get vehicle and tariff from DriverPreferences table (not JSON preferences)
        const driverPrefs = driver.driver_preferences;
        
        // ✅ CRITICAL FIX: Vehicle and tariff come from DriverPreferences, but may not exist yet
        // For walk-in jobs, we can proceed without them (will be null in ride record)
        const selectedVehicleId = driverPrefs?.selectedVehicleId || null;
        const selectedTariffId = driverPrefs?.selectedTariffId || null;
        
        logger.info(`📝 Walk-in job details: vehicleId=${selectedVehicleId}, tariffId=${selectedTariffId}, hasPrefs=${!!driverPrefs}`);

        // ✅ FIX: Get driver's current location from LocationUpdate table (real-time GPS data)
        let lastLocation = await prisma.locationUpdate.findFirst({
            where: { driverId: driverId },
            orderBy: { timestamp: 'desc' }
        });

        let pickupAddress = 'Current Location'; // Default address
        const jsonPrefs = driver.preferences || {}; // ✅ FIX: Define at correct scope

        if (!lastLocation || !lastLocation.latitude || !lastLocation.longitude) {
            logger.info(`⚠️ No location found for driver ${driverId} - checking JSON preferences fallback`);
            
            // Fallback to JSON preferences if LocationUpdate not available
            const currentLocation = jsonPrefs.lastLocation || jsonPrefs.currentLocation || {};
            const fallbackLatitude = currentLocation.latitude || currentLocation.lat;
            const fallbackLongitude = currentLocation.longitude || currentLocation.lng;
            
            if (!fallbackLatitude || !fallbackLongitude) {
                return res.status(400).json({ error: 'Cannot determine your current location. Please enable GPS and try again.' });
            }
            
            // Use fallback location
            lastLocation = {
                latitude: fallbackLatitude,
                longitude: fallbackLongitude
            };
            
            // Try to get address from JSON prefs if available
            pickupAddress = currentLocation.address || 'Current Location';
        }
        
        const pickupLatitude = lastLocation.latitude;
        const pickupLongitude = lastLocation.longitude;
        
        logger.info(`📍 Using location: lat=${pickupLatitude}, lng=${pickupLongitude}, address=${pickupAddress}`);

        const rawDropoffPayload =
            body.dropoff ||
            body.dropoffLocation ||
            body.destination ||
            null;
        const sanitizedDropoff = sanitizeLocationPayload(rawDropoffPayload);
        const dropoffSummary = sanitizedDropoff
            ? {
                  address:
                      (sanitizedDropoff.address &&
                          sanitizedDropoff.address.trim()) ||
                      rawDropoffPayload?.address ||
                      rawDropoffPayload?.label ||
                      "Pinned drop-off",
                  latitude: sanitizedDropoff.latitude,
                  longitude: sanitizedDropoff.longitude,
              }
            : {
                  address: 'Destination - To be set',
                  latitude: null,
                  longitude: null,
              };
        const dropoffMetadata = sanitizedDropoff
            ? {
                  placeId:
                      rawDropoffPayload?.placeId ||
                      rawDropoffPayload?.id ||
                      null,
                  source:
                      rawDropoffPayload?.source ||
                      rawDropoffPayload?.origin ||
                      'manual',
              }
            : null;

        const now = new Date();
        const rideId = `WALKIN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const result = await prisma.$transaction(async (tx) => {
            const ride = await tx.rides.create({
                data: {
                    id: randomUUID(),
                    rideId,
                    passengerId: driverId,
                    driverId,
                    vehicleId: selectedVehicleId || null,
                    companyId: driverCompany.id,
                    rideType: 'TAXI',
                    status: 'IN_PROGRESS',
                    pickup: {
                        address: pickupAddress,
                        latitude: pickupLatitude,
                        longitude: pickupLongitude,
                    },
                    destination: dropoffSummary,
                    requestedAt: now,
                    acceptedAt: now,
                    pickedUpAt: now,
                    createdAt: now,
                    updatedAt: now,
                    estimatedFare: 0,
                    paymentMethod: 'CASH',
                    paymentStatus: 'PENDING',
                    requirements: {
                        isWalkIn: true,
                        createdBy: driverId,
                        createdAt: now.toISOString(),
                        statusTimeline: {
                            OFFERED: now.toISOString(),
                            ACCEPTED: now.toISOString(),
                            STARTED: now.toISOString(),
                        },
                    },
                    tariffId: selectedTariffId || null,
                },
            });

            const job = await tx.job.create({
                data: {
                    id: randomUUID(),
                    jobId: rideId,
                    companyId: driverCompany.id,
                    type: 'TAXI',
                    status: 'STARTED',
                    tripId: ride.id,
                    scheduledAt: null,
                    assignedDriverId: driverId,
                    customerId: driverId,
                    pickupAddress,
                    pickupLatitude,
                    pickupLongitude,
                    dropoffAddress: dropoffSummary.address,
                    dropoffLatitude: dropoffSummary.latitude,
                    dropoffLongitude: dropoffSummary.longitude,
                    estimatedPrice: 0,
                    paymentMethod: 'CASH',
                    requirements: {
                        isWalkIn: true,
                        createdBy: driverId,
                        createdAt: now.toISOString(),
                        statusTimeline: {
                            OFFERED: now.toISOString(),
                            ACCEPTED: now.toISOString(),
                            STARTED: now.toISOString(),
                        },
                        dropoffSelection: sanitizedDropoff
                            ? {
                                  address: dropoffSummary.address,
                                  latitude: dropoffSummary.latitude,
                                  longitude: dropoffSummary.longitude,
                                  placeId: dropoffMetadata?.placeId,
                                  source: dropoffMetadata?.source,
                              }
                            : undefined,
                    },
                    createdAt: now,
                    updatedAt: now,
                    startedAt: now,
                },
            });

            await tx.user.update({
                where: { id: driverId },
                data: {
                    preferences: {
                        ...jsonPrefs,
                        driverStatus: 'BUSY',
                        lastStatusChange: now.toISOString(),
                    },
                },
            });

            return { ride, job };
        });

        const { ride, job } = result;
        logger.info(`✅ Walk-in ride created: ${ride.id}, job: ${job.id}, type: NOW (scheduledAt: null)`);

        // Return the job with full details
        res.json({
            success: true,
            message: 'Walk-in job created and started',
            job: {
                id: job.id,
                jobId: job.jobId,
                rideId: ride.id,
                status: job.status,
                pickupLocation: {
                    address: job.pickupAddress,
                    latitude: job.pickupLatitude,
                    longitude: job.pickupLongitude,
                },
                dropoffLocation: {
                    address: job.dropoffAddress,
                    latitude: job.dropoffLatitude,
                    longitude: job.dropoffLongitude,
                },
                estimatedFare: job.estimatedPrice || 0,
                createdAt: job.createdAt,
                isWalkIn: true,
                driver: {
                    id: driver.id,
                    name: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
                },
                vehicleId: selectedVehicleId, // ✅ FIX: Just return the ID
                tariffId: selectedTariffId, // ✅ Include tariff ID
            },
        });

    } catch (error) {
        logger.error('❌ Error creating walk-in job:', error);
        res.status(500).json({
            error: 'Failed to create walk-in job',
            details: error.message,
        });
    }
});

/**
 * ✅ NEW: Get today's driver stats (earnings & job count)
 * Returns REAL completed jobs and actual earnings for today
 */
router.get('/stats/today', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    
    if (!driverId) {
        return res.status(400).json({ error: 'Driver ID required' });
    }

    try {
        logger.info(`📊 Fetching today's stats for driver: ${driverId}`);
        
        // Get today's start and end times in UTC
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        logger.info(`📊 Date range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

        // ✅ FIX: Query COMPLETED jobs using completedAt field
        const todaysJobs = await prisma.job.findMany({
            where: {
                assignedDriverId: driverId,
                status: 'COMPLETED',
                completedAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
            select: {
                id: true,
                status: true,
                finalAmount: true,
                actualFare: true,
                estimatedPrice: true,
                completedAt: true,
                rides: {
                    select: {
                        actualFare: true,
                        payments: {
                            where: {
                                status: {
                                    in: ['COMPLETED', 'PAID'],
                                },
                            },
                            select: {
                                driverEarnings: true,
                                amount: true,
                            },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                    },
                },
            },
        });

        logger.info(`📊 Found ${todaysJobs.length} completed jobs for today`);

        // ✅ Calculate earnings from passenger-facing totals (before commission)
        const totalJobs = todaysJobs.length;
        const totalEarnings = todaysJobs.reduce((sum, job) => {
            const ridePayment = job.rides?.payments?.[0];
            const passengerTotal =
                parseFloat(ridePayment?.amount ?? '') ||
                parseFloat(job.rides?.actualFare ?? '') ||
                parseFloat(job.actualFare ?? '') ||
                parseFloat(job.finalAmount ?? '') ||
                parseFloat(job.estimatedPrice ?? '') ||
                0;
            return sum + passengerTotal;
        }, 0);

        logger.info(`📊 Total jobs: ${totalJobs}, Total earnings: $${totalEarnings.toFixed(2)}`);

        res.json({
            success: true,
            stats: {
                todayJobs: totalJobs,
                todayEarnings: parseFloat(totalEarnings.toFixed(2)),
                date: todayStart.toISOString().split('T')[0],
            },
        });

    } catch (error) {
        logger.error('❌ Error fetching today stats:', error);
        logger.error('Stack:', error.stack);
        
        // ✅ Return empty stats instead of error to prevent app crash
        res.json({
            success: true,
            stats: {
                todayJobs: 0,
                todayEarnings: 0,
                date: new Date().toISOString().split('T')[0],
            },
            warning: 'Failed to fetch actual stats, showing defaults',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});


module.exports = router;
