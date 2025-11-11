const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');


const router = express.Router();

const parseJsonField = (value, fallback = {}) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('Failed to parse JSON field', error);
            return fallback;
        }
    }
    if (Array.isArray(fallback) && !Array.isArray(value)) {
        return fallback;
    }
    return value;
};

const toNumber = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
};

const sanitizeCoordinates = (coordinates) => {
    if (!Array.isArray(coordinates)) {
        return null;
    }

    const normalized = coordinates
        .map((coord) => {
            if (!coord) return null;

            if (Array.isArray(coord) && coord.length >= 2) {
                const lat = toNumber(coord[1]);
                const lng = toNumber(coord[0]);
                return lat !== null && lng !== null ? { lat, lng } : null;
            }

            const lat = toNumber(coord.lat ?? coord.latitude);
            const lng = toNumber(coord.lng ?? coord.longitude);

            if (lat === null || lng === null) {
                return null;
            }

            return { lat, lng };
        })
        .filter(Boolean);

    return normalized.length > 0 ? normalized : null;
};

const sanitizeCenterPoint = (centerPoint) => {
    if (!centerPoint) return null;
    const lat = toNumber(centerPoint.lat ?? centerPoint.latitude);
    const lng = toNumber(centerPoint.lng ?? centerPoint.longitude);
    if (lat === null || lng === null) {
        return null;
    }
    return { lat, lng };
};

const sanitizeBounds = (bounds) => {
    if (!bounds) return null;
    const north = toNumber(bounds.north);
    const south = toNumber(bounds.south);
    const east = toNumber(bounds.east);
    const west = toNumber(bounds.west);

    if ([north, south, east, west].some((value) => value === null)) {
        return null;
    }

    return { north, south, east, west };
};

const zoneTariffInclude = {
    zone_tariffs: {
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
                    isActive: true
                }
            }
        },
        orderBy: {
            priority: 'asc'
        }
    }
};

const formatTariffSummary = (tariff) => {
    if (!tariff) return null;

    return {
        id: tariff.id,
        name: tariff.name,
        description: tariff.description || '',
        baseFare: toNumber(tariff.baseFare),
        perKmRate: toNumber(tariff.perKmRate),
        perMinuteRate: toNumber(tariff.perMinuteRate),
        minimumFare: toNumber(tariff.minimumFare),
        isActive: tariff.isActive
    };
};

const formatZoneTariff = (zoneTariff) => ({
    id: zoneTariff.id,
    zoneId: zoneTariff.zoneId,
    tariffId: zoneTariff.tariffId,
    priority: zoneTariff.priority,
    isDefault: zoneTariff.isDefault,
    createdAt: zoneTariff.createdAt,
    updatedAt: zoneTariff.updatedAt,
    tariff: formatTariffSummary(zoneTariff.tariffs)
});

const formatZone = (zone) => {
    const boundaries = parseJsonField(zone.boundaries, {});
    const specialRules = parseJsonField(zone.specialRules, {});
    const rawCoordinates = parseJsonField(boundaries.coordinates, []);
    const normalizedCoordinates = sanitizeCoordinates(rawCoordinates);
    const coordinates =
        normalizedCoordinates && normalizedCoordinates.length > 0
            ? normalizedCoordinates
            : rawCoordinates || [];

    const rawBounds = parseJsonField(boundaries.bounds, null);
    const normalizedBounds = sanitizeBounds(rawBounds);
    const bounds = normalizedBounds || rawBounds || null;

    const rawCenterPoint = parseJsonField(boundaries.centerPoint, null);
    const normalizedCenterPoint = sanitizeCenterPoint(rawCenterPoint);
    const centerPoint = normalizedCenterPoint || rawCenterPoint || null;

    const formattedZoneTariffs = (zone.zone_tariffs || []).map(formatZoneTariff);

    return {
        id: zone.id,
        companyId: zone.companyId,
        zoneName: zone.name,
        zoneType: zone.type || 'SERVICE_AREA',
        status: zone.isActive ? 'ACTIVE' : 'INACTIVE',
        description: zone.description || '',
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
        geometryType: boundaries.geometryType || 'POLYGON',
        polygonGeojson: boundaries.polygonGeojson || null,
        coordinates: coordinates || [],
        centerPoint,
        radius: boundaries.radius !== undefined ? toNumber(boundaries.radius) : null,
        bounds: bounds,
        color: boundaries.color || '#3B82F6',
        fillOpacity: boundaries.fillOpacity !== undefined ? toNumber(boundaries.fillOpacity) : 0.3,
        strokeWeight: boundaries.strokeWeight !== undefined ? toNumber(boundaries.strokeWeight) : 2,
        icon: boundaries.icon || '📍',
        priceMultiplier: zone.surgeMultiplier !== undefined ? toNumber(zone.surgeMultiplier, 1) : 1,
        pickupAllowed: specialRules.pickupAllowed !== undefined ? Boolean(specialRules.pickupAllowed) : true,
        dropoffAllowed: specialRules.dropoffAllowed !== undefined ? Boolean(specialRules.dropoffAllowed) : true,
        priority: specialRules.priority !== undefined ? toNumber(specialRules.priority, 0) : 0,
        notes: specialRules.notes || '',
        tariffCount: formattedZoneTariffs.length,
        zoneTariffs: formattedZoneTariffs,
        tariffs: formattedZoneTariffs.map((zt) => zt.tariff).filter(Boolean),
        activeRides: zone.activeRides || 0,
        totalRides: zone.totalRides || 0,
        rawBoundaries: boundaries,
        rawSpecialRules: specialRules
    };
};

