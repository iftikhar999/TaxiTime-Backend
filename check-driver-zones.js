#!/usr/bin/env node

/**
 * Driver Zone Analysis - Check zone assignment and queue status
 */

const { PrismaClient } = require('@prisma/client');

async function checkDriverZoneStatus() {
    const prisma = new PrismaClient();

    try {
        console.log('🗺️ Driver Zone Status Analysis\n');

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
                preferences: true,
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
        const driverZone = driver.preferences?.dispatch?.currentZone;

        console.log(`👤 Driver: ${driver.firstName} ${driver.lastName}`);
        console.log(`🆔 Driver ID: ${driver.id}`);
        console.log(`📍 Location: ${location?.latitude || 'N/A'}, ${location?.longitude || 'N/A'}`);
        console.log(`🕒 Location Time: ${location?.createdAt || 'Never'}`);
        console.log(`🗺️ Driver's Assigned Zone: ${driverZone?.name || 'None'}`);
        console.log(`🆔 Zone ID: ${driverZone?.id || 'None'}`);

        // Get all zones
        const zones = await prisma.zone.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                queue: true,
                companyId: true,
                boundaries: true
            }
        });

        console.log(`\n🏢 Available Zones (${zones.length}):`);

        let driverInAnyQueue = false;

        zones.forEach(zone => {
            const queue = Array.isArray(zone.queue) ? zone.queue : [];
            const isDriverInQueue = queue.includes(driver.id);

            if (isDriverInQueue) {
                driverInAnyQueue = true;
            }

            console.log(`\n📍 Zone: ${zone.name}`);
            console.log(`   🆔 ID: ${zone.id}`);
            console.log(`   🏢 Company: ${zone.companyId}`);
            console.log(`   📋 Queue Length: ${queue.length}`);
            console.log(`   ${isDriverInQueue ? '✅' : '❌'} Driver in queue: ${isDriverInQueue}`);
            console.log(`   🗺️ Has boundaries: ${zone.boundaries ? 'Yes' : 'No'}`);

            if (queue.length > 0) {
                console.log(`   👥 Queue: ${queue.slice(0, 3).join(', ')}${queue.length > 3 ? '...' : ''}`);
            }
        });

        // Analysis and recommendations
        console.log(`\n🔍 ANALYSIS:`);

        if (!driverZone || !driverZone.id) {
            console.log('⚠️  ISSUE 1: Driver has no assigned zone in preferences.dispatch.currentZone');
            console.log('   💡 This should be set when driver goes online');
        }

        if (!location) {
            console.log('⚠️  ISSUE 2: Driver has no location data');
            console.log('   💡 GPS might not be enabled or location update not working');
        }

        if (!driverInAnyQueue) {
            console.log('⚠️  ISSUE 3: Driver is NOT in any zone queue');
            console.log('   💡 This is why they show as "Outside zones" and "Not queued"');
            console.log('   🔧 FIX: QueueManagementService needs to assign driver to appropriate zone');
        } else {
            console.log('✅ Driver IS in a zone queue');
        }

        console.log(`\n📋 RECOMMENDATIONS:`);
        console.log('1. Check if QueueManagementService.handleDriverStatusChange() is working');
        console.log('2. Verify zone boundary detection logic');
        console.log('3. Ensure location updates trigger zone membership updates');
        console.log('4. Check if driver company matches zone company');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkDriverZoneStatus();