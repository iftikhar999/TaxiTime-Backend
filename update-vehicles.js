const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fuelTypes = ['gasoline', 'diesel', 'electric', 'hybrid'];
const transmissions = ['automatic', 'manual'];

async function updateVehicles() {
  console.log('🔄 Updating vehicles with fuelType and transmission...\n');
  
  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, make: true, model: true, features: true, insurance: true, registration: true }
  });
  
  console.log(`Found ${vehicles.length} vehicles`);
  
  for (const vehicle of vehicles) {
    const features = vehicle.features || {};
    const insurance = vehicle.insurance || {};
    const registration = vehicle.registration || {};
    
    // Add fuelType and transmission if missing
    if (!features.fuelType) {
      features.fuelType = fuelTypes[Math.floor(Math.random() * fuelTypes.length)];
    }
    if (!features.transmission) {
      features.transmission = transmissions[Math.floor(Math.random() * transmissions.length)];
    }
    
    // Add inspectionExpiry if missing
    if (!insurance.inspectionExpiry) {
      const inspectionDate = new Date(Date.now() + (Math.floor(Math.random() * 365) + 90) * 24 * 60 * 60 * 1000);
      insurance.inspectionExpiry = inspectionDate.toISOString().split('T')[0];
    }
    
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        features,
        insurance
      }
    });
    
    console.log(`  ✅ Updated: ${vehicle.make} ${vehicle.model} - ${features.fuelType}/${features.transmission}`);
  }
  
  console.log(`\n✅ Updated ${vehicles.length} vehicles`);
}

updateVehicles()
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
