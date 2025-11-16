const prisma = require('../lib/prisma');
const QueueManagementService = require('../services/queueManagementService');
const jobService = require('../services/jobService');

const NAMESPACES = {
    DISPATCH: '/dispatch',
    OWNER: '/owner',
    DRIVER: '/driver',
    PASSENGER: '/customer',
};

const timestampNow = () => new Date().toISOString();

const sanitizeNumber = (value) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const safeDate = (value) => {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeStatus = (rawStatus) => {
    if (!rawStatus) {
        return null;
    }

    const value = String(rawStatus).trim().toUpperCase();

    switch (value) {
        case 'AVAILABLE':
        case 'ONLINE':
            return 'AVAILABLE';
        case 'BUSY':
        case 'IN_RIDE':
        case 'ON_RIDE':
        case 'ON_THE_WAY':
        case 'ACTIVE':
            return 'BUSY';
        case 'ROGER':
            return 'ROGER';
        case 'AWAY':
        case 'BREAK':
            return 'AWAY';
        case 'OFFLINE':
            return 'OFFLINE';
        default:
            return value;
    }
};

const shiftStatusMap = {
    AVAILABLE: 'ONLINE',
    BUSY: 'BUSY',
    ROGER: 'BUSY',
    AWAY: 'BREAK',
    OFFLINE: 'OFFLINE',
};

const queueStatusMap = {
    AVAILABLE: 'AVAILABLE',
    BUSY: 'BUSY',
    ROGER: 'BUSY',
    AWAY: 'AWAY',
    OFFLINE: 'OFFLINE',
};

const jobProgressStatusMap = {
    OFFERED: 'AVAILABLE',
    ASSIGNED: 'BUSY',
    ACCEPTED: 'BUSY',
    ON_THE_WAY: 'BUSY',
    ARRIVED: 'BUSY',
    ARRIVED_READY: 'BUSY',
    STARTED: 'BUSY',
    ACTIVE: 'BUSY',
    PICKED_UP: 'BUSY',
    IN_PROGRESS: 'BUSY',
    REACHED: 'BUSY',
    COMPLETED: 'AVAILABLE',
    FINISHED: 'AVAILABLE',
    CANCELLED: 'AVAILABLE',
    CANCELED: 'AVAILABLE',
    REJECTED: 'AVAILABLE',
    NOSHOW: 'AVAILABLE',
    NO_SHOW: 'AVAILABLE',
    RECALL: 'AVAILABLE',
    RECALLED: 'AVAILABLE',
    UNASSIGNED: 'AVAILABLE',
    PENDING: 'AVAILABLE',
};

const assignmentStatusMap = {
    OFFERED: 'OFFERED',
    ASSIGNED: 'ASSIGNED',
    ACCEPTED: 'ASSIGNED',
    ON_THE_WAY: 'ASSIGNED',
    ARRIVED: 'ASSIGNED',
    ARRIVED_READY: 'ASSIGNED',
    STARTED: 'ASSIGNED',
    ACTIVE: 'ASSIGNED',
    PICKED_UP: 'ASSIGNED',
    IN_PROGRESS: 'ASSIGNED',
    REACHED: 'ASSIGNED',
    COMPLETED: 'COMPLETED',
    FINISHED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    CANCELED: 'CANCELLED',
    REJECTED: 'REJECTED',
    NOSHOW: 'CANCELLED',
    NO_SHOW: 'CANCELLED',
    RECALL: 'CANCELLED',
    RECALLED: 'CANCELLED',
    UNASSIGNED: 'CANCELLED',
    PENDING: 'CANCELLED',
};

const clearDriverFromJobStatuses = new Set([
    'REJECTED',
    'NOSHOW',
    'NO_SHOW',
    'RECALL',
    'RECALLED',
    'CANCELLED',
    'CANCELED',
    'UNASSIGNED',
    'PENDING',
]);
const returnToQueueStatuses = new Set(['REJECTED', 'RECALL', 'RECALLED']);
const ACTIVE_DRIVER_JOB_STATUSES = new Set([
    'ASSIGNED',
    'ACCEPTED',
    'ON_THE_WAY',
    'ARRIVED',
    // 'ARRIVED_READY', // ❌ Not a valid JobStatus in Prisma schema
    'STARTED',
    'ACTIVE',
    'IN_PROGRESS',
    'REACHED',
]);

const COMPLETION_STATUSES = new Set(['COMPLETED', 'FINISHED']);
const TERMINAL_DRIVER_JOB_STATUSES = new Set([
    ...COMPLETION_STATUSES,
    ...clearDriverFromJobStatuses,
]);

const normalizeJobStatus = (status) => {
    if (!status) {
        return undefined;
    }

    const value = String(status).trim().toUpperCase();
    return value || undefined;
};

const normalizeMessageType = (type) => {
    if (!type) {
        return 'TEXT';
    }

    const normalized = String(type).trim().toUpperCase();
    return ['TEXT', 'IMAGE', 'LOCATION', 'SYSTEM'].includes(normalized) ? normalized : 'TEXT';
};

const filterUndefined = (object = {}) =>
    Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

const safeClone = (value, fallback = {}) => {
    if (!value || typeof value !== 'object') {
        return { ...fallback };
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to clone JSON payload for dispatch metadata:', error?.message || error);
        return { ...fallback };
    }
};

const updateDriverCurrentJob = async (driverId, jobId = null) => {
    if (!driverId) {
        return;
    }

    try {
        await prisma.user.update({
            where: { id: driverId },
            data: {
                currentJobId: jobId ?? null,
            },
        });
    } catch (error) {
        console.warn(
            `[Socket] Failed to update current job reference for driver ${driverId}:`,
            error?.message || error
        );
    }
};

const mapLocationForMeta = (location) => {
    if (!location) {
        return null;
    }

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude,
        longitude,
        heading: location.heading ?? null,
        accuracy: location.accuracy ?? null,
        speed: location.speed ?? null,
        timestamp: location.timestamp || timestampNow(),
    };
};

const mergeStatusTimeline = (existingRequirements, status, timestamp) => {
    const base =
        existingRequirements && typeof existingRequirements === 'object'
            ? JSON.parse(JSON.stringify(existingRequirements))
            : {};
    const timeline =
        base.statusTimeline && typeof base.statusTimeline === 'object'
            ? { ...base.statusTimeline }
            : {};
    timeline[status] = timestamp.toISOString();
    base.statusTimeline = timeline;
    return base;
};

const mapZoneForMeta = (zone, queuePosition, timestamp) => {
    if (!zone) {
        return null;
    }

    const normalized = filterUndefined({
        id: zone.id ?? zone.zoneId ?? null,
        name: zone.name ?? zone.zoneName ?? null,
        queuePosition: queuePosition ?? zone.queuePosition ?? null,
        updatedAt: timestamp || zone.updatedAt || timestampNow(),
    });

    if (!normalized.id && !normalized.name && normalized.queuePosition == null) {
        return null;
    }

    return normalized;
};

