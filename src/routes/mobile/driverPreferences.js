const express = require('express');
const prisma = require('../../../lib/prisma');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();

/**
 * @route   PUT /api/mobile/driver/preferences
 * @desc    Update driver preferences (vehicle, tariff, zone)
 * @access  Private (Driver only)
 */
router.put('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { vehicleId, tariffId, zoneId } = req.body;

        console.log(`🔧 Updating driver preferences for ${userId}:`, {
            vehicleId,
            tariffId,
            zoneId,
        });

        // Validate inputs if provided
        if (vehicleId) {
            const vehicle = await prisma.vehicle.findFirst({
                where: {
                    id: vehicleId,
                    driverId: userId,
                    isActive: true,
                },
            });

            if (!vehicle) {
                return res.status(400).json({
                    success: false,
                    message: 'Vehicle not found or not assigned to you',
                });
            }
        }

        if (tariffId) {
            const driver = await prisma.user.findUnique({
                where: { id: userId },
                select: { companyId: true },
            });

            if (!driver?.companyId) {
                return res.status(400).json({
                    success: false,
                    message: 'No company assigned',
                });
            }

            const tariff = await prisma.tariff.findFirst({
                where: {
                    id: tariffId,
                    companyId: driver.companyId,
                    isActive: true,
                },
            });

            if (!tariff) {
                return res.status(400).json({
                    success: false,
                    message: 'Tariff not found or not active',
                });
            }
        }

        if (zoneId) {
            const driver = await prisma.user.findUnique({
                where: { id: userId },
                select: { companyId: true },
            });

            if (!driver?.companyId) {
                return res.status(400).json({
                    success: false,
                    message: 'No company assigned',
                });
            }

            const zone = await prisma.zone.findFirst({
                where: {
                    id: zoneId,
                    companyId: driver.companyId,
                    isActive: true,
                },
            });

            if (!zone) {
                return res.status(400).json({
                    success: false,
                    message: 'Zone not found or not active',
                });
            }
        }

        // Upsert preferences
        const preferences = await prisma.driverPreferences.upsert({
            where: {
                driverId: userId,
            },
            create: {
                driverId: userId,
                selectedZoneId: zoneId || null,
                selectedTariffId: tariffId || null,
                // Note: DriverPreferences schema doesn't have selectedVehicleId
                // We'll need to add it or handle vehicles differently
            },
            update: {
                ...(zoneId !== undefined && { selectedZoneId: zoneId }),
                ...(tariffId !== undefined && { selectedTariffId: tariffId }),
            },
        });

        console.log(`✅ Driver preferences updated for ${userId}`);

        res.json({
            success: true,
            message: 'Preferences updated successfully',
            data: preferences,
        });
    } catch (error) {
        console.error('Failed to update driver preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating preferences',
        });
    }
});

/**
 * @route   GET /api/mobile/driver/preferences
 * @desc    Get driver preferences
 * @access  Private (Driver only)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;

        const preferences = await prisma.driverPreferences.findUnique({
            where: {
                driverId: userId,
            },
            include: {
                selectedZone: {
                    select: {
                        id: true,
                        name: true,
                        boundaries: true,
                    },
                },
                selectedTariff: {
                    select: {
                        id: true,
                        name: true,
                        baseFare: true,
                        perKmRate: true,
                        perMinuteRate: true,
                    },
                },
            },
        });

        res.json({
            success: true,
            data: preferences,
        });
    } catch (error) {
        console.error('Failed to fetch driver preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching preferences',
        });
    }
});

module.exports = router;
