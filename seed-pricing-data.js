const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedTariffsAndZones() {
    console.log('🌱 Seeding basic tariffs and zones for pricing engine...');

    try {
        // Get the first active company to seed data for
        const company = await prisma.company.findFirst({
            where: {
                status: 'ACTIVE'
            }
        });

        if (!company) {
            console.log('⚠️  No active company found. Creating a basic company first...');
            return;
        }

        console.log(`📍 Seeding data for company: ${company.brandName || company.legalName}`);

        // Seed basic tariff
        const existingTariff = await prisma.tariff.findFirst({
            where: { companyId: company.id }
        });

        if (!existingTariff) {
            const basicTariff = await prisma.tariff.create({
                data: {
                    companyId: company.id,
                    name: 'Standard Rate',
                    description: 'Basic taxi fare for standard service',
                    vehicleType: 'SEDAN',
                    baseFare: 3.50,
                    perKmRate: 1.25,
                    perMinuteRate: 0.35,
                    minimumFare: 5.00,
                    waitingFee: 0.50,
                    maxSurgeMultiplier: 2.5,
                    isActive: true,
                    validFrom: new Date(),
                    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
                }
            });
            console.log(`  ✅ Created basic tariff: ${basicTariff.name}`);
        } else {
            console.log('  ✓ Tariff already exists');
        }

        // Seed basic service zone
        const existingZone = await prisma.zone.findFirst({
            where: { companyId: company.id }
        });

        if (!existingZone) {
            const basicZone = await prisma.zone.create({
                data: {
                    companyId: company.id,
                    name: 'Downtown Service Area',
                    description: 'Main service area for taxi operations',
                    boundaries: {
                        type: 'Polygon',
                        coordinates: [[
                            [-74.0059, 40.7128], // NYC coordinates as example
                            [-74.0059, 40.7589],
                            [-73.9441, 40.7589],
                            [-73.9441, 40.7128],
                            [-74.0059, 40.7128]
                        ]]
                    },
                    type: 'SERVICE_AREA',
                    surgeMultiplier: 1.0,
                    isActive: true
                }
            });
            console.log(`  ✅ Created basic zone: ${basicZone.name}`);
        } else {
            console.log('  ✓ Zone already exists');
        }

        // Seed additional vehicle type tariffs
        const vehicleTypes = ['SUV', 'HATCHBACK', 'VAN'];
        for (const vehicleType of vehicleTypes) {
            const existingVehicleTariff = await prisma.tariff.findFirst({
                where: {
                    companyId: company.id,
                    vehicleType: vehicleType
                }
            });

            if (!existingVehicleTariff) {
                const multiplier = vehicleType === 'VAN' ? 1.4 : vehicleType === 'SUV' ? 1.3 : 1.2;
                await prisma.tariff.create({
                    data: {
                        companyId: company.id,
                        name: `${vehicleType} Rate`,
                        description: `Fare for ${vehicleType.toLowerCase()} service`,
                        vehicleType: vehicleType,
                        baseFare: (3.50 * multiplier).toFixed(2),
                        perKmRate: (1.25 * multiplier).toFixed(2),
                        perMinuteRate: (0.35 * multiplier).toFixed(2),
                        minimumFare: (5.00 * multiplier).toFixed(2),
                        waitingFee: 0.50,
                        maxSurgeMultiplier: 2.5,
                        isActive: true,
                        validFrom: new Date(),
                        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }
                });
                console.log(`  ✅ Created ${vehicleType} tariff`);
            }
        }

        console.log('\n🎉 Successfully seeded tariffs and zones!');
        console.log('   📊 This enables the pricing engine to work properly');
        console.log('   🚕 Job creation and estimates should now function correctly\n');

    } catch (error) {
        console.error('❌ Error seeding tariffs and zones:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedTariffsAndZones();