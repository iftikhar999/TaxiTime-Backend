const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedReportsAndPayments() {
    console.log('🌱 Seeding Reports and Payments data...');

    try {
        // Get existing data
        const companies = await prisma.company.findMany({ take: 5 });
        const users = await prisma.user.findMany({ where: { role: 'PASSENGER' }, take: 20 });
        const drivers = await prisma.user.findMany({ where: { role: 'DRIVER' }, take: 10 });
        const subscriptionPlans = await prisma.subscriptionPlan.findMany();

        if (companies.length === 0) {
            console.log('❌ No companies found. Please seed companies first.');
            return;
        }

        // Create 100 fake rides (last 30 days)
        console.log('Creating 100 fake rides...');
        const statuses = ['COMPLETED', 'CANCELLED', 'IN_PROGRESS', 'PENDING'];
        const rides = [];

        for (let i = 0; i < 100; i++) {
            const randomCompany = companies[Math.floor(Math.random() * companies.length)];
            const randomPassenger = users[Math.floor(Math.random() * users.length)];
            const randomDriver = drivers[Math.floor(Math.random() * drivers.length)];
            const randomDaysAgo = Math.floor(Math.random() * 30);
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const baseFare = Math.floor(Math.random() * 50) + 10; // $10-$60
            const distance = Math.floor(Math.random() * 20) + 1; // 1-20 km
            const duration = Math.floor(Math.random() * 40) + 5; // 5-45 min

            const createdAt = new Date();
            createdAt.setDate(createdAt.getDate() - randomDaysAgo);

            rides.push({
                companyId: randomCompany.id,
                passengerId: randomPassenger?.id,
                driverId: randomDriver?.id,
                status: randomStatus,
                pickupLocation: `${Math.floor(Math.random() * 100)} Main St`,
                dropoffLocation: `${Math.floor(Math.random() * 100)} Oak Ave`,
                pickupLat: 40.7128 + (Math.random() - 0.5) * 0.1,
                pickupLng: -74.0060 + (Math.random() - 0.5) * 0.1,
                dropoffLat: 40.7128 + (Math.random() - 0.5) * 0.1,
                dropoffLng: -74.0060 + (Math.random() - 0.5) * 0.1,
                distance: distance,
                duration: duration,
                baseFare: baseFare,
                totalFare: baseFare + Math.floor(Math.random() * 20),
                paymentMethod: Math.random() > 0.5 ? 'CARD' : 'CASH',
                paymentStatus: randomStatus === 'COMPLETED' ? 'PAID' : 'PENDING',
                createdAt: createdAt,
                updatedAt: createdAt
            });
        }

        await prisma.ride.createMany({ data: rides });
        console.log('✅ Created 100 rides');

        // Create 50 fake payments (last 3 months)
        if (subscriptionPlans.length > 0) {
            console.log('Creating 50 fake payments...');
            const paymentStatuses = ['SUCCESS', 'PENDING', 'FAILED'];
            const paymentMethods = ['CARD', 'BANK_TRANSFER', 'PAYPAL'];
            const payments = [];

            for (let i = 0; i < 50; i++) {
                const randomCompany = companies[Math.floor(Math.random() * companies.length)];
                const randomPlan = subscriptionPlans[Math.floor(Math.random() * subscriptionPlans.length)];
                const randomDaysAgo = Math.floor(Math.random() * 90);
                const randomStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
                const randomMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

                const createdAt = new Date();
                createdAt.setDate(createdAt.getDate() - randomDaysAgo);

                payments.push({
                    companyId: randomCompany.id,
                    amount: randomPlan.price,
                    currency: 'USD',
                    status: randomStatus,
                    paymentMethod: randomMethod,
                    transactionId: `TXN${Date.now()}${i}`,
                    description: `Subscription payment for ${randomPlan.name}`,
                    metadata: JSON.stringify({
                        planId: randomPlan.id,
                        planName: randomPlan.name,
                        billingCycle: randomPlan.billingCycle
                    }),
                    createdAt: createdAt,
                    updatedAt: createdAt
                });
            }

            await prisma.payment.createMany({ data: payments });
            console.log('✅ Created 50 payments');
        }

        console.log('🎉 Seed completed successfully!');
        console.log('\nSummary:');
        console.log(`- Rides: 100`);
        console.log(`- Payments: 50`);

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
