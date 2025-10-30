const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedSubscriptionPlans() {
    try {
        console.log('🌱 Seeding subscription plans...');

        // Create subscription plans
        const plans = [
            {
                name: 'Starter',
                description: 'Perfect for small taxi companies just getting started',
                price: 99.99,
                billingCycle: 'monthly',
                vehicleLimit: 5,
                driverLimit: 10,
                rideCommission: 8.0,
                features: [
                    'Basic Dashboard',
                    'Vehicle Management',
                    'Driver Management',
                    'Ride Tracking',
                    'Basic Reports',
                    'Email Support',
                    'Mobile App Access'
                ],
                isActive: true,
                trialDays: 14,
                setupFee: 0
            },
            {
                name: 'Professional',
                description: 'Ideal for growing taxi companies with moderate fleets',
                price: 299.99,
                billingCycle: 'monthly',
                vehicleLimit: 25,
                driverLimit: 50,
                rideCommission: 6.0,
                features: [
                    'Basic Dashboard',
                    'Vehicle Management',
                    'Driver Management',
                    'Ride Tracking',
                    'Basic Reports',
                    'Email Support',
                    'Mobile App Access',
                    'Payment Processing',
                    'Real-time Tracking',
                    'Advanced Analytics',
                    'Priority Support'
                ],
                isActive: true,
                trialDays: 30,
                setupFee: 150
            },
            {
                name: 'Enterprise',
                description: 'Comprehensive solution for large taxi operations',
                price: 599.99,
                billingCycle: 'monthly',
                vehicleLimit: 100,
                driverLimit: 200,
                rideCommission: 4.0,
                features: [
                    'Basic Dashboard',
                    'Vehicle Management',
                    'Driver Management',
                    'Ride Tracking',
                    'Basic Reports',
                    'Email Support',
                    'Mobile App Access',
                    'Payment Processing',
                    'Real-time Tracking',
                    'Advanced Analytics',
                    'Priority Support',
                    'Custom Branding',
                    'API Access',
                    'White Label Solution',
                    'Dedicated Account Manager'
                ],
                isActive: true,
                trialDays: 30,
                setupFee: 500
            },
            {
                name: 'Ultimate',
                description: 'Unlimited solution for the largest taxi networks',
                price: 1299.99,
                billingCycle: 'monthly',
                vehicleLimit: -1, // Unlimited
                driverLimit: -1, // Unlimited
                rideCommission: 2.5,
                features: [
                    'Basic Dashboard',
                    'Vehicle Management',
                    'Driver Management',
                    'Ride Tracking',
                    'Basic Reports',
                    'Email Support',
                    'Mobile App Access',
                    'Payment Processing',
                    'Real-time Tracking',
                    'Advanced Analytics',
                    'Priority Support',
                    'Custom Branding',
                    'API Access',
                    'White Label Solution',
                    'Dedicated Account Manager'
                ],
                isActive: true,
                trialDays: 30,
                setupFee: 1000
            },
            {
                name: 'Basic (Legacy)',
                description: 'Legacy plan for existing customers',
                price: 49.99,
                billingCycle: 'monthly',
                vehicleLimit: 3,
                driverLimit: 5,
                rideCommission: 10.0,
                features: [
                    'Basic Dashboard',
                    'Vehicle Management',
                    'Driver Management',
                    'Email Support'
                ],
                isActive: false, // Inactive legacy plan
                trialDays: 7,
                setupFee: 0
            }
        ];

        for (const planData of plans) {
            const existingPlan = await prisma.subscriptionPlan.findUnique({
                where: { name: planData.name }
            });

            if (!existingPlan) {
                await prisma.subscriptionPlan.create({
                    data: planData
                });
                console.log(`✅ Created subscription plan: ${planData.name}`);
            } else {
                console.log(`⏭️  Subscription plan already exists: ${planData.name}`);
            }
        }

        console.log('🎉 Subscription plans seeded successfully!');
    } catch (error) {
        console.error('❌ Error seeding subscription plans:', error);
        throw error;
    }
}

async function main() {
    try {
        await seedSubscriptionPlans();
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = { seedSubscriptionPlans };