const loadZoneWithRelations = async (zoneId, companyId) => {
    return prisma.zones.findFirst({
        where: {
            id: zoneId,
            companyId
        },
        include: zoneTariffInclude
    });
};

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

// GET /api/owner/zones
router.get('/', async (req, res) => {
    try {
        const zones = await prisma.zones.findMany({
            where: { companyId: req.companyId },
            include: zoneTariffInclude,
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            zones: zones.map(formatZone)
        });
    } catch (error) {
        console.error('Error fetching zones:', error);
        res.status(500).json({ error: 'Failed to load zones' });
    }
});

// POST /api/owner/zones
router.post('/', async (req, res) => {
    try {
        const {
            zoneName,
            zoneType,
            geometryType = 'POLYGON',
            polygonGeojson,
            coordinates,
            centerPoint,
            radius,
            bounds,
            color = '#3B82F6',
            fillOpacity = 0.3,
            strokeWeight = 2,
            icon,
            description,
            priceMultiplier = 1,
            pickupAllowed = true,
            dropoffAllowed = true,
            priority = 0,
            notes,
            status = 'ACTIVE'
        } = req.body;

        if (!zoneName) {
            return res.status(400).json({ error: 'zoneName is required' });
        }

        // Validate geometry based on type
        const normalizedGeometry = (geometryType || 'POLYGON').toUpperCase();

        if (normalizedGeometry === 'CIRCLE' && (!centerPoint || !radius)) {
            return res.status(400).json({ error: 'centerPoint and radius are required for circles' });
        }
        if (normalizedGeometry === 'RECTANGLE' && !bounds) {
            return res.status(400).json({ error: 'bounds are required for rectangles' });
        }
        if (normalizedGeometry === 'POLYGON' && !coordinates) {
            return res.status(400).json({ error: 'coordinates are required for polygons' });
        }

        const sanitizedCoordinates = normalizedGeometry === 'POLYGON'
            ? sanitizeCoordinates(coordinates)
            : null;

        if (normalizedGeometry === 'POLYGON' && (!sanitizedCoordinates || sanitizedCoordinates.length < 3)) {
            return res.status(400).json({ error: 'Polygon coordinates are invalid' });
        }

        const sanitizedCenterPoint = sanitizeCenterPoint(centerPoint);
        const sanitizedBounds = sanitizeBounds(bounds);

        if (normalizedGeometry === 'CIRCLE') {
            if (!sanitizedCenterPoint || radius === undefined || radius === null) {
                return res.status(400).json({ error: 'centerPoint and radius are required for circles' });
            }
        }

        if (normalizedGeometry === 'RECTANGLE') {
            if (!sanitizedBounds) {
                return res.status(400).json({ error: 'bounds are required for rectangles' });
            }
        }

        const zone = await prisma.zones.create({
            data: {
                id: uuidv4(),
                companyId: req.companyId,
                name: zoneName,
                description: description || null,
                boundaries: {
                    geometryType: normalizedGeometry,
                    polygonGeojson: polygonGeojson || null,
                    coordinates: sanitizedCoordinates,
                    centerPoint: sanitizedCenterPoint,
                    radius: radius ? parseFloat(radius) : null,
                    bounds: sanitizedBounds,
                    color,
                    fillOpacity: fillOpacity !== undefined ? parseFloat(fillOpacity) : 0.3,
                    strokeWeight: strokeWeight !== undefined ? parseInt(strokeWeight, 10) : 2,
                    icon: icon || null
                },
                type: zoneType || 'SERVICE_AREA',
                surgeMultiplier: priceMultiplier !== undefined ? parseFloat(priceMultiplier) : 1.0,
                isActive: status === 'ACTIVE',
                specialRules: {
                    pickupAllowed: pickupAllowed !== undefined ? Boolean(pickupAllowed) : true,
                    dropoffAllowed: dropoffAllowed !== undefined ? Boolean(dropoffAllowed) : true,
                    priority: priority !== undefined ? parseInt(priority, 10) : 0,
                    notes: notes || null
                },
                updatedAt: new Date()
            }
        });

        const createdZone = await loadZoneWithRelations(zone.id, req.companyId);

        res.status(201).json({
            message: 'Zone created successfully',
            zone: formatZone(createdZone)
        });
    } catch (error) {
        console.error('Error creating zone:', error);
        res.status(500).json({ error: 'Failed to create zone', details: error.message });
    }
});