const updateDriverDispatchPreferences = async (driverId, queueManager, updater) => {
    if (!driverId || typeof updater !== 'function') {
        return null;
    }

    if (queueManager?.getDriverRecord && queueManager?.updateDriverZoneMetadata) {
        try {
            const driverRecord = await queueManager.getDriverRecord(driverId);
            if (!driverRecord) {
                return null;
            }

            return await queueManager.updateDriverZoneMetadata(driverRecord, updater);
        } catch (error) {
            console.warn('Queue manager metadata update failed:', error?.message || error);
        }
    }

    try {
        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: { preferences: true },
        });

        if (!driver) {
            return null;
        }

        const preferences = safeClone(driver.preferences);
        const dispatchMeta =
            preferences.dispatch && typeof preferences.dispatch === 'object'
                ? { ...preferences.dispatch }
                : {};

        const updatedDispatch = updater(dispatchMeta) || dispatchMeta;
        const nextPreferences = {
            ...preferences,
            dispatch: updatedDispatch,
        };

        await prisma.user.update({
            where: { id: driverId },
            data: { preferences: nextPreferences },
        });

        return nextPreferences.dispatch;
    } catch (error) {
        console.warn('Failed to persist driver dispatch preferences:', error?.message || error);
        return null;
    }
};

const buildStatusPayload = ({
    driverId,
    companyId,
    status,
    reason,
    jobId,
    location,
    dispatch,
    currentJobId,
}) => ({
    driverId,
    companyId,
    status,
    driverStatus: status,
    reason: reason || 'socket_update',
    jobId: jobId ?? null,
    currentJobId: currentJobId ?? dispatch?.currentJobId ?? jobId ?? null,
    location: location ?? undefined,
    queuePosition: dispatch?.queuePosition ?? dispatch?.zone?.queuePosition ?? null,
    zone: dispatch?.zone ?? null,
    dispatch: dispatch ?? undefined,
    timestamp: timestampNow(),
});

const buildLocationPayload = ({
    driverId,
    companyId,
    location,
    zoneUpdate,
    dispatch,
}) => ({
    driverId,
    companyId,
    location,
    zone: zoneUpdate ?? dispatch?.zone ?? null,
    queuePosition: dispatch?.queuePosition ?? zoneUpdate?.queuePosition ?? null,
    dispatch: dispatch ?? undefined,
    timestamp: timestampNow(),
});

const buildJobBroadcastPayload = (jobRecord, { rawPayload = {}, dispatchSnapshot = null } = {}) => {
    if (!jobRecord) {
        return null;
    }

    return {
        driverId: jobRecord.assignedDriverId,
        companyId: jobRecord.companyId,
        jobId: jobRecord.id,
        jobCode: jobRecord.jobId,
        status: jobRecord.status,
        progressStatus: rawPayload.progressStatus || rawPayload.status || null,
        queuePosition: dispatchSnapshot?.queuePosition ?? dispatchSnapshot?.zone?.queuePosition ?? null,
        zone: dispatchSnapshot?.zone ?? null,
        dispatch: dispatchSnapshot ?? undefined,
        job: {
            id: jobRecord.id,
            jobId: jobRecord.jobId,
            status: jobRecord.status,
            progressStatus: rawPayload.progressStatus || rawPayload.status || null,
            type: jobRecord.type,
            customerId: jobRecord.customerId,
            assignedDriverId: jobRecord.assignedDriverId,
            pickupAddress: jobRecord.pickupAddress,
            pickupLatitude: jobRecord.pickupLatitude,
            pickupLongitude: jobRecord.pickupLongitude,
            dropoffAddress: jobRecord.dropoffAddress,
            dropoffLatitude: jobRecord.dropoffLatitude,
            dropoffLongitude: jobRecord.dropoffLongitude,
            estimatedPrice: jobRecord.estimatedPrice,
            estimatedDistance: jobRecord.estimatedDistance,
            estimatedArrival: jobRecord.estimatedArrival,
            instructions: jobRecord.instructions,
            requirements: jobRecord.requirements,
            metadata: rawPayload.metadata || rawPayload.details || null,
            createdAt: jobRecord.createdAt,
            updatedAt: jobRecord.updatedAt,
            customer: jobRecord.customer
                ? {
                    id: jobRecord.customer.id,
                    firstName: jobRecord.customer.firstName,
                    lastName: jobRecord.customer.lastName,
                    phone: jobRecord.customer.phone,
                }
                : null,
        },
        timestamp: timestampNow(),
    };
};

const buildJobProgressPayload = ({
    driverId,
    companyId,
    jobId,
    progressStatus,
    metrics,
    dispatch,
}) => ({
    driverId,
    companyId,
    jobId,
    progressStatus,
    metrics,
    currentJobId: dispatch?.currentJobId ?? jobId ?? null,
    queuePosition: dispatch?.queuePosition ?? dispatch?.zone?.queuePosition ?? null,
    dispatch: dispatch ?? undefined,
    timestamp: timestampNow(),
});

const buildMessagePayload = (messageRecord, { companyId, dispatchSnapshot }) => ({
    id: messageRecord.id,
    driverId: messageRecord.senderId,
    companyId,
    jobId: messageRecord.jobId,
    receiverId: messageRecord.receiverId,
    content: messageRecord.content,
    messageType: messageRecord.messageType,
    attachments: messageRecord.attachments || null,
    dispatch: dispatchSnapshot ?? undefined,
    queuePosition: dispatchSnapshot?.queuePosition ?? null,
    sender: messageRecord.sender
        ? {
            id: messageRecord.sender.id,
            firstName: messageRecord.sender.firstName,
            lastName: messageRecord.sender.lastName,
            phone: messageRecord.sender.phone,
        }
        : { id: messageRecord.senderId },
    createdAt: messageRecord.createdAt,
    timestamp: timestampNow(),
});

const persistLocationUpdate = async (driverId, location) => {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
        return null;
    }

    try {
        // ✅ FIX: Validate driver exists before saving location
        const driverExists = await prisma.user.findUnique({
            where: { id: driverId },
            select: { id: true },
        });
        
        if (!driverExists) {
            console.warn(`⚠️ Cannot save location - driver ${driverId} not found in database`);
            return null;
        }
        
        await prisma.locationUpdate.create({
            data: {
                driverId,
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy ?? null,
                heading: location.heading ?? null,
                speed: location.speed ?? null,
                timestamp: location.timestamp ? new Date(location.timestamp) : new Date(),
            },
        });
    } catch (error) {
        console.warn('Failed to persist location update:', error?.message || error);
    }

    return {
        latitude: location.latitude,
        longitude: location.longitude,
        heading: location.heading ?? null,
        accuracy: location.accuracy ?? null,
        speed: location.speed ?? null,
        timestamp: location.timestamp || timestampNow(),
    };
};

