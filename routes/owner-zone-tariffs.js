/**
 * Zone-Tariff Linking Routes
 * 
 * Manages many-to-many relationships between Zones and Tariffs
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'ADMIN', 'COMPANY_ADMIN'));

// ═══════════════════════════════════════════════════════════
// GET /api/owner/zones/:zoneId/tariffs - Get tariffs for zone
// ═══════════════════════════════════════════════════════════
router.get('/:zoneId/tariffs', async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { companyId } = req.user;

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Get linked tariffs
        const zoneTariffs = await prisma.zoneTariff.findMany({
            where: { zoneId },
            include: {
                tariff: {
                    include: {
                        _count: {
                            select: {
                                rides: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                priority: 'desc'
            }
        });

        res.json({
            success: true,
            data: zoneTariffs.map(zt => ({
                ...zt.tariff,
                linkId: zt.id,
                isDefault: zt.isDefault,
                priority: zt.priority,
                activeFrom: zt.activeFrom,
                activeTo: zt.activeTo,
                daysOfWeek: zt.daysOfWeek,
                timeFrom: zt.timeFrom,
                timeTo: zt.timeTo,
                ridesCount: zt.tariff._count.rides
            })),
            total: zoneTariffs.length
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
// POST /api/owner/zones/:zoneId/tariffs - Link tariffs to zone
// ═══════════════════════════════════════════════════════════
router.post('/:zoneId/tariffs', async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { companyId } = req.user;
        const { tariffIds, setAsDefault } = req.body;

        if (!tariffIds || !Array.isArray(tariffIds) || tariffIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'tariffIds array is required'
            });
        }

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Verify all tariffs belong to company
        const tariffs = await prisma.tariff.findMany({
            where: {
                id: { in: tariffIds },
                companyId
            }
        });

        if (tariffs.length !== tariffIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Some tariffs not found or do not belong to your company'
            });
        }

        // If setting as default, clear other defaults first
        if (setAsDefault) {
            await prisma.zoneTariff.updateMany({
                where: {
                    zoneId,
                    isDefault: true
                },
                data: {
                    isDefault: false
                }
            });
        }

        // Get current max priority
        const maxPriority = await prisma.zoneTariff.aggregate({
            where: { zoneId },
            _max: { priority: true }
        });

        const startPriority = (maxPriority._max.priority || 0) + 1;

        // Create zone-tariff links
        const zoneTariffData = tariffIds.map((tariffId, index) => ({
            zoneId,
            tariffId,
            priority: startPriority + index,
            isDefault: setAsDefault && index === 0
        }));

        await prisma.zoneTariff.createMany({
            data: zoneTariffData,
            skipDuplicates: true
        });

        // Fetch updated zone tariffs
        const updatedZoneTariffs = await prisma.zoneTariff.findMany({
            where: { zoneId },
            include: {
                tariff: true
            },
            orderBy: {
                priority: 'desc'
            }
        });

        res.json({
            success: true,
            message: `Linked ${tariffIds.length} tariff(s) to zone`,
            data: updatedZoneTariffs
        });

    } catch (error) {
        console.error('Link zone tariffs error:', error);

        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'One or more tariffs are already linked to this zone'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to link tariffs to zone',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/owner/zones/:zoneId/tariffs/:tariffId - Unlink tariff
// ═══════════════════════════════════════════════════════════
router.delete('/:zoneId/tariffs/:tariffId', async (req, res) => {
    try {
        const { zoneId, tariffId } = req.params;
        const { companyId } = req.user;

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Find and delete the link
        const zoneTariff = await prisma.zoneTariff.findFirst({
            where: {
                zoneId,
                tariffId
            }
        });

        if (!zoneTariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff link not found'
            });
        }

        await prisma.zoneTariff.delete({
            where: { id: zoneTariff.id }
        });

        res.json({
            success: true,
            message: 'Tariff unlinked from zone successfully'
        });

    } catch (error) {
        console.error('Unlink zone tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unlink tariff from zone',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/zones/:zoneId/tariffs/:tariffId/default
// Set tariff as default for zone
// ═══════════════════════════════════════════════════════════
router.put('/:zoneId/tariffs/:tariffId/default', async (req, res) => {
    try {
        const { zoneId, tariffId } = req.params;
        const { companyId } = req.user;

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Verify link exists
        const zoneTariff = await prisma.zoneTariff.findFirst({
            where: { zoneId, tariffId }
        });

        if (!zoneTariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff is not linked to this zone'
            });
        }

        // Clear all defaults for this zone
        await prisma.zoneTariff.updateMany({
            where: { zoneId },
            data: { isDefault: false }
        });

        // Set this one as default
        await prisma.zoneTariff.update({
            where: { id: zoneTariff.id },
            data: { isDefault: true }
        });

        res.json({
            success: true,
            message: 'Default tariff updated successfully'
        });

    } catch (error) {
        console.error('Set default tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set default tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/zones/:zoneId/tariffs/reorder
// Update priority order of tariffs
// ═══════════════════════════════════════════════════════════
router.put('/:zoneId/tariffs/reorder', async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { companyId } = req.user;
        const { orderedTariffIds } = req.body;

        if (!orderedTariffIds || !Array.isArray(orderedTariffIds)) {
            return res.status(400).json({
                success: false,
                message: 'orderedTariffIds array is required'
            });
        }

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Update priorities
        for (let i = 0; i < orderedTariffIds.length; i++) {
            await prisma.zoneTariff.updateMany({
                where: {
                    zoneId,
                    tariffId: orderedTariffIds[i]
                },
                data: {
                    priority: orderedTariffIds.length - i // Higher number = higher priority
                }
            });
        }

        res.json({
            success: true,
            message: 'Tariff priorities updated successfully'
        });

    } catch (error) {
        console.error('Reorder tariffs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder tariffs',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/zones/:zoneId/tariffs/:tariffId/schedule
// Set time-based rules for tariff
// ═══════════════════════════════════════════════════════════
router.put('/:zoneId/tariffs/:tariffId/schedule', async (req, res) => {
    try {
        const { zoneId, tariffId } = req.params;
        const { companyId } = req.user;
        const { activeFrom, activeTo, daysOfWeek, timeFrom, timeTo } = req.body;

        // Verify zone ownership
        const zone = await prisma.zone.findFirst({
            where: { id: zoneId, companyId }
        });

        if (!zone) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found'
            });
        }

        // Find zone-tariff link
        const zoneTariff = await prisma.zoneTariff.findFirst({
            where: { zoneId, tariffId }
        });

        if (!zoneTariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff is not linked to this zone'
            });
        }

        // Update schedule
        const updated = await prisma.zoneTariff.update({
            where: { id: zoneTariff.id },
            data: {
                activeFrom: activeFrom ? new Date(activeFrom) : null,
                activeTo: activeTo ? new Date(activeTo) : null,
                daysOfWeek,
                timeFrom,
                timeTo
            }
        });

        res.json({
            success: true,
            message: 'Tariff schedule updated successfully',
            data: updated
        });

    } catch (error) {
        console.error('Update tariff schedule error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tariff schedule',
            error: error.message
        });
    }
});

module.exports = router;
