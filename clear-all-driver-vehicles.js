#!/usr/bin/env node
/**
 * Clear ALL Drivers' Vehicle Assignments
 * 
 * This script clears vehicle assignments for ALL drivers in the system.
 * Useful for testing or resetting the system.
 * 
 * Usage:
 *   node clear-all-driver-vehicles.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAllDriverVehicles() {
    try {
        console.log('\n🚗 Clearing ALL driver vehicle assignments...\n');

        // Get all drivers
        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER'
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
            }
        });

        if (drivers.length === 0) {
            console.log('ℹ️  No drivers found in the system\n');
            return;
        }

        console.log(`📋 Found ${drivers.length} driver(s):\n`);
        drivers.forEach((driver, index) => {
            console.log(`   ${index + 1}. ${driver.firstName} ${driver.lastName} (${driver.email})`);
        });
        console.log('');

        // End all active shifts
        const activeShiftsResult = await prisma.shift.updateMany({
            where: {
                status: {
                    in: ['ONLINE', 'BUSY', 'BREAK']
                }
            },
            data: {
                status: 'OFFLINE',
                endTime: new Date()
            }
        }); if (activeShiftsResult.count > 0) {
            console.log(`✅ Ended ${activeShiftsResult.count} active shift(s)\n`);
        } else {
            console.log('ℹ️  No active shifts found\n');
        }

        // Clear all vehicle assignments
        const assignmentsResult = await prisma.assignment.deleteMany({
            where: {
                driverId: {
                    in: drivers.map(d => d.id)
                }
            }
        });

        if (assignmentsResult.count > 0) {
            console.log(`✅ Cleared ${assignmentsResult.count} vehicle assignment(s)\n`);
        } else {
            console.log('ℹ️  No vehicle assignments found\n');
        }

        console.log('✨ SUCCESS! All driver vehicle assignments cleared.\n');
        console.log('📱 All drivers will now see the vehicle selection screen on next login.\n');

    } catch (error) {
        console.error('\n❌ Error clearing driver vehicles:', error.message);
        console.error('\nFull error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
clearAllDriverVehicles();
