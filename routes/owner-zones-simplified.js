const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN'));

// Scope to company middleware
const scopeToCompany = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                ownedCompany: true,
                company: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role === 'OWNER' && user.ownedCompany) {
            req.companyId = user.ownedCompany.id;
        } else if (user.role === 'COMPANY_ADMIN' && user.companyId) {
            req.companyId = user.companyId;
        } else {
            return res.status(403).json({ error: 'User not associated with a company' });
        }

        next();
    } catch (error) {
        console.error('Company scope error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(scopeToCompany);

// GET /api/owner/zones - Get all zones (simplified)
router.get('/', async (req, res) => {
    try {
        const zones = await prisma.zone.findMany({
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
        const zone = await prisma.zone.findFirst({
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

        const zone = await prisma.zone.create({
            data: {
                name,
                description,
                boundaries,
                type,
                isActive,
                companyId: req.companyId
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

        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const updatedZone = await prisma.zone.update({
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
        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Delete zone-tariff relationships first
        await prisma.zoneTariff.deleteMany({
            where: { zoneId: req.params.zoneId }
        });

        // Delete zone
        await prisma.zone.delete({
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
        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const zoneTariffs = await prisma.zoneTariff.findMany({
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

        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Verify tariffs belong to company
        const tariffs = await prisma.tariff.findMany({
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
                prisma.zoneTariff.upsert({
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
        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        await prisma.zoneTariff.deleteMany({
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
        const zone = await prisma.zone.findFirst({
            where: {
                id: req.params.zoneId,
                companyId: req.companyId
            }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Remove default from other tariffs in this zone
        await prisma.zoneTariff.updateMany({
            where: { zoneId: req.params.zoneId },
            data: { isDefault: false }
        });

        // Set this tariff as default
        await prisma.zoneTariff.updateMany({
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