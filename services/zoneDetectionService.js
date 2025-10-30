const zoneCacheService = require('./zoneCacheService');

/**
 * Point-in-Polygon algorithm (Ray Casting)
 * Determines if a point is inside a polygon
 * @param {Object} point - {lat, lng}
 * @param {Array} polygon - Array of {lat, lng} coordinates
 * @returns {boolean} True if point is inside polygon
 */
function pointInPolygon(point, polygon) {
    if (!point || !polygon || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
    }

    const { lat, lng } = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        // Support both {lat, lng} and {latitude, longitude} formats
        const xi = polygon[i].lng || polygon[i].longitude;
        const yi = polygon[i].lat || polygon[i].latitude;
        const xj = polygon[j].lng || polygon[j].longitude;
        const yj = polygon[j].lat || polygon[j].latitude;

        if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) {
            continue;
        }

        const intersect =
            yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Check if a point is within a bounding box (quick rejection test)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} bounds - {north, south, east, west}
 * @returns {boolean} True if point is within bounds
 */
function isWithinBounds(lat, lng, bounds) {
    if (!bounds) {
        return true; // No bounds = can't reject
    }

    return (
        lat >= bounds.south &&
        lat <= bounds.north &&
        lng >= bounds.west &&
        lng <= bounds.east
    );
}

/**
 * Detect which zone a location is in (OPTIMIZED with caching and bounds check)
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {string} companyId - Company ID
 * @returns {Promise<Object|null>} Zone object or null
 */
async function detectZone(latitude, longitude, companyId) {
    // Validate inputs
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        console.warn('⚠️ Invalid coordinates for zone detection:', { latitude, longitude });
        return null;
    }

    if (!companyId) {
        console.warn('⚠️ No company ID provided for zone detection');
        return null;
    }

    const startTime = Date.now();

    try {
        // Get zones from cache (or DB if cache miss)
        const zones = await zoneCacheService.getCompanyZones(companyId);

        if (zones.length === 0) {
            console.log(`ℹ️ No zones found for company ${companyId}`);
            return null;
        }

        // Step 1: Quick rejection using bounding boxes
        const candidateZones = zones.filter(zone => {
            if (!zone.bounds) {
                return true; // No bounds = must check polygon
            }
            return isWithinBounds(latitude, longitude, zone.bounds);
        });

        console.log(
            `🔍 Zone detection: ${candidateZones.length}/${zones.length} candidates after bounds check`
        );

        // Step 2: Point-in-polygon check for candidates only
        for (const zone of candidateZones) {
            if (!zone.coordinates || !Array.isArray(zone.coordinates)) {
                continue;
            }

            const point = { lat: latitude, lng: longitude };
            
            if (pointInPolygon(point, zone.coordinates)) {
                const duration = Date.now() - startTime;
                console.log(
                    `✅ Zone detected: "${zone.name}" (${zone.id}) in ${duration}ms`
                );
                return zone;
            }
        }

        const duration = Date.now() - startTime;
        console.log(`ℹ️ No zone match for location (${latitude}, ${longitude}) in ${duration}ms`);
        return null;
    } catch (error) {
        console.error('❌ Error in zone detection:', error);
        return null;
    }
}

/**
 * Invalidate zone cache for a company
 * Call this when zones are updated
 * @param {string} companyId - Company ID
 */
function invalidateZoneCache(companyId) {
    zoneCacheService.invalidateCompany(companyId);
}

/**
 * Invalidate all zone caches
 */
function invalidateAllZoneCaches() {
    zoneCacheService.invalidateAll();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getZoneCacheStats() {
    return zoneCacheService.getCacheStats();
}

module.exports = {
    detectZone,
    pointInPolygon,
    isWithinBounds,
    invalidateZoneCache,
    invalidateAllZoneCaches,
    getZoneCacheStats,
};