const persistJobData = async (driverId, companyId, payload = {}) => {
    const jobIdentifier = payload.jobId || payload.jobCode || payload.id;
    if (!jobIdentifier) {
        return null;
    }

    const status = normalizeJobStatus(payload.status || payload.jobStatus || payload.progressStatus);
    const pickup = payload.pickup || {};
    const dropoff = payload.dropoff || {};
    const metadata = payload.metadata || payload.details || null;

    const dataToPersist = filterUndefined({
        assignedDriverId: driverId,
        customerId: payload.customerId,
        status,
        vehicleType: payload.vehicleType,
        pickupAddress: payload.pickupAddress ?? pickup.address,
        pickupLatitude: sanitizeNumber(payload.pickupLatitude ?? pickup.latitude),
        pickupLongitude: sanitizeNumber(payload.pickupLongitude ?? pickup.longitude),
        dropoffAddress: payload.dropoffAddress ?? dropoff.address,
        dropoffLatitude: sanitizeNumber(payload.dropoffLatitude ?? dropoff.latitude),
        dropoffLongitude: sanitizeNumber(payload.dropoffLongitude ?? dropoff.longitude),
        estimatedPrice: sanitizeNumber(payload.estimatedPrice ?? payload.estimatedFare),
        estimatedDistance: sanitizeNumber(payload.estimatedDistance ?? payload.distance),
        estimatedArrival: safeDate(payload.estimatedArrival)?.toISOString(),
        paymentMethod: payload.paymentMethod,
        instructions: payload.instructions ?? payload.notes,
        requirements: metadata || payload.requirements || undefined,
    });

    const jobRecord = await prisma.job.upsert({
        where: { jobId: jobIdentifier },
        create: {
            jobId: jobIdentifier,
            companyId,
            status: dataToPersist.status || 'PENDING',
            assignedDriverId: driverId,
            pickupAddress: dataToPersist.pickupAddress ?? null,
            pickupLatitude: dataToPersist.pickupLatitude ?? null,
            pickupLongitude: dataToPersist.pickupLongitude ?? null,
            dropoffAddress: dataToPersist.dropoffAddress ?? null,
            dropoffLatitude: dataToPersist.dropoffLatitude ?? null,
            dropoffLongitude: dataToPersist.dropoffLongitude ?? null,
            estimatedPrice: dataToPersist.estimatedPrice ?? null,
            estimatedDistance: dataToPersist.estimatedDistance ?? null,
            estimatedArrival: dataToPersist.estimatedArrival ? new Date(dataToPersist.estimatedArrival) : null,
            paymentMethod: dataToPersist.paymentMethod ?? null,
            instructions: dataToPersist.instructions ?? null,
            requirements: dataToPersist.requirements ?? null,
        },
        update: {
            ...filterUndefined({
                ...dataToPersist,
                estimatedArrival: dataToPersist.estimatedArrival
                    ? new Date(dataToPersist.estimatedArrival)
                    : undefined,
            }),
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
    });

    return jobRecord;
};

const sanitizeLocationPayload = (raw = null) => {
    if (!raw) {
        return null;
    }

    const latitude = sanitizeNumber(raw.latitude ?? raw.lat);
    const longitude = sanitizeNumber(raw.longitude ?? raw.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude,
        longitude,
        accuracy: sanitizeNumber(raw.accuracy),
        heading: sanitizeNumber(raw.heading),
        speed: sanitizeNumber(raw.speed),
        timestamp: raw.timestamp || timestampNow(),
        address: raw.address ?? null,
    };
};

const buildDropoffOverride = (status, payload = {}, location = null) => {
    if (!location || !COMPLETION_STATUSES.has(status)) {
        return null;
    }

    const dropoffAddress =
        payload.dropoffAddress ??
        payload.dropoff?.address ??
        location.address ??
        null;

    return {
        dropoffLatitude: location.latitude,
        dropoffLongitude: location.longitude,
        dropoffAddress,
    };
};

const persistDriverMessage = async (driverId, payload = {}) => {
    const messageType = normalizeMessageType(payload.messageType);
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    const attachments =
        payload.attachments && typeof payload.attachments === 'object'
            ? payload.attachments
            : null;
    const hasAttachment = attachments && Object.keys(attachments).length > 0;

    if (!content && !hasAttachment) {
        throw new Error('Message requires text content or attachments.');
    }

    const messageRecord = await prisma.message.create({
        data: {
            senderId: driverId,
            receiverId: payload.receiverId || null,
            jobId: payload.jobId || null,
            content,
            messageType,
            attachments: hasAttachment ? attachments : null,
        },
        include: {
            sender: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                },
            },
        },
    });

    return messageRecord;
};

const broadcastToRooms = (namespace, rooms, event, payload) => {
    console.log(`[Socket Broadcast] Event: ${event}, Rooms: ${rooms.join(', ')}`);
    rooms.forEach((room) => namespace.to(room).emit(event, payload));
};

