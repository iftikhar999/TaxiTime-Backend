/**
 * Conflict Resolution Service
 * 
 * Detects and resolves conflicts when multiple clients
 * try to update the same entity simultaneously.
 */

const { compareVersions } = require('./eventVersioning');

/**
 * Conflict resolution strategies
 */
const RESOLUTION_STRATEGIES = {
    SERVER_WINS: 'SERVER_WINS',       // Server state always wins
    CLIENT_WINS: 'CLIENT_WINS',       // Client state always wins
    LATEST_WINS: 'LATEST_WINS',       // Most recent timestamp wins
    MERGE: 'MERGE',                    // Attempt to merge changes
};

/**
 * Detect if a conflict exists
 * 
 * @param {string} serverVersion - Current server version
 * @param {string} clientVersion - Client's last known version
 * @returns {boolean} - True if conflict detected
 */
function detectConflict(serverVersion, clientVersion) {
    if (!clientVersion) {
        // Client has no version, no conflict
        return false;
    }

    // Conflict if server version is ahead of client version
    return compareVersions(serverVersion, clientVersion) > 0;
}

/**
 * Resolve conflict using specified strategy
 * 
 * @param {object} serverData - Current server data
 * @param {object} clientData - Client's data
 * @param {string} strategy - Resolution strategy
 * @param {object} options - Additional options
 * @returns {object} - { resolved: data, winner: 'server'|'client', metadata }
 */
function resolveConflict(serverData, clientData, strategy = RESOLUTION_STRATEGIES.SERVER_WINS, options = {}) {
    console.log(`🔀 Resolving conflict with strategy: ${strategy}`);
    console.log('   Server data:', serverData);
    console.log('   Client data:', clientData);

    switch (strategy) {
        case RESOLUTION_STRATEGIES.SERVER_WINS:
            return {
                resolved: serverData,
                winner: 'server',
                metadata: {
                    strategy,
                    reason: 'Server state is authoritative',
                },
            };

        case RESOLUTION_STRATEGIES.CLIENT_WINS:
            return {
                resolved: clientData,
                winner: 'client',
                metadata: {
                    strategy,
                    reason: 'Client state accepted',
                },
            };

        case RESOLUTION_STRATEGIES.LATEST_WINS:
            return resolveByTimestamp(serverData, clientData);

        case RESOLUTION_STRATEGIES.MERGE:
            return mergeData(serverData, clientData, options);

        default:
            // Default to server wins
            return {
                resolved: serverData,
                winner: 'server',
                metadata: {
                    strategy: 'DEFAULT',
                    reason: 'Unknown strategy, defaulting to server',
                },
            };
    }
}

/**
 * Resolve by comparing timestamps
 * 
 * @param {object} serverData - Server data with timestamp
 * @param {object} clientData - Client data with timestamp
 * @returns {object} - Resolution result
 */
function resolveByTimestamp(serverData, clientData) {
    const serverTime = new Date(serverData.timestamp || serverData.updatedAt).getTime();
    const clientTime = new Date(clientData.timestamp || clientData.updatedAt).getTime();

    if (clientTime > serverTime) {
        return {
            resolved: clientData,
            winner: 'client',
            metadata: {
                strategy: RESOLUTION_STRATEGIES.LATEST_WINS,
                reason: 'Client timestamp is more recent',
                serverTime,
                clientTime,
            },
        };
    }

    return {
        resolved: serverData,
        winner: 'server',
        metadata: {
            strategy: RESOLUTION_STRATEGIES.LATEST_WINS,
            reason: 'Server timestamp is more recent',
            serverTime,
            clientTime,
        },
    };
}

/**
 * Attempt to merge data (field-level resolution)
 * 
 * @param {object} serverData - Server data
 * @param {object} clientData - Client data
 * @param {object} options - Merge options
 * @returns {object} - Resolution result
 */
