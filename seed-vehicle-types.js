const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedVehicleTypes() {
    console.log('🚗 Seeding Vehicle Types...');

    // Using single icon for all vehicle types for now
    const defaultIcon = '/shared/assets/vehicle-icons/svg.png';

    const vehicleTypes = [
        {
            name: 'Sedan',
            code: 'SEDAN',
            description: 'Standard 4-door sedan, comfortable for up to 4 passengers',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'SUV',
            code: 'SUV',
            description: 'Sports utility vehicle with elevated seating, perfect for families',
            capacity: 6,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Van',
            code: 'VAN',
            description: 'Spacious passenger van for group travel',
            capacity: 8,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Hatchback',
            code: 'HATCHBACK',
            description: 'Compact hatchback, fuel-efficient city car',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Luxury',
            code: 'LUXURY',
            description: 'Premium luxury sedan with executive amenities',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Motorcycle',
            code: 'MOTORCYCLE',
            description: 'Two-wheeler for quick urban transportation',
            capacity: 2,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Bicycle',
            code: 'BICYCLE',
            description: 'Eco-friendly bicycle for short distances',
            capacity: 1,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Truck',
            code: 'TRUCK',
            description: 'Pickup truck for deliveries and cargo',
            capacity: 3,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Electric',
            code: 'ELECTRIC',
            description: 'Zero-emission electric vehicle',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Economy',
            code: 'ECONOMY',
            description: 'Budget-friendly compact car',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Minivan',
            code: 'MINIVAN',
            description: 'Family minivan with sliding doors',
            capacity: 7,
            icon: defaultIcon,
            isActive: true
        },
        {
            name: 'Premium',
            code: 'PREMIUM',
            description: 'High-end premium vehicle with luxury features',
            capacity: 4,
            icon: defaultIcon,
            isActive: true
        }
    ];

    for (const vehicleType of vehicleTypes) {
        try {
            // Try to find existing vehicle type by code
            const existing = await prisma.vehicleTypeMaster.findUnique({
                where: { code: vehicleType.code }
            });

            if (existing) {
                // Update existing
                await prisma.vehicleTypeMaster.update({
                    where: { code: vehicleType.code },
                    data: vehicleType
                });
                console.log(`✅ Updated: ${vehicleType.name}`);
            } else {
                // Create new
                await prisma.vehicleTypeMaster.create({
                    data: vehicleType
                });
                console.log(`✨ Created: ${vehicleType.name}`);
            }
        } catch (error) {
            console.error(`❌ Error with ${vehicleType.name}:`, error.message);
        }
    }

    console.log('✅ Vehicle types seeding completed!');
}

seedVehicleTypes()
    .catch((error) => {
        console.error('Error seeding vehicle types:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

