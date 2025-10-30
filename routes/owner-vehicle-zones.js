/**
 * Vehicle-Zone Linking Routes
 * 
 * Manages many-to-many relationships between Vehicles and Zones
 * Controls which zones vehicles can operate in
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'ADMIN', 'COMPANY_ADMIN'));

// ═══════════════════════════════════════════════════════════
// GET /api/owner/vehicles/:vehicleId/zones - Get zones for vehicle
// ═══════════════════════════════════════════════════════════
router.get('/:vehicleId/zones', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { companyId } = req.user;

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // Get linked zones
        const vehicleZones = await prisma.vehicleZone.findMany({
            where: { vehicleId },
            include: {
                zone: {
                    include: {
                        _count: {
                            select: {
                                rides: true
                            }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            data: vehicleZones.map(vz => ({
                ...vz.zone,
                linkId: vz.id,
                isApproved: vz.isApproved,
                canOperate: vz.canOperate,
                validFrom: vz.validFrom,
                validTo: vz.validTo,
                ridesCount: vz.zone._count.rides
            })),
            total: vehicleZones.length
        });

    } catch (error) {
        console.error('Get vehicle zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch vehicle zones',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/owner/vehicles/:vehicleId/zones - Link zones to vehicle
// ═══════════════════════════════════════════════════════════
router.post('/:vehicleId/zones', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { companyId } = req.user;
        const { zoneIds, isApproved = true, canOperate = true } = req.body;

        if (!zoneIds || !Array.isArray(zoneIds) || zoneIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'zoneIds array is required'
            });
        }

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // Verify all zones belong to company
        const zones = await prisma.zone.findMany({
            where: {
                id: { in: zoneIds },
                companyId
            }
        });

        if (zones.length !== zoneIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Some zones not found or do not belong to your company'
            });
        }

        // Create vehicle-zone links
        const vehicleZoneData = zoneIds.map(zoneId => ({
            vehicleId,
            zoneId,
            isApproved,
            canOperate
        }));

        await prisma.vehicleZone.createMany({
            data: vehicleZoneData,
            skipDuplicates: true
        });

        // Fetch updated vehicle zones
        const updatedVehicleZones = await prisma.vehicleZone.findMany({
            where: { vehicleId },
            include: {
                zone: true
            }
        });

        res.json({
            success: true,
            message: `Linked ${zoneIds.length} zone(s) to vehicle`,
            data: updatedVehicleZones
        });

    } catch (error) {
        console.error('Link vehicle zones error:', error);

        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'One or more zones are already linked to this vehicle'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to link zones to vehicle',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/owner/vehicles/:vehicleId/zones/:zoneId - Unlink zone
// ═══════════════════════════════════════════════════════════
router.delete('/:vehicleId/zones/:zoneId', async (req, res) => {
    try {
        const { vehicleId, zoneId } = req.params;
        const { companyId } = req.user;

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // Find and delete the link
        const vehicleZone = await prisma.vehicleZone.findFirst({
            where: {
                vehicleId,
                zoneId
            }
        });

        if (!vehicleZone) {
            return res.status(404).json({
                success: false,
                message: 'Zone link not found'
            });
        }

        await prisma.vehicleZone.delete({
            where: { id: vehicleZone.id }
        });

        res.json({
            success: true,
            message: 'Zone unlinked from vehicle successfully'
        });

    } catch (error) {
        console.error('Unlink vehicle zone error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unlink zone from vehicle',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/vehicles/:vehicleId/zones/:zoneId/permissions
// Update zone permissions for vehicle
// ═══════════════════════════════════════════════════════════
router.put('/:vehicleId/zones/:zoneId/permissions', async (req, res) => {
    try {
        const { vehicleId, zoneId } = req.params;
        const { companyId } = req.user;
        const { isApproved, canOperate, validFrom, validTo } = req.body;

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // Find vehicle-zone link
        const vehicleZone = await prisma.vehicleZone.findFirst({
            where: { vehicleId, zoneId }
        });

        if (!vehicleZone) {
            return res.status(404).json({
                success: false,
                message: 'Zone is not linked to this vehicle'
            });
        }

        // Update permissions
        const updated = await prisma.vehicleZone.update({
            where: { id: vehicleZone.id },
            data: {
                ...(typeof isApproved === 'boolean' && { isApproved }),
                ...(typeof canOperate === 'boolean' && { canOperate }),
                ...(validFrom && { validFrom: new Date(validFrom) }),
                ...(validTo && { validTo: new Date(validTo) })
            }
        });

        res.json({
            success: true,
            message: 'Zone permissions updated successfully',
            data: updated
        });

    } catch (error) {
        console.error('Update zone permissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update zone permissions',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/owner/vehicles/:vehicleId/zones/bulk
// Bulk assign zones to vehicle
// ═══════════════════════════════════════════════════════════
router.post('/:vehicleId/zones/bulk', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { companyId } = req.user;
        const {
            zoneIds,
            replaceExisting = false,
            isApproved = true,
            canOperate = true
        } = req.body;

        if (!zoneIds || !Array.isArray(zoneIds)) {
            return res.status(400).json({
                success: false,
                message: 'zoneIds array is required'
            });
        }

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // If replacing, delete existing links
        if (replaceExisting) {
            await prisma.vehicleZone.deleteMany({
                where: { vehicleId }
            });
        }

        // Verify all zones belong to company
        if (zoneIds.length > 0) {
            const zones = await prisma.zone.findMany({
                where: {
                    id: { in: zoneIds },
                    companyId
                }
            });

            if (zones.length !== zoneIds.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some zones not found or do not belong to your company'
                });
            }

            // Create vehicle-zone links
            const vehicleZoneData = zoneIds.map(zoneId => ({
                vehicleId,
                zoneId,
                isApproved,
                canOperate
            }));

            await prisma.vehicleZone.createMany({
                data: vehicleZoneData,
                skipDuplicates: true
            });
        }

        // Fetch updated vehicle zones
        const updatedVehicleZones = await prisma.vehicleZone.findMany({
            where: { vehicleId },
            include: {
                zone: true
            }
        });

        res.json({
            success: true,
            message: replaceExisting
                ? `Replaced vehicle zones with ${zoneIds.length} zone(s)`
                : `Added ${zoneIds.length} zone(s) to vehicle`,
            data: updatedVehicleZones,
            total: updatedVehicleZones.length
        });

    } catch (error) {
        console.error('Bulk assign zones error:', error);

        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Some zones are already linked to this vehicle'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to bulk assign zones',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/owner/vehicles/:vehicleId/zones/available
// Get zones NOT yet assigned to vehicle
// ═══════════════════════════════════════════════════════════
router.get('/:vehicleId/zones/available', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { companyId } = req.user;

        // Verify vehicle ownership
        const vehicle = await prisma.vehicle.findFirst({
            where: { id: vehicleId, companyId }
        });

        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }

        // Get zones already assigned to vehicle
        const assignedZones = await prisma.vehicleZone.findMany({
            where: { vehicleId },
            select: { zoneId: true }
        });

        const assignedZoneIds = assignedZones.map(vz => vz.zoneId);

        // Get all company zones not assigned to vehicle
        const availableZones = await prisma.zone.findMany({
            where: {
                companyId,
                id: { notIn: assignedZoneIds }
            },
            include: {
                _count: {
                    select: {
                        rides: true,
                        vehicleZones: true
                    }
                }
            }
        });

        res.json({
            success: true,
            data: availableZones.map(zone => ({
                ...zone,
                ridesCount: zone._count.rides,
                assignedVehiclesCount: zone._count.vehicleZones
            })),
            total: availableZones.length
        });

    } catch (error) {
        console.error('Get available zones error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available zones',
            error: error.message
        });
    }
});

module.exports = router;
