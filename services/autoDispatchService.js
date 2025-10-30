const pointInPolygon = require('point-in-polygon');
const notificationService = require('./notificationService');
const prisma = require('../lib/prisma');

const toNumber = (value, fallback = null) => {
    if (value === null || value === undefined) {
        return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
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
        console.warn('[Auto-Dispatch] Failed to parse JSON payload:', error?.message || error);
        return {};
    }
};

const extractCoordinate = (source = {}) => {
    if (!source) {
        return { latitude: null, longitude: null, address: null };
    }

    const candidate = parseJson(source);

    const nested = candidate.coordinates || candidate.location || candidate.position || {};
    const lat =
        toNumber(candidate.latitude) ??
        toNumber(candidate.lat) ??
        toNumber(candidate.latitud) ??
        toNumber(nested.latitude) ??
        toNumber(nested.lat) ??
        (Array.isArray(candidate) ? toNumber(candidate[1]) : null) ??
        (Array.isArray(nested) ? toNumber(nested[1]) : null);

    const lng =
        toNumber(candidate.longitude) ??
        toNumber(candidate.lng) ??
        toNumber(candidate.lon) ??
        toNumber(candidate.longitud) ??
        toNumber(nested.longitude) ??
        toNumber(nested.lng) ??
        toNumber(nested.lon) ??
        (Array.isArray(candidate) ? toNumber(candidate[0]) : null) ??
        (Array.isArray(nested) ? toNumber(nested[0]) : null);

    const address =
        candidate.address ||
        candidate.formattedAddress ||
        candidate.name ||
        candidate.description ||
        null;

    return { latitude: lat, longitude: lng, address };
};

const extractRequiredVehicleType = (requirements) => {
    const payload = parseJson(requirements);
    return (
        payload.vehicleType ||
        payload.vehicleTypeId ||
        payload.vehicle_type ||
        null
    );
};

const toRadians = (value) => (value * Math.PI) / 180;

const calculateDistanceMeters = (originLat, originLng, targetLat, targetLng) => {
    if (
        !Number.isFinite(originLat) ||
        !Number.isFinite(originLng) ||
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLng)
    ) {
        return null;
    }

    const earthRadius = 6371000; // meters
    const dLat = toRadians(targetLat - originLat);
    const dLng = toRadians(targetLng - originLng);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(originLat)) *
            Math.cos(toRadians(targetLat)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
};

const normaliseQueue = (queue) => {
    if (!queue) {
        return [];
    }

    if (Array.isArray(queue)) {
        return queue.slice();
    }

    if (typeof queue === 'string') {
        try {
            const parsed = JSON.parse(queue);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[Auto-Dispatch] Failed to parse zone queue payload:', error?.message || error);
            return [];
        }
    }

    return [];
};

const extractZonePolygons = (boundaries) => {
    const parsed = parseJson(boundaries);
    const polygons = [];

    if (!parsed) {
        return polygons;
    }

    if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
        polygons.push(parsed.coordinates[0]);
    } else if (parsed.type === 'MultiPolygon' && Array.isArray(parsed.coordinates)) {
        parsed.coordinates.forEach((poly) => {
            if (Array.isArray(poly?.[0])) {
                polygons.push(poly[0]);
            }
        });
    } else if (Array.isArray(parsed.coordinates)) {
        polygons.push(parsed.coordinates);
    } else if (Array.isArray(parsed)) {
        polygons.push(parsed);
    }

    return polygons;
};

