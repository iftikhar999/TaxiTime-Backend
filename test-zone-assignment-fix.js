#!/usr/bin/env node

/**
 * Test Driver Zone Assignment Fix
 * This script simulates a driver going online to test automatic zone detection
 */

const { PrismaClient } = require('@prisma/client');
const QueueManagementService = require('./services/queueManagementService');

async function testDriverZoneAssignment() {
    const prisma = new PrismaClient();

    try {
        console.log('🧪 Testing Driver Zone Assignment Fix\n');

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
                preferences: true
            }
        });

        if (!driver) {
            console.log('❌ Driver not found');
            return;
        }

        console.log(`👤 Driver: ${driver.firstName} ${driver.lastName}`);
        console.log(`🆔 Driver ID: ${driver.id}`);
        console.log(`🏢 Company ID: ${driver.companyId}`);

        // Create mock IO for QueueManagementService
        const mockIO = {
            of: () => ({
                to: () => ({
                    emit: (event, data) => {
                        console.log(`📡 Socket Event: ${event}`, JSON.stringify(data, null, 2));
                    }
                })
            })
        };

        // Initialize QueueManagementService
        const queueService = new QueueManagementService(mockIO);

        console.log('\n🔄 Step 1: Check current driver state');
        const currentZone = driver.preferences?.dispatch?.currentZone;
        console.log(`Current Zone: ${currentZone?.id || 'None'}`);

        console.log('\n🔄 Step 2: Force driver offline to reset state');
        const offlineResult = await queueService.handleDriverStatusChange(driver.id, 'OFFLINE');
        console.log(`Offline Result: ${offlineResult}`);

        console.log('\n🔄 Step 3: Simulate driver going online (AVAILABLE)');
        const onlineResult = await queueService.handleDriverStatusChange(driver.id, 'AVAILABLE');
        console.log(`Online Result: ${onlineResult}`);

        console.log('\n🔍 Step 4: Check final driver state');
        const updatedDriver = await prisma.user.findUnique({
            where: { id: driver.id },
            select: {
                preferences: true
            }
        });

        const finalZone = updatedDriver?.preferences?.dispatch?.currentZone;
        console.log(`Final Zone: ${finalZone?.id || 'None'}`);
        if (finalZone) {
            console.log(`Zone Name: ${finalZone.name}`);
            console.log(`Queue Position: ${finalZone.queuePosition || 'N/A'}`);
        }

        console.log('\n🗺️ Step 5: Check zone queues');
        const zones = await prisma.zone.findMany({
            where: {
                companyId: driver.companyId,
                isActive: true
            },
            select: {
                id: true,
                name: true,
                queue: true
            }
        });

        zones.forEach(zone => {
            const queue = Array.isArray(zone.queue) ? zone.queue : [];
            const isInQueue = queue.includes(driver.id);
            console.log(`📍 Zone: ${zone.name}`);
            console.log(`   Queue Length: ${queue.length}`);
            console.log(`   Driver in queue: ${isInQueue ? '✅ YES' : '❌ NO'}`);
            if (isInQueue) {
                const position = queue.indexOf(driver.id) + 1;
                console.log(`   Position: ${position}`);
            }
        });

        console.log('\n🎯 RESULT ANALYSIS:');
        if (finalZone && finalZone.id) {
            console.log('✅ SUCCESS! Driver was automatically assigned to a zone');
            console.log(`   Zone: ${finalZone.name} (${finalZone.id})`);

            // Check if in queue
            const assignedZone = zones.find(z => z.id === finalZone.id);
            if (assignedZone) {
                const queue = Array.isArray(assignedZone.queue) ? assignedZone.queue : [];
                const isInQueue = queue.includes(driver.id);
                if (isInQueue) {
                    console.log('✅ Driver is properly added to zone queue');
                } else {
                    console.log('❌ Driver assigned to zone but not in queue');
                }
            }
        } else {
            console.log('❌ FAILED! Driver was not assigned to any zone');
            console.log('   Check location data and zone boundary detection');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testDriverZoneAssignment();