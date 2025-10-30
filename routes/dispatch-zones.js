/**
 * Dispatch Zone Routes
 * 
 * Handles zone detection and fare calculation for dispatch panel
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const zoneDetectionService = require('../services/zoneDetectionService');
const fareCalculationService = require('../services/fareCalculationService');

router.use(authenticateToken);
router.use(authorizeRoles('DISPATCHER', 'OWNER', 'ADMIN', 'COMPANY_ADMIN'));

// ═══════════════════════════════════════════════════════════
// POST /api/dispatch/zones/detect - Detect zone from coordinates
// ═══════════════════════════════════════════════════════════
router.post('/detect', async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const { companyId } = req.user;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: 'lat and lng are required'
            });
        }

        // Detect zone
        const zone = await zoneDetectionService.detectZone(lat, lng, companyId);

        if (!zone) {
            return res.json({
                success: true,
                data: null,
                message: 'No zone found for these coordinates'
            });
        }

        // Get default tariff for zone
        const defaultTariff = await zoneDetectionService.getDefaultTariffForZone(zone.id);

        res.json({
            success: true,
            data: {
                zone: {
                    id: zone.id,
                    name: zone.name,
                    description: zone.description,
                    surgeMultiplier: zone.surgeMultiplier
                },
                defaultTariff: defaultTariff ? {
                    id: defaultTariff.id,
                    name: defaultTariff.name,
                    baseFare: defaultTariff.baseFare,
                    perKmRate: defaultTariff.perKmRate,
                    perMinuteRate: defaultTariff.perMinuteRate
                } : null
            }
        });

    } catch (error) {
        console.error('Zone detection error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to detect zone',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/dispatch/zones/:zoneId/tariffs - Get tariffs for zone
// ═══════════════════════════════════════════════════════════
router.get('/:zoneId/tariffs', async (req, res) => {
    try {
        const { zoneId } = req.params;

        const tariffs = await zoneDetectionService.getTariffsForZone(zoneId);

        res.json({
            success: true,
            data: tariffs,
            total: tariffs.length
        });

    } catch (error) {
        console.error('Get zone tariffs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch zone tariffs',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/dispatch/zones/:zoneId/tariff/active - Get active tariff
// ═══════════════════════════════════════════════════════════
router.get('/:zoneId/tariff/active', async (req, res) => {
    try {
        const { zoneId } = req.params;

        const tariff = await zoneDetectionService.getActiveTariffForZone(zoneId);

        if (!tariff) {
            return res.status(404).json({
                success: false,
                message: 'No active tariff found for this zone'
            });
        }

        res.json({
            success: true,
            data: tariff
        });

    } catch (error) {
        console.error('Get active tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/dispatch/calculate-fare - Calculate fare
// ═══════════════════════════════════════════════════════════
router.post('/calculate-fare', async (req, res) => {
    try {
        const {
            tariffId,
            pickup,
            dropoff,
            zoneId,
            distance,
            duration,
            waitingTime,
            isAirport,
            tollFees
        } = req.body;

        if (!pickup || !pickup.lat || !pickup.lng) {
            return res.status(400).json({
                success: false,
                message: 'pickup coordinates (lat, lng) are required'
            });
        }

        if (!dropoff || !dropoff.lat || !dropoff.lng) {
            return res.status(400).json({
                success: false,
                message: 'dropoff coordinates (lat, lng) are required'
            });
        }

        // Calculate fare
        const fareBreakdown = await fareCalculationService.calculateFare({
            tariffId,
            pickup,
            dropoff,
            zoneId,
            distance,
            duration,
            waitingTime,
            isAirport,
            tollFees
        });

        res.json({
            success: true,
            data: fareBreakdown
        });

    } catch (error) {
        console.error('Calculate fare error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate fare',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/dispatch/estimate-fare - Get estimated fare
// ═══════════════════════════════════════════════════════════
router.post('/estimate-fare', async (req, res) => {
    try {
        const { pickup, dropoff, zoneId, tariffId } = req.body;
        const { companyId } = req.user;

        if (!pickup || !pickup.lat || !pickup.lng) {
            return res.status(400).json({
                success: false,
                message: 'pickup coordinates (lat, lng) are required'
            });
        }

        if (!dropoff || !dropoff.lat || !dropoff.lng) {
            return res.status(400).json({
                success: false,
                message: 'dropoff coordinates (lat, lng) are required'
            });
        }

        // Get estimated fare
        const estimate = await fareCalculationService.getEstimatedFare({
            pickup,
            dropoff,
            companyId,
            zoneId,
            tariffId
        });

        res.json({
            success: true,
            data: estimate
        });

    } catch (error) {
        console.error('Estimate fare error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to estimate fare',
            error: error.message
        });
    }
});

module.exports = router;
