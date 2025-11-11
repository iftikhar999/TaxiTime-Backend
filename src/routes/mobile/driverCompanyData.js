const express = require('express');
const { authenticateToken } = require('../../../middleware/auth');
const prisma = require('../../../lib/prisma');

const router = express.Router();

const toNumber = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
};

const sanitizeCoordinates = (coordinates) => {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map((coord) => {
            if (!coord) return null;

            if (Array.isArray(coord) && coord.length >= 2) {
                const lat = toNumber(coord[1]);
                const lng = toNumber(coord[0]);
                return lat !== null && lng !== null ? { lat, lng } : null;
            }

            const lat = toNumber(coord.lat ?? coord.latitude);
            const lng = toNumber(coord.lng ?? coord.longitude);
            if (lat === null || lng === null) {
                return null;
            }
            return { lat, lng };
        })
        .filter(Boolean);
};

const sanitizeCenterPoint = (centerPoint) => {
    if (!centerPoint) return null;
    const lat = toNumber(centerPoint.lat ?? centerPoint.latitude);
    const lng = toNumber(centerPoint.lng ?? centerPoint.longitude);
    if (lat === null || lng === null) {
        return null;
    }
    return { lat, lng };
};

const sanitizeBounds = (bounds) => {
    if (!bounds) return null;
    const north = toNumber(bounds.north);
    const south = toNumber(bounds.south);
    const east = toNumber(bounds.east);
    const west = toNumber(bounds.west);

    if ([north, south, east, west].some((value) => value === null)) {
        return null;
    }
    return { north, south, east, west };
};

/**
 * @route   GET /api/companies/:id/settings
 * @desc    Get company settings for driver app
 * @access  Authenticated drivers
 */
router.get('/:id/settings', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const company = await prisma.companies.findUnique({
            where: { id },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                companyCode: true,
                logo: true,
                supportEmail: true,
                supportPhone: true,
                operatingHoursJson: true,
                commissionRate: true,
                serviceModes: true,
                dispatchMode: true,
                autoAssignRadiusKm: true,
                driverPayoutFrequency: true,
            }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        const companySettings = await prisma.company_settings.findUnique({
            where: { companyId: id },
            select: {
                mapProvider: true,
                placeApiProvider: true,
                locationUpdateInterval: true,
                heartbeatInterval: true
            }
        });

        // Build settings object for driver app
        const settings = {
            dispatchMode: company.dispatchMode || 'AUTO',
            autoAssignRadius: company.autoAssignRadiusKm || 5.0,
            commissionRate: company.commissionRate || 15.0,
            payoutFrequency: company.driverPayoutFrequency || 'WEEKLY',
            operatingHours: company.operatingHoursJson || {},
            serviceModes: company.serviceModes || { taxi: true },
            supportEmail: company.supportEmail,
            supportPhone: company.supportPhone,
            mapProvider: companySettings?.mapProvider || 'OPENSTREETMAP',
            placeApiProvider: companySettings?.placeApiProvider || 'OPENSTREETMAP',
            locationUpdateInterval: companySettings?.locationUpdateInterval || 2,
            heartbeatInterval: companySettings?.heartbeatInterval || 30
        };

        res.json({
            success: true,
            data: {
                id: company.id,
                name: company.brandName || company.legalName || company.companyCode,
                legalName: company.legalName,
                brandName: company.brandName,
                companyCode: company.companyCode,
                logo: company.logo,
                companyName: company.brandName || company.legalName || company.companyCode,
                // Provide default colors since they don't exist in schema
                primaryColor: '#4F46E5',
                secondaryColor: '#818CF8',
                settings,
            }
        });

    } catch (error) {
        console.error('Get company settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching company settings',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route   GET /api/companies/:id/zones
 * @desc    Get operational zones for a company
 * @access  Authenticated drivers
 */
router.get('/:id/zones', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if company exists
        const company = await prisma.companies.findUnique({
            where: { id },
            select: { id: true, legalName: true, brandName: true }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        // Try to find zones - the Zone model may or may not exist
        let zones = [];
        try {
            // Check if Zone model exists in schema
            if (prisma.zones) {
                zones = await prisma.zones.findMany({
                    where: {
                        companyId: id,
                        isActive: true
                    },
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        boundaries: true,
                        surgeMultiplier: true,
                        isActive: true,
                    },
                    orderBy: { name: 'asc' }
                });
            }
        } catch (error) {
            console.log('Zone model not available or query error:', error.message);
            // Return empty array if Zone model doesn't exist
            zones = [];
        }

        const formattedZones = zones.map((zone) => {
            const boundaries = zone.boundaries || {};
            const coordinates = sanitizeCoordinates(boundaries.coordinates || []);
            const centerPoint = sanitizeCenterPoint(boundaries.centerPoint);
            const bounds = sanitizeBounds(boundaries.bounds);

            return {
                id: zone.id,
                name: zone.name,
                type: zone.type,
                isActive: zone.isActive,
                surgeMultiplier: zone.surgeMultiplier,
                geometryType: (boundaries.geometryType || 'POLYGON').toUpperCase(),
                coordinates,
                centerPoint,
                bounds,
                radius: boundaries.radius !== undefined ? toNumber(boundaries.radius) : null,
                color: boundaries.color || '#4F46E5',
                fillOpacity: boundaries.fillOpacity !== undefined ? toNumber(boundaries.fillOpacity, 0.3) : 0.3,
                strokeWeight: boundaries.strokeWeight !== undefined ? toNumber(boundaries.strokeWeight, 2) : 2,
                icon: boundaries.icon || '📍'
            };
        });

        res.json({
            success: true,
            data: formattedZones
        });

    } catch (error) {
        console.error('Get company zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching company zones'
        });
    }
});

/**
 * @route   GET /api/companies/:id/tariffs
 * @desc    Get tariffs/pricing for a company
 * @access  Authenticated drivers
 */
router.get('/:id/tariffs', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if company exists
        const company = await prisma.companies.findUnique({
            where: { id },
            select: { id: true, name: true }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        // Try to find tariffs - the Tariff model may or may not exist
        let tariffs = [];
        try {
            // Check if Tariff model exists in schema
            if (prisma.tariffs) {
                const rawTariffs = await prisma.tariffs.findMany({
                    where: {
                        companyId: id,
                        isActive: true
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        baseFare: true,
                        perKmRate: true,
                        perMinuteRate: true,
                        minimumFare: true,
                        waitingFee: true,
                        maxSurgeMultiplier: true,
                        isActive: true,
                    },
                    orderBy: { name: 'asc' }
                });

                // Transform to match driver app expectations
                tariffs = rawTariffs.map((tariff, index) => {
                    const baseFare = toNumber(tariff.baseFare, 0);
                    const perKmRate = toNumber(tariff.perKmRate, 0);
                    const perMinuteRate = toNumber(tariff.perMinuteRate, 0);
                    const minimumFare = toNumber(tariff.minimumFare, 0);
                    const waitingFee = toNumber(tariff.waitingFee, 0.25);
                    const surgeMultiplier = toNumber(tariff.maxSurgeMultiplier, 1.0);
                    const vehicleType = 'SEDAN';

                    return {
                        id: tariff.id,
                        name: tariff.name,
                        description: tariff.description || 'Standard pricing',
                        type: vehicleType,
                        vehicleType,
                        baseFare,
                        perKmRate,
                        perMinuteRate,
                        minimumFare,
                        waitingTimeRate: waitingFee,
                        surgeMultiplier,
                        isDefault: index === 0,
                        isActive: tariff.isActive,
                        timeBasedRates: [
                            {
                                timeSlot: 'All Day',
                                baseFare,
                                perMileRate: perKmRate * 1.60934,
                                perMinuteRate,
                                minimumFare,
                            }
                        ],
                        features: [
                            'Standard metered fare',
                            'Real-time GPS tracking',
                            'Cashless payment',
                            'In-app support'
                        ],
                        estimatedEarning: `$${(baseFare * 10).toFixed(0)}-$${(baseFare * 20).toFixed(0)}/day`
                    };
                });
            }
        } catch (error) {
            console.log('Tariff model not available or query error:', error.message);
            // Return mock tariff if Tariff model doesn't exist
            tariffs = [{
                id: 'default-tariff',
                name: 'Standard Rate',
                description: 'Standard taxi fare',
                type: 'SEDAN',
                vehicleType: 'SEDAN',
                baseFare: 3.50,
                perKmRate: 1.20,
                perMinuteRate: 0.35,
                minimumFare: 5.00,
                waitingTimeRate: 0.25,
                surgeMultiplier: 1.0,
                isDefault: true,
                isActive: true,
                timeBasedRates: [
                    {
                        timeSlot: 'All Day',
                        baseFare: 3.50,
                        perMileRate: 1.93, // 1.20 km * 1.60934
                        perMinuteRate: 0.35,
                        minimumFare: 5.00,
                    }
                ],
                features: [
                    'Standard metered fare',
                    'Real-time GPS tracking',
                    'Cashless payment',
                    'In-app support'
                ],
                estimatedEarning: '$35-$70/day'
            }];
        }

        res.json({
            success: true,
            data: tariffs
        });

    } catch (error) {
        console.error('Get company tariffs error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching company tariffs'
        });
    }
});

