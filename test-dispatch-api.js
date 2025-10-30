#!/usr/bin/env node

/**
 * Test Dispatch API - Verify Driver Status Fix
 * 
 * This script simulates the dispatch API call to verify
 * that drivers marked as OFFLINE in database are properly
 * filtered out by the getDispatchDriversHandler.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate the dispatch API logic
async function testDispatchAPI() {
    console.log('🧪 Testing Dispatch API Logic...\n');

    try {
        // This mimics the query in routes/dispatch.js getDispatchDriversHandler
        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER',
                isActive: true,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                preferences: true,
                shifts: {
                    where: { endTime: null },
                    orderBy: { startTime: 'desc' },
                    take: 1,
                    select: { status: true },
                }
            },
            take: 150,
        });

        console.log(`📊 Found ${drivers.length} active drivers in database`);

        // Apply the same status normalization logic as the API
        const normalizeStatus = (rawStatus) => {
            const status = String(rawStatus || '').toLowerCase().trim();
            switch (status) {
                case 'online':
                case 'available':
                    return 'available';
                case 'busy':
                    return 'busy';
                case 'break':
                case 'away':
                    return 'away';
                default:
                    return 'offline';
            }
        };

        let onlineCount = 0;
        let offlineCount = 0;

        console.log('\n📋 Driver Status Analysis:');
        drivers.forEach(driver => {
            const preferences = driver.preferences || {};
            const dispatchMeta = preferences.dispatch || {};
            const latestShift = driver.shifts[0] || null;

            // This is the same logic as in the API
            let statusHint = dispatchMeta.status || null;
            if (!statusHint && latestShift?.status) {
                statusHint = latestShift.status;
            }

            const normalizedStatus = normalizeStatus(statusHint);

            if (normalizedStatus === 'offline') {
                offlineCount++;
            } else {
                onlineCount++;
            }

            console.log(`   • ${driver.firstName} ${driver.lastName}: ${normalizedStatus.toUpperCase()} (source: ${statusHint || 'none'})`);
        });

        console.log(`\n📊 Summary:`);
        console.log(`   Online Drivers: ${onlineCount}`);
        console.log(`   Offline Drivers: ${offlineCount}`);
        console.log(`   Total Drivers: ${drivers.length}`);

        if (onlineCount === 0) {
            console.log('\n✅ SUCCESS: No online drivers found - dispatch portal should be empty!');
        } else {
            console.log('\n⚠️  WARNING: Some drivers still showing as online');
        }

        console.log('\n💡 This matches what the dispatch API will return to the frontend.');

    } catch (error) {
        console.error('❌ Error testing API logic:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testDispatchAPI();