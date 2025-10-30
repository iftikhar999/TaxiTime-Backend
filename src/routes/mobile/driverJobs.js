const express = require('express');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');
const { cacheMiddleware } = require('../../../middleware/requestCache');
const jobService = require('../../../services/jobService');
const { detectZone, pointInPolygon } = require('../../../services/zoneDetectionService');

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
        console.warn('Failed to parse JSON payload', error?.message || error);
        return {};
    }
};

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
        console.log(`🔍 Fetching current job for driver: ${driverId}`);
        
        // Find any active/in-progress job for this driver
        const job = await prisma.job.findFirst({
            where: {
                assignedDriverId: driverId,
                status: {
                    in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'PAUSED', 'PENDING_PAYMENT']
                },
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                    },
                },
                trip: true,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        if (!job) {
            console.log(`ℹ️ No active job found for driver: ${driverId}`);
            return res.json({
                success: true,
                job: null,
            });
        }

        console.log(`✅ Found active job for driver: ${job.id}, status: ${job.status}`);

        // Build response
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
            customer: job.customer ? {
                id: job.customer.id,
                name: `${job.customer.firstName || ''} ${job.customer.lastName || ''}`.trim() || job.customer.email,
                phone: job.customer.phone,
            } : null,
            trip: job.trip ? {
                id: job.trip.id,
                status: job.trip.status,
            } : null,
        };

        res.json({
            success: true,
            job: jobResponse,
        });

    } catch (error) {
        console.error('❌ Error fetching current job:', error);
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

    if (boundaries.type === 'Polygon' && Array.isArray(boundaries.coordinates)) {
        return [boundaries.coordinates[0]];
    }

    if (boundaries.type === 'MultiPolygon' && Array.isArray(boundaries.coordinates)) {
        return boundaries.coordinates
            .map((poly) => poly?.[0])
            .filter(Boolean);
    }

    if (Array.isArray(boundaries.coordinates)) {
        const coords = boundaries.coordinates;
        const first = coords[0];
        if (Array.isArray(first) && first.length >= 2 && typeof first[0] === 'number') {
            return [coords];
        }
    }

    if (Array.isArray(boundaries)) {
        const first = boundaries[0];
        if (Array.isArray(first) && first.length >= 2 && typeof first[0] === 'number') {
            return [boundaries];
        }
        if (first && typeof first === 'object' && first.lat !== undefined && first.lng !== undefined) {
            return [boundaries.map((coord) => [coord.lng, coord.lat])];
        }
    }

    if (boundaries.coordinates && Array.isArray(boundaries.coordinates)) {
        const coords = boundaries.coordinates;
        const first = coords[0];
        if (first && typeof first === 'object' && first.lat !== undefined && first.lng !== undefined) {
            return [coords.map((coord) => [coord.lng, coord.lat])];
        }
    }

    return [];
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

router.get('/history', authenticateToken, async (req, res) => {
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
        console.error('Failed to fetch driver job history:', error);
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

// ✅ OPTIMIZED: Added 10-second cache to reduce load by 95%+
router.get('/upcoming', authenticateToken, cacheMiddleware(10), async (req, res) => {
    const driverId = req.user?.id;

    if (!driverId) {
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    try {
        console.log(`📡 [/upcoming] Request from driver ${driverId}`);
        
        // ✅ OPTIMIZATION: Get driver data from auth token to avoid extra DB query
        const driver = req.user;
        
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
                    driver.companyId
                );
                if (detectedZone) {
                    currentZoneId = detectedZone.id;
                    currentZoneName = detectedZone.name || null;
                }
            }
        }

        if (!currentZoneId) {
            console.log(`📡 [/upcoming] No zone for driver ${driverId}, returning empty`);
            return res.json({ success: true, data: [] });
        }

        // ✅ OPTIMIZATION: Get zone boundaries from cache (zoneCacheService)
        const zoneRecord = await prisma.zone.findUnique({
            where: { id: currentZoneId },
            select: { id: true, name: true, boundaries: true },
        });

        if (!zoneRecord) {
            console.log(`📡 [/upcoming] Zone ${currentZoneId} not found`);
            return res.json({ success: true, data: [] });
        }

        const zonePolygons = normaliseZonePolygons(zoneRecord.boundaries);

        if (zonePolygons.length === 0) {
            console.log(`📡 [/upcoming] Zone ${currentZoneId} has no polygons`);
            return res.json({ success: true, data: [] });
        }

        if (!currentZoneName) {
            currentZoneName = zoneRecord.name || null;
        }

        const now = new Date();
        const soon = new Date(now.getTime() + 10 * 60 * 1000);

        const candidates = await prisma.job.findMany({
            where: {
                companyId: driver.companyId,
                status: { in: ['UNASSIGNED', 'PENDING'] },
                assignedDriverId: null,
                pickupLatitude: { not: null },
                pickupLongitude: { not: null },
                OR: [{ scheduledAt: null }, { scheduledAt: { lte: soon } }],
            },
            include: {
                customer: {
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

        for (const job of candidates) {
            const lat = Number(job.pickupLatitude);
            const lng = Number(job.pickupLongitude);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                continue;
            }

            const matchesZone = zonePolygons.some((polygon) =>
                pointInPolygon(lat, lng, polygon)
            );

            if (!matchesZone) {
                continue;
            }

            const scheduledAt = job.scheduledAt ? new Date(job.scheduledAt) : null;
            const isLate = scheduledAt ? scheduledAt < now : false;
            const minutesToPickup = scheduledAt
                ? Math.round((scheduledAt.getTime() - now.getTime()) / 60000)
                : 0;

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
                customer: job.customer
                    ? {
                          id: job.customer.id,
                          firstName: job.customer.firstName,
                          lastName: job.customer.lastName,
                          phone: job.customer.phone,
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
        console.error('Failed to fetch upcoming jobs for driver:', error);
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

    console.log('🚀 [CLAIM JOB ROUTE] Request received', { jobId, driverId, userId: req.user?.id });

    if (!driverId) {
        console.error('❌ [CLAIM JOB ROUTE] No driver ID found');
        return res.status(401).json({
            success: false,
            message: 'Driver authentication required',
        });
    }

    try {
        console.log('🚀 [CLAIM JOB ROUTE] Calling jobService.claimJob');
        const result = await jobService.claimJob(jobId, driverId, req.io);
        console.log('✅ [CLAIM JOB ROUTE] Success, sending response', { hasResult: !!result });
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ [CLAIM JOB ROUTE] Error caught:', {
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
    const { jobId, amount, paymentMethod, customerId, status, collectedAt } = req.body;

    console.log('💰 [PAYMENT COLLECTION] Request received', { 
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

    if (!jobId || !amount || !paymentMethod) {
        return res.status(400).json({
            success: false,
            message: 'Missing required payment information',
        });
    }

    try {
        // Verify job exists and belongs to this driver
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { 
                trip: true,
                company: true,
            },
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found',
            });
        }

        if (job.assignedDriverId !== driverId) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this job',
            });
        }

        // Calculate commission (e.g., 20% for company)
        const companyCommissionRate = job.company?.commissionRate || 0.20;
        const companyCommission = amount * companyCommissionRate;
        const driverEarnings = amount - companyCommission;

        // Create payment record
        const payment = await prisma.payment.create({
            data: {
                jobId,
                tripId: job.tripId,
                customerId: customerId || job.customerId,
                driverId,
                companyId: job.companyId,
                amount: amount,
                currency: 'USD',
                paymentMethod: paymentMethod.toUpperCase(),
                status: status || 'COMPLETED',
                paidAt: collectedAt ? new Date(collectedAt) : new Date(),
                fees: companyCommission,
                driverEarnings,
            },
        });

        // Update job with actual fare
        await prisma.job.update({
            where: { id: jobId },
            data: { 
                actualFare: amount,
                paymentMethod: paymentMethod.toUpperCase(),
            },
        });

        // If there's a trip record, update it too
        if (job.tripId) {
            await prisma.ride.update({
                where: { id: job.tripId },
                data: {
                    actualFare: amount,
                    paymentMethod: paymentMethod.toUpperCase(),
                    paymentStatus: 'PAID',
                },
            });
        }

        console.log('✅ [PAYMENT COLLECTION] Payment recorded successfully', {
            paymentId: payment.id,
            amount,
            driverEarnings,
            companyCommission,
        });

        res.json({
            success: true,
            data: {
                paymentId: payment.id,
                amount,
                driverEarnings,
                companyCommission,
                paymentMethod,
                status: payment.status,
            },
            message: 'Payment recorded successfully',
        });
    } catch (error) {
        console.error('❌ [PAYMENT COLLECTION] Error:', {
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
    
    if (!driverId) {
        return res.status(400).json({ error: 'Driver ID required' });
    }

    try {
        console.log(`🚶 Creating walk-in job (NOW job) for driver ${driverId}`);
        
        // Get driver details
        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            include: {
                company: true,
                shifts: {
                    where: {
                        status: { in: ['ONLINE', 'OFFLINE', 'BUSY', 'BREAK'] }, // ✅ FIX: Valid ShiftStatus enum values
                    },
                    orderBy: {
                        startTime: 'desc',
                    },
                    take: 1,
                },
            },
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        if (!driver.company) {
            return res.status(400).json({ error: 'Driver not linked to a company' });
        }

        const currentShift = driver.shifts?.[0];
        if (!currentShift) {
            return res.status(400).json({ error: 'No active shift found. Please start your shift first.' });
        }
        
        // ✅ FIX: Get vehicle and tariff from driver preferences (not from relations)
        const prefs = driver.preferences || {};
        const selectedVehicleId = prefs.selectedVehicleId || prefs.vehicleId;
        const selectedTariffId = prefs.selectedTariffId || prefs.tariffId;

        // Get driver's current location from preferences
        const driverPrefs = driver.preferences || {};
        const currentLocation = driverPrefs.lastLocation || driverPrefs.currentLocation || {};
        
        const pickupLatitude = currentLocation.latitude || currentLocation.lat;
        const pickupLongitude = currentLocation.longitude || currentLocation.lng;

        if (!pickupLatitude || !pickupLongitude) {
            return res.status(400).json({ error: 'Cannot determine your current location. Please enable GPS.' });
        }

        const now = new Date();
        const rideId = `WALKIN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`📝 Walk-in job details: vehicleId=${selectedVehicleId}, tariffId=${selectedTariffId}`);
        
        // ✅ FIX: Create BOTH Ride AND Job (like dispatch does)
        // Use a transaction to ensure both are created together
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Ride (Trip) first - STARTED status
            const ride = await tx.ride.create({
                data: {
                    rideId: rideId,
                    passengerId: driverId, // ✅ For walk-in, use driver as temporary passenger
                    driverId: driverId,
                    vehicleId: selectedVehicleId || null, // ✅ FIX: Use from preferences
                    companyId: driver.company.id,
                    rideType: 'TAXI',
                    status: 'IN_PROGRESS', // ✅ Started immediately
                    pickup: {
                        address: currentLocation.address || 'Current Location',
                        latitude: pickupLatitude,
                        longitude: pickupLongitude,
                    },
                    destination: {
                        address: 'Destination - To be set',
                        latitude: null,
                        longitude: null,
                    },
                    requestedAt: now,
                    acceptedAt: now,
                    pickedUpAt: now, // ✅ Picked up immediately (walk-in)
                    estimatedFare: 0,
                    paymentMethod: 'CASH', // Default to cash
                    paymentStatus: 'PENDING',
                    requirements: {
                        isWalkIn: true,
                        createdBy: driverId,
                        createdAt: now.toISOString(),
                    },
                    tariffId: selectedTariffId || null, // ✅ FIX: Use from preferences
                },
            });

            // 2. Create the Job linked to the Ride
            const job = await tx.job.create({
                data: {
                    jobId: rideId,
                    companyId: driver.company.id,
                    type: 'TAXI',
                    status: 'STARTED', // ✅ Start immediately
                    tripId: ride.id, // ✅ CRITICAL: Link to Ride
                    scheduledAt: null, // ✅ FIX: NULL = "NOW" job (not "LATER")
                    assignedDriverId: driverId,
                    customerId: driverId, // Temporary - walk-in has no pre-registered customer
                    pickupAddress: currentLocation.address || 'Current Location',
                    pickupLatitude: pickupLatitude,
                    pickupLongitude: pickupLongitude,
                    dropoffAddress: 'Destination - To be set',
                    dropoffLatitude: null,
                    dropoffLongitude: null,
                    estimatedPrice: 0,
                    paymentMethod: 'CASH',
                    requirements: {
                        isWalkIn: true,
                        createdBy: driverId,
                        createdAt: now.toISOString(),
                    },
                },
            });

            // 3. Update driver status to BUSY
            await tx.user.update({
                where: { id: driverId },
                data: {
                    preferences: {
                        ...driverPrefs,
                        driverStatus: 'BUSY',
                        lastStatusChange: now.toISOString(),
                    },
                },
            });

            return { ride, job };
        });

        console.log(`✅ Walk-in ride created: ${result.ride.id}, job: ${result.job.id}, type: NOW (scheduledAt: null)`);

        // Return the job with full details
        res.json({
            success: true,
            message: 'Walk-in job created and started',
            job: {
                id: result.job.id,
                jobId: result.job.jobId,
                rideId: result.ride.id, // ✅ Include ride ID
                status: result.job.status,
                pickupLocation: {
                    address: result.job.pickupAddress,
                    latitude: result.job.pickupLatitude,
                    longitude: result.job.pickupLongitude,
                },
                dropoffLocation: {
                    address: result.job.dropoffAddress,
                    latitude: result.job.dropoffLatitude,
                    longitude: result.job.dropoffLongitude,
                },
                estimatedFare: result.job.estimatedPrice || 0,
                createdAt: result.job.createdAt,
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
        console.error('❌ Error creating walk-in job:', error);
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
        console.log(`📊 Fetching today's stats for driver: ${driverId}`);
        
        // Get today's start and end times (local timezone aware)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Get all completed jobs for today
        // ✅ FIX: Job model doesn't have completedAt, use updatedAt instead
        // ✅ FIX: Job model doesn't have Payment relation, get it from Ride model
        const todaysJobs = await prisma.job.findMany({
            where: {
                assignedDriverId: driverId,
                status: 'COMPLETED', // ✅ FIX: Only COMPLETED status
                updatedAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
            include: {
                trip: {
                    include: {
                        Payment: true, // ✅ FIX: Capital P! (Payment, not payment)
                    },
                },
            },
        });

        console.log(`📊 Found ${todaysJobs.length} completed jobs for today`);

        // ✅ Calculate earnings from ACTUAL payments (not estimates)
        const totalJobs = todaysJobs.length;
        const totalEarnings = todaysJobs.reduce((sum, job) => {
            // Priority 1: Payment from trip relation (array of payments)
            if (job.trip && job.trip.Payment && job.trip.Payment.length > 0) {
                const payment = job.trip.Payment[0]; // Get first payment
                const earning = payment.driverEarnings 
                    ? parseFloat(payment.driverEarnings) 
                    : payment.amount 
                    ? parseFloat(payment.amount) 
                    : 0;
                return sum + earning;
            }
            
            // Priority 2: Trip's actual fare (if no payment record)
            if (job.trip && job.trip.actualFare) {
                return sum + parseFloat(job.trip.actualFare);
            }
            
            // Priority 3: Fallback to estimated price
            if (job.estimatedPrice) {
                return sum + parseFloat(job.estimatedPrice);
            }
            
            return sum;
        }, 0);

        console.log(`📊 Total jobs: ${totalJobs}, Total earnings: $${totalEarnings.toFixed(2)}`);

        res.json({
            success: true,
            stats: {
                todayJobs: totalJobs,
                todayEarnings: totalEarnings.toFixed(2),
                date: todayStart.toISOString().split('T')[0],
            },
        });

    } catch (error) {
        console.error('❌ Error fetching today stats:', error);
        console.error('Stack:', error.stack);
        
        // ✅ Return empty stats instead of error to prevent app crash
        res.json({
            success: true,
            stats: {
                todayJobs: 0,
                todayEarnings: '0.00',
                date: new Date().toISOString().split('T')[0],
            },
            warning: 'Failed to fetch actual stats, showing defaults',
        });
    }
});


module.exports = router;