module.exports = (io, socket, driverId, companyId, queueService) => {
    if (!io || !socket || !driverId || !companyId) {
        console.warn('Enhanced driver status handlers initialised without required context');
        return;
    }

    const dispatchNamespace = io.of(NAMESPACES.DISPATCH);
    const ownerNamespace = io.of(NAMESPACES.OWNER);
    const driverNamespace = io.of(NAMESPACES.DRIVER);
    const passengerNamespace = io.of(NAMESPACES.PASSENGER);
    const queueManager = queueService || new QueueManagementService(io);

    const dispatchRooms = [`dispatch_${companyId}`, `company_${companyId}`, 'super_admin', 'all_dispatchers'];
    const ownerRooms = [`company_${companyId}`];
    const driverRooms = [`company:${companyId}`];

    const getDispatchSnapshot = async () =>
        queueManager?.getDriverDispatchSnapshot
            ? await queueManager.getDriverDispatchSnapshot(driverId)
            : null;

    const broadcastStatus = (payload) => {
        console.log(`[BROADCAST STATUS] Driver: ${driverId}, Status: ${payload.status || payload.driverStatus}`);
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:status:update', payload);
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:status:updated', payload);
        ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driver:status:updated', payload));
        driverRooms.forEach((room) => driverNamespace.to(room).emit('driver:status:peer', payload));
    };

    const broadcastLocation = (payload) => {
        console.log(`[BROADCAST LOCATION] Driver: ${driverId}, Lat: ${payload.location?.latitude}, Lng: ${payload.location?.longitude}`);
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:location:update', payload);
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'driverLocationUpdate', payload);
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:location:realtime', payload);
        ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driverLocationUpdate', payload));
    };

    const broadcastJobUpdate = (payload, notifyPassenger = true) => {
        if (!payload) {
            return;
        }

        broadcastToRooms(dispatchNamespace, dispatchRooms, 'job:data:updated', payload);
        ownerRooms.forEach((room) => ownerNamespace.to(room).emit('job:data:updated', payload));
        driverRooms.forEach((room) => driverNamespace.to(room).emit('job:data:peer', payload));

        if (notifyPassenger && passengerNamespace && payload.job) {
            if (payload.job.customerId) {
                passengerNamespace
                    .to(`customer_${payload.job.customerId}`)
                    .emit('job:data:updated', payload);
            }

            if (payload.job.jobId) {
                passengerNamespace.to(`job_${payload.job.jobId}`).emit('job:data:updated', payload);
            }
        }
    };

    const broadcastJobProgress = (payload) => {
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'job:progress:updated', payload);
        ownerRooms.forEach((room) => ownerNamespace.to(room).emit('job:progress:updated', payload));
        if (passengerNamespace) {
            passengerNamespace.to(`job_${payload.jobId}`).emit('job:progress:updated', payload);
        }
    };

    const broadcastMessage = (payload) => {
        broadcastToRooms(dispatchNamespace, dispatchRooms, 'chat:message:new', payload);
        ownerRooms.forEach((room) => ownerNamespace.to(room).emit('chat:message:new', payload));
        driverRooms.forEach((room) => driverNamespace.to(room).emit('chat:message:peer', payload));
    };

    socket.on('driver:status:update', async (payload = {}) => {
        try {
            const status = normalizeStatus(
                payload.newStatus ?? payload.status ?? payload.driverStatus,
            );
            const eventId = payload.eventId ?? null;

            if (!status) {
                return;
            }

            const location = payload.location
                ? {
                    latitude: Number(payload.location.latitude),
                    longitude: Number(payload.location.longitude),
                    heading: payload.location.heading ?? null,
                    accuracy: payload.location.accuracy ?? null,
                    speed: payload.location.speed ?? null,
                    timestamp: payload.location.timestamp || timestampNow(),
                }
                : null;

            const shiftStatus = shiftStatusMap[status];
            if (shiftStatus) {
                await prisma.shift.updateMany({
                    where: { driverId, endTime: null },
                    data: { status: shiftStatus, updatedAt: new Date() },
                });
            }

            const queueStatus = queueStatusMap[status];
            if (queueStatus && queueManager?.handleDriverStatusChange) {
                await queueManager.handleDriverStatusChange(driverId, queueStatus);
            }

            const persistedLocation = location ? await persistLocationUpdate(driverId, location) : null;
            const dispatchSnapshot = await getDispatchSnapshot();

            const statusPayload = buildStatusPayload({
                driverId,
                companyId,
                status,
                reason: payload.reason,
                jobId: payload.jobId,
                location: persistedLocation,
                dispatch: dispatchSnapshot,
                currentJobId: dispatchSnapshot?.currentJobId ?? payload.jobId ?? null,
            });

            const locationMeta = mapLocationForMeta(persistedLocation);
            const zoneMeta = mapZoneForMeta(statusPayload.zone, statusPayload.queuePosition, statusPayload.timestamp);

            await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => {
                const nextMeta = {
                    ...dispatchMeta,
                    status,
                    lastStatusUpdate: statusPayload.timestamp,
                };

                if (locationMeta) {
                    nextMeta.lastKnownLocation = locationMeta;
                    nextMeta.lastLocationUpdate = locationMeta.timestamp;
                }

                if (zoneMeta) {
                    nextMeta.currentZone = zoneMeta;
                } else if (dispatchSnapshot && !dispatchSnapshot.zone) {
                    nextMeta.currentZone = null;
                }

                if (statusPayload.currentJobId !== undefined) {
                    nextMeta.currentJobId = statusPayload.currentJobId;
                }

                return nextMeta;
            });

            broadcastStatus(statusPayload);

            socket.emit('server:status:confirmed', {
                success: true,
                driverId,
                status,
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
                eventId,
            });
        } catch (error) {
            console.error('Failed to process driver status update:', error);

            socket.emit('server:status:error', {
                success: false,
                driverId,
                error: error?.message || 'Status update failed',
                timestamp: timestampNow(),
                eventId: payload.eventId ?? null,
            });
        }
    });

    socket.on('driver:location:update', async (payload = {}) => {
        try {
            const locationPayload = payload.location ?? payload;
            const latitude = sanitizeNumber(locationPayload.latitude);
            const longitude = sanitizeNumber(locationPayload.longitude);
            
            // ✨ NEW: Extract appState from payload (sent by mobile app)
            const appState = payload.appState || 'ACTIVE';

            if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
                return;
            }

            const persistedLocation = await persistLocationUpdate(driverId, {
                latitude: Number(latitude),
                longitude: Number(longitude),
                heading: locationPayload.heading ?? null,
                accuracy: locationPayload.accuracy ?? null,
                speed: locationPayload.speed ?? null,
                timestamp: locationPayload.timestamp || timestampNow(),
            });

            let zoneUpdate = null;
            if (queueManager?.updateDriverZoneMembership) {
                try {
                    zoneUpdate = await queueManager.updateDriverZoneMembership(
                        driverId,
                        persistedLocation.latitude,
                        persistedLocation.longitude,
                    );
                } catch (zoneError) {
                    console.warn('Failed to update driver zone membership:', zoneError?.message || zoneError);
                }
            }

            const dispatchSnapshot = zoneUpdate
                ? {
                    driverId,
                    companyId,
                    status: zoneUpdate.status,
                    zone: {
                        id: zoneUpdate.zoneId,
                        name: zoneUpdate.zoneName,
                        queuePosition: zoneUpdate.queuePosition ?? null,
                        updatedAt: zoneUpdate.updatedAt,
                    },
                    queuePosition: zoneUpdate.queuePosition ?? null,
                }
                : await getDispatchSnapshot();

            const locationEventPayload = buildLocationPayload({
                driverId,
                companyId,
                location: persistedLocation,
                zoneUpdate,
                dispatch: dispatchSnapshot,
            });
            
            // ✨ NEW: Add appState to location payload for dispatch
            locationEventPayload.appState = appState;
            locationEventPayload.isMinimized = appState === 'BACKGROUND' || appState === 'INACTIVE';
            locationEventPayload.isForeground = appState === 'ACTIVE';

            const locationMeta = mapLocationForMeta(locationEventPayload.location);
            const zoneMeta = mapZoneForMeta(
                locationEventPayload.zone,
                locationEventPayload.queuePosition,
                locationEventPayload.timestamp,
            );

            await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => {
                const nextMeta = { ...dispatchMeta };

                const metaTimestamp = locationEventPayload.location?.timestamp || locationEventPayload.timestamp;
                if (metaTimestamp) {
                    nextMeta.lastLocationUpdate = metaTimestamp;
                }

                if (locationMeta) {
                    nextMeta.lastKnownLocation = locationMeta;
                }

                if (zoneMeta) {
                    nextMeta.currentZone = zoneMeta;
                } else if (zoneUpdate && zoneUpdate.zoneId === null) {
                    nextMeta.currentZone = null;
                }
                
                // ✨ NEW: Store appState in driver preferences
                nextMeta.appState = appState;
                nextMeta.appStateUpdatedAt = locationEventPayload.timestamp;

                return nextMeta;
            });

            broadcastLocation(locationEventPayload);

            if (zoneUpdate) {
                // ✅ FIX: Send zone change to the DRIVER who moved (not just dispatch/owner)
                socket.emit('driver:zone:changed', zoneUpdate);
                console.log(`📍 Zone change sent to driver ${driverId}:`, zoneUpdate);
                
                // Also broadcast to dispatch and owner for monitoring
                broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:zone:changed', zoneUpdate);
                ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driver:zone:changed', zoneUpdate));
            }
        } catch (error) {
            console.error('Failed to process driver location update:', error);

            socket.emit('server:location:error', {
                driverId,
                error: error?.message || 'Location update failed',
                timestamp: timestampNow(),
            });
        }
    });

    socket.on('driver:job:update', async (payload = {}) => {
        try {
            const jobRecord = await persistJobData(driverId, companyId, payload);
            if (!jobRecord) {
                return;
            }

            const dispatchSnapshot = await getDispatchSnapshot();
            const jobBroadcastPayload = buildJobBroadcastPayload(jobRecord, {
                rawPayload: payload,
                dispatchSnapshot,
            });

            broadcastJobUpdate(jobBroadcastPayload, payload.notifyPassenger !== false);

            socket.emit('server:job:update:confirmed', {
                success: true,
                driverId,
                companyId,
                jobId: jobRecord.id,
                jobCode: jobRecord.jobId,
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to process driver job update:', error);

            socket.emit('server:job:update:error', {
                success: false,
                driverId,
                companyId,
                jobId: payload.jobId || payload.jobCode || null,
                error: error?.message || 'Job update failed',
                timestamp: timestampNow(),
            });
        }
    });

    socket.on('driver:message:send', async (payload = {}) => {
        try {
            const messageRecord = await persistDriverMessage(driverId, payload);
            const dispatchSnapshot = await getDispatchSnapshot();

            const messagePayload = buildMessagePayload(messageRecord, {
                companyId,
                dispatchSnapshot,
            });

            broadcastMessage(messagePayload);

            socket.emit('server:message:sent', {
                success: true,
                driverId,
                companyId,
                messageId: messageRecord.id,
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to process driver chat message:', error);

            socket.emit('server:message:error', {
                success: false,
                driverId,
                companyId,
                error: error?.message || 'Message delivery failed',
                timestamp: timestampNow(),
            });
        }
    });

    socket.on('driver:job:progress', async (payload = {}) => {
        try {
            const { jobId, metrics = {} } = payload;
            let { progressStatus } = payload;
            let normalizedProgressStatus = normalizeJobStatus(progressStatus);
            const sanitizedLocation = sanitizeLocationPayload(payload.location);

            console.log(`📊 Driver ${driverId} sent job progress:`, { jobId, progressStatus, metrics });

            if (!jobId || !progressStatus) {
                console.log('❌ Missing jobId or progressStatus');
                return;
            }

            if (sanitizedLocation) {
                await persistLocationUpdate(driverId, sanitizedLocation);
            }

            const dropoffOverride = buildDropoffOverride(
                normalizedProgressStatus,
                payload,
                sanitizedLocation,
            );

            // Update assignment table when driver accepts offered job
            if (normalizedProgressStatus === 'ACCEPTED') {
                console.log(`🔄 Processing ACCEPTED status - will update to ASSIGNED for job ${jobId}`);
                // Update Job status to ASSIGNED (not ACCEPTED)
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: 'ASSIGNED',
                        metrics: {
                            ...metrics,
                            lastUpdate: new Date(),
                        },
                        lastProgressUpdate: new Date(),
                    },
                });

                await updateDriverCurrentJob(driverId, jobId);

                // Update Assignment table from OFFERED to ASSIGNED
                await prisma.assignments.updateMany({
                    where: {
                        jobId,
                        driverId,
                        status: 'OFFERED'
                    },
                    data: {
                        status: 'ASSIGNED',
                        acceptedAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                await prisma.offer.updateMany({
                    where: {
                        jobId,
                        driverId,
                        status: { in: ['SENT', 'ASSIGNED'] },
                    },
                    data: {
                        status: 'ACCEPTED',
                        response: 'ACCEPTED',
                        respondedAt: new Date(),
                    },
                });

                jobService.clearOfferExpiryTimer(jobId);
                console.log(`✅ Job ${jobId} and Assignment updated to ASSIGNED - accepted by driver ${driverId}`);

                // Override progressStatus to ASSIGNED for broadcasts and events
                progressStatus = 'ASSIGNED';
                normalizedProgressStatus = 'ASSIGNED';
            } else {
                // For other status updates, update normally
                const shouldClearDriver = clearDriverFromJobStatuses.has(normalizedProgressStatus);
                const finalJobStatus = returnToQueueStatuses.has(normalizedProgressStatus)
                    ? 'UNASSIGNED'
                    : normalizedProgressStatus;

                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: finalJobStatus,
                        ...(shouldClearDriver ? { assignedDriverId: null } : {}),
                        ...(dropoffOverride ?? {}),
                        metrics: {
                            ...metrics,
                            lastUpdate: new Date(),
                        },
                        lastProgressUpdate: new Date(),
                    },
                });

                if (shouldClearDriver || TERMINAL_DRIVER_JOB_STATUSES.has(normalizedProgressStatus)) {
                    await updateDriverCurrentJob(driverId, null);
                } else if (ACTIVE_DRIVER_JOB_STATUSES.has(normalizedProgressStatus)) {
                    await updateDriverCurrentJob(driverId, jobId);
                }

                if (shouldClearDriver) {
                    await prisma.assignments.updateMany({
                        where: {
                            jobId,
                            driverId,
                        },
                        data: {
                            status: 'CANCELLED',
                            rejectionReason: normalizedProgressStatus,
                            updatedAt: new Date(),
                        },
                    });
                }

                if (normalizedProgressStatus !== 'OFFERED') {
                    jobService.clearOfferExpiryTimer(jobId);
                }
            }

            let dispatchSnapshot = null;

            const derivedStatus = jobProgressStatusMap[normalizedProgressStatus];
            if (derivedStatus) {
                const queueStatus = queueStatusMap[derivedStatus];
                if (queueStatus && queueManager?.handleDriverStatusChange) {
                    await queueManager.handleDriverStatusChange(driverId, queueStatus);
                }

                dispatchSnapshot = await getDispatchSnapshot();

                const statusPayload = buildStatusPayload({
                    driverId,
                    companyId,
                    status: derivedStatus,
                    reason: 'job_progress',
                    jobId,
                    dispatch: dispatchSnapshot,
                    currentJobId: dispatchSnapshot?.currentJobId ?? (shouldClearDriver ? null : jobId),
                });

                const zoneMeta = mapZoneForMeta(
                    statusPayload.zone,
                    statusPayload.queuePosition,
                    statusPayload.timestamp,
                );

                await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => {
                    const nextMeta = {
                        ...dispatchMeta,
                        status: derivedStatus,
                        lastStatusUpdate: statusPayload.timestamp,
                    };

                    if (zoneMeta) {
                        nextMeta.currentZone = zoneMeta;
                    } else if (dispatchSnapshot && !dispatchSnapshot.zone) {
                        nextMeta.currentZone = null;
                    }

                    if (statusPayload.currentJobId !== undefined) {
                        nextMeta.currentJobId = statusPayload.currentJobId;
                    }

                    return nextMeta;
                });
                broadcastStatus(statusPayload);
            } else {
                dispatchSnapshot = await getDispatchSnapshot();
            }

            const jobProgressPayload = buildJobProgressPayload({
                driverId,
                companyId,
                jobId,
                progressStatus: normalizedProgressStatus,
                metrics,
                location: sanitizedLocation ?? payload.location ?? null,
                dispatch: dispatchSnapshot,
            });

            broadcastJobProgress(jobProgressPayload);

            socket.emit('server:job:confirmed', {
                success: true,
                driverId,
                jobId,
                progressStatus,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to process job progress update:', error);

            socket.emit('server:job:error', {
                success: false,
                driverId,
                jobId: payload.jobId,
                error: error?.message || 'Job progress update failed',
                timestamp: timestampNow(),
            });
        }
    });

    // New standardized event for job progress updates
    socket.on('job:progress:update', async (payload = {}) => {
        try {
            const { jobId, status: jobStatus } = payload;
            const eventId = payload.eventId ?? null;

            if (!jobId || !jobStatus) {
                console.warn('job:progress:update: missing jobId or status');
                return;
            }

            const normalizedStatus = normalizeJobStatus(jobStatus);
            if (!normalizedStatus) {
                console.warn(`job:progress:update: unable to normalize status "${jobStatus}"`);
                return;
            }

            const derivedDriverStatus = jobProgressStatusMap[normalizedStatus];
            const assignmentStatus = assignmentStatusMap[normalizedStatus];
            const shouldClearDriver = clearDriverFromJobStatuses.has(normalizedStatus);
            const shouldReturnToUnassigned = returnToQueueStatuses.has(normalizedStatus);
            const sanitizedLocation = sanitizeLocationPayload(payload.location);
            if (sanitizedLocation) {
                await persistLocationUpdate(driverId, sanitizedLocation);
            }
            const dropoffOverride = buildDropoffOverride(normalizedStatus, payload, sanitizedLocation);

            let progressTimestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
            if (Number.isNaN(progressTimestamp.getTime())) {
                progressTimestamp = new Date();
            }

            console.log('📡 [JOB STATUS] Driver update received', {
                driverId,
                jobId,
                normalizedStatus,
                payloadStatus: payload.status || payload.progressStatus || null,
                timestamp: progressTimestamp.toISOString(),
            });

            // When driver rejects/recalls job, set job status to UNASSIGNED so it becomes available to other drivers
            // PAUSED is a client-only state; persist STARTED in the DB while tracking pause in requirements/timeline
            const finalJobStatus = (() => {
                if (shouldReturnToUnassigned) return 'UNASSIGNED';
                if (normalizedStatus === 'PAUSED') return 'STARTED';
                return normalizedStatus;
            })();

            const existingJobRequirements = await prisma.job.findUnique({
                where: { id: jobId },
                select: { requirements: true },
            });

            const requirementsPayload = mergeStatusTimeline(
                existingJobRequirements?.requirements,
                normalizedStatus,
                progressTimestamp
            );
            const jobTimelineFieldPatch = {};
            if (normalizedStatus === 'STARTED') {
                jobTimelineFieldPatch.startedAt = progressTimestamp;
            }
            if (['COMPLETED', 'FINISHED'].includes(normalizedStatus)) {
                jobTimelineFieldPatch.completedAt = progressTimestamp;
            }

            const prismaJobRecord = await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: finalJobStatus,
                    updatedAt: progressTimestamp,
                    ...(shouldClearDriver
                        ? { assignedDriverId: null }
                        : { assignedDriverId: driverId }),
                    ...(dropoffOverride ?? {}),
                    requirements: requirementsPayload,
                    ...jobTimelineFieldPatch,
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
            });
            const jobRecord = {
                ...prismaJobRecord,
                customer: prismaJobRecord.users_jobs_customerIdTousers || null,
            };

            if (shouldClearDriver || TERMINAL_DRIVER_JOB_STATUSES.has(normalizedStatus)) {
                await updateDriverCurrentJob(driverId, null);
            } else if (ACTIVE_DRIVER_JOB_STATUSES.has(normalizedStatus)) {
                await updateDriverCurrentJob(driverId, jobId);
            }

            if (normalizedStatus !== 'OFFERED') {
                jobService.clearOfferExpiryTimer(jobId);

                const offerStatusUpdate = {};
                if (['ASSIGNED', 'ACCEPTED'].includes(normalizedStatus)) {
                    offerStatusUpdate.status = 'ACCEPTED';
                    offerStatusUpdate.response = 'ACCEPTED';
                } else if (normalizedStatus === 'REJECTED') {
                    offerStatusUpdate.status = 'REJECTED';
                    offerStatusUpdate.response = 'REJECTED';
                } else if (
                    ['CANCELLED', 'CANCELED', 'NOSHOW', 'NO_SHOW', 'RECALL', 'RECALLED'].includes(
                        normalizedStatus
                    )
                ) {
                    offerStatusUpdate.status = 'CANCELLED';
                    offerStatusUpdate.response = normalizedStatus;
                }

                if (Object.keys(offerStatusUpdate).length > 0) {
                    await prisma.offer.updateMany({
                        where: {
                            jobId,
                            driverId,
                            status: { in: ['SENT', 'ACCEPTED'] },
                        },
                        data: {
                            ...offerStatusUpdate,
                            respondedAt: new Date(),
                        },
                    });
                }
            }

            if (assignmentStatus) {
                const activeAssignment = await prisma.assignments.findFirst({
                    where: {
                        jobId,
                        driverId,
                    },
                    orderBy: { assignedAt: 'desc' },
                });

                if (activeAssignment) {
                    const assignmentUpdate = {
                        status: assignmentStatus,
                    };

                    if (assignmentStatus === 'ASSIGNED') {
                        assignmentUpdate.acceptedAt = progressTimestamp;
                        assignmentUpdate.rejectedAt = null;
                        assignmentUpdate.rejectionReason = null;
                    } else if (assignmentStatus === 'REJECTED') {
                        assignmentUpdate.rejectedAt = progressTimestamp;
                        assignmentUpdate.rejectionReason =
                            payload.reason || payload.rejectionReason || 'Driver rejected job';
                    } else if (assignmentStatus === 'CANCELLED') {
                        assignmentUpdate.rejectionReason =
                            payload.reason || payload.rejectionReason || activeAssignment.rejectionReason || null;
                    } else if (assignmentStatus === 'COMPLETED') {
                        assignmentUpdate.acceptedAt =
                            activeAssignment.acceptedAt || activeAssignment.assignedAt;
                    }

                    await prisma.assignments.update({
                        where: { id: activeAssignment.id },
                        data: assignmentUpdate,
                    });
                } else {
                    console.warn(
                        `job:progress:update: no assignment found for job ${jobId} (driver ${driverId})`
                    );
                }
            }

            let dispatchSnapshot = null;

            if (derivedDriverStatus) {
                const queueStatus = queueStatusMap[derivedDriverStatus];
                if (queueStatus && queueManager?.handleDriverStatusChange) {
                    await queueManager.handleDriverStatusChange(driverId, queueStatus);
                }

                dispatchSnapshot = await getDispatchSnapshot();

                const statusPayload = buildStatusPayload({
                    driverId,
                    companyId,
                    status: derivedDriverStatus,
                    reason: 'job_progress',
                    jobId,
                    dispatch: dispatchSnapshot,
                    currentJobId: dispatchSnapshot?.currentJobId ?? (shouldClearDriver ? null : jobId),
                });

                const zoneMeta = mapZoneForMeta(
                    statusPayload.zone,
                    statusPayload.queuePosition,
                    statusPayload.timestamp,
                );

                await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => {
                    const nextMeta = {
                        ...dispatchMeta,
                        status: derivedDriverStatus,
                        lastStatusUpdate: statusPayload.timestamp,
                    };

                    if (zoneMeta) {
                        nextMeta.currentZone = zoneMeta;
                    } else if (dispatchSnapshot && !dispatchSnapshot.zone) {
                        nextMeta.currentZone = null;
                    }

                    if (statusPayload.currentJobId !== undefined) {
                        nextMeta.currentJobId = statusPayload.currentJobId;
                    }

                    return nextMeta;
                });

                broadcastStatus(statusPayload);
            } else {
                dispatchSnapshot = await getDispatchSnapshot();
            }

            const enrichedPayload = {
                ...payload,
                progressStatus: normalizedStatus,
            };
            const jobUpdatePayload = buildJobBroadcastPayload(jobRecord, {
                rawPayload: enrichedPayload,
                dispatchSnapshot,
            });

            if (jobUpdatePayload) {
                broadcastJobUpdate(jobUpdatePayload);
            }

            const jobProgressPayload = {
                driverId,
                companyId,
                jobId: jobRecord.jobId || jobId,
                internalJobId: jobId, // ✅ FIX: Add internal ID so dispatch can find the job
                status: finalJobStatus, // ✅ FIX: Send the final job status (UNASSIGNED for rejected jobs)
                progressStatus: normalizedStatus, // Original driver action (REJECTED, etc.)
                location: sanitizedLocation ?? payload.location ?? null,
                timestamp: payload.timestamp || timestampNow(),
            };

            console.log(`📡 Broadcasting job progress to dispatch:`, {
                jobId: jobProgressPayload.jobId,
                internalJobId: jobProgressPayload.internalJobId,
                status: finalJobStatus,
                progressStatus: normalizedStatus,
                driverCleared: shouldClearDriver
            });

            broadcastJobProgress(jobProgressPayload);

            socket.emit('server:job:progress:confirmed', {
                success: true,
                driverId,
                jobId,
                status: normalizedStatus,
                timestamp: timestampNow(),
                eventId,
            });

            console.log(`✅ Job progress: ${jobId} -> ${normalizedStatus} (driver: ${driverId})`);
        } catch (error) {
            console.error('Failed to process job:progress:update:', error);

            socket.emit('server:job:progress:error', {
                success: false,
                driverId,
                jobId: payload.jobId,
                error: error?.message || 'Job progress update failed',
                timestamp: timestampNow(),
                eventId: payload.eventId ?? null,
            });
        }
    });

    socket.on('driver:shift:start', async (payload = {}) => {
        try {
            await prisma.shift.updateMany({
                where: { driverId, endTime: null },
                data: {
                    status: 'ONLINE',
                    updatedAt: new Date(),
                },
            });

            if (queueManager?.handleDriverStatusChange) {
                await queueManager.handleDriverStatusChange(driverId, 'AVAILABLE');
            }

            const dispatchSnapshot = await getDispatchSnapshot();
            const shiftPayload = {
                driverId,
                companyId,
                status: 'shift_started',
                vehicleId: payload.vehicleId ?? null,
                shiftId: payload.shiftId ?? null,
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            };

            const zoneMeta = mapZoneForMeta(
                dispatchSnapshot?.zone,
                dispatchSnapshot?.queuePosition,
                shiftPayload.timestamp,
            );

            await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => {
                const nextMeta = {
                    ...dispatchMeta,
                    status: 'AVAILABLE',
                    lastStatusUpdate: shiftPayload.timestamp,
                };

                if (zoneMeta) {
                    nextMeta.currentZone = zoneMeta;
                } else if (dispatchSnapshot && !dispatchSnapshot.zone) {
                    nextMeta.currentZone = null;
                }

                return nextMeta;
            });

            broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:shift:updated', shiftPayload);
            ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driver:shift:updated', shiftPayload));

            socket.emit('server:shift:confirmed', {
                success: true,
                driverId,
                status: 'started',
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to start shift via socket:', error);
            socket.emit('server:shift:error', {
                success: false,
                error: error?.message || 'Shift start failed',
            });
        }
    });

    socket.on('driver:shift:end', async () => {
        try {
            await prisma.shift.updateMany({
                where: { driverId, endTime: null },
                data: {
                    status: 'OFFLINE',
                    endTime: new Date(),
                    updatedAt: new Date(),
                },
            });

            if (queueManager?.handleDriverStatusChange) {
                await queueManager.handleDriverStatusChange(driverId, 'OFFLINE');
            }

            const dispatchSnapshot = await getDispatchSnapshot();
            const shiftPayload = {
                driverId,
                companyId,
                status: 'shift_ended',
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            };

            await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => ({
                ...dispatchMeta,
                status: 'OFFLINE',
                lastStatusUpdate: shiftPayload.timestamp,
                currentZone: null,
            }));

            broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:shift:updated', shiftPayload);
            ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driver:shift:updated', shiftPayload));

            socket.emit('server:shift:confirmed', {
                success: true,
                driverId,
                status: 'ended',
                dispatch: dispatchSnapshot ?? undefined,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to end shift via socket:', error);
            socket.emit('server:shift:error', {
                success: false,
                error: error?.message || 'Shift end failed',
            });
        }
    });

    socket.on('driver:queue:position', async () => {
        try {
            const dispatchSnapshot = await getDispatchSnapshot();

            socket.emit('server:queue:position', {
                driverId,
                queuePosition: dispatchSnapshot?.queuePosition ?? null,
                zone: dispatchSnapshot?.zone ?? null,
                timestamp: timestampNow(),
            });
        } catch (error) {
            console.error('Failed to fetch queue position:', error);
        }
    });

    // ✅ LOCATION UPDATE: Save driver's real-time GPS location
    socket.on('driver:location:update', async (payload = {}) => {
        try {
            const { location, appState } = payload;

            if (!location || !location.latitude || !location.longitude) {
                console.warn('driver:location:update: missing location data');
                return;
            }

            // ✅ FIX: Validate driver exists before saving location
            const driverExists = await prisma.user.findUnique({
                where: { id: driverId },
                select: { id: true },
            });
            
            if (!driverExists) {
                console.warn(`⚠️ driver:location:update - driver ${driverId} not found in database`);
                return;
            }

            // Save location to LocationUpdate table
            await prisma.locationUpdate.create({
                data: {
                    driverId,
                    latitude: sanitizeNumber(location.latitude),
                    longitude: sanitizeNumber(location.longitude),
                    accuracy: sanitizeNumber(location.accuracy) || 0,
                    heading: sanitizeNumber(location.heading) || 0,
                    speed: sanitizeNumber(location.speed) || 0,
                    timestamp: safeDate(location.timestamp) || new Date(),
                },
            });

            // Broadcast location to dispatch/owner panels
            const locationPayload = {
                driverId,
                companyId,
                location: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy,
                    heading: location.heading,
                    speed: location.speed,
                },
                appState,
                timestamp: location.timestamp || timestampNow(),
            };

            broadcastToRooms(dispatchNamespace, dispatchRooms, 'driver:location:updated', locationPayload);
            ownerRooms.forEach((room) => ownerNamespace.to(room).emit('driver:location:updated', locationPayload));
        } catch (error) {
            console.error('Failed to process location update:', error);
        }
    });

    // Heartbeat mechanism - update last seen timestamp and resync status if needed
    socket.on('driver:heartbeat', async (payload = {}) => {
        try {
            const heartbeatDate = new Date();
            const heartbeatTimestamp = timestampNow();

            // Update active shift's timestamp to track driver connectivity
            await prisma.shift.updateMany({
                where: {
                    driverId,
                    endTime: null, // Only update active shifts
                },
                data: {
                    updatedAt: heartbeatDate,
                },
            });

            const normalizedHeartbeatStatus = normalizeStatus(payload.status);
            let nextStatus = normalizedHeartbeatStatus;
            let nextJobId = payload.jobId ?? null;

            let currentDispatchStatus = null;
            try {
                const driverRecord = await prisma.user.findUnique({
                    where: { id: driverId },
                    select: { preferences: true },
                });
                const dispatchMeta =
                    driverRecord?.preferences?.dispatch && typeof driverRecord.preferences.dispatch === 'object'
                        ? driverRecord.preferences.dispatch
                        : null;
                if (dispatchMeta?.status) {
                    currentDispatchStatus = normalizeStatus(dispatchMeta.status);
                }
            } catch (metaError) {
                console.warn('⚠️ Unable to read driver dispatch metadata for heartbeat:', metaError?.message || metaError);
            }

            let activeJob = null;
            if (
                !nextStatus &&
                (currentDispatchStatus === 'BUSY' ||
                    currentDispatchStatus === 'AVAILABLE' ||
                    currentDispatchStatus === null)
            ) {
                activeJob = await prisma.job.findFirst({
                    where: {
                        assignedDriverId: driverId,
                        status: { in: Array.from(ACTIVE_DRIVER_JOB_STATUSES) },
                    },
                    select: {
                        id: true,
                        jobId: true,
                    },
                });

                const derivedStatusFromJobs = activeJob ? 'BUSY' : 'AVAILABLE';
                if (!currentDispatchStatus || currentDispatchStatus !== derivedStatusFromJobs) {
                    nextStatus = derivedStatusFromJobs;
                }

                if (activeJob && !nextJobId) {
                    nextJobId = activeJob.id;
                }
            }

            const shouldBroadcastStatus = Boolean(nextStatus && nextStatus !== currentDispatchStatus);

            await updateDriverDispatchPreferences(driverId, queueManager, (dispatchMeta = {}) => ({
                ...dispatchMeta,
                lastHeartbeatAt: heartbeatTimestamp,
                ...(shouldBroadcastStatus ? { status: nextStatus } : {}),
            }));

            if (shouldBroadcastStatus && nextStatus) {
                const queueStatus = queueStatusMap[nextStatus];
                if (queueStatus && queueManager?.handleDriverStatusChange) {
                    await queueManager.handleDriverStatusChange(driverId, queueStatus);
                }

                const dispatchSnapshot = await getDispatchSnapshot();
                const statusPayload = buildStatusPayload({
                    driverId,
                    companyId,
                    status: nextStatus,
                    reason: payload.reason || 'heartbeat_sync',
                    jobId: nextJobId,
                    dispatch: dispatchSnapshot,
                    currentJobId: dispatchSnapshot?.currentJobId ?? nextJobId ?? activeJob?.id ?? null,
                });

                broadcastStatus(statusPayload);
            }

            socket.emit('server:heartbeat:ack', {
                driverId,
                timestamp: heartbeatTimestamp,
            });
        } catch (error) {
            console.error('Failed to process heartbeat:', error);
        }
    });

    // Meter telemetry - live ride metrics streaming
    socket.on('meter:telemetry', async (payload = {}) => {
        try {
            const { jobId, telemetry, location } = payload;

            if (!jobId || !telemetry) {
                console.warn('meter:telemetry: missing jobId or telemetry');
                return;
            }

            // ✅ FIX: Don't save to database (Job model doesn't have metrics field)
            // Telemetry is already tracked in mobile app and will be saved on job completion
            // Just broadcast the real-time data to dispatch/owner panels
            
            // Broadcast meter telemetry to dispatch and owner rooms
            const meterPayload = {
                driverId,
                companyId,
                jobId,
                telemetry: {
                    elapsedSeconds: telemetry.elapsedSeconds,
                    distanceMeters: telemetry.distanceMeters,
                    waitingSeconds: telemetry.waitingSeconds || 0,
                    currentFare: telemetry.currentFare || 0,
                    speedKmh: telemetry.speedKmh || 0,
                },
                location,
                timestamp: payload.timestamp || timestampNow(),
            };

            broadcastToRooms(dispatchNamespace, dispatchRooms, 'meter:telemetry:update', meterPayload);
            ownerRooms.forEach((room) => ownerNamespace.to(room).emit('meter:telemetry:update', meterPayload));

            // Also broadcast to passenger if connected
            if (passengerNamespace) {
                passengerNamespace.to(`job_${jobId}`).emit('meter:telemetry:update', meterPayload);
            }
        } catch (error) {
            console.error('Failed to process meter telemetry:', error);
        }
    });

    socket.on('meter:snapshot', async (payload = {}) => {
        try {
            const { jobId, telemetry, location, routeSegment } = payload;

            if (!jobId || !telemetry) {
                console.warn('meter:snapshot: missing jobId or telemetry');
                return;
            }

            const recordedAt = safeDate(payload.recordedAt) || new Date();
            const normalizedSegment =
                Array.isArray(routeSegment) && routeSegment.length
                    ? routeSegment
                          .map((point) => {
                              const latitude = sanitizeNumber(point.latitude);
                              const longitude = sanitizeNumber(point.longitude);

                              if (latitude === null || longitude === null) {
                                  return null;
                              }

                              const timestamp =
                                  point.timestamp !== undefined && point.timestamp !== null
                                      ? safeDate(point.timestamp) || new Date(point.timestamp)
                                      : null;

                              return {
                                  latitude,
                                  longitude,
                                  timestamp: timestamp ? timestamp.toISOString() : null,
                              };
                          })
                          .filter(Boolean)
                    : null;

            await prisma.job_meter_snapshots.create({
                data: {
                    jobId,
                    driverId,
                    companyId,
                    recordedAt,
                    status: payload.status ? String(payload.status).toUpperCase() : null,
                    reason: payload.reason || 'interval',
                    elapsedSeconds: Math.max(0, Math.round(telemetry.elapsedSeconds || 0)),
                    waitingSeconds: Math.max(0, Math.round(telemetry.waitingSeconds || 0)),
                    distanceMeters: Number(telemetry.distanceMeters || 0),
                    currentFare: telemetry.currentFare !== undefined ? Number(telemetry.currentFare) : null,
                    speedKmh: telemetry.speedKmh !== undefined ? Number(telemetry.speedKmh) : null,
                    isPaused: !!payload.isPaused,
                    latitude: sanitizeNumber(location?.latitude),
                    longitude: sanitizeNumber(location?.longitude),
                    accuracy: sanitizeNumber(location?.accuracy),
                    heading: sanitizeNumber(location?.heading),
                    routeSegment: normalizedSegment,
                },
            });
        } catch (error) {
            console.error('Failed to persist meter snapshot:', error);
        }
    });
};
