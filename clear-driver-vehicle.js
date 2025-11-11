#!/usr/bin/env node
/**
 * Clear Driver Vehicle Assignment
 * 
 * This script clears the current vehicle assignment for a driver
 * so they can see the vehicle selection screen on next login.
 * 
 * Usage:
 *   node clear-driver-vehicle.js <driver-email>
 *   node clear-driver-vehicle.js driver@example.com
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearDriverVehicle(driverEmail) {
    try {
        console.log('\n🚗 Clearing vehicle assignment for driver...\n');

        // Find the driver
        const driver = await prisma.user.findUnique({
            where: {
                email: driverEmail,
                role: 'DRIVER'
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                companyId: true
            }
        });

        if (!driver) {
            console.error('❌ Driver not found with email:', driverEmail);
            console.log('\n💡 Tip: Make sure the email is correct and the user has DRIVER role');
            return;
        }

        console.log('📋 Driver found:');
        console.log(`   Name: ${driver.firstName} ${driver.lastName}`);
        console.log(`   Email: ${driver.email}`);
        console.log(`   ID: ${driver.id}\n`);

        // End any active shifts
        const activeShifts = await prisma.shift.findMany({
            where: {
                driverId: driver.id,
                status: {
                    in: ['ONLINE', 'BUSY', 'BREAK']
                }
            }
        });

        if (activeShifts.length > 0) {
            console.log(`⏰ Found ${activeShifts.length} active shift(s), ending them...\n`);

            await prisma.shift.updateMany({
                where: {
                    driverId: driver.id,
                    status: {
                        in: ['ONLINE', 'BUSY', 'BREAK']
                    }
                },
                data: {
                    status: 'OFFLINE',
                    endTime: new Date()
                }
            }); console.log('✅ Active shifts ended\n');
        } else {
            console.log('ℹ️  No active shifts found\n');
        }

        // Check if driver has any assigned vehicles in assignments table
        const assignments = await prisma.assignments.findMany({
            where: {
                driverId: driver.id
            }
        });

        if (assignments.length > 0) {
            console.log(`📦 Found ${assignments.length} vehicle assignment(s), clearing them...\n`);

            await prisma.assignments.deleteMany({
                where: {
                    driverId: driver.id
                }
            });

            console.log('✅ Vehicle assignments cleared\n');
        } else {
            console.log('ℹ️  No vehicle assignments found\n');
        }

        console.log('✨ SUCCESS! Driver vehicle assignment cleared.\n');
        console.log('📱 The driver will now see the vehicle selection screen on next login.\n');

    } catch (error) {
        console.error('\n❌ Error clearing driver vehicle:', error.message);
        console.error('\nFull error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Get driver email from command line arguments
const driverEmail = process.argv[2];

if (!driverEmail) {
    console.error('\n❌ Error: Driver email is required\n');
    console.log('Usage: node clear-driver-vehicle.js <driver-email>\n');
    console.log('Example: node clear-driver-vehicle.js driver@example.com\n');
    process.exit(1);
}

// Run the script
clearDriverVehicle(driverEmail);