function mergeData(serverData, clientData, options = {}) {
    const { mergeFields = [] } = options;

    const merged = { ...serverData };
    const conflicts = [];

    // Merge specified fields from client if they differ
    mergeFields.forEach(field => {
        if (clientData[field] !== undefined && clientData[field] !== serverData[field]) {
            // Field differs, check which is newer
            const serverFieldTime = serverData[`${field}UpdatedAt`] 
                ? new Date(serverData[`${field}UpdatedAt`]).getTime()
                : 0;
            const clientFieldTime = clientData[`${field}UpdatedAt`]
                ? new Date(clientData[`${field}UpdatedAt`]).getTime()
                : new Date(clientData.timestamp || clientData.updatedAt).getTime();

            if (clientFieldTime > serverFieldTime) {
                merged[field] = clientData[field];
                conflicts.push({
                    field,
                    winner: 'client',
                    serverValue: serverData[field],
                    clientValue: clientData[field],
                });
            } else {
                conflicts.push({
                    field,
                    winner: 'server',
                    serverValue: serverData[field],
                    clientValue: clientData[field],
                });
            }
        }
    });

    return {
        resolved: merged,
        winner: 'merged',
        metadata: {
            strategy: RESOLUTION_STRATEGIES.MERGE,
            reason: 'Data merged field by field',
            conflicts,
        },
    };
}

/**
 * Create conflict resolution payload for client
 * 
 * @param {object} resolution - Resolution result
 * @param {string} entityType - Type of entity (job, driver, etc.)
 * @param {string} entityId - Entity ID
 * @returns {object} - Payload to send to client
 */
function createConflictPayload(resolution, entityType, entityId) {
    return {
        type: 'conflict_resolved',
        entityType,
        entityId,
        winner: resolution.winner,
        data: resolution.resolved,
        metadata: resolution.metadata,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Handle job update conflict
 * 
 * @param {object} serverJob - Current server job state
 * @param {object} clientUpdate - Client's update attempt
 * @returns {object} - Resolution result
 */
function resolveJobConflict(serverJob, clientUpdate) {
    // For jobs, server always wins on status changes
    // (prevents race conditions in state machine)
    if (clientUpdate.status && clientUpdate.status !== serverJob.status) {
        return resolveConflict(serverJob, clientUpdate, RESOLUTION_STRATEGIES.SERVER_WINS);
    }

    // For other fields, use latest timestamp
    return resolveConflict(serverJob, clientUpdate, RESOLUTION_STRATEGIES.LATEST_WINS);
}

/**
 * Handle location update conflict
 * 
 * @param {object} serverLocation - Current server location
 * @param {object} clientLocation - Client's location
 * @returns {object} - Resolution result
 */
function resolveLocationConflict(serverLocation, clientLocation) {
    // For location, always accept client (it's the source of truth)
    return resolveConflict(serverLocation, clientLocation, RESOLUTION_STRATEGIES.CLIENT_WINS);
}

/**
 * Check if update is stale (client version is behind)
 * 
 * @param {string} serverVersion - Current server version
 * @param {string} clientVersion - Client's version
 * @param {number} maxAgeSec - Max age in seconds (default: 60)
 * @returns {boolean} - True if update is stale
 */
function isStaleUpdate(serverVersion, clientVersion, maxAgeSec = 60) {
    if (!clientVersion) {
        return false;
    }

    const comparison = compareVersions(serverVersion, clientVersion);
    
    if (comparison <= 0) {
        // Client is up to date or ahead
        return false;
    }

    // Check age
    const [serverTimestamp] = serverVersion.split('-');
    const [clientTimestamp] = clientVersion.split('-');
    
    const ageSec = (parseInt(serverTimestamp) - parseInt(clientTimestamp)) / 1000;
    
    return ageSec > maxAgeSec;
}

module.exports = {
    RESOLUTION_STRATEGIES,
    detectConflict,
    resolveConflict,
    createConflictPayload,
    resolveJobConflict,
    resolveLocationConflict,
    isStaleUpdate,
};

