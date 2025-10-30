const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testVehicleUpdate() {
    try {
        console.log('🔍 Testing vehicle field updates...\n');

        // Get first vehicle from Elite Taxi (owner5)
        const vehicle = await prisma.vehicle.findFirst({
            where: {
                companyId: 'cmgi14j9y000f9k0nfslciyvw' // Elite Taxi Service
            }
        });

        if (!vehicle) {
            console.log('❌ No vehicle found');
            return;
        }

        console.log('📋 Original Vehicle:');
        console.log(`   ID: ${vehicle.id}`);
        console.log(`   Make/Model: ${vehicle.make} ${vehicle.model}`);
        console.log(`   License Plate: ${vehicle.licensePlate}`);
        console.log(`   Features: ${JSON.stringify(vehicle.features, null, 2)}`);
        console.log(`   Insurance: ${JSON.stringify(vehicle.insurance, null, 2)}`);
        console.log(`   Registration: ${JSON.stringify(vehicle.registration, null, 2)}\n`);

        // Update vehicle with new data
        const updated = await prisma.vehicle.update({
            where: { id: vehicle.id },
            data: {
                make: 'Honda',
                model: 'Accord',
                year: 2023,
                color: 'Blue',
                features: {
                    fuelType: 'hybrid',
                    transmission: 'automatic'
                },
                insurance: {
                    expiry: '2026-12-31',
                    inspectionExpiry: '2025-12-31'
                },
                registration: {
                    number: 'REG-TEST-123',
                    expiry: '2026-06-30'
                }
            }
        });

        console.log('✅ Vehicle Updated Successfully!');
        console.log(`   Make/Model: ${updated.make} ${updated.model} ${updated.year}`);
        console.log(`   Color: ${updated.color}`);
        console.log(`   Features: ${JSON.stringify(updated.features, null, 2)}`);
        console.log(`   Insurance: ${JSON.stringify(updated.insurance, null, 2)}`);
        console.log(`   Registration: ${JSON.stringify(updated.registration, null, 2)}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

testVehicleUpdate();
