#!/usr/bin/env node

/**
 * Inspect Zone Boundary Format
 */

const { PrismaClient } = require('@prisma/client');

async function inspectZoneBoundaries() {
    const prisma = new PrismaClient();

    try {
        console.log('🔍 Inspecting Zone Boundary Formats\n');

        // Get zones with boundaries
        const zones = await prisma.zone.findMany({
            where: {
                companyId: 'cmgt7lmip0005mxarxkkjup1p',
                isActive: true
            },
            select: {
                id: true,
                name: true,
                boundaries: true
            }
        });

        console.log(`Found ${zones.length} zones to inspect\n`);

        zones.forEach((zone, index) => {
            console.log(`📍 Zone ${index + 1}: ${zone.name}`);
            console.log(`   ID: ${zone.id}`);

            if (zone.boundaries) {
                console.log(`   Boundaries Type: ${typeof zone.boundaries}`);

                try {
                    const boundaries = typeof zone.boundaries === 'string'
                        ? JSON.parse(zone.boundaries)
                        : zone.boundaries;

                    console.log(`   Parsed Boundaries:`, JSON.stringify(boundaries, null, 2));

                    // Check GeoJSON format
                    if (boundaries.type) {
                        console.log(`   ✅ GeoJSON Type: ${boundaries.type}`);
                    } else {
                        console.log(`   ❌ Missing GeoJSON 'type' field`);
                    }

                    if (boundaries.coordinates) {
                        console.log(`   ✅ Has coordinates: ${boundaries.coordinates.length} elements`);
                        if (boundaries.coordinates.length > 0) {
                            console.log(`   First coordinate:`, boundaries.coordinates[0]);
                        }
                    } else {
                        console.log(`   ❌ Missing 'coordinates' field`);
                    }

                    // Check coordinate format
                    if (boundaries.coordinates && boundaries.coordinates.length > 0) {
                        const firstCoord = boundaries.coordinates[0];
                        if (Array.isArray(firstCoord)) {
                            console.log(`   Coordinate format: Array of arrays`);
                            if (firstCoord.length >= 2) {
                                console.log(`   First point: [${firstCoord[0]}, ${firstCoord[1]}]`);
                            }
                        } else if (firstCoord.lat !== undefined && firstCoord.lng !== undefined) {
                            console.log(`   Coordinate format: Objects with lat/lng`);
                            console.log(`   First point: {lat: ${firstCoord.lat}, lng: ${firstCoord.lng}}`);
                        } else {
                            console.log(`   ❓ Unknown coordinate format:`, firstCoord);
                        }
                    }

                } catch (parseError) {
                    console.log(`   ❌ Failed to parse boundaries: ${parseError.message}`);
                }
            } else {
                console.log(`   ❌ No boundaries data`);
            }

            console.log(''); // Empty line
        });

        // Test driver location
        console.log('🧪 Testing Driver Location vs Zone Boundaries');
        console.log('Driver Location: 25.2854467, 51.5310383 (Lat, Lng)\n');

        // Manual test for each zone
        zones.forEach((zone) => {
            console.log(`Testing zone: ${zone.name}`);

            if (zone.boundaries) {
                try {
                    const boundaries = typeof zone.boundaries === 'string'
                        ? JSON.parse(zone.boundaries)
                        : zone.boundaries;

                    if (boundaries.coordinates) {
                        console.log(`   Zone coordinates:`, boundaries.coordinates.slice(0, 3)); // Show first 3 points

                        // Check if coordinates are in reasonable range for Qatar/Middle East
                        const firstPoint = boundaries.coordinates[0];
                        if (Array.isArray(firstPoint) && firstPoint.length >= 2) {
                            const lat = firstPoint[1];
                            const lng = firstPoint[0];
                            console.log(`   First point: Lat ${lat}, Lng ${lng}`);

                            // Qatar is roughly: Lat 24-27, Lng 50-52
                            if (lat >= 24 && lat <= 27 && lng >= 50 && lng <= 52) {
                                console.log(`   ✅ Coordinates are in Qatar region`);
                            } else {
                                console.log(`   ⚠️ Coordinates may be outside Qatar region`);
                            }
                        } else if (firstPoint.lat !== undefined && firstPoint.lng !== undefined) {
                            console.log(`   First point: Lat ${firstPoint.lat}, Lng ${firstPoint.lng}`);

                            if (firstPoint.lat >= 24 && firstPoint.lat <= 27 && firstPoint.lng >= 50 && firstPoint.lng <= 52) {
                                console.log(`   ✅ Coordinates are in Qatar region`);
                            } else {
                                console.log(`   ⚠️ Coordinates may be outside Qatar region`);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`   ❌ Error processing zone: ${error.message}`);
                }
            }

            console.log('');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

inspectZoneBoundaries();