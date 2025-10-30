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
        const rideStatuses = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS', 'REQUESTED'];
        const rides = [];

        for (let i = 0; i < 100; i++) {
            const randomCompany = companies[Math.floor(Math.random() * companies.length)];
            const randomPassenger = passengers[Math.floor(Math.random() * passengers.length)];
            const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
            const randomStatus = rideStatuses[Math.floor(Math.random() * rideStatuses.length)];
            const randomDaysAgo = Math.floor(Math.random() * 30);

            const actualFare = Math.floor(Math.random() * 50) + 10; // $10-$60
            const estimatedFare = actualFare - 5 + Math.floor(Math.random() * 10); // Close to actual

            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - randomDaysAgo);

            rides.push({
                rideId: `RIDE-${Date.now()}-${i}`,
                companyId: randomCompany.id,
                passengerId: randomPassenger.id,
                driverId: randomDriver.id,
                status: randomStatus,
                pickup: {
                    address: `${Math.floor(Math.random() * 100)} Main St, New York`,
                    lat: 40.7128 + (Math.random() - 0.5) * 0.1,
                    lng: -74.0060 + (Math.random() - 0.5) * 0.1
                },
                destination: {
                    address: `${Math.floor(Math.random() * 100)} Oak Ave, New York`,
                    lat: 40.7128 + (Math.random() - 0.5) * 0.1,
                    lng: -74.0060 + (Math.random() - 0.5) * 0.1
                },
                actualDistance: Math.floor(Math.random() * 20) + 1,
                estimatedDistance: Math.floor(Math.random() * 20) + 1,
                actualDuration: Math.floor(Math.random() * 40) + 5,
                estimatedDuration: Math.floor(Math.random() * 40) + 5,
                actualFare: actualFare,
                estimatedFare: estimatedFare,
                paymentMethod: Math.random() > 0.5 ? 'CARD' : 'CASH',
                paymentStatus: randomStatus === 'COMPLETED' ? 'PAID' : 'PENDING',
                createdAt: createdAt,
                updatedAt: createdAt,
                requestedAt: createdAt
            });
        }

        await prisma.ride.createMany({ data: rides });
        console.log('✅ Created 100 rides');

        // Get created rides so we can link some payments to them
        const createdRides = await prisma.ride.findMany({
            where: {
                status: 'COMPLETED'
            },
            take: 50, // Get 50 completed rides for payments
        });

        console.log(`Found ${createdRides.length} completed rides for linking payments\n`);

        // Create 50 fake payments (last 3 months)
        console.log('Creating 50 fake payments...');
        const paymentStatuses = ['COMPLETED', 'PENDING', 'FAILED']; // Use valid PaymentStatus enum values
        const paymentMethods = ['CARD', 'CASH', 'DIGITAL_WALLET', 'BANK_TRANSFER']; // Use valid PaymentMethod enum values
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
            const isRidePayment = i < 35 && createdRides.length > 0;
            let amount, metadata, tripId = null;

            if (isRidePayment) {
                // Payment for a completed ride
                const randomRide = createdRides[Math.floor(Math.random() * createdRides.length)];
                tripId = randomRide.id;
                amount = randomRide.actualFare || 25.00; // Use ride's fare or default
                metadata = {
                    type: 'RIDE_PAYMENT',
                    rideId: randomRide.rideId,
                    paymentMethod: randomMethod
                };
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
                // Default payment
                amount = Math.floor(Math.random() * 200) + 50;
                metadata = {
                    type: 'MISC_PAYMENT'
                };
            }

            payments.push({
                companyId: randomCompany.id,
                customerId: randomPassenger.id,
                tripId: tripId,
                amount: parseFloat(amount.toFixed(2)),
                currency: 'USD',
                status: randomStatus,
                paymentMethod: randomMethod,
                providerTransactionId: `TXN-${Date.now()}-${i}`,
                processedAt: randomStatus === 'COMPLETED' ? createdAt : null,
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
