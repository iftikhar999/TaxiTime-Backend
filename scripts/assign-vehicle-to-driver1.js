// Quick script to assign vehicle to Driver1
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignVehicle() {
    try {
        // First, check if vehicle exists
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                id: 'cmhevs55y001b9ky4o1qrxi6a'
            }
        });
        
        if (existingVehicle) {
            console.log('✅ Vehicle found:', existingVehicle.licensePlate);
            
            // Update it to assign to Driver1
            const updated = await prisma.vehicle.update({
                where: { id: 'cmhevs55y001b9ky4o1qrxi6a' },
                data: { driverId: 'cmhevs557000b9ky461vhx8f9' }
            });
            
            console.log(`✅ Assigned vehicle ${updated.licensePlate} to Driver1`);
        } else {
            // Find any unassigned vehicle
            const anyVehicle = await prisma.vehicle.findFirst({
                where: {
                    companyId: 'cmhevs52g00059ky427qd5kxe',
                    isActive: true
                }
            });
            
            if (anyVehicle) {
                const updated = await prisma.vehicle.update({
                    where: { id: anyVehicle.id },
                    data: { driverId: 'cmhevs557000b9ky461vhx8f9' }
                });
                console.log(`✅ Assigned vehicle ${updated.licensePlate} to Driver1`);
            } else {
                console.log('❌ No vehicles found in company');
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

assignVehicle();