// PUT /api/owner/zones/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await loadZoneWithRelations(id, req.companyId);

        if (!existing) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const {
            zoneName,
            zoneType,
            geometryType,
            polygonGeojson,
            coordinates,
            centerPoint,
            radius,
            bounds,
            color,
            fillOpacity,
            strokeWeight,
            icon,
            description,
            priceMultiplier,
            pickupAllowed,
            dropoffAllowed,
            priority,
            notes,
            status
        } = req.body;

        const updateData = {};

        if (zoneName !== undefined) updateData.name = zoneName;
        if (description !== undefined) updateData.description = description;
        if (zoneType !== undefined) updateData.type = zoneType;
        if (priceMultiplier !== undefined) updateData.surgeMultiplier = parseFloat(priceMultiplier);
        if (status !== undefined) updateData.isActive = status === 'ACTIVE';

        const existingBoundaries = parseJsonField(existing.boundaries, {});
        const boundariesUpdate = { ...existingBoundaries };
        let hasBoundaryUpdate = false;

        if (geometryType !== undefined) {
            boundariesUpdate.geometryType = geometryType;
            hasBoundaryUpdate = true;
        }
        if (polygonGeojson !== undefined) {
            boundariesUpdate.polygonGeojson = polygonGeojson || null;
            hasBoundaryUpdate = true;
        }
        if (coordinates !== undefined) {
            const sanitized = sanitizeCoordinates(coordinates);
            if (sanitized) {
                boundariesUpdate.coordinates = sanitized;
            } else if (coordinates === null || coordinates === undefined) {
                boundariesUpdate.coordinates = null;
            }
            hasBoundaryUpdate = true;
        }
        if (centerPoint !== undefined) {
            boundariesUpdate.centerPoint = sanitizeCenterPoint(centerPoint);
            hasBoundaryUpdate = true;
        }
        if (radius !== undefined) {
            boundariesUpdate.radius = radius !== null && radius !== undefined ? parseFloat(radius) : null;
            hasBoundaryUpdate = true;
        }
        if (bounds !== undefined) {
            boundariesUpdate.bounds = sanitizeBounds(bounds);
            hasBoundaryUpdate = true;
        }
        if (color !== undefined) {
            boundariesUpdate.color = color;
            hasBoundaryUpdate = true;
        }
        if (fillOpacity !== undefined) {
            boundariesUpdate.fillOpacity = parseFloat(fillOpacity);
            hasBoundaryUpdate = true;
        }
        if (strokeWeight !== undefined) {
            boundariesUpdate.strokeWeight = parseInt(strokeWeight);
            hasBoundaryUpdate = true;
        }
        if (icon !== undefined) {
            boundariesUpdate.icon = icon;
            hasBoundaryUpdate = true;
        }

        if (hasBoundaryUpdate) {
            const finalGeometry = (boundariesUpdate.geometryType || existingBoundaries.geometryType || 'POLYGON').toUpperCase();
            boundariesUpdate.geometryType = finalGeometry;

            if (finalGeometry === 'POLYGON') {
                const effectiveCoordinates = sanitizeCoordinates(boundariesUpdate.coordinates ?? existingBoundaries.coordinates);
                if (!effectiveCoordinates || effectiveCoordinates.length < 3) {
                    return res.status(400).json({ error: 'Polygon coordinates are invalid' });
                }
                boundariesUpdate.coordinates = effectiveCoordinates;
                boundariesUpdate.centerPoint = sanitizeCenterPoint(boundariesUpdate.centerPoint ?? existingBoundaries.centerPoint);
                boundariesUpdate.bounds = null;
                boundariesUpdate.radius = null;
            } else if (finalGeometry === 'CIRCLE') {
                const effectiveCenter = sanitizeCenterPoint(boundariesUpdate.centerPoint ?? existingBoundaries.centerPoint);
                const effectiveRadiusRaw = boundariesUpdate.radius !== undefined ? boundariesUpdate.radius : existingBoundaries.radius;
                const effectiveRadius = effectiveRadiusRaw !== null && effectiveRadiusRaw !== undefined ? parseFloat(effectiveRadiusRaw) : null;

                if (!effectiveCenter || effectiveRadius === null || Number.isNaN(effectiveRadius)) {
                    return res.status(400).json({ error: 'centerPoint and radius are required for circles' });
                }

                boundariesUpdate.centerPoint = effectiveCenter;
                boundariesUpdate.radius = effectiveRadius;
                boundariesUpdate.coordinates = null;
                boundariesUpdate.bounds = null;
            } else if (finalGeometry === 'RECTANGLE') {
                const effectiveBounds = sanitizeBounds(boundariesUpdate.bounds ?? existingBoundaries.bounds);
                if (!effectiveBounds) {
                    return res.status(400).json({ error: 'bounds are required for rectangles' });
                }
                boundariesUpdate.bounds = effectiveBounds;
                boundariesUpdate.centerPoint = sanitizeCenterPoint(boundariesUpdate.centerPoint ?? existingBoundaries.centerPoint);
                boundariesUpdate.coordinates = null;
                boundariesUpdate.radius = null;
            }

            updateData.boundaries = boundariesUpdate;
        }

        const existingSpecialRules = parseJsonField(existing.specialRules, {});
        const specialRulesUpdate = { ...existingSpecialRules };
        let hasSpecialRuleUpdate = false;

        if (pickupAllowed !== undefined) {
            specialRulesUpdate.pickupAllowed = Boolean(pickupAllowed);
            hasSpecialRuleUpdate = true;
        }
        if (dropoffAllowed !== undefined) {
            specialRulesUpdate.dropoffAllowed = Boolean(dropoffAllowed);
            hasSpecialRuleUpdate = true;
        }
        if (priority !== undefined) {
            specialRulesUpdate.priority = parseInt(priority);
            hasSpecialRuleUpdate = true;
        }
        if (notes !== undefined) {
            specialRulesUpdate.notes = notes;
            hasSpecialRuleUpdate = true;
        }

        if (hasSpecialRuleUpdate) {
            updateData.specialRules = specialRulesUpdate;
        }

        await prisma.zones.update({
            where: { id },
            data: updateData
        });

        const updatedZone = await loadZoneWithRelations(id, req.companyId);

        res.json({
            message: 'Zone updated successfully',
            zone: formatZone(updatedZone)
        });
    } catch (error) {
        console.error('Error updating zone:', error);
        res.status(500).json({ error: 'Failed to update zone', details: error.message });
    }
});

