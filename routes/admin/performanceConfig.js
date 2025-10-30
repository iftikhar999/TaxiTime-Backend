/**
 * Super Admin Performance Configuration API
 * 
 * Allows super admin to:
 * 1. View performance analysis reports
 * 2. Configure API polling intervals
 * 3. Set cache TTLs
 * 4. Adjust debounce times
 * 5. Control rate limits
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const { generateAnalysisReport, resetSessionStats } = require('../../middleware/performanceLogger');

// Helper middleware for super admin only
const requireSuperAdmin = requireRole('SUPER_ADMIN');

// Configuration storage
const CONFIG_FILE = path.join(__dirname, '../../config/performance-config.json');

// Default configuration
const DEFAULT_CONFIG = {
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
    
    // Location updates
    location: {
        driverUpdateInterval: 2000, // ms - how often driver sends location
        zoneDetectionDebounce: 3000, // ms - debounce for zone updates
        zoneStabilityRequired: 3, // consecutive detections needed
        locationBatchSize: 1, // batch N updates into 1 emission (1 = no batching)
    },
    
    // Job polling
    jobs: {
        upcomingJobsPolling: 30000, // ms - how often driver polls for jobs
        dispatcherJobsRefresh: 5000, // ms - how often dispatcher refreshes job list
        jobOfferTimeout: 30000, // ms - how long driver has to accept
    },
    
    // Caching
    cache: {
        jobListTTL: 10, // seconds - cache jobs list
        driverListTTL: 5, // seconds - cache driver list
        zoneTTL: 300, // seconds - cache zone data
        tariffTTL: 600, // seconds - cache tariff data
    },
    
    // Database
    database: {
        locationHistoryLimit: 100, // keep last N locations per driver
        cleanupInterval: 3600000, // ms - cleanup old data every hour
    },
    
    // Rate limiting
    rateLimits: {
        jobsUpcoming: { windowMs: 60000, max: 60 }, // 60 requests per minute
        driverLocation: { windowMs: 60000, max: 100 }, // 100 requests per minute
        zoneUpdate: { windowMs: 60000, max: 50 }, // 50 requests per minute
    },
    
    // Socket events
    socket: {
        locationUpdateConsolidated: true, // use single consolidated event
        batchSocketEmissions: false, // batch multiple events (experimental)
    },
};

/**
 * Load configuration from file
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading performance config:', error);
    }
    return DEFAULT_CONFIG;
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving performance config:', error);
        return false;
    }
}

/**
 * GET /api/admin/performance/config
 * Get current performance configuration
 */
router.get('/config', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const config = loadConfig();
        res.json({
            success: true,
            config,
        });
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch configuration',
        });
    }
});

/**
 * PUT /api/admin/performance/config
 * Update performance configuration
 */
router.put('/config', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const currentConfig = loadConfig();
        const updates = req.body;
        
        // Merge updates with current config
        const newConfig = {
            ...currentConfig,
            ...updates,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user?.id || 'super_admin',
        };
        
        // Validate configuration
        const validation = validateConfig(newConfig);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid configuration',
                errors: validation.errors,
            });
        }
        
        // Save configuration
        if (saveConfig(newConfig)) {
            console.log(`📝 Performance configuration updated by ${newConfig.updatedBy}`);
            
            // Broadcast configuration change to all services
            broadcastConfigUpdate(newConfig);
            
            res.json({
                success: true,
                message: 'Configuration updated successfully',
                config: newConfig,
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to save configuration',
            });
        }
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update configuration',
        });
    }
});

/**
 * GET /api/admin/performance/analysis
 * Get performance analysis report
 */
router.get('/analysis', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const report = generateAnalysisReport();
        res.json({
            success: true,
            report,
        });
    } catch (error) {
        console.error('Error generating analysis:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate analysis report',
        });
    }
});

/**
 * POST /api/admin/performance/analysis/reset
 * Reset performance tracking (start new analysis period)
 */
