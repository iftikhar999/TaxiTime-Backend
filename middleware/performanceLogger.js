/**
 * Performance Logging Middleware
 * 
 * Tracks all API calls, database queries, and their frequencies
 * to identify optimization opportunities.
 * 
 * Log files will be analyzed to determine:
 * - Which APIs can be slowed down (less frequent updates)
 * - Which APIs need to be real-time (critical for job assignment)
 * - Unnecessary/duplicate queries
 * - Performance bottlenecks
 */

const fs = require('fs');
const path = require('path');

// Log file paths
const LOGS_DIR = path.join(__dirname, '../logs');
const PERFORMANCE_LOG = path.join(LOGS_DIR, 'performance-analysis.log');
const API_FREQUENCY_LOG = path.join(LOGS_DIR, 'api-frequency.log');
const DB_QUERY_LOG = path.join(LOGS_DIR, 'db-queries.log');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// In-memory tracking for current session
const sessionStats = {
    startTime: Date.now(),
    apiCalls: new Map(), // endpoint -> { count, totalTime, avgTime, callers: Map }
    dbQueries: new Map(), // query -> { count, totalTime, avgTime }
    socketEvents: new Map(), // event -> { count, emitters: Map }
};

/**
 * Log API call details
 */
function logApiCall(req, res, duration) {
    const endpoint = `${req.method} ${req.path}`;
    const caller = req.user?.id || req.ip;
    const timestamp = new Date().toISOString();
    
    // Update in-memory stats
    if (!sessionStats.apiCalls.has(endpoint)) {
        sessionStats.apiCalls.set(endpoint, {
            count: 0,
            totalTime: 0,
            avgTime: 0,
            callers: new Map(),
            lastCalled: timestamp,
        });
    }
    
    const stats = sessionStats.apiCalls.get(endpoint);
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.count;
    stats.lastCalled = timestamp;
    
    // Track caller frequency
    if (!stats.callers.has(caller)) {
        stats.callers.set(caller, { count: 0, lastCall: timestamp });
    }
    stats.callers.get(caller).count++;
    stats.callers.get(caller).lastCall = timestamp;
    
    // Log to file (append)
    const logEntry = JSON.stringify({
        timestamp,
        type: 'API_CALL',
        endpoint,
        method: req.method,
        path: req.path,
        query: req.query,
        caller,
        duration,
        statusCode: res.statusCode,
    }) + '\n';
    
    fs.appendFileSync(API_FREQUENCY_LOG, logEntry);
}

/**
 * Log database query details
 */
function logDatabaseQuery(query, duration, params = {}) {
    const timestamp = new Date().toISOString();
    const queryType = extractQueryType(query);
    const table = extractTableName(query);
    
    // Update in-memory stats
    const queryKey = `${queryType} ${table}`;
    if (!sessionStats.dbQueries.has(queryKey)) {
        sessionStats.dbQueries.set(queryKey, {
            count: 0,
            totalTime: 0,
            avgTime: 0,
            queries: [],
        });
    }
    
    const stats = sessionStats.dbQueries.get(queryKey);
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.count;
    
    // Store unique queries (up to 10 examples)
    if (stats.queries.length < 10 && !stats.queries.includes(query)) {
        stats.queries.push(query);
    }
    
    // Log to file (append)
    const logEntry = JSON.stringify({
        timestamp,
        type: 'DB_QUERY',
        queryType,
        table,
        query: query.substring(0, 200), // Truncate long queries
        duration,
        params,
    }) + '\n';
    
    fs.appendFileSync(DB_QUERY_LOG, logEntry);
}

/**
 * Log socket event details
 */
function logSocketEvent(eventName, emitter, data = {}) {
    const timestamp = new Date().toISOString();
    
    // Update in-memory stats
    if (!sessionStats.socketEvents.has(eventName)) {
        sessionStats.socketEvents.set(eventName, {
            count: 0,
            emitters: new Map(),
        });
    }
    
    const stats = sessionStats.socketEvents.get(eventName);
    stats.count++;
    
    // Track emitter frequency
    if (!stats.emitters.has(emitter)) {
        stats.emitters.set(emitter, 0);
    }
    stats.emitters.set(emitter, stats.emitters.get(emitter) + 1);
    
    // Log to file (append)
    const logEntry = JSON.stringify({
        timestamp,
        type: 'SOCKET_EVENT',
        event: eventName,
        emitter,
        dataSize: JSON.stringify(data).length,
    }) + '\n';
    
    fs.appendFileSync(PERFORMANCE_LOG, logEntry);
}

