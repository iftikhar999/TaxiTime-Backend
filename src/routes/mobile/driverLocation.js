const express = require('express');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();

const cloneJson = (value) => {
    if (!value || typeof value !== 'object') {
        return {};
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to clone JSON payload:', error?.message || error);
        return {};
    }
};

const coerceNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const coerceTimestamp = (value) => {
    if (!value) {
        return new Date();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const persistLastLocation = async (driverId, location) => {
    const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: { preferences: true },
    });

    if (!driver) {
        return;
    }

    const preferences = cloneJson(driver.preferences);
    preferences.lastLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        heading: location.heading ?? null,
        speed: location.speed ?? null,
        accuracy: location.accuracy ?? null,
        altitude: location.altitude ?? null,
        source: location.source ?? 'mobile_api',
        timestamp: location.timestamp.toISOString(),
    };

    try {
        await prisma.user.update({
            where: { id: driverId },
            data: { preferences },
        });
    } catch (error) {
        console.warn('Failed to persist driver last location:', error?.message || error);
    }
};

const getServices = (req) => ({
    tracking:
        req.trackingService ||
        req.app?.locals?.trackingService ||
        null,
    queue:
        req.queueManagementService ||
        req.app?.locals?.queueManagementService ||
        null,
});

router.post('/update', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const {
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
        altitude,
        timestamp,
        jobId = null,
        tripId = null,
    } = req.body || {};

    const latNumber = coerceNumber(latitude);
    const lngNumber = coerceNumber(longitude);

    if (latNumber === null || lngNumber === null) {
        return res.status(400).json({
            success: false,
            message: 'Latitude and longitude are required',
        });
    }

    const locationPayload = {
        latitude: latNumber,
        longitude: lngNumber,
        heading: coerceNumber(heading),
        speed: coerceNumber(speed),
        accuracy: coerceNumber(accuracy),
        altitude: coerceNumber(altitude),
        timestamp: coerceTimestamp(timestamp),
        jobId: jobId || null,
        tripId: tripId || null,
    };

    const { tracking, queue } = getServices(req);

    try {
        let storedLocation = null;

        if (tracking?.updateDriverLocation) {
            storedLocation = await tracking.updateDriverLocation(driverId, {
                latitude: locationPayload.latitude,
                longitude: locationPayload.longitude,
                heading: locationPayload.heading,
                speed: locationPayload.speed,
                accuracy: locationPayload.accuracy,
                timestamp: locationPayload.timestamp,
                jobId: locationPayload.jobId,
                tripId: locationPayload.tripId,
            });
        } else {
            storedLocation = await prisma.locationUpdate.create({
                data: {
                    driverId,
                    jobId: locationPayload.jobId,
                    tripId: locationPayload.tripId,
                    latitude: locationPayload.latitude,
                    longitude: locationPayload.longitude,
                    heading: locationPayload.heading,
                    speed: locationPayload.speed,
                    accuracy: locationPayload.accuracy,
                    timestamp: locationPayload.timestamp,
                },
            });
        }

        await persistLastLocation(driverId, {
            ...locationPayload,
            source: 'mobile_api',
        });

        let zoneDetails = null;
        if (queue?.updateDriverZoneMembership) {
            zoneDetails = await queue.updateDriverZoneMembership(
                driverId,
                locationPayload.latitude,
                locationPayload.longitude,
            );
        }

        return res.json({
            success: true,
            data: {
                location: {
                    id: storedLocation?.id || null,
                    latitude: locationPayload.latitude,
                    longitude: locationPayload.longitude,
                    heading: locationPayload.heading,
                    speed: locationPayload.speed,
                    accuracy: locationPayload.accuracy,
                    altitude: locationPayload.altitude ?? null,
                    recordedAt: storedLocation?.timestamp
                        ? new Date(storedLocation.timestamp).toISOString()
                        : locationPayload.timestamp.toISOString(),
                },
                zone: zoneDetails,
            },
        });
    } catch (error) {
        console.error('Error updating driver location:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update driver location',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

router.post('/zone-update', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const { zoneId = null, latitude, longitude } = req.body || {};
    const { queue } = getServices(req);

    if (!queue?.setDriverZoneFromClient) {
        return res.status(503).json({
            success: false,
            message: 'Zone management service not available',
        });
    }

    try {
        await queue.setDriverZoneFromClient(driverId, zoneId || null);

        const latNumber = coerceNumber(latitude);
        const lngNumber = coerceNumber(longitude);

        if (latNumber !== null && lngNumber !== null) {
            await persistLastLocation(driverId, {
                latitude: latNumber,
                longitude: lngNumber,
                heading: null,
                speed: null,
                accuracy: null,
                altitude: null,
                source: 'mobile_zone_update',
                timestamp: new Date(),
            });
        }

        return res.json({
            success: true,
            data: {
                zoneId: zoneId || null,
            },
        });
    } catch (error) {
        console.error('Error applying zone update from driver:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update driver zone',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

router.get('/history', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    const {
        limit = 50,
        page = 1,
        startDate,
        endDate,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const whereClause = {
        driverId,
    };

    if (startDate || endDate) {
        whereClause.timestamp = {};
        if (startDate) {
            const start = new Date(startDate);
            if (!Number.isNaN(start.getTime())) {
                whereClause.timestamp.gte = start;
            }
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!Number.isNaN(end.getTime())) {
                whereClause.timestamp.lte = end;
            }
        }
    }

    try {
        const [entries, total] = await Promise.all([
            prisma.locationUpdate.findMany({
                where: whereClause,
                orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
                skip: offset,
                take: parsedLimit,
                select: {
                    id: true,
                    latitude: true,
                    longitude: true,
                    heading: true,
                    speed: true,
                    accuracy: true,
                    timestamp: true,
                    createdAt: true,
                },
            }),
            prisma.locationUpdate.count({ where: whereClause }),
        ]);

        return res.json({
            success: true,
            data: entries.map((entry) => ({
                id: entry.id,
                latitude: entry.latitude,
                longitude: entry.longitude,
                heading: entry.heading,
                speed: entry.speed,
                accuracy: entry.accuracy,
                timestamp: (entry.timestamp || entry.createdAt).toISOString(),
            })),
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                hasMore: offset + parsedLimit < total,
            },
        });
    } catch (error) {
        console.error('Error fetching location history:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch location history',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

module.exports = router;
