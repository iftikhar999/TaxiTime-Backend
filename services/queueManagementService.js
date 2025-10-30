const prisma = require('../lib/prisma');
const { detectZone } = require('./zoneDetectionService');

// Debouncing for zone updates
const ZONE_UPDATE_DEBOUNCE_MS = 3000; // ✅ BALANCED: 3 seconds (real-time for job assignment, still reduces DB writes by 33%)

const DEFAULT_QUEUE_EVENT = 'zone_queue_updated';
const DRIVER_ZONE_EVENT = 'driver:zone:changed';

const unique = (values = []) => {
    if (!Array.isArray(values) || !values.length) {
        return [];
    }

    return [...new Set(values.filter(Boolean))];
};

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

const normalizeQueue = (queue) => {
    if (!queue) {
        return [];
    }

    const working = Array.isArray(queue) ? queue : [];
    const normalized = [];

    for (const entry of working) {
        const candidate =
            typeof entry === 'string'
                ? entry
                : entry?.driverId || entry?.id || null;

        if (candidate && !normalized.includes(candidate)) {
            normalized.push(candidate);
        }
    }

    return normalized;
};

const mapShiftStatusToDriver = (shiftStatus) => {
    switch (shiftStatus) {
        case 'ONLINE':
            return 'AVAILABLE';
        case 'BUSY':
            return 'BUSY';
        case 'BREAK':
            return 'AWAY';
        default:
            return 'OFFLINE';
    }
};

class QueueManagementService {
    constructor(io) {
        this.io = io;
        this.dispatchNamespace = typeof io?.of === 'function' ? io.of('/dispatch') : null;
        
        // Debouncing for zone updates
        this.pendingZoneUpdates = new Map(); // driverId -> { zone, timestamp }
        this.zoneUpdateTimers = new Map();   // driverId -> timer
        this.ZONE_UPDATE_DEBOUNCE_MS = 3000; // ✅ BALANCED: 3s for real-time job assignment (was 2s, briefly 10s)
        
        // Zone stability tracking (prevent flapping)
        this.zoneDetectionHistory = new Map(); // driverId -> { detections: [], lastStableZone: null }
        this.ZONE_STABILITY_REQUIRED = 3; // Require 3 consecutive detections
        this.ZONE_STABILITY_WINDOW_MS = 10000; // Within 10 seconds
    }

    emitToDispatch(companyId, event, payload) {
        if (!this.dispatchNamespace || !companyId) {
            return;
        }

        try {
            this.dispatchNamespace.to(`dispatch_${companyId}`).emit(event, payload);
            this.dispatchNamespace.to(`company_${companyId}`).emit(event, payload);
            this.dispatchNamespace.to('super_admin').emit(event, payload);
        } catch (error) {
            console.warn(`[Queue] Failed to emit ${event}:`, error?.message || error);
        }
    }

