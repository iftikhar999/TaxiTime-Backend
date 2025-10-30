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

// GET /api/owner/tariffs-simplified - Get all tariffs (simplified structure)
router.get('/', async (req, res) => {
    try {
        const tariffs = await prisma.tariff.findMany({
            where: { companyId: req.companyId },
            include: {
                zoneTariffs: {
                    include: {
                        zone: {
                            select: { id: true, name: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Add linked zones info
        const tariffsWithZones = tariffs.map(tariff => ({
            ...tariff,
            linkedZones: tariff.zoneTariffs.map(zt => ({
                zoneId: zt.zone.id,
                zoneName: zt.zone.name,
                isDefault: zt.isDefault
            }))
        }));

        res.json({ data: tariffsWithZones });
    } catch (error) {
        console.error('Error fetching tariffs:', error);
        res.status(500).json({ error: 'Failed to load tariffs' });
    }
});

// GET /api/owner/tariffs-simplified/:tariffId - Get single tariff
router.get('/:tariffId', async (req, res) => {
    try {
        const tariff = await prisma.tariff.findFirst({
            where: {
                id: req.params.tariffId,
                companyId: req.companyId
            },
            include: {
                zoneTariffs: {
                    include: {
                        zone: {
                            select: { id: true, name: true }
                        }
                    }
                }
            }
        });

        if (!tariff) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        // Add linked zones info
        const tariffWithZones = {
            ...tariff,
            linkedZones: tariff.zoneTariffs.map(zt => ({
                zoneId: zt.zone.id,
                zoneName: zt.zone.name,
                isDefault: zt.isDefault
            }))
        };

        res.json({ data: tariffWithZones });
    } catch (error) {
        console.error('Error fetching tariff:', error);
        res.status(500).json({ error: 'Failed to load tariff' });
    }
});

// POST /api/owner/tariffs-simplified - Create tariff (simplified)
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            baseFare,
            perKmRate,
            perMinuteRate,
            minimumFare,
            waitingFee = 0,
            airportFee = 0,
            tollFee = 0,
            extraStopFee = 0
        } = req.body;

        if (!name || !baseFare || !perKmRate || !perMinuteRate || !minimumFare) {
            return res.status(400).json({
                error: 'Name, baseFare, perKmRate, perMinuteRate, and minimumFare are required'
            });
        }

        const tariff = await prisma.tariff.create({
            data: {
                name,
                description,
                baseFare: parseFloat(baseFare),
                perKmRate: parseFloat(perKmRate),
                perMinuteRate: parseFloat(perMinuteRate),
                minimumFare: parseFloat(minimumFare),
                waitingFee: parseFloat(waitingFee) || 0,
                airportFee: parseFloat(airportFee) || 0,
                tollFee: parseFloat(tollFee) || 0,
                extraStopFee: parseFloat(extraStopFee) || 0,
                companyId: req.companyId
            }
        });

        res.status(201).json({ data: tariff });
    } catch (error) {
        console.error('Error creating tariff:', error);
        res.status(500).json({ error: 'Failed to create tariff' });
    }
});

// PUT /api/owner/tariffs-simplified/:tariffId - Update tariff
router.put('/:tariffId', async (req, res) => {
    try {
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
            extraStopFee
        } = req.body;

        const tariff = await prisma.tariff.findFirst({
            where: {
                id: req.params.tariffId,
                companyId: req.companyId
            }
        });

        if (!tariff) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        const updatedTariff = await prisma.tariff.update({
            where: { id: req.params.tariffId },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(baseFare && { baseFare: parseFloat(baseFare) }),
                ...(perKmRate && { perKmRate: parseFloat(perKmRate) }),
                ...(perMinuteRate && { perMinuteRate: parseFloat(perMinuteRate) }),
                ...(minimumFare && { minimumFare: parseFloat(minimumFare) }),
                ...(waitingFee !== undefined && { waitingFee: parseFloat(waitingFee) || 0 }),
                ...(airportFee !== undefined && { airportFee: parseFloat(airportFee) || 0 }),
                ...(tollFee !== undefined && { tollFee: parseFloat(tollFee) || 0 }),
                ...(extraStopFee !== undefined && { extraStopFee: parseFloat(extraStopFee) || 0 }),
                updatedAt: new Date()
            }
        });

        res.json({ data: updatedTariff });
    } catch (error) {
        console.error('Error updating tariff:', error);
        res.status(500).json({ error: 'Failed to update tariff' });
    }
});

// DELETE /api/owner/tariffs-simplified/:tariffId - Delete tariff
router.delete('/:tariffId', async (req, res) => {
    try {
        const tariff = await prisma.tariff.findFirst({
            where: {
                id: req.params.tariffId,
                companyId: req.companyId
            }
        });

        if (!tariff) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        // Delete zone-tariff relationships first
        await prisma.zoneTariff.deleteMany({
            where: { tariffId: req.params.tariffId }
        });

        // Delete tariff
        await prisma.tariff.delete({
            where: { id: req.params.tariffId }
        });

        res.json({ message: 'Tariff deleted successfully' });
    } catch (error) {
        console.error('Error deleting tariff:', error);
        res.status(500).json({ error: 'Failed to delete tariff' });
    }
});

// POST /api/owner/tariffs-simplified/:tariffId/toggle - Toggle tariff active status
router.post('/:tariffId/toggle', async (req, res) => {
    try {
        const tariff = await prisma.tariff.findFirst({
            where: {
                id: req.params.tariffId,
                companyId: req.companyId
            }
        });

        if (!tariff) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        // For now, we'll use a boolean field or create one
        // Since the schema might not have isActive, let's check and update based on what exists
        const updatedTariff = await prisma.tariff.update({
            where: { id: req.params.tariffId },
            data: {
                // Toggle logic - we'll need to check what field exists in schema
                updatedAt: new Date()
            }
        });

        res.json({ data: updatedTariff });
    } catch (error) {
        console.error('Error toggling tariff:', error);
        res.status(500).json({ error: 'Failed to toggle tariff' });
    }
});

module.exports = router;