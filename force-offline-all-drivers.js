#!/usr/bin/env node

/**
 * Force Offline All Drivers - Database Cleanup Utility
 * 
 * This script updates the database to mark all drivers as offline
 * by updating their user preferences.dispatch.status field.
 * 
 * This fixes the synchronization issue where socket events
 * were not properly updating the database records.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function forceOfflineAllDrivers() {
    console.log('🔄 Starting database cleanup - Force offline all drivers...');

    try {
        // Get all drivers
        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER',
                isActive: true
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                preferences: true
            }
        });

        console.log(`📊 Found ${drivers.length} active drivers`);

        if (drivers.length === 0) {
            console.log('✅ No drivers found to update');
            return;
        }

        // Update each driver's preferences to set dispatch status to OFFLINE
        const updatePromises = drivers.map(async (driver) => {
            const currentPrefs = driver.preferences || {};
            const currentDispatch = (currentPrefs.dispatch) || {};

            return prisma.user.update({
                where: { id: driver.id },
                data: {
                    preferences: {
                        ...currentPrefs,
                        dispatch: {
                            ...currentDispatch,
                            status: 'OFFLINE',
                            lastStatusUpdate: new Date().toISOString(),
                            lastLocation: null
                        }
                    }
                }
            });
        });

        await Promise.all(updatePromises);

        console.log('✅ Successfully updated all driver statuses to OFFLINE');

        // End any active shifts
        const shiftsResult = await prisma.shift.updateMany({
            where: {
                endTime: null
            },
            data: {
                status: 'OFFLINE',
                endTime: new Date()
            }
        });

        console.log(`✅ Ended ${shiftsResult.count} active shifts`);

        // Show updated driver statuses
        console.log('\n📋 Updated driver statuses:');
        for (const driver of drivers) {
            console.log(`   • ${driver.firstName} ${driver.lastName} (${driver.id}): OFFLINE`);
        }

        console.log('\n🎉 Database cleanup completed successfully!');
        console.log('💡 All drivers have been marked as OFFLINE in the database.');
        console.log('🔄 Refresh the dispatch portal to see the changes.');

    } catch (error) {
        console.error('❌ Error during database cleanup:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Execute the cleanup
forceOfflineAllDrivers()
    .catch((error) => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });