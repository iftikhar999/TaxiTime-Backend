#!/usr/bin/env node

/**
 * Test Zone Detection with Driver Location
 * This script tests if the zone detection service works with the driver's actual GPS coordinates
 */

const { PrismaClient } = require('@prisma/client');
const { detectZone } = require('./services/zoneDetectionService');

async function testZoneDetection() {
    const prisma = new PrismaClient();

    try {
        console.log('🔍 Testing Zone Detection with Driver Location\n');

        // Get Driver1 City Cabs
        const driver = await prisma.user.findFirst({
            where: {
                firstName: 'Driver1',
                lastName: { contains: 'City' },
                role: 'DRIVER'
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                companyId: true,
                locationUpdates: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        latitude: true,
                        longitude: true,
                        createdAt: true
                    }
                }
            }
        });

        if (!driver) {
            console.log('❌ Driver not found');
            return;
        }

        const location = driver.locationUpdates[0];
        if (!location) {
            console.log('❌ No location data for driver');
            return;
        }

        console.log(`👤 Driver: ${driver.firstName} ${driver.lastName}`);
        console.log(`🏢 Company ID: ${driver.companyId}`);
        console.log(`📍 Location: ${location.latitude}, ${location.longitude}`);
        console.log(`🕒 Location Time: ${location.createdAt}\n`);

        // Test zone detection
        console.log('🔍 Testing Zone Detection...');
        const detectedZone = await detectZone(location.latitude, location.longitude, driver.companyId);

        if (detectedZone) {
            console.log('✅ ZONE DETECTED!');
            console.log(`📍 Zone: ${detectedZone.name}`);
            console.log(`🆔 Zone ID: ${detectedZone.id}`);
            console.log(`🏢 Company: ${detectedZone.companyId}`);
            console.log(`📋 Active: ${detectedZone.isActive}`);

            // Show boundaries format
            if (detectedZone.boundaries) {
                const boundaries = typeof detectedZone.boundaries === 'string'
                    ? JSON.parse(detectedZone.boundaries)
                    : detectedZone.boundaries;
                console.log(`🗺️ Geometry Type: ${boundaries.type || 'Unknown'}`);
                console.log(`📐 Has Coordinates: ${!!(boundaries.coordinates)}`);
            }

            // Show tariffs
            if (detectedZone.zoneTariffs && detectedZone.zoneTariffs.length > 0) {
                console.log(`\n💰 Available Tariffs (${detectedZone.zoneTariffs.length}):`);
                detectedZone.zoneTariffs.forEach((zt, index) => {
                    console.log(`   ${index + 1}. ${zt.tariff.name} - ${zt.tariff.vehicleType || 'All Vehicles'}`);
                });
            } else {
                console.log(`\n⚠️ No tariffs configured for this zone`);
            }

        } else {
            console.log('❌ NO ZONE DETECTED');
            console.log('   Driver location does not fall within any active zone boundaries');

            // Show available zones
            console.log('\n🗺️ Available Zones:');
            const zones = await prisma.zone.findMany({
                where: {
                    companyId: driver.companyId,
                    isActive: true
                },
                select: {
                    id: true,
                    name: true,
                    boundaries: true
                }
            });

            zones.forEach((zone, index) => {
                const boundaries = zone.boundaries ?
                    (typeof zone.boundaries === 'string' ? JSON.parse(zone.boundaries) : zone.boundaries)
                    : null;

                console.log(`   ${index + 1}. ${zone.name}`);
                console.log(`      - ID: ${zone.id}`);
                console.log(`      - Has Boundaries: ${!!boundaries}`);
                console.log(`      - Geometry: ${boundaries?.type || 'Unknown'}`);
                console.log(`      - Has Coordinates: ${!!(boundaries?.coordinates)}`);
            });
        }

        console.log('\n🔧 RECOMMENDED FIXES:');
        if (detectedZone) {
            console.log('1. Zone detection is WORKING! The issue is in QueueManagementService');
            console.log('2. Modify handleDriverStatusChange() to call updateDriverZoneMembership()');
            console.log('3. Ensure location updates trigger zone membership updates');
        } else {
            console.log('1. Zone boundaries may be incorrectly formatted');
            console.log('2. Driver location may be outside all defined zones');
            console.log('3. Check zone coordinate format and boundaries');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testZoneDetection();