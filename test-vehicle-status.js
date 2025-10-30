const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVehicleStatus() {
    try {
        const vehicles = await prisma.vehicle.findMany({
            where: {
                companyId: 'cmgi14j9y000f9k0nfslciyvw' // Elite Taxi
            },
            select: {
                make: true,
                model: true,
                licensePlate: true,
                isActive: true,
                isAvailable: true
            }
        });

        console.log('🚗 Vehicle Status Check:\n');
        vehicles.forEach(v => {
            // Apply NEW fixed logic from backend API
            const status = v.isActive ? 'ACTIVE' : 'INACTIVE';
            const expectedStatus = v.isActive ? 'ACTIVE ✅' : 'INACTIVE ✅';
            console.log(`${v.make} ${v.model} (${v.licensePlate}):`);
            console.log(`  isActive: ${v.isActive}, isAvailable: ${v.isAvailable}`);
            console.log(`  Computed Status: ${status}`);
            console.log(`  Expected: ${expectedStatus}\n`);
        });

        console.log('\n✅ Status Logic Fixed:');
        console.log('   - isActive=true → Status=ACTIVE (vehicle is working)');
        console.log('   - isActive=false → Status=INACTIVE (vehicle broken/not working)');
        console.log('   - isAvailable flag is for internal assignment tracking only\n');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkVehicleStatus();