    async getDriverRecord(driverId) {
        if (!driverId) {
            return null;
        }

        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                role: true,
                isActive: true,
                companyId: true,
                preferences: true,
                firstName: true,
                lastName: true,
            },
        });

        if (!driver || driver.role !== 'DRIVER' || !driver.isActive) {
            return null;
        }

        return {
            ...driver,
            preferences: cloneJson(driver.preferences),
        };
    }

    async getDriverDispatchStatus(driverId) {
        const shift = await prisma.shift.findFirst({
            where: {
                driverId,
                endTime: null,
            },
            orderBy: { startTime: 'desc' },
            select: { status: true },
        });

        return mapShiftStatusToDriver(shift?.status || 'OFFLINE');
    }

    async writePreferences(driverId, preferences) {
        try {
            await prisma.user.update({
                where: { id: driverId },
                data: {
                    preferences,
                },
            });
        } catch (error) {
            console.error('[Queue] Failed to persist driver preferences:', error);
        }
    }

    async addDriverToZoneQueue(driverId, zoneId) {
        const zone = await prisma.zone.findUnique({
            where: { id: zoneId },
            select: {
                id: true,
                name: true,
                companyId: true,
                queue: true,
            },
        });

        if (!zone) {
            console.warn(`[Queue] Zone ${zoneId} not found for driver ${driverId}`);
            return null;
        }

        const queue = normalizeQueue(zone.queue);
        const existingIndex = queue.indexOf(driverId);

        if (existingIndex === -1) {
            queue.push(driverId);
            await prisma.zone.update({
                where: { id: zone.id },
                data: { queue },
            });

            this.emitToDispatch(zone.companyId, DEFAULT_QUEUE_EVENT, {
                zoneId: zone.id,
                zoneName: zone.name,
                queue,
            });
        }

        return { zone, queue };
    }

    async ensureDriverRemovedFromZone(driverId, zoneId) {
        const zone = await prisma.zone.findUnique({
            where: { id: zoneId },
            select: {
                id: true,
                name: true,
                companyId: true,
                queue: true,
            },
        });

        if (!zone) {
            return null;
        }

        const queue = normalizeQueue(zone.queue);
        const filtered = queue.filter((entry) => entry !== driverId);

        if (filtered.length !== queue.length) {
            await prisma.zone.update({
                where: { id: zone.id },
                data: { queue: filtered },
            });

            this.emitToDispatch(zone.companyId, DEFAULT_QUEUE_EVENT, {
                zoneId: zone.id,
                zoneName: zone.name,
                queue: filtered,
            });
        }

        return { zone, queue: filtered };
    }

    async removeDriverFromAllQueues(driverId, companyId) {
        const zones = await prisma.zone.findMany({
            where: companyId
                ? { companyId }
                : {
                    queue: {
                        path: '$',
                        array_contains: driverId,
                    },
                },
            select: {
                id: true,
                name: true,
                companyId: true,
                queue: true,
            },
        });

        for (const zone of zones) {
            const queue = normalizeQueue(zone.queue);
            if (!queue.includes(driverId)) {
                continue;
            }

            const filtered = queue.filter((entry) => entry !== driverId);
            await prisma.zone.update({
                where: { id: zone.id },
                data: { queue: filtered },
            });

            this.emitToDispatch(zone.companyId, DEFAULT_QUEUE_EVENT, {
                zoneId: zone.id,
                zoneName: zone.name,
                queue: filtered,
            });
        }
    }

    async emitDriverZoneChange(driver, payload) {
        if (!driver?.companyId) {
            return;
        }

        // ✅ FIX: Emit to both dispatch AND mobile driver socket!
        this.emitToDispatch(driver.companyId, DRIVER_ZONE_EVENT, payload);
        
        // Also emit directly to the driver's mobile socket
        if (this.io && payload.driverId) {
            this.io.to(`driver:${payload.driverId}`).emit(DRIVER_ZONE_EVENT, {
                zoneId: payload.zoneId || null,
                zoneName: payload.zoneName || null,
                queuePosition: payload.queuePosition,
                timestamp: payload.updatedAt || new Date().toISOString()
            });
            console.log(`📍 Emitted zone change to mobile driver ${payload.driverId}:`, {
                zoneId: payload.zoneId,
                zoneName: payload.zoneName
            });
        }
    }

    async updateDriverZoneMetadata(driver, updater) {
        const preferences = cloneJson(driver.preferences);
        const dispatchMeta =
            preferences.dispatch && typeof preferences.dispatch === 'object'
                ? { ...preferences.dispatch }
                : {};

        const updatedDispatch = updater(dispatchMeta) || dispatchMeta;
        preferences.dispatch = updatedDispatch;

        await this.writePreferences(driver.id, preferences);

        return preferences.dispatch;
    }

    async updateDriverZoneMembership(driverId, latitude, longitude) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        const driver = await this.getDriverRecord(driverId);
        if (!driver?.companyId) {
            return null;
        }

        // Detect zone using OPTIMIZED service (with caching and bounds check)
        const currentStatus = await this.getDriverDispatchStatus(driverId);
        const detectedZone = await detectZone(latitude, longitude, driver.companyId);
        const newZoneId = detectedZone?.id || null;

        const currentZoneId =
            driver.preferences?.dispatch?.currentZone?.id || null;

        // 🔒 STABILITY CHECK: Prevent zone flapping
        const stableZone = this.checkZoneStability(driverId, newZoneId);
        
        // If no stable zone yet, return current state without changes
        if (stableZone === undefined) {
            console.log(`⏳ Zone stability pending for driver ${driverId} (need ${this.ZONE_STABILITY_REQUIRED} consecutive detections)`);
            return {
                driverId,
                zoneId: currentZoneId, // Keep current zone
                zoneName: driver.preferences?.dispatch?.currentZone?.name || null,
                status: currentStatus,
                changed: false,
                pending: true,
            };
        }
        
        // Use the stable zone
        const finalZoneId = stableZone;
        const finalZone = finalZoneId ? detectedZone : null;

        // Check if zone actually changed from current
        if (currentZoneId === finalZoneId) {
            // No zone change - skip DB write and just return current info
            return {
                driverId,
                zoneId: finalZoneId,
                zoneName: finalZone?.name || null,
                status: currentStatus,
                changed: false,
            };
        }

        console.log(`🔄 Stable zone change confirmed for driver ${driverId}: ${currentZoneId || 'none'} -> ${finalZoneId || 'none'}`);

        // Zone changed - update immediately (queues need instant update)
        if (currentZoneId && currentZoneId !== newZoneId) {
            await this.removeDriverFromAllQueues(driverId, driver.companyId);
        }

        let queuePosition = null;
        if (newZoneId) {
            if (currentStatus === 'AVAILABLE') {
                const result = await this.addDriverToZoneQueue(driverId, newZoneId);
                if (result?.queue) {
                    const index = result.queue.indexOf(driverId);
                    queuePosition = index >= 0 ? index + 1 : null;
                }
            } else {
                await this.ensureDriverRemovedFromZone(driverId, newZoneId);
            }
        }

        // Debounce the DB write (preferences update)
        this.debounceZoneUpdate(driver, finalZone, finalZoneId, {
            driverId,
            latitude,
            longitude,
            status: currentStatus,
            queuePosition,
        });

        // Emit immediately so dispatcher sees zone change in real-time
        const zonePayload = {
            driverId,
            zoneId: finalZoneId,
            zoneName: finalZone?.name || null,
            queuePosition,
            status: currentStatus,
            latitude,
            longitude,
            updatedAt: new Date().toISOString(),
        };

        await this.emitDriverZoneChange(driver, zonePayload);

        return zonePayload;
    }

    /**
     * Check zone stability to prevent flapping
     * Requires multiple consecutive detections of the same zone
     * @param {string} driverId - Driver ID
     * @param {string|null} detectedZoneId - Currently detected zone ID
     * @returns {string|null|undefined} Stable zone ID, or undefined if not stable yet
     */
    checkZoneStability(driverId, detectedZoneId) {
        const now = Date.now();
        
        // Get or create detection history
        if (!this.zoneDetectionHistory.has(driverId)) {
            this.zoneDetectionHistory.set(driverId, {
                detections: [],
                lastStableZone: null,
            });
        }
        
        const history = this.zoneDetectionHistory.get(driverId);
        
        // Add current detection
        history.detections.push({
            zoneId: detectedZoneId,
            timestamp: now,
        });
        
        // Remove old detections outside the stability window
        history.detections = history.detections.filter(
            d => now - d.timestamp < this.ZONE_STABILITY_WINDOW_MS
        );
        
        // Check if we have enough recent detections
        if (history.detections.length < this.ZONE_STABILITY_REQUIRED) {
            // Not enough data yet, return undefined (pending)
            return undefined;
        }
        
        // Get the last N detections
        const recentDetections = history.detections.slice(-this.ZONE_STABILITY_REQUIRED);
        
        // Check if all recent detections are the same
        const allSame = recentDetections.every(d => d.zoneId === recentDetections[0].zoneId);
        
        if (allSame) {
            // Stable zone detected!
            const stableZone = recentDetections[0].zoneId;
            history.lastStableZone = stableZone;
            console.log(`✅ Stable zone confirmed for driver ${driverId}: ${stableZone || 'none'}`);
            return stableZone;
        }
        
        // Still fluctuating, return last stable zone (or undefined if never stable)
        return history.lastStableZone !== null ? history.lastStableZone : undefined;
    }

    /**
     * Debounce zone updates to DB (preferences)
     * This prevents excessive DB writes when driver is near zone boundaries
     */
    debounceZoneUpdate(driver, detectedZone, newZoneId, metadata) {
        const { driverId, latitude, longitude, status, queuePosition } = metadata;

        // Clear existing timer
        if (this.zoneUpdateTimers.has(driverId)) {
            clearTimeout(this.zoneUpdateTimers.get(driverId));
        }

        // Store pending update
        this.pendingZoneUpdates.set(driverId, {
            zone: detectedZone,
            zoneId: newZoneId,
            timestamp: Date.now(),
            latitude,
            longitude,
            status,
            queuePosition,
        });

        // Set new timer
        const timer = setTimeout(async () => {
            const pending = this.pendingZoneUpdates.get(driverId);
            if (!pending) {
                return;
            }

            try {
                const timestamp = new Date().toISOString();

                // Write to DB
                await this.updateDriverZoneMetadata(driver, (dispatchMeta) => ({
                    ...dispatchMeta,
                    status: pending.status,
                    currentZone: pending.zoneId
                        ? {
                            id: pending.zoneId,
                            name: pending.zone?.name || null,
                            updatedAt: timestamp,
                            queuePosition: pending.queuePosition,
                        }
                        : null,
                    lastZoneCheck: {
                        latitude: pending.latitude,
                        longitude: pending.longitude,
                        zoneId: pending.zoneId,
                        updatedAt: timestamp,
                    },
                }));

                console.log(`✅ Zone update written to DB for driver ${driverId} (debounced)`);
            } catch (error) {
                console.error(`❌ Error writing debounced zone update for driver ${driverId}:`, error);
            } finally {
                // Cleanup
                this.pendingZoneUpdates.delete(driverId);
                this.zoneUpdateTimers.delete(driverId);
            }
        }, ZONE_UPDATE_DEBOUNCE_MS);

        this.zoneUpdateTimers.set(driverId, timer);
    }

    async setDriverZoneFromClient(driverId, zoneId) {
        const driver = await this.getDriverRecord(driverId);
        if (!driver?.companyId) {
            return false;
        }

        const normalizedZoneId = zoneId || null;
        const currentStatus = await this.getDriverDispatchStatus(driverId);
        const previousZoneId =
            driver.preferences?.dispatch?.currentZone?.id || null;

        if (previousZoneId && previousZoneId !== normalizedZoneId) {
            await this.removeDriverFromAllQueues(driverId, driver.companyId);
        }

        let zone = null;
        let queuePosition = null;

        if (normalizedZoneId) {
            zone = await prisma.zone.findUnique({
                where: { id: normalizedZoneId },
                select: {
                    id: true,
                    name: true,
                    companyId: true,
                    queue: true,
                },
            });

            if (!zone) {
                return false;
            }

            if (currentStatus === 'AVAILABLE') {
                const result = await this.addDriverToZoneQueue(driverId, zone.id);
                if (result?.queue) {
                    const index = result.queue.indexOf(driverId);
                    queuePosition = index >= 0 ? index + 1 : null;
                }
            } else {
                await this.ensureDriverRemovedFromZone(driverId, zone.id);
            }
        }

        const timestamp = new Date().toISOString();

        await this.updateDriverZoneMetadata(driver, (dispatchMeta) => ({
            ...dispatchMeta,
            status: currentStatus,
            currentZone: zone
                ? {
                    id: zone.id,
                    name: zone.name || null,
                    updatedAt: timestamp,
                    queuePosition,
                }
                : null,
            lastZoneCheck: {
                zoneId: zone?.id || null,
                updatedAt: timestamp,
            },
        }));

        await this.emitDriverZoneChange(driver, {
            driverId,
            zoneId: zone?.id || null,
            zoneName: zone?.name || null,
            queuePosition,
            status: currentStatus,
            updatedAt: timestamp,
        });

        return true;
    }

    async handleDriverStatusChange(driverId, newStatus) {
        const driver = await this.getDriverRecord(driverId);
        if (!driver?.companyId) {
            return false;
        }

        const dispatchMeta = await this.updateDriverZoneMetadata(driver, (dispatchMeta) => ({
            ...dispatchMeta,
            status: newStatus,
        }));

        let currentZoneId =
            dispatchMeta?.currentZone?.id ||
            driver.preferences?.dispatch?.currentZone?.id ||
            null;

        // If driver is going AVAILABLE but has no zone, try to detect zone from location
        if (newStatus === 'AVAILABLE' && !currentZoneId) {
            console.log(`[QueueManagement] Driver ${driverId} has no zone, attempting location-based detection...`);

            // Get latest location
            const locationUpdate = await prisma.locationUpdate.findFirst({
                where: { driverId },
                orderBy: { createdAt: 'desc' },
                select: { latitude: true, longitude: true }
            });

            if (locationUpdate && locationUpdate.latitude && locationUpdate.longitude) {
                console.log(`[QueueManagement] Using location: ${locationUpdate.latitude}, ${locationUpdate.longitude}`);

                // Update zone membership based on current location
                const zoneUpdate = await this.updateDriverZoneMembership(
                    driverId,
                    locationUpdate.latitude,
                    locationUpdate.longitude
                );

                if (zoneUpdate?.zoneId) {
                    currentZoneId = zoneUpdate.zoneId;
                    console.log(`[QueueManagement] Driver ${driverId} auto-assigned to zone: ${currentZoneId}`);
                } else {
                    console.log(`[QueueManagement] Driver ${driverId} location not in any zone`);
                }
            } else {
                console.log(`[QueueManagement] No location data for driver ${driverId}`);
            }
        }

        if (newStatus === 'AVAILABLE' && currentZoneId) {
            await this.addDriverToZoneQueue(driverId, currentZoneId);
        } else if (newStatus !== 'AVAILABLE') {
            await this.removeDriverFromAllQueues(driverId, driver.companyId);
        }

        await this.emitDriverZoneChange(driver, {
            driverId,
            zoneId: currentZoneId,
            status: newStatus,
            updatedAt: new Date().toISOString(),
        });

        return true;
    }

    async getDriverDispatchSnapshot(driverId) {
        const driver = await this.getDriverRecord(driverId);
        if (!driver?.companyId) {
            return null;
        }

        const dispatchMeta = driver.preferences?.dispatch || {};
        const status = dispatchMeta.status || (await this.getDriverDispatchStatus(driverId));
        const zoneMeta = dispatchMeta.currentZone || null;

        return {
            driverId,
            companyId: driver.companyId,
            status,
            zone: zoneMeta
                ? {
                    id: zoneMeta.id || null,
                    name: zoneMeta.name || null,
                    queuePosition: zoneMeta.queuePosition ?? null,
                    updatedAt: zoneMeta.updatedAt || dispatchMeta.lastStatusUpdate || null,
                }
                : null,
            queuePosition: zoneMeta?.queuePosition ?? null,
            lastStatusUpdate: dispatchMeta.lastStatusUpdate || null,
            lastZoneCheck: dispatchMeta.lastZoneCheck || null,
        };
    }

    async getCompanyZoneQueues(companyId) {
        if (!companyId) {
            return [];
        }

        const zones = await prisma.zone.findMany({
            where: { companyId },
            select: {
                id: true,
                name: true,
                queue: true,
            },
        });

        if (!zones.length) {
            return [];
        }

        const driverIds = unique(
            zones
                .map((zone) => normalizeQueue(zone.queue))
                .flat()
        );

        const drivers = driverIds.length
            ? await prisma.user.findMany({
                where: { id: { in: driverIds } },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                    preferences: true,
                },
            })
            : [];

        const driverMap = drivers.reduce((acc, driver) => {
            acc[driver.id] = {
                id: driver.id,
                firstName: driver.firstName,
                lastName: driver.lastName,
                status: driver.status,
                dispatch: cloneJson(driver.preferences?.dispatch),
            };
            return acc;
        }, {});

        return zones.map((zone) => {
            const queue = normalizeQueue(zone.queue);
            return {
                zoneId: zone.id,
                zoneName: zone.name,
                queue: queue.map((driverId, index) => ({
                    driverId,
                    position: index + 1,
                    driver: driverMap[driverId] || null,
                })),
            };
        });
    }
}

module.exports = QueueManagementService;
