const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testZoneFormatting() {
    try {
        const parseJsonField = (value, fallback = {}) => {
            if (value === null || value === undefined) return fallback;
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch (error) {
                    return fallback;
                }
            }
            if (Array.isArray(fallback) && !Array.isArray(value)) {
                return fallback;
            }
            return value;
        };

        const zones = await prisma.zone.findMany({ take: 1 });
        const zone = zones[0];

        console.log('Raw zone from DB:');
        console.log('Zone name:', zone.name);
        console.log('Zone type:', zone.type);
        console.log('Zone boundaries type:', typeof zone.boundaries);

        const boundaries = parseJsonField(zone.boundaries, {});
        const coordinates = parseJsonField(boundaries.coordinates, []);

        console.log('\nParsed boundaries keys:', Object.keys(boundaries));
        console.log('Geometry type:', boundaries.geometryType);
        console.log('Coordinates length:', coordinates.length);

        const formatted = {
            id: zone.id,
            zoneName: zone.name,
            zoneType: zone.type || 'SERVICE_AREA',
            status: zone.isActive ? 'ACTIVE' : 'INACTIVE',
            geometryType: boundaries.geometryType || 'POLYGON',
            coordinates: coordinates || [],
            color: boundaries.color || '#3B82F6'
        };

        console.log('\nFormatted zone summary:');
        console.log('Name:', formatted.zoneName);
        console.log('Type:', formatted.zoneType);
        console.log('Status:', formatted.status);
        console.log('Geometry:', formatted.geometryType);
        console.log('Coordinates count:', formatted.coordinates.length);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testZoneFormatting();