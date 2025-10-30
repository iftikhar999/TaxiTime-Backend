/**
 * Socket Sync Handler
 * 
 * Handles delta sync requests from clients on reconnection.
 * Sends only the events the client missed.
 */

const { getDeltaSync } = require('../services/eventVersioning');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Handle sync request from client
 * 
 * @param {Socket} socket - Socket.IO socket
 * @param {object} payload - Sync request payload
 *   - lastVersion: Client's last known version
 *   - entityType: Optional entity type filter (job, driver)
 *   - entityId: Optional entity ID filter
 */
async function handleSyncRequest(socket, payload) {
    console.log(`🔄 Sync request from client ${socket.id}:`, payload);

    const { lastVersion, entityType, entityId, userId } = payload;

    try {
        // Get events since client's last version
        const delta = getDeltaSync(lastVersion, entityId);

        console.log(`📦 Sending ${delta.count} events to client (version: ${lastVersion} → ${delta.latestVersion})`);

        // Send delta sync response
        socket.emit('sync:response', {
            success: true,
            events: delta.events,
            latestVersion: delta.latestVersion,
            count: delta.count,
            timestamp: new Date().toISOString(),
        });

        // If requested, also send current state snapshot
        if (payload.includeState) {
            const state = await getCurrentState(entityType, entityId, userId);
            socket.emit('sync:state', state);
        }

    } catch (error) {
        console.error('❌ Sync request failed:', error);
        socket.emit('sync:error', {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
}

/**
 * Get current state snapshot for entity
 * 
 * @param {string} entityType - Entity type (job, driver, etc.)
 * @param {string} entityId - Entity ID
 * @param {string} userId - User ID (for filtering)
 * @returns {object} - Current state snapshot
 */
async function getCurrentState(entityType, entityId, userId) {
    switch (entityType) {
        case 'job':
            return await getJobState(entityId);
        
        case 'driver':
            return await getDriverState(entityId);
        
        case 'jobs':
            return await getAllJobs(userId);
        
        case 'drivers':
            return await getAllDrivers(userId);
        
        default:
            return null;
    }
}

/**
 * Get job state
 */
async function getJobState(jobId) {
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
            driver: true,
            customer: true,
            tariff: true,
        },
    });

    return {
        entityType: 'job',
        entityId: jobId,
        data: job,
    };
}

/**
 * Get driver state
 */
async function getDriverState(driverId) {
    const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        include: {
            currentJob: true,
            vehicle: true,
        },
    });

    return {
        entityType: 'driver',
        entityId: driverId,
        data: driver,
    };
}

/**
 * Get all jobs for dispatcher
 */
async function getAllJobs(dispatcherId) {
    // TODO: Filter by dispatcher's company
    const jobs = await prisma.job.findMany({
        where: {
            // Add company filter based on dispatcher
        },
        include: {
            driver: true,
            customer: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: 100, // Limit to recent jobs
    });

    return {
        entityType: 'jobs',
        data: jobs,
    };
}

/**
 * Get all drivers for dispatcher
 */
async function getAllDrivers(dispatcherId) {
    // TODO: Filter by dispatcher's company
    const drivers = await prisma.driver.findMany({
        where: {
            // Add company filter based on dispatcher
        },
        include: {
            vehicle: true,
            currentJob: true,
        },
    });

    return {
        entityType: 'drivers',
        data: drivers,
    };
}

/**
 * Register sync handlers on socket
 * 
 * @param {Socket} socket - Socket.IO socket
 */
function registerSyncHandlers(socket) {
    socket.on('sync:request', (payload) => handleSyncRequest(socket, payload));
    
    socket.on('sync:ping', () => {
        socket.emit('sync:pong', {
            serverTime: new Date().toISOString(),
            version: require('../services/eventVersioning').generateVersion(),
        });
    });
}

module.exports = {
    handleSyncRequest,
    registerSyncHandlers,
};

