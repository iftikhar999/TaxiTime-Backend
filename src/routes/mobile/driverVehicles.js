const express = require('express');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();

// Helper function to safely convert values to numbers
const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

/**
 * @route   GET /api/mobile/driver/vehicles
 * @desc    Get vehicles assigned to the authenticated driver
 * @access  Private (Driver only)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;

        // Get driver with company info
        const driver = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                companyId: true,
                companies_users_companyIdTocompanies: {
                    select: {
                        id: true,
                        name: true,
                        brandName: true,
                        legalName: true
                    }
                }
            }
        });

        if (!driver || !driver.companyId) {
            return res.status(400).json({
                success: false,
                message: 'Driver not associated with any company'
            });
        }

        const companyRecord = driver.companies_users_companyIdTocompanies
            ?? (await prisma.companies.findUnique({
                where: { id: driver.companyId },
                select: {
                    id: true,
                    name: true,
                    brandName: true,
                    legalName: true
                }
            }));

        const companySummary = companyRecord
            ? {
                id: companyRecord.id,
                name: companyRecord.brandName || companyRecord.name || companyRecord.legalName || null
            }
            : null;

        // Get vehicles assigned to this driver
        const vehicles = await prisma.vehicles.findMany({
            where: {
                driverId: userId,
                isActive: true
            },
            select: {
                id: true,
                make: true,
                model: true,
                year: true,
                color: true,
                licensePlate: true,
                vehicleType: true,
                isActive: true,  // Added - needed by driver app
                isAvailable: true,
                vin: true,
                capacity: true,
                features: true,
                insurance: true,
                registration: true,
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            data: {
                vehicles,
                totalVehicles: vehicles.length,
                company: companySummary
            }
        });

    } catch (error) {
        console.error('Get driver vehicles error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching vehicles'
        });
    }
});

/**
 * @route   GET /api/mobile/driver/vehicles/:id
 * @desc    Get specific vehicle details
 * @access  Private (Driver only)
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { id } = req.params;

        const vehicle = await prisma.vehicles.findFirst({
            where: {
                id,
                driverId: userId,
                isActive: true
            },
            select: {
                id: true,
                make: true,
                model: true,
                year: true,
                color: true,
                licensePlate: true,
                vehicleType: true,
                isAvailable: true,
                vin: true,
                capacity: true,
                features: true,
                insurance: true,
                registration: true,
                currentLocation: true,
                companies: {
                    select: {
                        id: true,
                        name: true,
                        brandName: true,
                        legalName: true
                    }
                }
            }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found or not assigned to you'
            });
        }

        const { companies, ...vehicleData } = vehicle;

        const companySummary = companies
            ? {
                id: companies.id,
                name: companies.brandName || companies.name || companies.legalName || null
            }
            : null;

        const mappedVehicle = {
            ...vehicleData,
            company: companySummary
        };

        res.json({
            success: true,
            data: { vehicle: mappedVehicle }
        });

    } catch (error) {
        console.error('Get vehicle details error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching vehicle details'
        });
    }
});

/**
 * @route   GET /api/mobile/driver/vehicles/:vehicleId/tariffs
 * @desc    DEPRECATED: Use zone-based tariffs instead
 * @access  Private (Driver only)
 * @note    This endpoint redirects to company zones and zone tariffs
 */
router.get('/:vehicleId/tariffs', authenticateToken, async (req, res) => {
    // 🚨🚨🚨 EMERGENCY LOOP BREAKER 🚨🚨🚨
    // DO NOT REMOVE THIS - IT PREVENTS INFINITE LOOPS
    
    console.log('\n' + '='.repeat(80));
    console.log('🚨🚨🚨 INFINITE LOOP DETECTED 🚨🚨🚨');
    console.log('ShiftContext.tsx:320 is calling this endpoint!');
    console.log('THIS ENDPOINT NO LONGER EXISTS - USE ZONE-BASED TARIFFS');
    console.log('='.repeat(80) + '\n');
    
    // Return immediately - DO NOT query database
    return res.json({
        success: true,
        data: [],
        message: '🛑 LOOP BREAKER ACTIVE - ShiftContext.tsx:320 MUST BE REMOVED',
        loopBreaker: true,
        emergency: true,
        deleteThisCode: 'ShiftContext.tsx line 320 - Fetching zone-specific tariffs for vehicle',
        guidance: {
            issue: 'App stuck in vehicle→tariff→vehicle infinite loop',
            solution: 'DELETE ShiftContext.tsx:320 and use zone-based flow',
            mobileAppNeedsUpdate: true,
            correctFlow: [
                '1. DELETE line 320 in ShiftContext.tsx',
                '2. Fetch company zones with GET /zones',
                '3. User selects zone',
                '4. Fetch zone tariffs with GET /zones/:zoneId/tariffs', 
                '5. User selects tariff',
                '6. Save with POST /zones/select'
            ]
        }
    });
});

