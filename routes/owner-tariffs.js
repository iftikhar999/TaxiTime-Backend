const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN'));

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

const parseFloatOrNull = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
};

// GET /api/owner/tariffs
router.get('/', async (req, res) => {
    try {
        const tariffs = await prisma.companyTariff.findMany({
            where: { companyId: req.companyId },
            include: {
                zone: {
                    select: {
                        id: true,
                        zoneName: true,
                        zoneType: true,
                        priceMultiplier: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ tariffs });
    } catch (error) {
        console.error('Error fetching tariffs:', error);
        res.status(500).json({ error: 'Failed to load tariffs' });
    }
});

// POST /api/owner/tariffs
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            serviceMode,
            vehicleType,
            zoneId,
            baseFare,
            perKmRate,
            perMinuteRate,
            minimumFare,
            waitingFeePerMinute,
            cancellationFee,
            bookingFee,
            airportFee,
            peakHourMultiplier,
            peakHourStart,
            peakHourEnd,
            peakHour2Start,
            peakHour2End,
            weekendMultiplier,
            nightMultiplier,
            nightStart,
            nightEnd,
            taxRate,
            currency = 'USD',
            priority = 0,
            isActive = true,
            promoStackRulesJson,
            validFrom,
            validTo
        } = req.body;

        if (!serviceMode || !vehicleType || baseFare === undefined || perKmRate === undefined || perMinuteRate === undefined || minimumFare === undefined) {
            return res.status(400).json({ error: 'Missing required fields: serviceMode, vehicleType, baseFare, perKmRate, perMinuteRate, minimumFare' });
        }

        // Validate zone belongs to company
        if (zoneId) {
            const zone = await prisma.companyZone.findFirst({
                where: { id: zoneId, companyId: req.companyId }
            });
            if (!zone) {
                return res.status(400).json({ error: 'Invalid zone selected' });
            }
        }

        const tariff = await prisma.companyTariff.create({
            data: {
                companyId: req.companyId,
                name: name || null,
                description: description || null,
                serviceMode,
                vehicleType,
                zoneId: zoneId || null,
                baseFare: parseFloat(baseFare),
                perKmRate: parseFloat(perKmRate),
                perMinuteRate: parseFloat(perMinuteRate),
                minimumFare: parseFloat(minimumFare),
                waitingFeePerMinute: parseFloatOrNull(waitingFeePerMinute) ?? 0,
                cancellationFee: parseFloatOrNull(cancellationFee) ?? 0,
                bookingFee: parseFloatOrNull(bookingFee) ?? 0,
                airportFee: parseFloatOrNull(airportFee) ?? 0,
                peakHourMultiplier: parseFloatOrNull(peakHourMultiplier),
                peakHourStart: peakHourStart || null,
                peakHourEnd: peakHourEnd || null,
                peakHour2Start: peakHour2Start || null,
                peakHour2End: peakHour2End || null,
                weekendMultiplier: parseFloatOrNull(weekendMultiplier),
                nightMultiplier: parseFloatOrNull(nightMultiplier),
                nightStart: nightStart || null,
                nightEnd: nightEnd || null,
                taxRate: parseFloatOrNull(taxRate) ?? 0,
                currency,
                priority: parseInt(priority),
                isActive: Boolean(isActive),
                promoStackRulesJson: promoStackRulesJson ? (typeof promoStackRulesJson === 'string' ? JSON.parse(promoStackRulesJson) : promoStackRulesJson) : undefined,
                validFrom: validFrom ? new Date(validFrom) : undefined,
                validTo: validTo ? new Date(validTo) : undefined
            }
        });

        res.status(201).json({
            message: 'Tariff created successfully',
            tariff
        });
    } catch (error) {
        console.error('Error creating tariff:', error);
        res.status(500).json({ error: 'Failed to create tariff', details: error.message });
    }
});

