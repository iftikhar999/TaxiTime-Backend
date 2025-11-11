const prisma = require('../lib/prisma');

/**
 * In-Memory Zone Cache Service
 * Caches zones per company to avoid repeated database queries
 * Significantly improves performance for zone detection
 */
class ZoneCacheService {
    constructor() {
        // Map of companyId -> zones[]
        this.zonesByCompany = new Map();
        
        // Map of companyId -> timestamp
        this.lastUpdate = new Map();
        
        // Cache TTL: 5 minutes
        this.CACHE_TTL = 5 * 60 * 1000;
        
        console.log('🗺️ Zone Cache Service initialized');
    }

    /**
     * Get zones for a company (with caching)
     * @param {string} companyId - Company ID
     * @returns {Promise<Array>} Array of zones
     */
    async getCompanyZones(companyId) {
        if (!companyId) {
            return [];
        }

        const now = Date.now();
        const lastUpdate = this.lastUpdate.get(companyId) || 0;
        
        // Check if cache is still valid
        if (now - lastUpdate < this.CACHE_TTL) {
            const cachedZones = this.zonesByCompany.get(companyId);
            if (cachedZones) {
                console.log(`✅ Zone cache HIT for company ${companyId} (${cachedZones.length} zones)`);
                return cachedZones;
            }
        }
        
        // Cache miss or expired - fetch from database
        console.log(`🔄 Zone cache MISS for company ${companyId} - fetching from DB`);
        
        try {
            const zones = await prisma.zones.findMany({
                where: { 
                    companyId,
                    isActive: true 
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    boundaries: true, // ✅ FIXED: Use 'boundaries' from schema
                    companyId: true,
                }
            });
            
            // Process zones to extract coordinates and calculate bounds
            const processedZones = zones.map(zone => {
                let coordinates = [];
                let bounds = null;
                
                // Parse boundaries JSON
                if (zone.boundaries) {
                    try {
                        const boundariesData = typeof zone.boundaries === 'string' 
                            ? JSON.parse(zone.boundaries) 
                            : zone.boundaries;
                        
                        // Extract coordinates from boundaries
                        // Boundaries can be in various formats:
                        // 1. Array of {lat, lng}
                        // 2. Object with coordinates property
                        // 3. GeoJSON format
                        
                        if (Array.isArray(boundariesData)) {
                            coordinates = boundariesData;
                        } else if (boundariesData.coordinates && Array.isArray(boundariesData.coordinates)) {
                            coordinates = boundariesData.coordinates;
                        } else if (boundariesData.type === 'Polygon' && boundariesData.coordinates) {
                            // GeoJSON format: coordinates[0] is the outer ring
                            coordinates = boundariesData.coordinates[0];
                        }
                        
                        // Calculate bounds if we have coordinates
                        if (coordinates.length > 0) {
                            bounds = this.calculateBounds(coordinates);
                        }
                    } catch (error) {
                        console.error(`❌ Error parsing boundaries for zone ${zone.id}:`, error);
                    }
                }
                
                return {
                    ...zone,
                    coordinates,
                    bounds,
                };
            });
            
            // Update cache
            this.zonesByCompany.set(companyId, processedZones);
            this.lastUpdate.set(companyId, now);
            
            console.log(`✅ Cached ${processedZones.length} zones for company ${companyId}`);
            
            return processedZones;
        } catch (error) {
            console.error(`❌ Error fetching zones for company ${companyId}:`, error);
            return [];
        }
    }

    /**
     * Calculate bounding box from polygon coordinates
     * @param {Array} coordinates - Array of {lat, lng} or {latitude, longitude}
     * @returns {Object} Bounds object {north, south, east, west}
     */
    calculateBounds(coordinates) {
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
            return null;
        }

        let north = -90;
        let south = 90;
        let east = -180;
        let west = 180;

        for (const coord of coordinates) {
            const lat = coord.lat || coord.latitude;
            const lng = coord.lng || coord.longitude;
            
            if (typeof lat !== 'number' || typeof lng !== 'number') {
                continue;
            }

            north = Math.max(north, lat);
            south = Math.min(south, lat);
            east = Math.max(east, lng);
            west = Math.min(west, lng);
        }

        return { north, south, east, west };
    }

    /**
     * Invalidate cache for a specific company
     * Call this when zones are updated/created/deleted
     * @param {string} companyId - Company ID
     */
    invalidateCompany(companyId) {
        if (!companyId) {
            return;
        }

        const hadCache = this.zonesByCompany.has(companyId);
        
        this.zonesByCompany.delete(companyId);
        this.lastUpdate.delete(companyId);
        
        if (hadCache) {
            console.log(`🗑️ Invalidated zone cache for company ${companyId}`);
        }
    }

    /**
     * Invalidate all caches
     * Call this for global zone updates or during deployment
     */
    invalidateAll() {
        const companyCount = this.zonesByCompany.size;
        
        this.zonesByCompany.clear();
        this.lastUpdate.clear();
        
        console.log(`🗑️ Invalidated ALL zone caches (${companyCount} companies)`);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        const stats = {
            cachedCompanies: this.zonesByCompany.size,
            totalZones: 0,
            oldestCacheAge: 0,
            companies: []
        };

        const now = Date.now();

        for (const [companyId, zones] of this.zonesByCompany.entries()) {
            const lastUpdate = this.lastUpdate.get(companyId) || 0;
            const age = now - lastUpdate;
            
            stats.totalZones += zones.length;
            stats.oldestCacheAge = Math.max(stats.oldestCacheAge, age);
            
            stats.companies.push({
                companyId,
                zoneCount: zones.length,
                cacheAge: Math.floor(age / 1000), // seconds
                valid: age < this.CACHE_TTL
            });
        }

        return stats;
    }
}

// Singleton instance
const zoneCacheService = new ZoneCacheService();

module.exports = zoneCacheService;
