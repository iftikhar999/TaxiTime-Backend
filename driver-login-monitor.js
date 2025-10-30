#!/usr/bin/env node

/**
 * Real-Time Driver Login Monitor
 * 
 * This script monitors driver login events and database changes
 * to verify our socket-database synchronization fix is working.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let lastDriverStatus = new Map();

async function monitorDriverStatus() {
    console.log('🔍 Real-Time Driver Login Monitor Started');
    console.log('📊 Monitoring driver authentication and status changes...\n');

    // Monitor every 2 seconds
    setInterval(async () => {
        try {
            const drivers = await prisma.user.findMany({
                where: {
                    role: 'DRIVER',
                    isActive: true
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
                        select: {
                            status: true,
                            startTime: true
                        }
                    },
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

            let hasChanges = false;

            drivers.forEach(driver => {
                const dispatchStatus = driver.preferences?.dispatch?.status || 'OFFLINE';
                const shiftStatus = driver.shifts[0]?.status || 'OFFLINE';
                const lastUpdate = driver.preferences?.dispatch?.lastStatusUpdate;
                const location = driver.locationUpdates[0];

                const currentState = {
                    dispatchStatus,
                    shiftStatus,
                    lastUpdate,
                    hasLocation: !!location,
                    locationTime: location?.createdAt
                };

                const previousState = lastDriverStatus.get(driver.id);

                if (!previousState || JSON.stringify(currentState) !== JSON.stringify(previousState)) {
                    hasChanges = true;

                    const statusIcon = dispatchStatus === 'ONLINE' ? '🟢' :
                        dispatchStatus === 'BUSY' ? '🟡' : '🔴';

                    console.log(`${statusIcon} ${driver.firstName} ${driver.lastName} (${driver.id})`);
                    console.log(`   📱 Dispatch Status: ${dispatchStatus}`);
                    console.log(`   🚗 Shift Status: ${shiftStatus}`);
                    console.log(`   ⏰ Last Update: ${lastUpdate || 'Never'}`);
                    console.log(`   📍 Location: ${location ? '✅ Active' : '❌ None'}`);

                    if (previousState) {
                        console.log(`   🔄 Changed from: ${previousState.dispatchStatus} → ${dispatchStatus}`);
                    } else {
                        console.log(`   🆕 First time detected`);
                    }
                    console.log('');

                    lastDriverStatus.set(driver.id, currentState);
                }
            });

            if (hasChanges) {
                console.log(`📊 Status Summary (${new Date().toLocaleTimeString()}):`);
                const onlineCount = drivers.filter(d => d.preferences?.dispatch?.status === 'ONLINE').length;
                const busyCount = drivers.filter(d => d.preferences?.dispatch?.status === 'BUSY').length;
                const offlineCount = drivers.filter(d => (d.preferences?.dispatch?.status || 'OFFLINE') === 'OFFLINE').length;
                console.log(`   🟢 Online: ${onlineCount} | 🟡 Busy: ${busyCount} | 🔴 Offline: ${offlineCount}`);
                console.log('─'.repeat(60));
            }

        } catch (error) {
            console.error('❌ Monitor error:', error.message);
        }
    }, 2000);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down monitor...');
    await prisma.$disconnect();
    process.exit(0);
});

// Start monitoring
monitorDriverStatus();