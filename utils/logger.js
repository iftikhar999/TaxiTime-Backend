/**
 * Centralized Logger with Environment-Based Control
 * 
 * Controls all logging based on ENABLE_LOGGING environment variable
 * In production, set ENABLE_LOGGING=false to disable all logs and save bandwidth
 * 
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Message', { data });
 *   logger.error('Error', error);
 *   logger.warn('Warning');
 *   logger.debug('Debug info');
 * 
 * GLOBAL OVERRIDE:
 *   When ENABLE_LOGGING=false, this module also overrides console.log/error/warn
 *   to prevent any logs from being output, saving bandwidth in production.
 */

const ENABLE_LOGGING = process.env.ENABLE_LOGGING !== 'false';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;

// Store original console methods before overriding
const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
};

/**
 * Format log message with timestamp and context
 */
function formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data !== undefined) {
        return `${prefix} ${message}`;
    }
    return `${prefix} ${message}`;
}

/**
 * Internal log function
 */
function log(level, message, data) {
    if (!ENABLE_LOGGING) return;
    if (LOG_LEVELS[level] < currentLogLevel) return;
    
    const formattedMessage = formatMessage(level, message, data);
    
    switch (level) {
        case 'error':
            if (data !== undefined) {
                originalConsole.error(formattedMessage, data);
            } else {
                originalConsole.error(formattedMessage);
            }
            break;
        case 'warn':
            if (data !== undefined) {
                originalConsole.warn(formattedMessage, data);
            } else {
                originalConsole.warn(formattedMessage);
            }
            break;
        case 'debug':
        case 'info':
        default:
            if (data !== undefined) {
                originalConsole.log(formattedMessage, data);
            } else {
                originalConsole.log(formattedMessage);
            }
            break;
    }
}

const logger = {
    /**
     * Debug level logs - most verbose
     */
    debug: (message, data) => log('debug', message, data),
    
    /**
     * Info level logs - general information
     */
    info: (message, data) => log('info', message, data),
    
    /**
     * Warning level logs - potential issues
     */
    warn: (message, data) => log('warn', message, data),
    
    /**
     * Error level logs - critical issues
     */
    error: (message, data) => log('error', message, data),
    
    /**
     * Check if logging is enabled
     */
    isEnabled: () => ENABLE_LOGGING,
    
    /**
     * Get current log level
     */
    getLevel: () => LOG_LEVEL,
};

// GLOBAL CONSOLE OVERRIDE
// When logging is disabled, replace console methods with no-ops
if (!ENABLE_LOGGING) {
    const noop = () => {};
    console.log = noop;
    console.error = noop;
    console.warn = noop;
    console.info = noop;
    console.debug = noop;
    
    // Use original console for initialization message
    originalConsole.log('[LOGGER] Silent mode enabled - all console output disabled (ENABLE_LOGGING=false)');
} else {
    originalConsole.log(`[LOGGER] Initialized - ENABLE_LOGGING=${ENABLE_LOGGING}, LOG_LEVEL=${LOG_LEVEL}`);
}

module.exports = logger;