/**
 * Extract query type (SELECT, INSERT, UPDATE, DELETE)
 */
function extractQueryType(query) {
    const match = query.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT)/i);
    return match ? match[1].toUpperCase() : 'UNKNOWN';
}

/**
 * Extract table name from query
 */
function extractTableName(query) {
    // Try to extract from SELECT ... FROM table
    let match = query.match(/FROM\s+"?(\w+)"?/i);
    if (match) return match[1];
    
    // Try to extract from INSERT INTO table
    match = query.match(/INSERT\s+INTO\s+"?(\w+)"?/i);
    if (match) return match[1];
    
    // Try to extract from UPDATE table
    match = query.match(/UPDATE\s+"?(\w+)"?/i);
    if (match) return match[1];
    
    // Try to extract from DELETE FROM table
    match = query.match(/DELETE\s+FROM\s+"?(\w+)"?/i);
    if (match) return match[1];
    
    return 'unknown';
}

/**
 * API Logging Middleware
 */
function performanceLoggerMiddleware(req, res, next) {
    const startTime = Date.now();
    
    // Capture original end function
    const originalEnd = res.end;
    
    // Override end function to log after response
    res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Log the API call
        try {
            logApiCall(req, res, duration);
        } catch (error) {
            console.error('Error logging API call:', error);
        }
        
        // Call original end
        originalEnd.apply(res, args);
    };
    
    next();
}

/**
 * Generate analysis report
 */
function generateAnalysisReport() {
    const uptime = Date.now() - sessionStats.startTime;
    const uptimeMinutes = (uptime / 1000 / 60).toFixed(2);
    
    const report = {
        generatedAt: new Date().toISOString(),
        uptimeMinutes,
        summary: {
            totalApiCalls: Array.from(sessionStats.apiCalls.values())
                .reduce((sum, stat) => sum + stat.count, 0),
            totalDbQueries: Array.from(sessionStats.dbQueries.values())
                .reduce((sum, stat) => sum + stat.count, 0),
            totalSocketEvents: Array.from(sessionStats.socketEvents.values())
                .reduce((sum, stat) => sum + stat.count, 0),
            uniqueEndpoints: sessionStats.apiCalls.size,
            uniqueQueries: sessionStats.dbQueries.size,
            uniqueEvents: sessionStats.socketEvents.size,
        },
        topApisByFrequency: getTopAPIs(10),
        topQueriesByFrequency: getTopQueries(10),
        topSocketEvents: getTopSocketEvents(10),
        slowestAPIs: getSlowestAPIs(10),
        slowestQueries: getSlowestQueries(10),
        mostActiveCallers: getMostActiveCallers(10),
        recommendations: generateRecommendations(),
    };
    
    // Write report to file
    const reportPath = path.join(LOGS_DIR, `analysis-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Performance analysis report generated: ${reportPath}`);
    console.log(`📈 Uptime: ${uptimeMinutes} minutes`);
    console.log(`📡 Total API calls: ${report.summary.totalApiCalls}`);
    console.log(`🗄️  Total DB queries: ${report.summary.totalDbQueries}`);
    console.log(`⚡ Total socket events: ${report.summary.totalSocketEvents}`);
    
    return report;
}

/**
 * Get top APIs by call frequency
 */
function getTopAPIs(limit = 10) {
    return Array.from(sessionStats.apiCalls.entries())
        .map(([endpoint, stats]) => ({
            endpoint,
            callCount: stats.count,
            avgDuration: Math.round(stats.avgTime),
            uniqueCallers: stats.callers.size,
            callsPerMinute: (stats.count / ((Date.now() - sessionStats.startTime) / 1000 / 60)).toFixed(2),
        }))
        .sort((a, b) => b.callCount - a.callCount)
        .slice(0, limit);
}

/**
 * Get top database queries by frequency
 */
function getTopQueries(limit = 10) {
    return Array.from(sessionStats.dbQueries.entries())
        .map(([query, stats]) => ({
            query,
            count: stats.count,
            avgDuration: Math.round(stats.avgTime),
            totalTime: Math.round(stats.totalTime),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Get top socket events by frequency
 */
function getTopSocketEvents(limit = 10) {
    return Array.from(sessionStats.socketEvents.entries())
        .map(([event, stats]) => ({
            event,
            count: stats.count,
            uniqueEmitters: stats.emitters.size,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Get slowest APIs
 */
function getSlowestAPIs(limit = 10) {
    return Array.from(sessionStats.apiCalls.entries())
        .map(([endpoint, stats]) => ({
            endpoint,
            avgDuration: Math.round(stats.avgTime),
            callCount: stats.count,
        }))
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, limit);
}

/**
 * Get slowest queries
 */
function getSlowestQueries(limit = 10) {
    return Array.from(sessionStats.dbQueries.entries())
        .map(([query, stats]) => ({
            query,
            avgDuration: Math.round(stats.avgTime),
            count: stats.count,
        }))
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, limit);
}

/**
 * Get most active callers
 */
function getMostActiveCallers(limit = 10) {
    const callerStats = new Map();
    
    sessionStats.apiCalls.forEach((stats) => {
        stats.callers.forEach((callerInfo, callerId) => {
            if (!callerStats.has(callerId)) {
                callerStats.set(callerId, { totalCalls: 0, endpoints: new Set() });
            }
            const stat = callerStats.get(callerId);
            stat.totalCalls += callerInfo.count;
            stat.endpoints.add(stats);
        });
    });
    
    return Array.from(callerStats.entries())
        .map(([caller, stats]) => ({
            caller,
            totalCalls: stats.totalCalls,
            uniqueEndpoints: stats.endpoints.size,
        }))
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, limit);
}

/**
 * Generate optimization recommendations
 */
function generateRecommendations() {
    const recommendations = [];
    const uptime = (Date.now() - sessionStats.startTime) / 1000 / 60; // minutes
    
    // Check for high-frequency APIs that could be cached
    sessionStats.apiCalls.forEach((stats, endpoint) => {
        const callsPerMinute = stats.count / uptime;
        
        if (callsPerMinute > 30 && endpoint.startsWith('GET')) {
            recommendations.push({
                type: 'CACHING',
                priority: 'HIGH',
                endpoint,
                reason: `Called ${callsPerMinute.toFixed(1)} times/minute - add caching`,
                suggestion: 'Add request-level caching with 10-30s TTL',
            });
        }
        
        if (callsPerMinute > 10 && stats.avgTime > 500) {
            recommendations.push({
                type: 'SLOW_API',
                priority: 'HIGH',
                endpoint,
                reason: `Slow API (${Math.round(stats.avgTime)}ms) called ${callsPerMinute.toFixed(1)} times/minute`,
                suggestion: 'Optimize database queries or add caching',
            });
        }
        
        if (callsPerMinute > 60) {
            recommendations.push({
                type: 'RATE_LIMITING',
                priority: 'MEDIUM',
                endpoint,
                reason: `Very high frequency: ${callsPerMinute.toFixed(1)} calls/minute`,
                suggestion: 'Consider rate limiting or increasing client-side polling interval',
            });
        }
    });
    
    // Check for redundant database queries
    sessionStats.dbQueries.forEach((stats, query) => {
        const queriesPerMinute = stats.count / uptime;
        
        if (queriesPerMinute > 100 && query.startsWith('SELECT')) {
            recommendations.push({
                type: 'DB_CACHING',
                priority: 'HIGH',
                query,
                reason: `Query executed ${queriesPerMinute.toFixed(1)} times/minute`,
                suggestion: 'Cache query results or use in-memory store',
            });
        }
        
        if (stats.avgTime > 100 && stats.count > 50) {
            recommendations.push({
                type: 'SLOW_QUERY',
                priority: 'HIGH',
                query,
                reason: `Slow query (${Math.round(stats.avgTime)}ms) executed ${stats.count} times`,
                suggestion: 'Add database indexes or optimize query',
            });
        }
    });
    
    return recommendations;
}

/**
 * Reset session stats (call this when starting a new analysis period)
 */
function resetSessionStats() {
    sessionStats.startTime = Date.now();
    sessionStats.apiCalls.clear();
    sessionStats.dbQueries.clear();
    sessionStats.socketEvents.clear();
    
    console.log('📊 Performance tracking reset - starting new analysis period');
}

module.exports = {
    performanceLoggerMiddleware,
    logApiCall,
    logDatabaseQuery,
    logSocketEvent,
    generateAnalysisReport,
    resetSessionStats,
    sessionStats,
};

