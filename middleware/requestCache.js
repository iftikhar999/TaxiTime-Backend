/**
 * Request-Level Caching Middleware
 * 
 * Provides lightweight in-memory caching for API responses to reduce database load.
 * Particularly useful for frequently-called endpoints like /jobs/upcoming.
 * 
 * Features:
 * - Per-user caching (cache key includes user ID)
 * - Configurable TTL per route
 * - Automatic cache invalidation
 * - Cache statistics
 */

const NodeCache = require('node-cache');

// Create cache instance
const requestCache = new NodeCache({
    stdTTL: 10, // Default: 10 seconds
    checkperiod: 5, // Check for expired keys every 5 seconds
    useClones: false, // Better performance - don't clone objects
    deleteOnExpire: true,
});

// Cache statistics
const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
};

/**
 * Cache middleware factory
 * @param {number} ttlSeconds - Time to live in seconds (default: 10)
 * @param {Function} keyGenerator - Optional custom key generator function
 * @returns {Function} Express middleware function
 */
function cacheMiddleware(ttlSeconds = 10, keyGenerator = null) {
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Generate cache key
        const key = keyGenerator
            ? keyGenerator(req)
            : `${req.user?.id || 'anonymous'}:${req.originalUrl}`;

        // Try to get cached response
        const cachedResponse = requestCache.get(key);

        if (cachedResponse) {
            stats.hits++;
            console.log(`🎯 Cache HIT: ${key} (${stats.hits} total hits)`);
            return res.json(cachedResponse);
        }

        stats.misses++;
        console.log(`❌ Cache MISS: ${key} (${stats.misses} total misses)`);

        // Intercept res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            // Only cache successful responses
            if (res.statusCode === 200 && body) {
                requestCache.set(key, body, ttlSeconds);
                stats.sets++;
                console.log(`💾 Cached: ${key} (TTL: ${ttlSeconds}s)`);
            }
            return originalJson(body);
        };

        next();
    };
}

/**
 * Invalidate cache for a specific pattern
 * @param {string} pattern - Pattern to match keys (e.g., 'user123:')
 */
function invalidateCache(pattern) {
    const keys = requestCache.keys();
    let count = 0;

    keys.forEach((key) => {
        if (key.includes(pattern)) {
            requestCache.del(key);
            count++;
        }
    });

    console.log(`🗑️ Invalidated ${count} cache entries matching: ${pattern}`);
    return count;
}

/**
 * Invalidate all cache entries for a specific user
 * @param {string} userId - User ID
 */
function invalidateUserCache(userId) {
    return invalidateCache(`${userId}:`);
}

/**
 * Clear all cache
 */
function clearAllCache() {
    requestCache.flushAll();
    console.log('🗑️ All cache cleared');
    stats.hits = 0;
    stats.misses = 0;
    stats.sets = 0;
}

/**
 * Get cache statistics
 */
function getCacheStats() {
    const hitRate = stats.hits + stats.misses > 0
        ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
        : 0;

    return {
        hits: stats.hits,
        misses: stats.misses,
        sets: stats.sets,
        hitRate: `${hitRate}%`,
        keys: requestCache.keys().length,
        size: requestCache.getStats(),
    };
}

/**
 * Cache warming - pre-populate cache for a user
 * @param {string} userId - User ID
 * @param {Object} data - Data to cache
 * @param {string} url - URL/endpoint
 * @param {number} ttl - TTL in seconds
 */
function warmCache(userId, url, data, ttl = 10) {
    const key = `${userId}:${url}`;
    requestCache.set(key, data, ttl);
    console.log(`🔥 Cache warmed: ${key}`);
}

module.exports = {
    cacheMiddleware,
    requestCache,
    invalidateCache,
    invalidateUserCache,
    clearAllCache,
    getCacheStats,
    warmCache,
    stats,
};