// POST /api/owner/tariffs/bulk - Create multiple tariffs at once
router.post('/bulk', async (req, res) => {
    try {
        const { tariffs } = req.body;

        if (!Array.isArray(tariffs) || tariffs.length === 0) {
            return res.status(400).json({ error: 'tariffs array is required and must not be empty' });
        }

        const created = [];
        const errors = [];

        for (let i = 0; i < tariffs.length; i++) {
            const tariffData = tariffs[i];

            try {
                // Validate required fields
                if (!tariffData.serviceMode || !tariffData.vehicleType ||
                    tariffData.baseFare === undefined || tariffData.perKmRate === undefined ||
                    tariffData.perMinuteRate === undefined || tariffData.minimumFare === undefined) {
                    errors.push({ index: i, error: 'Missing required fields' });
                    continue;
                }

                // Validate zone if provided
                if (tariffData.zoneId) {
                    const zone = await prisma.companyZone.findFirst({
                        where: { id: tariffData.zoneId, companyId: req.companyId }
                    });
                    if (!zone) {
                        errors.push({ index: i, error: 'Invalid zone selected' });
                        continue;
                    }
                }

                const tariff = await prisma.companyTariff.create({
                    data: {
                        companyId: req.companyId,
                        name: tariffData.name || null,
                        description: tariffData.description || null,
                        serviceMode: tariffData.serviceMode,
                        vehicleType: tariffData.vehicleType,
                        zoneId: tariffData.zoneId || null,
                        baseFare: parseFloat(tariffData.baseFare),
                        perKmRate: parseFloat(tariffData.perKmRate),
                        perMinuteRate: parseFloat(tariffData.perMinuteRate),
                        minimumFare: parseFloat(tariffData.minimumFare),
                        waitingFeePerMinute: parseFloatOrNull(tariffData.waitingFeePerMinute) ?? 0,
                        cancellationFee: parseFloatOrNull(tariffData.cancellationFee) ?? 0,
                        bookingFee: parseFloatOrNull(tariffData.bookingFee) ?? 0,
                        airportFee: parseFloatOrNull(tariffData.airportFee) ?? 0,
                        peakHourMultiplier: parseFloatOrNull(tariffData.peakHourMultiplier),
                        peakHourStart: tariffData.peakHourStart || null,
                        peakHourEnd: tariffData.peakHourEnd || null,
                        peakHour2Start: tariffData.peakHour2Start || null,
                        peakHour2End: tariffData.peakHour2End || null,
                        weekendMultiplier: parseFloatOrNull(tariffData.weekendMultiplier),
                        nightMultiplier: parseFloatOrNull(tariffData.nightMultiplier),
                        nightStart: tariffData.nightStart || null,
                        nightEnd: tariffData.nightEnd || null,
                        taxRate: parseFloatOrNull(tariffData.taxRate) ?? 0,
                        currency: tariffData.currency || 'USD',
                        priority: parseInt(tariffData.priority || 0),
                        isActive: Boolean(tariffData.isActive !== false),
                        promoStackRulesJson: tariffData.promoStackRulesJson || undefined,
                        validFrom: tariffData.validFrom ? new Date(tariffData.validFrom) : undefined,
                        validTo: tariffData.validTo ? new Date(tariffData.validTo) : undefined
                    }
                });

                created.push(tariff);
            } catch (error) {
                console.error(`Error creating tariff at index ${i}:`, error);
                errors.push({ index: i, error: error.message });
            }
        }

        res.status(201).json({
            message: `Bulk tariff creation completed: ${created.length} created, ${errors.length} failed`,
            created,
            errors: errors.length > 0 ? errors : undefined,
            stats: {
                total: tariffs.length,
                successful: created.length,
                failed: errors.length
            }
        });
    } catch (error) {
        console.error('Error in bulk tariff creation:', error);
        res.status(500).json({ error: 'Failed to create tariffs in bulk', details: error.message });
    }
});

// PUT /api/owner/tariffs/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.companyTariff.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        const {
            serviceMode,
            vehicleType,
            zoneId,
            baseFare,
            perKmRate,
            perMinuteRate,
            minimumFare,
            waitingFeePerMinute,
            cancellationFee,
            airportFee,
            nightSurchargeMultiplier,
            taxRate,
            currency,
            promoStackRulesJson,
            validFrom,
            validTo
        } = req.body;

        if (zoneId) {
            const zone = await prisma.companyZone.findFirst({
                where: { id: zoneId, companyId: req.companyId }
            });
            if (!zone) {
                return res.status(400).json({ error: 'Invalid zone selected' });
            }
        }

        const tariff = await prisma.companyTariff.update({
            where: { id },
            data: {
                serviceMode,
                vehicleType,
                zoneId,
                baseFare: baseFare !== undefined ? parseFloat(baseFare) : undefined,
                perKmRate: perKmRate !== undefined ? parseFloat(perKmRate) : undefined,
                perMinuteRate: perMinuteRate !== undefined ? parseFloat(perMinuteRate) : undefined,
                minimumFare: minimumFare !== undefined ? parseFloat(minimumFare) : undefined,
                waitingFeePerMinute: waitingFeePerMinute !== undefined ? parseFloat(waitingFeePerMinute) : undefined,
                cancellationFee: cancellationFee !== undefined ? parseFloat(cancellationFee) : undefined,
                airportFee: airportFee !== undefined ? parseFloat(airportFee) : undefined,
                nightSurchargeMultiplier: nightSurchargeMultiplier !== undefined ? parseFloat(nightSurchargeMultiplier) : undefined,
                taxRate: taxRate !== undefined ? parseFloat(taxRate) : undefined,
                currency,
                promoStackRulesJson: promoStackRulesJson ? (typeof promoStackRulesJson === 'string' ? JSON.parse(promoStackRulesJson) : promoStackRulesJson) : undefined,
                validFrom: validFrom ? new Date(validFrom) : undefined,
                validTo: validTo ? new Date(validTo) : undefined
            }
        });

        res.json({
            message: 'Tariff updated successfully',
            tariff
        });
    } catch (error) {
        console.error('Error updating tariff:', error);
        res.status(500).json({ error: 'Failed to update tariff' });
    }
});

// DELETE /api/owner/tariffs/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.companyTariff.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Tariff not found' });
        }

        await prisma.companyTariff.delete({ where: { id } });

        res.json({ message: 'Tariff deleted successfully' });
    } catch (error) {
        console.error('Error deleting tariff:', error);
        res.status(500).json({ error: 'Failed to delete tariff' });
    }
});

module.exports = router;
