require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedLocalDatabase() {
    try {
        console.log('🌱 Starting comprehensive LOCAL database seeding...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Clean existing data first (except super admin)
        console.log('🧹 Cleaning existing data...');
        await prisma.job.deleteMany();
        await prisma.shift.deleteMany();
        await prisma.companyDriver.deleteMany();
        await prisma.user.deleteMany({
            where: { role: { not: 'SUPER_ADMIN' } }
        });
        await prisma.company.deleteMany();
        await prisma.subscriptionPlan.deleteMany();
        await prisma.zone.deleteMany();
        await prisma.tariff.deleteMany(); console.log('✅ Existing data cleaned');

        // Create subscription plans
        console.log('📋 Creating subscription plans...');
        const basicPlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Basic Plan',
                description: 'Basic features for small taxi companies',
                price: 99.99,
                billingCycle: 'monthly',
                vehicleLimit: 10,
                driverLimit: 10,
                rideCommission: 10.0,
                features: ['Basic Dispatch', 'Driver Management', 'Basic Reports'],
                isActive: true,
                trialDays: 7
            }
        });

        const proPlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Professional Plan',
                description: 'Advanced features for growing companies',
                price: 199.99,
                billingCycle: 'monthly',
                vehicleLimit: 50,
                driverLimit: 50,
                rideCommission: 8.0,
                features: ['Advanced Dispatch', 'Fleet Management', 'Advanced Analytics', 'API Access'],
                isActive: true,
                trialDays: 14
            }
        });

        const enterprisePlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Enterprise Plan',
                description: 'Enterprise features for large taxi fleets',
                price: 499.99,
                billingCycle: 'monthly',
                vehicleLimit: -1,
                driverLimit: -1,
                rideCommission: 5.0,
                features: ['Full Platform Access', 'White Label', 'Custom Integrations', 'Priority Support'],
                isActive: true,
                trialDays: 30
            }
        });

        console.log('✅ Subscription plans created');

        // Create companies with owners first
        console.log('🏢 Creating companies and owners...');

        const companies = [];
        const companyData = [
            {
                legalName: 'Metro Taxi Services Inc',
                brandName: 'Metro Taxi',
                companyCode: 'METRO001',
                registrationNumber: 'REG123456',
                taxId: 'TAX789012',
                primaryContactName: 'John Smith',
                primaryContactEmail: 'john@metrotaxi.com',
                primaryContactPhone: '+1234567891',
                hqAddressLine1: '123 Main Street',
                hqCity: 'New York',
                hqState: 'NY',
                hqPostcode: '10001',
                hqCountry: 'USA',
                hqLatitude: 40.7128,
                hqLongitude: -74.0060
            },
            {
                legalName: 'City Cabs Ltd',
                brandName: 'City Cabs',
                companyCode: 'CITY002',
                registrationNumber: 'REG234567',
                taxId: 'TAX890123',
                primaryContactName: 'Sarah Johnson',
                primaryContactEmail: 'sarah@citycabs.com',
                primaryContactPhone: '+1234567892',
                hqAddressLine1: '456 Oak Avenue',
                hqCity: 'Los Angeles',
                hqState: 'CA',
                hqPostcode: '90001',
                hqCountry: 'USA',
                hqLatitude: 34.0522,
                hqLongitude: -118.2437
            },
            {
                legalName: 'Quick Ride Co',
                brandName: 'Quick Ride',
                companyCode: 'QUICK003',
                registrationNumber: 'REG345678',
                taxId: 'TAX901234',
                primaryContactName: 'Mike Brown',
                primaryContactEmail: 'mike@quickride.com',
                primaryContactPhone: '+1234567893',
                hqAddressLine1: '789 Pine Street',
                hqCity: 'Chicago',
                hqState: 'IL',
                hqPostcode: '60601',
                hqCountry: 'USA',
                hqLatitude: 41.8781,
                hqLongitude: -87.6298
            }
        ];

        for (const companyInfo of companyData) {
            // Create owner user
            const ownerPassword = await bcrypt.hash('owner123', 10);
            const owner = await prisma.user.create({
                data: {
                    firstName: companyInfo.primaryContactName.split(' ')[0],
                    lastName: companyInfo.primaryContactName.split(' ')[1] || 'Owner',
                    email: companyInfo.primaryContactEmail,
                    phone: companyInfo.primaryContactPhone,
                    password: ownerPassword,
                    role: 'OWNER',
                    isActive: true,
                    isVerified: true
                }
            });

            // Create company
            const company = await prisma.company.create({
                data: {
                    legalName: companyInfo.legalName,
                    brandName: companyInfo.brandName,
                    companyCode: companyInfo.companyCode,
                    registrationNumber: companyInfo.registrationNumber,
                    taxId: companyInfo.taxId,
                    primaryContactName: companyInfo.primaryContactName,
                    primaryContactEmail: companyInfo.primaryContactEmail,
                    primaryContactPhone: companyInfo.primaryContactPhone,
                    hqAddressLine1: companyInfo.hqAddressLine1,
                    hqCity: companyInfo.hqCity,
                    hqState: companyInfo.hqState,
                    hqPostcode: companyInfo.hqPostcode,
                    hqCountry: companyInfo.hqCountry,
                    hqLatitude: companyInfo.hqLatitude,
                    hqLongitude: companyInfo.hqLongitude,
                    ownerId: owner.id,
                    subscriptionPlanId: basicPlan.id,
                    status: 'ACTIVE',
                    kycStatus: 'APPROVED'
                }
            });

            // Update user with company relationship
            await prisma.user.update({
                where: { id: owner.id },
                data: { companyId: company.id }
            });

            companies.push({ company, owner });
            console.log(`✅ Created company: ${company.brandName} with owner: ${owner.firstName} ${owner.lastName}`);
        }

        // Create zones for each company
        console.log('🗺️ Creating zones...');
        for (const { company } of companies) {
            const downtown = await prisma.zone.create({
                data: {
                    companyId: company.id,
                    name: `${company.brandName} Downtown`,
                    description: 'City center and business district',
                    boundaries: [
                        [40.7128, -74.0060],
                        [40.7200, -74.0060],
                        [40.7200, -73.9950],
                        [40.7128, -73.9950]
                    ],
                    isActive: true,
                    type: 'SERVICE_AREA'
                }
            });

            console.log(`✅ Created zones for ${company.brandName}`);
        }

        // Create tariffs for each company
        console.log('💰 Creating tariffs...');
        for (const { company } of companies) {
            const standardTariff = await prisma.tariff.create({
                data: {
                    companyId: company.id,
                    name: `${company.brandName} Standard Rate`,
                    description: 'Standard city taxi rates',
                    baseFare: 3.50,
                    perKmRate: 2.20,
                    perMinuteRate: 0.50,
                    minimumFare: 5.00,
                    waitingFee: 0.30,
                    extraStopFee: 2.50,
                    isActive: true,
                    currency: 'USD'
                }
            });

            console.log(`✅ Created tariffs for ${company.brandName}`);
        }        // Create drivers for each company
        console.log('🚗 Creating drivers...');

        for (const { company } of companies) {
            for (let i = 1; i <= 3; i++) {
                const driverPassword = await bcrypt.hash('driver123', 10);

                // Create driver user
                const driverUser = await prisma.user.create({
                    data: {
                        firstName: `Driver${i}`,
                        lastName: `${company.brandName}`,
                        email: `driver${i}@${company.brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                        phone: `+123456789${company.id.slice(-1)}${i}`,
                        password: driverPassword,
                        role: 'DRIVER',
                        companyId: company.id,
                        isActive: true,
                        isVerified: true
                    }
                });

                // Create driver profile
                const driver = await prisma.companyDriver.create({
                    data: {
                        userId: driverUser.id,
                        companyId: company.id,
                        employmentType: 'FULL_TIME',
                        hireDate: new Date(),
                        licenseNumber: `DL${Date.now()}${i}`,
                        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                        status: 'ACTIVE',
                        backgroundCheckStatus: 'APPROVED'
                    }
                }); console.log(`✅ Created driver: ${driverUser.firstName} ${driverUser.lastName} for ${company.brandName}`);
            }
        }

        // Create dispatchers for each company
        console.log('📡 Creating dispatchers...');

        for (const { company } of companies) {
            const dispatcherPassword = await bcrypt.hash('dispatch123', 10);

            const dispatcher = await prisma.user.create({
                data: {
                    firstName: 'Dispatcher',
                    lastName: company.brandName.split(' ')[0],
                    email: `dispatch@${company.brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                    phone: `+1234567800${company.id.slice(-1)}`,
                    password: dispatcherPassword,
                    role: 'DISPATCHER',
                    companyId: company.id,
                    isActive: true,
                    isVerified: true
                }
            });

            console.log(`✅ Created dispatcher: ${dispatcher.firstName} ${dispatcher.lastName} for ${company.brandName}`);
        }

        // Create customers
        console.log('👥 Creating customers...');

        const customerNames = [
            { first: 'Alice', last: 'Cooper', email: 'alice.cooper@email.com' },
            { first: 'Bob', last: 'Wilson', email: 'bob.wilson@email.com' },
            { first: 'Carol', last: 'Davis', email: 'carol.davis@email.com' },
            { first: 'David', last: 'Miller', email: 'david.miller@email.com' },
            { first: 'Emma', last: 'Garcia', email: 'emma.garcia@email.com' }
        ];

        for (const customerInfo of customerNames) {
            const customerPassword = await bcrypt.hash('customer123', 10);

            // Create customer user (no separate customer profile needed)
            const customer = await prisma.user.create({
                data: {
                    firstName: customerInfo.first,
                    lastName: customerInfo.last,
                    email: customerInfo.email,
                    phone: `+1555${Math.floor(Math.random() * 900) + 100}${Math.floor(Math.random() * 9000) + 1000}`,
                    password: customerPassword,
                    role: 'CUSTOMER',
                    isActive: true,
                    isVerified: true
                }
            }); console.log(`✅ Created customer: ${customer.firstName} ${customer.lastName}`);
        }

        // Get final counts
        const userCount = await prisma.user.count();
        const companyCount = await prisma.company.count();
        const driverCount = await prisma.companyDriver.count();
        const customerCount = await prisma.user.count({ where: { role: 'CUSTOMER' } });
        const zoneCount = await prisma.zone.count();
        const tariffCount = await prisma.tariff.count();
        const planCount = await prisma.subscriptionPlan.count(); console.log('\n🎉 LOCAL Database seeding completed successfully!');
        console.log(`📊 Final counts:`);
        console.log(`   Users: ${userCount}`);
        console.log(`   Companies: ${companyCount}`);
        console.log(`   Drivers: ${driverCount}`);
        console.log(`   Customers: ${customerCount}`);
        console.log(`   Zones: ${zoneCount}`);
        console.log(`   Tariffs: ${tariffCount}`);
        console.log(`   Subscription Plans: ${planCount}`);

        console.log('\n🔑 Login credentials:');
        console.log('Super Admin: admin@abtaxi.com / admin123');
        console.log('Company Owners: [owner-email] / owner123');
        console.log('Drivers: [driver-email] / driver123');
        console.log('Dispatchers: [dispatcher-email] / dispatch123');
        console.log('Customers: [customer-email] / customer123');

        console.log('\n🏢 Company Details:');
        for (const { company, owner } of companies) {
            console.log(`   ${company.brandName}: ${owner.email} / owner123`);
        }

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedLocalDatabase();