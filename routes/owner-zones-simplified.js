const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');


const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

// GET /api/owner/zones - Get all zones (simplified)
router.get('/', async (req, res) => {
    try {
        const zones = await prisma.zones.findMany({
            where: { companyId: req.companyId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ zones });
    } catch (error) {
        console.error('Error fetching zones:', error);
        res.status(500).json({ error: 'Failed to load zones' });
    }
});

// GET /api/owner/zones/:zoneId - Get single zone
router.get('/:zoneId', async (req, res) => {
    try {
        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        res.json({ zone });
    } catch (error) {
        console.error('Error fetching zone:', error);
        res.status(500).json({ error: 'Failed to load zone' });
    }
});

// POST /api/owner/zones - Create zone (simplified)
router.post('/', async (req, res) => {
    try {
        const { name, description, boundaries, type = 'SERVICE_AREA', isActive = true } = req.body;

        if (!name || !boundaries) {
            return res.status(400).json({ error: 'Name and boundaries are required' });
        }

        const zone = await prisma.zones.create({
            data: {
                id: uuidv4(),
                name,
                description,
                boundaries,
                type,
                isActive,
                companyId: req.companyId,
                updatedAt: new Date()
            }
        });

        res.status(201).json({ zone });
    } catch (error) {
        console.error('Error creating zone:', error);
        res.status(500).json({ error: 'Failed to create zone' });
    }
});

// PUT /api/owner/zones/:zoneId - Update zone
router.put('/:zoneId', async (req, res) => {
    try {
        const { name, description, boundaries, isActive } = req.body;

        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const updatedZone = await prisma.zones.update({
            where: { id: req.params.zoneId },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(boundaries && { boundaries }),
                ...(isActive !== undefined && { isActive }),
                updatedAt: new Date()
            }
        });

        res.json({ zone: updatedZone });
    } catch (error) {
        console.error('Error updating zone:', error);
        res.status(500).json({ error: 'Failed to update zone' });
    }
});

// DELETE /api/owner/zones/:zoneId - Delete zone
router.delete('/:zoneId', async (req, res) => {
    try {
        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Delete zone-tariff relationships first
        await prisma.zone_tariffs.deleteMany({
            where: { zoneId: req.params.zoneId }
        });

        // Delete zone
        await prisma.zones.delete({
            where: { id: req.params.zoneId }
        });

        res.json({ message: 'Zone deleted successfully' });
    } catch (error) {
        console.error('Error deleting zone:', error);
        res.status(500).json({ error: 'Failed to delete zone' });
    }
});

// GET /api/owner/zones/:zoneId/tariffs - Get tariffs linked to zone
router.get('/:zoneId/tariffs', async (req, res) => {
    try {
        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const zoneTariffs = await prisma.zone_tariffs.findMany({
            where: { zoneId: req.params.zoneId },
            include: {
                tariff: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const tariffs = zoneTariffs.map(zt => zt.tariff);

        res.json({ tariffs });
    } catch (error) {
        console.error('Error fetching zone tariffs:', error);
        res.status(500).json({ error: 'Failed to load zone tariffs' });
    }
});

// POST /api/owner/zones/:zoneId/tariffs - Link tariffs to zone
router.post('/:zoneId/tariffs', async (req, res) => {
    try {
        const { tariffIds, setAsDefault = false } = req.body;

        if (!tariffIds || !Array.isArray(tariffIds)) {
            return res.status(400).json({ error: 'tariffIds array is required' });
        }

        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Verify tariffs belong to company
        const tariffs = await prisma.tariffs.findMany({
            where: {
                id: { in: tariffIds },
                companyId: req.companyId
            }
        });

        if (tariffs.length !== tariffIds.length) {
            return res.status(400).json({ error: 'Some tariffs not found or not owned by company' });
        }

        // Create zone-tariff links
        const links = await Promise.all(
            tariffIds.map(tariffId =>
                prisma.zone_tariffs.upsert({
                    where: {
                        zoneId_tariffId: {
                            zoneId: req.params.zoneId,
                            tariffId
                        }
                    },
                    create: {
                        zoneId: req.params.zoneId,
                        tariffId,
                        isDefault: setAsDefault
                    },
                    update: {}
                })
            )
        );

        res.json({
            message: 'Tariffs linked successfully',
            links
        });
    } catch (error) {
        console.error('Error linking tariffs:', error);
        res.status(500).json({ error: 'Failed to link tariffs' });
    }
});

// DELETE /api/owner/zones/:zoneId/tariffs/:tariffId - Unlink tariff from zone
router.delete('/:zoneId/tariffs/:tariffId', async (req, res) => {
    try {
        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        await prisma.zone_tariffs.deleteMany({
            where: {
                zoneId: req.params.zoneId,
                tariffId: req.params.tariffId
            }
        });

        res.json({ message: 'Tariff unlinked successfully' });
    } catch (error) {
        console.error('Error unlinking tariff:', error);
        res.status(500).json({ error: 'Failed to unlink tariff' });
    }
});

// PUT /api/owner/zones/:zoneId/tariffs/:tariffId/default - Set default tariff for zone
router.put('/:zoneId/tariffs/:tariffId/default', async (req, res) => {
    try {
        const zone = await prisma.zones.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Remove default from other tariffs in this zone
        await prisma.zone_tariffs.updateMany({
            where: { zoneId: req.params.zoneId },
            data: { isDefault: false }
        });

        // Set this tariff as default
        await prisma.zone_tariffs.updateMany({
            where: {
                zoneId: req.params.zoneId,
                tariffId: req.params.tariffId
            },
            data: { isDefault: true }
        });

        res.json({ message: 'Default tariff updated successfully' });
    } catch (error) {
        console.error('Error setting default tariff:', error);
        res.status(500).json({ error: 'Failed to set default tariff' });
    }
});

module.exports = router;