// GET /api/companies/:companyId/settings - Get company settings for mobile apps
router.get('/:companyId/settings', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.params;
        const { companyId: userCompanyId, role } = req.user;

        // Security: Only allow access to own company's settings (except SUPER_ADMIN)
        if (role !== 'SUPER_ADMIN' && companyId !== userCompanyId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Cannot access other company settings'
            });
        }

        // Get company settings, create defaults if not exists
        let settings = await prisma.company_settings.findUnique({
            where: { companyId },
        });

        if (!settings) {
            settings = await prisma.company_settings.create({
                data: {
                    companyId,
                    mapProvider: 'OPENSTREETMAP',
                    placeApiProvider: 'OPENSTREETMAP',
                    defaultLanguage: 'en',
                    defaultCurrency: 'USD',
                    timezone: 'UTC',
                    locationUpdateInterval: 2, // Default 2 seconds
                    heartbeatInterval: 30, // Default 30 seconds
                },
            });
        }

        // Return settings in the format expected by mobile apps
        res.json({
            success: true,
            data: {
                id: companyId,
                name: null, // Will be populated from Company if needed
                companyName: null, // Will be populated from Company if needed
                settings: {
                    mapProvider: settings.mapProvider || 'OPENSTREETMAP',
                    placeApiProvider: settings.placeApiProvider || 'OPENSTREETMAP',
                    defaultLanguage: settings.defaultLanguage || 'en',
                    defaultCurrency: settings.defaultCurrency || 'USD',
                    timezone: settings.timezone || 'UTC',
                    locationUpdateInterval: settings.locationUpdateInterval || 2,
                    heartbeatInterval: settings.heartbeatInterval || 30,
                }
            }
        });

    } catch (error) {
        console.error('Get company settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching company settings'
        });
    }
});

module.exports = router;
