/**
 * Timer Synchronization Service
 * 
 * Provides server-issued timestamps for synchronized timers
 * across all clients (driver, dispatcher, customer).
 */

/**
 * Get current server time in milliseconds
 * @returns {number} - Current time in ms
 */
function getServerTime() {
    return Date.now();
}

/**
 * Get current server time as ISO string
 * @returns {string} - ISO 8601 timestamp
 */
function getServerTimeISO() {
    return new Date().toISOString();
}

/**
 * Calculate expiration time from now
 * 
 * @param {number} durationMs - Duration in milliseconds
 * @returns {object} - { expiresAt (ISO), serverTime (ISO), durationMs }
 */
function createTimer(durationMs) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);

    return {
        expiresAt: expiresAt.toISOString(),
        serverTime: now.toISOString(),
        durationMs,
        createdAt: now.toISOString(),
    };
}

/**
 * Create job offer timer (default: 60 seconds)
 * 
 * @param {number} durationMs - Timer duration in ms (default: 60000)
 * @returns {object} - Timer data
 */
function createOfferTimer(durationMs = 60000) {
    return createTimer(durationMs);
}

/**
 * Check if timer has expired
 * 
 * @param {string} expiresAt - ISO timestamp of expiration
 * @returns {boolean} - True if expired
 */
function isExpired(expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    return Date.now() >= expiryTime;
}

/**
 * Get remaining time in milliseconds
 * 
 * @param {string} expiresAt - ISO timestamp of expiration
 * @returns {number} - Remaining ms (0 if expired)
 */
function getRemainingTime(expiresAt) {
    const expiryTime = new Date(expiresAt).getTime();
    const remaining = expiryTime - Date.now();
    return Math.max(0, remaining);
}

/**
 * Calculate time elapsed since timestamp
 * 
 * @param {string} startTime - ISO timestamp of start
 * @returns {number} - Elapsed ms
 */
function getElapsedTime(startTime) {
    const start = new Date(startTime).getTime();
    return Date.now() - start;
}

/**
 * Format duration for display
 * 
 * @param {number} ms - Duration in milliseconds
 * @returns {object} - { hours, minutes, seconds, formatted }
 */
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
        hours,
        minutes,
        seconds,
        totalSeconds,
        formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        shortFormat: minutes > 0 
            ? `${minutes}m ${seconds}s` 
            : `${seconds}s`,
    };
}

/**
 * Create a synchronized timer payload for clients
 * 
 * @param {string} timerId - Unique timer ID
 * @param {number} durationMs - Timer duration
 * @param {object} metadata - Additional data
 * @returns {object} - Timer payload
 */
function createTimerPayload(timerId, durationMs, metadata = {}) {
    const timer = createTimer(durationMs);

    return {
        timerId,
        ...timer,
        ...metadata,
    };
}

/**
 * Create job meter timer (tracks time for billing)
 * 
 * @param {string} jobId - Job ID
 * @param {string} startTime - ISO start time (defaults to now)
 * @returns {object} - Meter timer data
 */
function createMeterTimer(jobId, startTime = null) {
    const now = new Date();
    const start = startTime ? new Date(startTime) : now;

    return {
        jobId,
        startTime: start.toISOString(),
        serverTime: now.toISOString(),
        elapsedMs: now.getTime() - start.getTime(),
    };
}

/**
 * Update meter timer with current elapsed time
 * 
 * @param {string} startTime - ISO start time
 * @returns {object} - Updated meter data
 */
function updateMeterTimer(startTime) {
    const elapsed = getElapsedTime(startTime);
    const duration = formatDuration(elapsed);

    return {
        startTime,
        serverTime: getServerTimeISO(),
        elapsedMs: elapsed,
        elapsedSeconds: duration.totalSeconds,
        duration: duration.formatted,
    };
}

/**
 * Schedule timer expiration callback (server-side only)
 * 
 * @param {string} expiresAt - ISO expiration time
 * @param {Function} callback - Function to call on expiration
 * @returns {NodeJS.Timeout} - Timer handle
 */
function scheduleExpiration(expiresAt, callback) {
    const remaining = getRemainingTime(expiresAt);
    
    if (remaining === 0) {
        // Already expired, call immediately
        setImmediate(callback);
        return null;
    }

    return setTimeout(callback, remaining);
}

module.exports = {
    getServerTime,
    getServerTimeISO,
    createTimer,
    createOfferTimer,
    isExpired,
    getRemainingTime,
    getElapsedTime,
    formatDuration,
    createTimerPayload,
    createMeterTimer,
    updateMeterTimer,
    scheduleExpiration,
};

