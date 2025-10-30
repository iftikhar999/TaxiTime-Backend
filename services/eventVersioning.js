/**
 * Event Versioning Service
 * 
 * Adds version numbers to all events for delta sync and conflict resolution.
 * Uses timestamp-based versioning for simplicity and ordering.
 */

let eventCounter = 0;

/**
 * Generate a version number (timestamp + counter for uniqueness)
 * @returns {string} - Version string (timestamp-counter)
 */
function generateVersion() {
    const timestamp = Date.now();
    eventCounter = (eventCounter + 1) % 1000; // Reset every 1000 events
    return `${timestamp}-${eventCounter.toString().padStart(3, '0')}`;
}

/**
 * Parse version string into components
 * @param {string} version - Version string
 * @returns {object} - { timestamp, counter }
 */
function parseVersion(version) {
    const [timestamp, counter] = version.split('-');
    return {
        timestamp: parseInt(timestamp, 10),
        counter: parseInt(counter, 10),
    };
}

/**
 * Compare two versions
 * @param {string} v1 - Version 1
 * @param {string} v2 - Version 2
 * @returns {number} - -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);

    if (p1.timestamp !== p2.timestamp) {
        return p1.timestamp < p2.timestamp ? -1 : 1;
    }

    if (p1.counter !== p2.counter) {
        return p1.counter < p2.counter ? -1 : 1;
    }

    return 0;
}

/**
 * Create a versioned event
 * 
 * @param {string} eventName - Event name
 * @param {object} data - Event data
 * @param {object} metadata - Additional metadata
 * @returns {object} - Versioned event
 */
function createVersionedEvent(eventName, data, metadata = {}) {
    return {
        event: eventName,
        version: generateVersion(),
        timestamp: Date.now(),
        data,
        ...metadata,
    };
}

/**
 * Event Store - In-memory cache of recent events
 * Used for delta sync on client reconnection
 */
class EventStore {
    constructor(maxSize = 10000, ttlMs = 3600000) { // 1 hour TTL
        this.events = [];
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.eventsByEntity = new Map(); // entityId -> events[]
    }

    /**
     * Add event to store
     * @param {object} event - Versioned event
     * @param {string} entityId - Entity ID (jobId, driverId, etc.)
     */
    add(event, entityId = null) {
        // Add to main store
        this.events.push({
            ...event,
            entityId,
            storedAt: Date.now(),
        });

        // Add to entity index
        if (entityId) {
            if (!this.eventsByEntity.has(entityId)) {
                this.eventsByEntity.set(entityId, []);
            }
            this.eventsByEntity.get(entityId).push(event);
        }

        // Cleanup old events
        this.cleanup();
    }

    /**
     * Get events since a specific version
     * @param {string} sinceVersion - Last known version
     * @param {string} entityId - Optional: Filter by entity
     * @returns {object[]} - Array of events
     */
    getEventsSince(sinceVersion, entityId = null) {
        let events = entityId && this.eventsByEntity.has(entityId)
            ? this.eventsByEntity.get(entityId)
            : this.events;

        if (!sinceVersion) {
            return events;
        }

        return events.filter(e => compareVersions(e.version, sinceVersion) > 0);
    }

    /**
     * Get latest version
     * @returns {string} - Latest version
     */
    getLatestVersion() {
        if (this.events.length === 0) {
            return generateVersion();
        }
        return this.events[this.events.length - 1].version;
    }

    /**
     * Cleanup old events (beyond maxSize or TTL)
     */
    cleanup() {
        const now = Date.now();

        // Remove expired events
        this.events = this.events.filter(e => 
            (now - e.storedAt) < this.ttlMs
        );

        // Trim to maxSize
        if (this.events.length > this.maxSize) {
            const removeCount = this.events.length - this.maxSize;
            this.events.splice(0, removeCount);
        }

        // Rebuild entity index
        this.eventsByEntity.clear();
        this.events.forEach(event => {
            if (event.entityId) {
                if (!this.eventsByEntity.has(event.entityId)) {
                    this.eventsByEntity.set(event.entityId, []);
                }
                this.eventsByEntity.get(event.entityId).push(event);
            }
        });
    }

    /**
     * Clear all events
     */
    clear() {
        this.events = [];
        this.eventsByEntity.clear();
    }
}

// Global event store instance
const globalEventStore = new EventStore();

/**
 * Create and store a versioned event
 * 
 * @param {string} eventName - Event name
 * @param {object} data - Event data
 * @param {string} entityId - Entity ID for filtering
 * @param {object} metadata - Additional metadata
 * @returns {object} - Versioned event
 */
function emitVersionedEvent(eventName, data, entityId = null, metadata = {}) {
    const event = createVersionedEvent(eventName, data, metadata);
    globalEventStore.add(event, entityId);
    return event;
}

/**
 * Get events for delta sync
 * 
 * @param {string} sinceVersion - Last known client version
 * @param {string} entityId - Optional entity filter
 * @returns {object} - { events, latestVersion }
 */
function getDeltaSync(sinceVersion, entityId = null) {
    const events = globalEventStore.getEventsSince(sinceVersion, entityId);
    const latestVersion = globalEventStore.getLatestVersion();

    return {
        events,
        latestVersion,
        count: events.length,
    };
}

module.exports = {
    generateVersion,
    parseVersion,
    compareVersions,
    createVersionedEvent,
    emitVersionedEvent,
    getDeltaSync,
    EventStore,
    globalEventStore,
};

