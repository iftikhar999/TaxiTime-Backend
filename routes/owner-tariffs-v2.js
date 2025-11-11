/**
 * Owner Tariff Routes - Redesigned System
 * 
 * Tariffs are now INDEPENDENT of zones and vehicles.
 * They can be linked to multiple zones via ZoneTariff junction table.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');

const buildLinkedZones = (zoneTariffs = []) =>
    zoneTariffs.map((zt) => {
        const zone = zt.zones || zt.zone;
        return zone
            ? {
                  zoneId: zone.id,
                  zoneName: zone.name,
                  isDefault: zt.isDefault,
                  priority: zt.priority,
                  isActive: zone.isActive ?? true
              }
            : null;
    }).filter(Boolean);

const attachLinkedZones = (tariff) => {
    if (!tariff) return null;
    const zoneTariffs = tariff.zone_tariffs || tariff.zoneTariffs || [];
    return {
        ...tariff,
        linkedZones: buildLinkedZones(zoneTariffs)
    };
};

// All routes require OWNER or ADMIN role
router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

// ═══════════════════════════════════════════════════════════
// GET /api/owner/tariffs - List all tariffs for company
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        const companyId = req.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'Company ID is required'
            });
        }

        const tariffs = await prisma.tariffs.findMany({
            where: { companyId },
            include: {
                zone_tariffs: {
                    include: {
                        zones: {
                            select: {
                                id: true,
                                name: true,
                                isActive: true
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        zone_tariffs: true,
                        rides: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Transform response to include linked zones
        const tariffsWithZones = tariffs.map((tariff) => {
            const formatted = attachLinkedZones(tariff);
            return {
                ...formatted,
                zonesCount: tariff._count.zone_tariffs,
                ridesCount: tariff._count.rides
            };
        });

        res.json({
            success: true,
            data: tariffsWithZones,
            total: tariffsWithZones.length
        });

    } catch (error) {
        console.error('Get tariffs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tariffs',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/owner/tariffs/:id - Get single tariff details
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.companyId;

        const tariff = await prisma.tariffs.findFirst({
            where: {
                id,
                companyId
            },
            include: {
                zone_tariffs: {
                    include: {
                        zones: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                isActive: true,
                                type: true
                            }
                        }
                    },
                    orderBy: {
                        priority: 'desc'
                    }
                },
                rides: {
                    select: {
                        id: true,
                        createdAt: true,
                        status: true,
                        totalFare: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 10
                }
            }
        });

        if (!tariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff not found'
            });
        }

        res.json({
            success: true,
            data: attachLinkedZones(tariff)
        });

    } catch (error) {
        console.error('Get tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/owner/tariffs - Create new tariff (INDEPENDENT)
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
    try {
        const companyId = req.companyId;
        const {
            name,
            description,
            baseFare,
            perKmRate,
            perMinuteRate,
            minimumFare,
            waitingFee,
            airportFee,
            tollFee,
            extraStopFee,
            peakHourMultiplier,
            nightTimeMultiplier,
            maxSurgeMultiplier,
            isActive,
            validFrom,
            validTo,
            // Optional: Link to zones immediately
            zoneIds
        } = req.body;

        // Validation
        if (!name || baseFare === undefined || perKmRate === undefined || perMinuteRate === undefined || minimumFare === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, baseFare, perKmRate, perMinuteRate, minimumFare'
            });
        }

        // Create tariff (no vehicle type required!)
        const tariff = await prisma.tariffs.create({
            data: {
                id: uuidv4(),
                companyId,
                name,
                description,
                baseFare: parseFloat(baseFare),
                perKmRate: parseFloat(perKmRate),
                perMinuteRate: parseFloat(perMinuteRate),
                minimumFare: parseFloat(minimumFare),
                waitingFee: waitingFee ? parseFloat(waitingFee) : null,
                airportFee: airportFee ? parseFloat(airportFee) : null,
                tollFee: tollFee ? parseFloat(tollFee) : null,
                extraStopFee: extraStopFee ? parseFloat(extraStopFee) : null,
                peakHourMultiplier: peakHourMultiplier ? parseFloat(peakHourMultiplier) : null,
                nightTimeMultiplier: nightTimeMultiplier ? parseFloat(nightTimeMultiplier) : null,
                maxSurgeMultiplier: maxSurgeMultiplier ? parseFloat(maxSurgeMultiplier) : 3.0,
                isActive: isActive !== undefined ? isActive : true,
                validFrom: validFrom ? new Date(validFrom) : null,
                validTo: validTo ? new Date(validTo) : null,
                updatedAt: new Date()
            }
        });

        // Optionally link to zones immediately
        if (zoneIds && Array.isArray(zoneIds) && zoneIds.length > 0) {
            const zoneTariffData = zoneIds.map((zoneId, index) => ({
                id: uuidv4(),
                zoneId,
                tariffId: tariff.id,
                priority: index + 1,
                isDefault: index === 0 // First one is default
            }));

            await prisma.zone_tariffs.createMany({
                data: zoneTariffData,
                skipDuplicates: true
            });
        }

        // Fetch complete tariff with relations
        const completeTariff = await prisma.tariffs.findUnique({
            where: { id: tariff.id },
            include: {
                zone_tariffs: {
                    include: {
                        zones: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'Tariff created successfully',
            data: attachLinkedZones(completeTariff)
        });

    } catch (error) {
        console.error('Create tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/tariffs/:id - Update tariff
// ═══════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.companyId;
        const updateData = req.body;

        // Verify ownership
        const existingTariff = await prisma.tariffs.findFirst({
            where: { id, companyId }
        });

        if (!existingTariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff not found'
            });
        }

        // Remove non-updatable fields
        delete updateData.id;
        delete updateData.companyId;
        delete updateData.createdAt;
        delete updateData.zoneIds;

        // Parse decimal fields
        const decimalFields = [
            'baseFare', 'perKmRate', 'perMinuteRate', 'minimumFare',
            'waitingFee', 'airportFee', 'tollFee', 'extraStopFee',
            'peakHourMultiplier', 'nightTimeMultiplier', 'maxSurgeMultiplier'
        ];

        decimalFields.forEach(field => {
            if (updateData[field] !== undefined && updateData[field] !== null) {
                updateData[field] = parseFloat(updateData[field]);
            }
        });

        // Parse date fields
        if (updateData.validFrom) {
            updateData.validFrom = new Date(updateData.validFrom);
        }
        if (updateData.validTo) {
            updateData.validTo = new Date(updateData.validTo);
        }

        // Update tariff
        updateData.updatedAt = new Date();

        const updatedTariff = await prisma.tariffs.update({
            where: { id },
            data: updateData,
            include: {
                zone_tariffs: {
                    include: {
                        zones: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            message: 'Tariff updated successfully',
            data: attachLinkedZones(updatedTariff)
        });

    } catch (error) {
        console.error('Update tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/owner/tariffs/:id - Delete tariff
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.companyId;

        // Verify ownership
        const tariff = await prisma.tariffs.findFirst({
            where: { id, companyId },
            include: {
                _count: {
                    select: {
                        rides: true,
                        zone_tariffs: true
                    }
                }
            }
        });

        if (!tariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff not found'
            });
        }

        // Check if tariff is in use
        if (tariff._count.rides > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete tariff. It is used by ${tariff._count.rides} ride(s). Consider deactivating it instead.`,
                ridesCount: tariff._count.rides
            });
        }

        // Delete tariff (CASCADE will delete ZoneTariff records)
        await prisma.tariffs.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Tariff deleted successfully'
        });

    } catch (error) {
        console.error('Delete tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete tariff',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/owner/tariffs/:id/toggle - Toggle active status
// ═══════════════════════════════════════════════════════════
router.post('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.companyId;

        const tariff = await prisma.tariffs.findFirst({
            where: { id, companyId }
        });

        if (!tariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff not found'
            });
        }

        const updatedTariff = await prisma.tariffs.update({
            where: { id },
            data: {
                isActive: !tariff.isActive
            }
        });

        res.json({
            success: true,
            message: `Tariff ${updatedTariff.isActive ? 'activated' : 'deactivated'} successfully`,
            data: updatedTariff
        });

    } catch (error) {
        console.error('Toggle tariff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle tariff',
            error: error.message
        });
    }
});

module.exports = router;
