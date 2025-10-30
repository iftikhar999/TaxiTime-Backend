// Fix for zones without geometry data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addSampleGeometryToZones() {
    try {
        console.log('🔧 Adding sample geometry to zones without coordinates...');

        const zones = await prisma.zone.findMany({
            where: {
                isActive: true
            }
        });

        console.log(`Found ${zones.length} zones to check`);

        for (const zone of zones) {
            let boundaries = zone.boundaries || {};

            // Parse if string
            if (typeof boundaries === 'string') {
                try {
                    boundaries = JSON.parse(boundaries);
                } catch (e) {
                    boundaries = {};
                }
            }

            // Check if zone needs geometry data
            const needsGeometry = !boundaries.coordinates && !boundaries.centerPoint && !boundaries.bounds;

            if (needsGeometry) {
                console.log(`\n📍 Adding geometry to zone: ${zone.name}`);

                // Add sample polygon coordinates (around NYC area)
                const sampleCoordinates = [
                    { lat: 40.7500, lng: -74.0060 },
                    { lat: 40.7600, lng: -74.0060 },
                    { lat: 40.7600, lng: -73.9960 },
                    { lat: 40.7500, lng: -73.9960 },
                    { lat: 40.7500, lng: -74.0060 }  // Close the polygon
                ];

                const updatedBoundaries = {
                    ...boundaries,
                    geometryType: 'POLYGON',
                    coordinates: sampleCoordinates,
                    color: '#3B82F6',
                    fillOpacity: 0.3,
                    strokeWeight: 2
                };

                await prisma.zone.update({
                    where: { id: zone.id },
                    data: {
                        boundaries: updatedBoundaries
                    }
                });

                console.log(`  ✅ Added polygon geometry to ${zone.name}`);
            } else {
                console.log(`  ⏭️ Zone ${zone.name} already has geometry`);
            }
        }

        console.log('\n✅ Geometry fix complete!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addSampleGeometryToZones();