// DELETE /api/owner/zones/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.zones.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        await prisma.zones.delete({ where: { id } });

        res.json({ message: 'Zone deleted successfully' });
    } catch (error) {
        console.error('Error deleting zone:', error);
        res.status(500).json({ error: 'Failed to delete zone' });
    }
});

// GET /api/owner/zones/:id/tariffs - Get tariffs linked to a zone
router.get('/:id/tariffs', async (req, res) => {
    try {
        const { id } = req.params;

        const zone = await prisma.zones.findFirst({
            where: { id, companyId: req.companyId },
            include: zoneTariffInclude
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const formattedZone = formatZone(zone);

        res.json({
            zoneId: formattedZone.id,
            zoneTariffs: formattedZone.zoneTariffs
        });
    } catch (error) {
        console.error('Error getting zone tariffs:', error);
        res.status(500).json({ error: 'Failed to get zone tariffs' });
    }
});

// POST /api/owner/zones/:id/tariffs - Link tariffs to a zone
router.post('/:id/tariffs', async (req, res) => {
    try {
        const { id } = req.params;
        const { tariffIds, setAsDefault = false } = req.body;

        if (!Array.isArray(tariffIds) || tariffIds.length === 0) {
            return res.status(400).json({ error: 'tariffIds must be a non-empty array' });
        }

        const zone = await prisma.zones.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Verify tariffs belong to the company
        const tariffs = await prisma.tariffs.findMany({
            where: {
                id: { in: tariffIds },
                companyId: req.companyId,
                isActive: true
            }
        });

        if (tariffs.length !== tariffIds.length) {
            return res.status(400).json({ error: 'Some tariffs not found or not owned by company' });
        }

        const existingLinks = await prisma.zone_tariffs.findMany({
            where: { zoneId: id },
            orderBy: { priority: 'asc' }
        });

        const existingTariffIds = new Set(existingLinks.map(link => link.tariffId));
        const newTariffIds = tariffIds.filter(tariffId => !existingTariffIds.has(tariffId));
        let nextPriority = existingLinks.length + 1;

        await prisma.$transaction(async (tx) => {
            for (const tariffId of newTariffIds) {
                await tx.zone_tariffs.create({
                    data: {
                        id: uuidv4(),
                        zoneId: id,
                        tariffId,
                        priority: nextPriority++,
                        isDefault: false
                    }
                });
            }

            if (setAsDefault && tariffIds[0]) {
                await tx.zone_tariffs.updateMany({
                    where: { zoneId: id },
                    data: { isDefault: false }
                });

                await tx.zone_tariffs.updateMany({
                    where: {
                        zoneId: id,
                        tariffId: tariffIds[0]
                    },
                    data: { isDefault: true }
                });
            }
        });

        const updatedZone = await loadZoneWithRelations(id, req.companyId);
        const formattedZone = formatZone(updatedZone);

        res.json({
            message: 'Tariffs linked to zone successfully',
            linkedCount: newTariffIds.length,
            totalLinked: formattedZone.zoneTariffs.length,
            zoneTariffs: formattedZone.zoneTariffs
        });
    } catch (error) {
        console.error('Error linking tariffs to zone:', error);
        res.status(500).json({ error: 'Failed to link tariffs to zone' });
    }
});

// DELETE /api/owner/zones/:id/tariffs/:tariffId - Unlink a tariff from a zone
router.delete('/:id/tariffs/:tariffId', async (req, res) => {
    try {
        const { id, tariffId } = req.params;

        const zone = await prisma.zones.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const deleteResult = await prisma.zone_tariffs.deleteMany({
            where: {
                zoneId: id,
                tariffId: tariffId,
                tariffs: {
                    companyId: req.companyId
                }
            }
        });

        if (deleteResult.count === 0) {
            return res.status(404).json({ error: 'Tariff link not found for this zone' });
        }

        let remainingLinks = await prisma.zone_tariffs.findMany({
            where: { zoneId: id },
            orderBy: { priority: 'asc' }
        });

        if (remainingLinks.length > 0) {
            // Normalize priorities
            await Promise.all(
                remainingLinks.map((link, index) => {
                    const desiredPriority = index + 1;
                    if (link.priority === desiredPriority) return null;
                    return prisma.zone_tariffs.update({
                        where: { id: link.id },
                        data: { priority: desiredPriority }
                    });
                }).filter(Boolean)
            );

            remainingLinks = await prisma.zone_tariffs.findMany({
                where: { zoneId: id },
                orderBy: { priority: 'asc' }
            });

            // Ensure a default tariff exists
            const hasDefault = remainingLinks.some(link => link.isDefault);
            if (!hasDefault) {
                await prisma.zone_tariffs.update({
                    where: { id: remainingLinks[0].id },
                    data: { isDefault: true }
                });
            }
        }

        const updatedZone = await loadZoneWithRelations(id, req.companyId);

        res.json({
            message: 'Tariff unlinked from zone successfully',
            zoneTariffs: formatZone(updatedZone).zoneTariffs
        });
    } catch (error) {
        console.error('Error unlinking tariff from zone:', error);
        res.status(500).json({ error: 'Failed to unlink tariff from zone' });
    }
});

// PUT /api/owner/zones/:id/tariffs/:tariffId/default - Set default tariff for a zone
router.put('/:id/tariffs/:tariffId/default', async (req, res) => {
    try {
        const { id, tariffId } = req.params;

        const zone = await prisma.zones.findFirst({
            where: { id, companyId: req.companyId }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        const zoneTariff = await prisma.zone_tariffs.findFirst({
            where: {
                zoneId: id,
                tariffId,
                tariffs: {
                    companyId: req.companyId
                }
            }
        });

        if (!zoneTariff) {
            return res.status(404).json({ error: 'Tariff is not linked to this zone' });
        }

        await prisma.$transaction([
            prisma.zone_tariffs.updateMany({
                where: { zoneId: id },
                data: { isDefault: false }
            }),
            prisma.zone_tariffs.updateMany({
                where: {
                    zoneId: id,
                    tariffId
                },
                data: { isDefault: true }
            })
        ]);

        const updatedZone = await loadZoneWithRelations(id, req.companyId);
        const formattedZone = formatZone(updatedZone);

        res.json({
            message: 'Default tariff updated successfully',
            zoneTariffs: formattedZone.zoneTariffs
        });
    } catch (error) {
        console.error('Error setting default tariff for zone:', error);
        res.status(500).json({ error: 'Failed to set default tariff for zone' });
    }
});

module.exports = router;
