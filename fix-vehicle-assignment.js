const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixVehicleAssignment() {
  try {
    console.log('🔍 Checking vehicle NYC1000 assignment...\n');

    // Find the vehicle
    const vehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: 'NYC1000' },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        driverId: true,
        companyId: true,
        isActive: true
      }
    });

    if (!vehicle) {
      console.error('❌ Vehicle NYC1000 not found in database!');
      return;
    }

    console.log('📋 Current Vehicle Info:');
    console.log(JSON.stringify(vehicle, null, 2));

    // Find the driver
    const driver = await prisma.user.findUnique({
      where: { id: 'cmhevs557000b9ky461vhx8f9' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        companyId: true,
        role: true
      }
    });

    if (!driver) {
      console.error('❌ Driver not found!');
      return;
    }

    console.log('\n👤 Driver Info:');
    console.log(JSON.stringify(driver, null, 2));

    // Check if they're in the same company
    if (vehicle.companyId !== driver.companyId) {
      console.error('\n❌ Vehicle and Driver are in DIFFERENT companies!');
      console.error(`   Vehicle company: ${vehicle.companyId}`);
      console.error(`   Driver company: ${driver.companyId}`);
      return;
    }

    // Check current assignment
    if (vehicle.driverId === driver.id) {
      console.log('\n✅ Vehicle is ALREADY assigned to this driver!');
      return;
    }

    if (vehicle.driverId) {
      console.log(`\n⚠️  Vehicle is currently assigned to driver: ${vehicle.driverId}`);
      console.log('   Do you want to reassign it? (This will be done automatically)');
    }

    // Assign the vehicle to the driver
    console.log(`\n🔄 Assigning vehicle ${vehicle.licensePlate} to driver ${driver.firstName} ${driver.lastName}...`);
    
    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        driverId: driver.id,
        isActive: true,
        isAvailable: true
      }
    });

    console.log('\n✅ Vehicle assignment updated successfully!');
    console.log('\n📋 Updated Vehicle Info:');
    console.log(JSON.stringify({
      id: updated.id,
      licensePlate: updated.licensePlate,
      make: updated.make,
      model: updated.model,
      year: updated.year,
      driverId: updated.driverId,
      isActive: updated.isActive,
      isAvailable: updated.isAvailable
    }, null, 2));

    console.log('\n✅ Driver should now see NYC1000 in their vehicle list!');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixVehicleAssignment();
