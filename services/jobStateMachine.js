/**
 * Job State Machine - Enforces Valid State Transitions
 * 
 * This ensures jobs can only transition through valid states,
 * preventing data corruption and maintaining system integrity.
 */

const JOB_STATUSES = {
    UNASSIGNED: 'UNASSIGNED',
    OFFERED: 'OFFERED',
    ASSIGNED: 'ASSIGNED',
    REJECTED: 'REJECTED',
    ON_THE_WAY: 'ON_THE_WAY',
    ARRIVED: 'ARRIVED',
    NO_SHOW: 'NO_SHOW',
    RECALLED: 'RECALLED',
    STARTED: 'STARTED',
    ACTIVE: 'ACTIVE',
    REACHED: 'REACHED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
};

/**
 * Valid state transitions map
 * Key: Current Status
 * Value: Array of allowed next statuses
 */
const VALID_TRANSITIONS = {
    [JOB_STATUSES.UNASSIGNED]: [
        JOB_STATUSES.OFFERED,
        JOB_STATUSES.ASSIGNED,
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.OFFERED]: [
        JOB_STATUSES.ASSIGNED,
        JOB_STATUSES.REJECTED,
        JOB_STATUSES.CANCELLED,
        JOB_STATUSES.UNASSIGNED, // Offer expired
    ],
    [JOB_STATUSES.ASSIGNED]: [
        JOB_STATUSES.ON_THE_WAY,
        JOB_STATUSES.RECALLED,
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.ON_THE_WAY]: [
        JOB_STATUSES.ARRIVED,
        JOB_STATUSES.RECALLED,
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.ARRIVED]: [
        JOB_STATUSES.STARTED,
        JOB_STATUSES.NO_SHOW,
        JOB_STATUSES.RECALLED,
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.STARTED]: [
        JOB_STATUSES.ACTIVE,
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.ACTIVE]: [
        JOB_STATUSES.REACHED,
        JOB_STATUSES.COMPLETED, // Direct completion
        JOB_STATUSES.CANCELLED,
    ],
    [JOB_STATUSES.REACHED]: [
        JOB_STATUSES.COMPLETED,
        JOB_STATUSES.CANCELLED,
    ],
    // Terminal states (no further transitions)
    [JOB_STATUSES.COMPLETED]: [],
    [JOB_STATUSES.CANCELLED]: [],
    [JOB_STATUSES.REJECTED]: [],
    [JOB_STATUSES.NO_SHOW]: [],
    [JOB_STATUSES.RECALLED]: [],
};

/**
 * Validate if a state transition is allowed
 * 
 * @param {string} currentStatus - Current job status
 * @param {string} newStatus - Desired new status
 * @returns {boolean} - True if transition is valid
 */
function isValidTransition(currentStatus, newStatus) {
    // Same status is always valid (idempotent)
    if (currentStatus === newStatus) {
        return true;
    }

    const validNextStates = VALID_TRANSITIONS[currentStatus];

    // If current status not in map, it's invalid
    if (!validNextStates) {
        return false;
    }

    return validNextStates.includes(newStatus);
}

/**
 * Validate and throw error if transition is invalid
 * 
 * @param {string} currentStatus - Current job status
 * @param {string} newStatus - Desired new status
 * @param {string} jobId - Job ID for error message
 * @throws {Error} - If transition is invalid
 */
function validateTransition(currentStatus, newStatus, jobId) {
    if (!isValidTransition(currentStatus, newStatus)) {
        throw new Error(
            `Invalid job state transition for job ${jobId}: ` +
            `${currentStatus} → ${newStatus}. ` +
            `Allowed transitions from ${currentStatus}: ` +
            `[${VALID_TRANSITIONS[currentStatus]?.join(', ') || 'NONE'}]`
        );
    }
}

/**
 * Get all valid next states for a given status
 * 
 * @param {string} currentStatus - Current job status
 * @returns {string[]} - Array of valid next statuses
 */
function getValidNextStates(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
}

/**
 * Check if a status is a terminal state (no further transitions)
 * 
 * @param {string} status - Job status to check
 * @returns {boolean} - True if terminal state
 */
function isTerminalState(status) {
    const validNext = VALID_TRANSITIONS[status];
    return validNext && validNext.length === 0;
}

/**
 * Get driver status based on job status
 * 
 * @param {string} jobStatus - Job status
 * @returns {string} - Corresponding driver status
 */
function getDriverStatusForJobStatus(jobStatus) {
    const statusMap = {
        [JOB_STATUSES.UNASSIGNED]: 'AVAILABLE',
        [JOB_STATUSES.OFFERED]: 'AVAILABLE',
        [JOB_STATUSES.ASSIGNED]: 'ROGER',
        [JOB_STATUSES.REJECTED]: 'AVAILABLE',
        [JOB_STATUSES.ON_THE_WAY]: 'ROGER',
        [JOB_STATUSES.ARRIVED]: 'ROGER',
        [JOB_STATUSES.NO_SHOW]: 'AVAILABLE',
        [JOB_STATUSES.RECALLED]: 'AVAILABLE',
        [JOB_STATUSES.STARTED]: 'BUSY',
        [JOB_STATUSES.ACTIVE]: 'BUSY',
        [JOB_STATUSES.REACHED]: 'BUSY',
        [JOB_STATUSES.COMPLETED]: 'AVAILABLE',
        [JOB_STATUSES.CANCELLED]: 'AVAILABLE',
    };

    return statusMap[jobStatus] || 'AVAILABLE';
}

/**
 * Get dispatcher tab for job status
 * 
 * @param {string} jobStatus - Job status
 * @returns {string} - Dispatcher tab name
 */
function getDispatcherTabForStatus(jobStatus) {
    const tabMap = {
        [JOB_STATUSES.UNASSIGNED]: 'UNASSIGNED',
        [JOB_STATUSES.OFFERED]: 'OFFERED',
        [JOB_STATUSES.ASSIGNED]: 'ASSIGNED',
        [JOB_STATUSES.ON_THE_WAY]: 'ASSIGNED',
        [JOB_STATUSES.ARRIVED]: 'ASSIGNED',
        [JOB_STATUSES.STARTED]: 'ACTIVE',
        [JOB_STATUSES.ACTIVE]: 'ACTIVE',
        [JOB_STATUSES.REACHED]: 'ACTIVE',
        [JOB_STATUSES.COMPLETED]: 'FINISHED',
        [JOB_STATUSES.CANCELLED]: 'CANCELLED',
        [JOB_STATUSES.REJECTED]: 'REJECTED',
        [JOB_STATUSES.NO_SHOW]: 'NOSHOW',
        [JOB_STATUSES.RECALLED]: 'RECALLED',
    };

    return tabMap[jobStatus] || 'UNASSIGNED';
}

/**
 * Create state transition metadata
 * 
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {string} userId - User who triggered the transition
 * @param {string} reason - Optional reason for transition
 * @returns {object} - Transition metadata
 */
function createTransitionMetadata(fromStatus, toStatus, userId, reason = null) {
    return {
        fromStatus,
        toStatus,
        userId,
        reason,
        timestamp: new Date().toISOString(),
        isValid: isValidTransition(fromStatus, toStatus),
    };
}

module.exports = {
    JOB_STATUSES,
    VALID_TRANSITIONS,
    isValidTransition,
    validateTransition,
    getValidNextStates,
    isTerminalState,
    getDriverStatusForJobStatus,
    getDispatcherTabForStatus,
    createTransitionMetadata,
};