const formatPassengerName = (passenger) => {
    if (!passenger) {
        return null;
    }

    const fullName = [passenger.firstName, passenger.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

    return fullName || null;
};

class AutoDispatchService {
    constructor(io) {
        this.io = io;
    }

    /**
     * Main entry point for auto-dispatching a ride
     * @param {string} rideId - The ride to dispatch
     * @returns {Promise<{success: boolean, driverId?: string, reason?: string}>}
     */
    async dispatchRide(rideId) {
        try {
            console.log(`[Auto-Dispatch] Starting dispatch for ride ${rideId}`);

            // Get ride details
            const ride = await prisma.ride.findUnique({
                where: { id: rideId },
                include: {
                    company: {
                        select: {
                            id: true,
                            autoDispatchEnabled: true,
                            maxDispatchRadiusKm: true
                        }
                    },
                    passenger: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    }
                }
            });

            if (!ride) {
                return { success: false, reason: 'Ride not found' };
            }

            // Check if auto-dispatch is enabled for this company
            if (!ride.company.autoDispatchEnabled) {
                console.log(`[Auto-Dispatch] Auto-dispatch disabled for company ${ride.company.id}`);
                return { success: false, reason: 'Auto-dispatch disabled for company' };
            }

            const pickup = extractCoordinate(ride.pickup);
            const { latitude, longitude } = pickup;

            if (!latitude || !longitude) {
                return { success: false, reason: 'Invalid pickup coordinates' };
            }

            const requiredVehicleType = extractRequiredVehicleType(ride.requirements);

            // Strategy 1: Zone-based queue
            const zoneResult = await this.tryZoneBasedDispatch(
                ride,
                latitude,
                longitude,
                requiredVehicleType
            );

            if (zoneResult.success) {
                return zoneResult;
            }

            // Strategy 2: Progressive radius search
            console.log('[Auto-Dispatch] Zone queue empty, trying radius search...');
            const radiusResult = await this.tryRadiusBasedDispatch(
                ride,
                latitude,
                longitude,
                requiredVehicleType
            );

            if (radiusResult.success) {
                return radiusResult;
            }

            // No driver found
            console.log(`[Auto-Dispatch] No available drivers found for ride ${rideId}`);
            await this.updateRideStatus(rideId, 'PENDING', null);

            // Notify dispatch portal
            this.io.to(`dispatch_${ride.companyId}`).emit('ride_updated', {
                rideId,
                status: 'PENDING',
                reason: 'No available drivers'
            });

            return { success: false, reason: 'No available drivers within 5km' };

        } catch (error) {
            console.error('[Auto-Dispatch] Error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Try to dispatch using zone-based FIFO queue
     */
    async tryZoneBasedDispatch(ride, latitude, longitude, requiredVehicleType) {
        try {
            // Find zone containing pickup point
            const zone = await this.findZoneContainingPoint(
                ride.companyId,
                latitude,
                longitude
            );

            const queue = normaliseQueue(zone?.queue);

            if (!zone || queue.length === 0) {
                console.log('[Auto-Dispatch] No zone or empty queue');
                return { success: false, reason: 'No zone or empty queue' };
            }

            console.log(`[Auto-Dispatch] Found zone ${zone.name} with ${queue.length} drivers`);

            // Try each driver in queue (FIFO order)
            for (const driverId of queue) {
                const isAvailable = await this.isDriverAvailable(
                    driverId,
                    requiredVehicleType
                );

                if (isAvailable) {
                    console.log(`[Auto-Dispatch] Assigning to driver ${driverId} from zone queue`);
                    const result = await this.assignRideToDriver(ride.id, driverId);

                    if (result.success) {
                        // Move driver to back of queue
                        await this.moveDriverToBackOfQueue(driverId, zone.id);
                        return result;
                    }
                }
            }

            return { success: false, reason: 'No available drivers in zone queue' };
        } catch (error) {
            console.error('[Auto-Dispatch] Zone-based dispatch error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Try to dispatch using progressive radius search
     */
    async tryRadiusBasedDispatch(ride, latitude, longitude, requiredVehicleType) {
        try {
            const maxRadius = ride.company.maxDispatchRadiusKm || 5.0;
            const radiusSteps = [1, 2, 3, 4, maxRadius]; // km

            for (const radiusKm of radiusSteps) {
                console.log(`[Auto-Dispatch] Searching within ${radiusKm}km radius...`);

                const drivers = await this.findAvailableDriversWithinRadius(
                    ride.companyId,
                    latitude,
                    longitude,
                    radiusKm * 1000, // Convert to meters
                    requiredVehicleType
                );

                if (drivers.length > 0) {
                    // Select closest driver
                    const closestDriver = drivers[0];
                    console.log(
                        `[Auto-Dispatch] Found driver ${closestDriver.id} at ${(
                            closestDriver.distance / 1000
                        ).toFixed(2)}km`
                    );

                    const result = await this.assignRideToDriver(ride.id, closestDriver.id);

                    if (result.success) {
                        return result;
                    }
                }
            }

            return { success: false, reason: `No drivers within ${maxRadius}km` };
        } catch (error) {
            console.error('[Auto-Dispatch] Radius-based dispatch error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Find zone containing a geographic point
     */
    async findZoneContainingPoint(companyId, latitude, longitude) {
        try {
            const zones = await prisma.zone.findMany({
                where: {
                    companyId,
                    isActive: true
                },
                select: {
                    id: true,
                    name: true,
                    boundaries: true,
                    queue: true
                }
            });

            for (const zone of zones) {
                const polygons = extractZonePolygons(zone.boundaries);

                for (const polygon of polygons) {
                    const formattedPolygon = polygon
                        .map((point) => {
                            const candidate = Array.isArray(point)
                                ? point
                                : [point?.lng ?? point?.longitude, point?.lat ?? point?.latitude];

                            const lng = toNumber(candidate?.[0]);
                            const lat = toNumber(candidate?.[1]);

                            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                                return [lng, lat];
                            }
                            return null;
                        })
                        .filter(Boolean);

                    if (formattedPolygon.length < 3) {
                        continue;
                    }

                    if (pointInPolygon([longitude, latitude], formattedPolygon)) {
                        console.log(`[Auto-Dispatch] Point is in zone ${zone.name}`);
                        return zone;
                    }
                }
            }

            console.log('[Auto-Dispatch] Point not in any zone');
            return null;
        } catch (error) {
            console.error('[Auto-Dispatch] Error finding zone:', error);
            return null;
        }
    }

    /**
     * Check if driver is available and matches vehicle requirements
     */
    async isDriverAvailable(driverId, requiredVehicleTypeId = null) {
        try {
            const driver = await prisma.user.findUnique({
                where: { id: driverId },
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    companyId: true,
                    shifts: {
                        where: { endTime: null },
                        orderBy: { startTime: 'desc' },
                        take: 1,
                        select: { status: true }
                    },
                    locationUpdates: {
                        orderBy: [
                            { timestamp: 'desc' },
                            { createdAt: 'desc' }
                        ],
                        take: 1,
                        select: {
                            latitude: true,
                            longitude: true,
                            timestamp: true
                        }
                    }
                }
            });

            if (!driver || driver.role !== 'DRIVER') {
                return false;
            }

            if (!driver.isActive || !driver.companyId) {
                return false;
            }

            const activeShift = driver.shifts[0];
            if (!activeShift || activeShift.status !== 'ONLINE') {
                return false;
            }

            const latestLocation = driver.locationUpdates[0];
            if (
                !latestLocation ||
                !Number.isFinite(latestLocation.latitude) ||
                !Number.isFinite(latestLocation.longitude)
            ) {
                return false;
            }

            // Check vehicle type if specified
            if (requiredVehicleTypeId) {
                const vehicle = await prisma.vehicle.findFirst({
                    where: {
                        driverId,
                        isActive: true
                    },
                    select: {
                        vehicleType: true
                    }
                });

                if (!vehicle || vehicle.vehicleType !== requiredVehicleTypeId) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('[Auto-Dispatch] Error checking driver availability:', error);
            return false;
        }
    }

    /**
     * Find available drivers within a radius
     */
    async findAvailableDriversWithinRadius(companyId, latitude, longitude, radiusMeters, vehicleTypeId = null) {
        try {
            const drivers = await prisma.user.findMany({
                where: {
                    companyId,
                    role: 'DRIVER',
                    isActive: true,
                    shifts: {
                        some: {
                            endTime: null,
                            status: 'ONLINE'
                        }
                    }
                },
                select: {
                    id: true,
                    shifts: {
                        where: { endTime: null },
                        orderBy: { startTime: 'desc' },
                        take: 1,
                        select: { status: true }
                    },
                    locationUpdates: {
                        orderBy: [
                            { timestamp: 'desc' },
                            { createdAt: 'desc' }
                        ],
                        take: 1,
                        select: {
                            latitude: true,
                            longitude: true
                        }
                    }
                }
            });

            const candidates = [];

            for (const driver of drivers) {
                const activeShift = driver.shifts[0];
                if (!activeShift || activeShift.status !== 'ONLINE') {
                    continue;
                }

                const latestLocation = driver.locationUpdates[0];
                if (!latestLocation) {
                    continue;
                }

                const distance = calculateDistanceMeters(
                    latitude,
                    longitude,
                    latestLocation.latitude,
                    latestLocation.longitude
                );

                if (distance === null || distance > radiusMeters) {
                    continue;
                }

                if (vehicleTypeId) {
                    const vehicle = await prisma.vehicle.findFirst({
                        where: {
                            driverId: driver.id,
                            isActive: true
                        },
                        select: {
                            vehicleType: true
                        }
                    });

                    if (!vehicle || vehicle.vehicleType !== vehicleTypeId) {
                        continue;
                    }
                }

                candidates.push({
                    id: driver.id,
                    distance
                });
            }

            return candidates.sort((a, b) => a.distance - b.distance).slice(0, 10);
        } catch (error) {
            console.error('[Auto-Dispatch] Error finding drivers within radius:', error);
            return [];
        }
    }

    /**
     * Assign ride to driver and send notifications
     */
    async assignRideToDriver(rideId, driverId) {
        try {
            console.log(`[Auto-Dispatch] Assigning ride ${rideId} to driver ${driverId}`);

            // Create ride offer record
            await prisma.rideOffer.create({
                data: {
                    rideId,
                    driverId,
                    status: 'OFFERED',
                    offeredAt: new Date()
                }
            });

            // Update ride status
            const ride = await prisma.ride.update({
                where: { id: rideId },
                data: {
                    driverId,
                    status: 'DRIVER_ASSIGNED',
                    offeredAt: new Date()
                },
                include: {
                    passenger: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    },
                    company: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            const pickup = extractCoordinate(ride.pickup);
            const dropoff = extractCoordinate(ride.destination);

            // Send push notification to driver
            try {
                await notificationService.sendToDriver(driverId, {
                    type: 'NEW_RIDE_OFFER',
                    title: 'New Ride Request',
                    body: `Pickup: ${pickup.address || 'Address not available'}`,
                    data: {
                        rideId: ride.id,
                        reference: ride.rideId,
                        pickupAddress: pickup.address,
                        dropoffAddress: dropoff.address
                    }
                });
            } catch (notifError) {
                console.error('[Auto-Dispatch] Failed to send notification:', notifError);
                // Continue even if notification fails
            }

            // Emit socket event to dispatch portal
            this.io.to(`dispatch_${ride.companyId}`).emit('ride_updated', {
                rideId: ride.id,
                status: 'DRIVER_ASSIGNED',
                driverId,
                reference: ride.rideId
            });

            // Emit to driver
            this.io.to(`driver_${driverId}`).emit('new_ride_offer', {
                ride: {
                    id: ride.id,
                    reference: ride.rideId,
                    pickupAddress: pickup.address,
                    dropoffAddress: dropoff.address,
                    passengerName: formatPassengerName(ride.passenger),
                    estimatedFare: ride.estimatedFare
                }
            });

            console.log(`[Auto-Dispatch] Successfully assigned ride ${rideId} to driver ${driverId}`);

            return { success: true, driverId };
        } catch (error) {
            console.error('[Auto-Dispatch] Error assigning ride:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Handle driver rejection and retry dispatch
     */
    async handleDriverRejection(rideId, driverId, reason = null) {
        try {
            console.log(`[Auto-Dispatch] Driver ${driverId} rejected ride ${rideId}`);

            // Update ride offer status
            await prisma.rideOffer.updateMany({
                where: { rideId, driverId },
                data: {
                    status: 'REJECTED',
                    respondedAt: new Date(),
                    rejectionReason: reason
                }
            });

            // Get all previous offers for this ride
            const previousOffers = await prisma.rideOffer.findMany({
                where: { rideId },
                select: { driverId: true }
            });

            const excludeDriverIds = previousOffers.map(offer => offer.driverId);

            // Retry dispatch with excluded drivers
            return await this.redispatchRide(rideId, excludeDriverIds);
        } catch (error) {
            console.error('[Auto-Dispatch] Error handling rejection:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Retry dispatching a ride, excluding certain drivers
     */
    async redispatchRide(rideId, excludeDriverIds = []) {
        try {
            const ride = await prisma.ride.findUnique({
                where: { id: rideId },
                include: {
                    company: true,
                    pickupLocation: true
                }
            });

            if (!ride) {
                return { success: false, reason: 'Ride not found' };
            }

            // Reset ride status
            await this.updateRideStatus(rideId, 'PENDING', null);

            // Try zone dispatch first, excluding previous drivers
            // This is a simplified version - would need to modify zone queue logic
            return await this.dispatchRide(rideId);
        } catch (error) {
            console.error('[Auto-Dispatch] Error redispatching:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Move driver to back of zone queue after accepting/rejecting
     */
    async moveDriverToBackOfQueue(driverId, zoneId) {
        try {
            const zone = await prisma.zone.findUnique({
                where: { id: zoneId }
            });

            if (!zone) return;

            let queue = normaliseQueue(zone.queue);

            // Remove driver from current position
            queue = queue.filter(id => id !== driverId);

            // Add to back
            queue.push(driverId);

            await prisma.zone.update({
                where: { id: zoneId },
                data: { queue }
            });

            console.log(`[Auto-Dispatch] Moved driver ${driverId} to back of queue in zone ${zone.name}`);
        } catch (error) {
            console.error('[Auto-Dispatch] Error moving driver in queue:', error);
        }
    }

    /**
     * Update ride status
     */
    async updateRideStatus(rideId, status, driverId = null) {
        try {
            const updateData = { status };
            if (driverId !== null) {
                updateData.driverId = driverId;
            }

            return await prisma.ride.update({
                where: { id: rideId },
                data: updateData
            });
        } catch (error) {
            console.error('[Auto-Dispatch] Error updating ride status:', error);
            throw error;
        }
    }
}

module.exports = AutoDispatchService;