router.post('/analysis/reset', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        resetSessionStats();
        res.json({
            success: true,
            message: 'Performance tracking reset successfully',
        });
    } catch (error) {
        console.error('Error resetting stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset performance tracking',
        });
    }
});

/**
 * GET /api/admin/performance/logs
 * List available log files
 */
router.get('/logs', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const logsDir = path.join(__dirname, '../../logs');
        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log') || file.endsWith('.json'))
            .map(file => {
                const stats = fs.statSync(path.join(logsDir, file));
                return {
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                };
            })
            .sort((a, b) => b.modified - a.modified);
        
        res.json({
            success: true,
            logs: files,
        });
    } catch (error) {
        console.error('Error listing logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list log files',
        });
    }
});

/**
 * GET /api/admin/performance/logs/:filename
 * Download specific log file
 */
router.get('/logs/:filename', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../../logs', filename);
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(path.join(__dirname, '../../logs'))) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Log file not found',
            });
        }
        
        res.download(filePath);
    } catch (error) {
        console.error('Error downloading log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download log file',
        });
    }
});

/**
 * POST /api/admin/performance/apply-recommendations
 * Auto-apply recommended optimizations
 */
router.post('/apply-recommendations', authenticateToken, requireSuperAdmin, (req, res) => {
    try {
        const report = generateAnalysisReport();
        const config = loadConfig();
        let applied = 0;
        
        // Apply high-priority recommendations
        report.recommendations.forEach(rec => {
            if (rec.priority === 'HIGH') {
                if (rec.type === 'CACHING' && rec.endpoint.includes('/jobs/upcoming')) {
                    config.cache.jobListTTL = 15; // Increase cache TTL
                    applied++;
                }
                
                if (rec.type === 'RATE_LIMITING') {
                    // Adjust polling intervals
                    if (rec.endpoint.includes('/jobs/upcoming')) {
                        config.jobs.upcomingJobsPolling = Math.max(
                            config.jobs.upcomingJobsPolling,
                            45000 // Increase to 45s
                        );
                        applied++;
                    }
                }
            }
        });
        
        if (applied > 0) {
            config.updatedAt = new Date().toISOString();
            config.updatedBy = `${req.user?.id} (auto-apply)`;
            saveConfig(config);
            broadcastConfigUpdate(config);
        }
        
        res.json({
            success: true,
            message: `Applied ${applied} recommendations`,
            appliedCount: applied,
            config,
        });
    } catch (error) {
        console.error('Error applying recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply recommendations',
        });
    }
});

/**
 * Validate configuration
 */
function validateConfig(config) {
    const errors = [];
    
    // Validate location config
    if (config.location?.driverUpdateInterval < 1000) {
        errors.push('Driver update interval must be at least 1 second');
    }
    if (config.location?.zoneDetectionDebounce < 1000) {
        errors.push('Zone detection debounce must be at least 1 second');
    }
    
    // Validate job config
    if (config.jobs?.jobOfferTimeout < 10000) {
        errors.push('Job offer timeout must be at least 10 seconds');
    }
    
    // Validate cache config
    if (config.cache?.jobListTTL < 5) {
        errors.push('Job list cache TTL must be at least 5 seconds');
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Broadcast configuration update to all services
 */
function broadcastConfigUpdate(config) {
    try {
        // Update zone service debounce
        const queueService = require('../../services/queueManagementService');
        if (queueService && config.location?.zoneDetectionDebounce) {
            // Note: This would require the service to expose a method to update config
            console.log('📡 Configuration broadcast to services');
        }
        
        // Broadcast via socket to all clients
        const io = global.io;
        if (io) {
            io.of('/dispatch').emit('config:updated', {
                timestamp: new Date().toISOString(),
                config: {
                    jobs: config.jobs,
                    cache: config.cache,
                },
            });
            
            io.of('/driver').emit('config:updated', {
                timestamp: new Date().toISOString(),
                config: {
                    location: config.location,
                    jobs: config.jobs,
                },
            });
        }
    } catch (error) {
        console.error('Error broadcasting config update:', error);
    }
}

module.exports = router;

