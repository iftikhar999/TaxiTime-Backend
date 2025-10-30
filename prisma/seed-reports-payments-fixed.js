const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedReportsAndPayments() {
    try {
        console.log('🌱 Starting seed for Reports & Payments data...\n');

        // Get existing data
        const companies = await prisma.company.findMany();
        const passengers = await prisma.user.findMany({
            where: { role: 'PASSENGER' }
        });
        const drivers = await prisma.user.findMany({
            where: { role: 'DRIVER' }
        });
        const subscriptionPlans = await prisma.subscriptionPlan.findMany();

        if (companies.length === 0) {
            console.log('❌ No companies found. Please seed companies first.');
            return;
        }
        if (passengers.length === 0) {
            console.log('❌ No passengers found. Please seed users first.');
            return;
        }
        if (drivers.length === 0) {
            console.log('❌ No drivers found. Please seed drivers first.');
            return;
        }

        console.log(`Found ${companies.length} companies, ${passengers.length} passengers, ${drivers.length} drivers\n`);

        // Create 100 fake rides (last 30 days)
        console.log('Creating 100 fake rides...');
        const rideStatuses = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS', 'PENDING'];
        const rides = [];

        for (let i = 0; i < 100; i++) {
            const randomCompany = companies[Math.floor(Math.random() * companies.length)];
            const randomPassenger = passengers[Math.floor(Math.random() * passengers.length)];
            const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
            const randomStatus = rideStatuses[Math.floor(Math.random() * rideStatuses.length)];
            const randomDaysAgo = Math.floor(Math.random() * 30);

            const baseFare = Math.floor(Math.random() * 50) + 10;
            const distance = Math.floor(Math.random() * 20) + 1;
            const duration = Math.floor(Math.random() * 40) + 5;

            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - randomDaysAgo);

            rides.push({
                rideId: `RIDE-${Date.now()}-${i}`, // Required unique field
                companyId: randomCompany.id,
                passengerId: randomPassenger.id,
                driverId: randomDriver.id,
                status: randomStatus,
                pickup: {
                    address: `${Math.floor(Math.random() * 100)} Main St`,
                    lat: 40.7128 + (Math.random() - 0.5) * 0.1,
                    lng: -74.0060 + (Math.random() - 0.5) * 0.1
                },
                destination: {
                    address: `${Math.floor(Math.random() * 100)} Oak Ave`,
                    lat: 40.7128 + (Math.random() - 0.5) * 0.1,
                    lng: -74.0060 + (Math.random() - 0.5) * 0.1
                },
                actualDistance: distance,
                actualDuration: duration,
                actualFare: baseFare + Math.floor(Math.random() * 20),
                paymentMethod: Math.random() > 0.5 ? 'CARD' : 'CASH',
                paymentStatus: randomStatus === 'COMPLETED' ? 'PAID' : 'PENDING',
                createdAt: createdAt,
                updatedAt: createdAt
            });
        }

        await prisma.ride.createMany({ data: rides });
        console.log('✅ Created 100 rides');

        // Get created rides so we can link some payments to them
        const createdRides = await prisma.ride.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Create 50 fake payments (last 3 months)
        console.log('Creating 50 fake payments...');
        const paymentStatuses = ['SUCCESS', 'PENDING', 'FAILED'];
        const paymentMethods = ['CARD', 'BANK_TRANSFER', 'PAYPAL'];
        const payments = [];

        for (let i = 0; i < 50; i++) {
            const randomCompany = companies[Math.floor(Math.random() * companies.length)];
            const randomPassenger = passengers[Math.floor(Math.random() * passengers.length)];
            const randomDaysAgo = Math.floor(Math.random() * 90);
            const randomStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
            const randomMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - randomDaysAgo);

            // 70% are ride payments, 30% are subscription payments
            const isRidePayment = Math.random() < 0.7;
            let amount, metadata, tripId = null;

            if (isRidePayment && createdRides.length > 0) {
                // Payment for a completed ride
                const completedRides = createdRides.filter(r => r.status === 'COMPLETED');
                if (completedRides.length > 0) {
                    const randomRide = completedRides[Math.floor(Math.random() * completedRides.length)];
                    tripId = randomRide.id;
                    amount = parseFloat(randomRide.totalFare);
                    metadata = {
                        type: 'RIDE_PAYMENT',
                        rideId: randomRide.id,
                        paymentMethod: randomMethod
                    };
                } else {
                    // No completed rides, make it a subscription payment
                    const randomPlan = subscriptionPlans[Math.floor(Math.random() * subscriptionPlans.length)];
                    amount = parseFloat(randomPlan.price);
                    metadata = {
                        type: 'SUBSCRIPTION_PAYMENT',
                        planId: randomPlan.id,
                        planName: randomPlan.name
                    };
                }
            } else if (subscriptionPlans.length > 0) {
                // Subscription payment
                const randomPlan = subscriptionPlans[Math.floor(Math.random() * subscriptionPlans.length)];
                amount = parseFloat(randomPlan.price);
                metadata = {
                    type: 'SUBSCRIPTION_PAYMENT',
                    planId: randomPlan.id,
                    planName: randomPlan.name,
                    billingCycle: randomPlan.billingCycle
                };
            } else {
                // Default amount if no plans
                amount = Math.floor(Math.random() * 500) + 100;
                metadata = {
                    type: 'MISC_PAYMENT'
                };
            }

            payments.push({
                companyId: randomCompany.id,
                customerId: randomPassenger.id, // Required field
                tripId: tripId, // Optional - only for ride payments
                amount: amount,
                currency: 'USD',
                status: randomStatus,
                paymentMethod: randomMethod,
                providerTransactionId: `TXN-${Date.now()}-${i}`,
                processedAt: randomStatus === 'SUCCESS' ? createdAt : null,
                failureReason: randomStatus === 'FAILED' ? 'Insufficient funds' : null,
                metadata: metadata,
                createdAt: createdAt,
                updatedAt: createdAt
            });
        }

        await prisma.payment.createMany({ data: payments });
        console.log('✅ Created 50 payments');

        console.log('\n🎉 Seed completed successfully!');
        console.log('\nSummary:');
        console.log(`- Rides: 100 (last 30 days)`);
        console.log(`- Payments: 50 (last 3 months)`);
        console.log(`  • ~35 ride payments`);
        console.log(`  • ~15 subscription payments`);

    } catch (error) {
        console.error('❌ Error seeding data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedReportsAndPayments()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