/**
 * @route   POST /api/mobile/driver/vehicles/select
 * @desc    Select a vehicle and refresh zones
 * @access  Private (Driver only)
 */
router.post('/select', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { vehicleId } = req.body;

        if (!vehicleId) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle ID is required'
            });
        }

        // Verify the vehicle belongs to this driver
        const vehicle = await prisma.vehicles.findFirst({
            where: {
                id: vehicleId,
                driverId: userId,
                isActive: true
            },
            select: {
                id: true,
                make: true,
                model: true,
                year: true,
                color: true,
                licensePlate: true,
                vehicleType: true
            }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found or not assigned to you'
            });
        }

        // Get current driver preferences
        const driver = await prisma.user.findUnique({
            where: { id: userId },
            select: { 
                id: true,
                preferences: true,
                companyId: true
            }
        });

        // Update driver preferences with selected vehicle
        const currentPreferences = driver.preferences && typeof driver.preferences === 'object'
            ? driver.preferences
            : {};

        const updatedPreferences = {
            ...currentPreferences,
            selectedVehicleId: vehicleId,
            vehicleSelectedAt: new Date().toISOString()
        };

        await prisma.user.update({
            where: { id: userId },
            data: {
                preferences: updatedPreferences
            }
        });

        console.log(`🚗 Driver ${userId} selected vehicle ${vehicleId} (${vehicle.make} ${vehicle.model})`);

        // Automatically fetch refreshed zones for the selected vehicle
        const zones = await prisma.zones.findMany({
            where: {
                companyId: driver.companyId,
                isActive: true,
                vehicle_zones: {
                    some: {
                        vehicleId: vehicleId
                    }
                }
            },
            include: {
                zone_tariffs: {
                    where: {
                        tariffs: {
                            isActive: true
                        }
                    },
                    include: {
                        tariffs: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                baseFare: true,
                                perKmRate: true,
                                perMinuteRate: true,
                                minimumFare: true,
                                waitingFee: true,
                                isActive: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { type: 'asc' },
                { name: 'asc' }
            ]
        });

        const formattedZones = zones.map((zone) => {
            const surgeMultiplier = zone.surgeMultiplier ? toNumber(zone.surgeMultiplier, 1) : 1;

            const tariffs = zone.zone_tariffs.map((zt) => {
                const tariff = zt.tariffs;
                const baseFare = toNumber(tariff.baseFare, 0);
                const perKmRate = toNumber(tariff.perKmRate, 0);
                const perMinuteRate = toNumber(tariff.perMinuteRate, 0);
                const minimumFare = toNumber(tariff.minimumFare, 0);
                const waitingFee = toNumber(tariff.waitingFee, 0);

                return {
                    zoneTariffId: zt.id,
                    priority: zt.priority,
                    isDefault: zt.isDefault,
                    activeFrom: zt.activeFrom,
                    activeTo: zt.activeTo,
                    daysOfWeek: zt.daysOfWeek,
                    timeFrom: zt.timeFrom,
                    timeTo: zt.timeTo,
                    id: tariff.id,
                    name: tariff.name,
                    description: tariff.description,
                    vehicleType: 'SEDAN',
                    baseFare,
                    perKmRate,
                    perMinuteRate,
                    minimumFare,
                    waitingFee,
                    isActive: tariff.isActive
                };
            });

            return {
                id: zone.id,
                name: zone.name,
                description: zone.description,
                type: zone.type,
                boundaries: zone.boundaries,
                surgeMultiplier,
                isActive: zone.isActive,
                tariffCount: tariffs.length,
                tariffs
            };
        });

        console.log(`✅ Vehicle selected and zones refreshed for driver ${userId}`);

        res.json({
            success: true,
            message: 'Vehicle selected successfully',
            data: {
                selectedVehicle: {
                    id: vehicle.id,
                    make: vehicle.make,
                    model: vehicle.model,
                    year: vehicle.year,
                    color: vehicle.color,
                    licensePlate: vehicle.licensePlate,
                    vehicleType: vehicle.vehicleType
                },
                refreshedZones: formattedZones,
                zonesRefreshedAt: new Date().toISOString(),
                totalZones: formattedZones.length,
                totalTariffs: formattedZones.reduce((sum, zone) => sum + zone.tariffCount, 0)
            }
        });

    } catch (error) {
        console.error('Vehicle selection error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error selecting vehicle',
            error: error.message
        });
    }
});

module.exports = router;
