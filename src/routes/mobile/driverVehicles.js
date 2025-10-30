const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
                company: {
                    select: {
                        id: true,
                        name: true
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

        // Get vehicles assigned to this driver
        const vehicles = await prisma.vehicle.findMany({
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
                company: driver.company
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

        const vehicle = await prisma.vehicle.findFirst({
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
                company: {
                    select: {
                        id: true,
                        name: true,
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

        res.json({
            success: true,
            data: { vehicle }
        });

    } catch (error) {
        console.error('Get vehicle details error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching vehicle details'
        });
    }
});

module.exports = router;
