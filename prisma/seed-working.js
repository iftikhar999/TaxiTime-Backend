const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database with test users...\n');

    try {
        // Create Super Admin User
        const adminPassword = await bcrypt.hash('admin123', 10);

        const superAdmin = await prisma.user.upsert({
            where: { email: 'admin@abtaxi.com' },
            update: {
                password: adminPassword,
                isActive: true,
                isVerified: true
            },
            create: {
                firstName: 'Super',
                lastName: 'Admin',
                email: 'admin@abtaxi.com',
                phone: '+1234567890',
                password: adminPassword,
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
                preferences: {
                    language: 'en',
                    currency: 'USD',
                    notifications: {
                        push: true,
                        email: true,
                        sms: false
                    }
                }
            },
        });

        console.log('✅ Super Admin created/updated:');
        console.log(`   Email: ${superAdmin.email}`);
        console.log(`   Password: admin123\n`);

        // Create multiple company owners with working companies
        const ownerPassword = await bcrypt.hash('owner123', 10);

        const ownersData = [
            {
                firstName: 'John',
                lastName: 'Smith',
                email: 'owner@citytaxi.com',
                phone: '+1234567891',
                companyName: 'City Taxi Co Ltd',
                companyCode: 'CITY001'
            },
            {
                firstName: 'Sarah',
                lastName: 'Johnson',
                email: 'owner@elitetaxi.com',
                phone: '+1234567892',
                companyName: 'Elite Taxi Service',
                companyCode: 'ELITE001'
            },
            {
                firstName: 'Mike',
                lastName: 'Brown',
                email: 'owner@metrorides.com',
                phone: '+1234567893',
                companyName: 'Metro Rides Inc',
                companyCode: 'METRO001'
            }
        ];

        console.log('👤 Creating Owner Users:\n');

        for (const ownerData of ownersData) {
            // Create owner user
            const owner = await prisma.user.upsert({
                where: { email: ownerData.email },
                update: {
                    password: ownerPassword,
                    isActive: true,
                    isVerified: true
                },
                create: {
                    firstName: ownerData.firstName,
                    lastName: ownerData.lastName,
                    email: ownerData.email,
                    phone: ownerData.phone,
                    password: ownerPassword,
                    role: 'OWNER',
                    isActive: true,
                    isVerified: true,
                },
            });

            // Check if company exists for this owner
            let company = await prisma.company.findFirst({
                where: { ownerId: owner.id }
            });

            // Create company if it doesn't exist
            if (!company) {
                company = await prisma.company.create({
                    data: {
                        legalName: ownerData.companyName,
                        brandName: ownerData.companyName.replace(' Co Ltd', '').replace(' Inc', ''),
                        companyCode: ownerData.companyCode,
                        companyType: 'TAXI_OPERATOR',
                        businessModel: 'B2C',
                        registrationNumber: `REG${Math.floor(Math.random() * 1000000)}`,
                        taxId: `TX${Math.floor(Math.random() * 1000000000)}`,
                        primaryLanguage: 'en',
                        timezone: 'America/New_York',
                        status: 'ACTIVE',
                        activationDate: new Date(),
                        ownerId: owner.id,

                        // Contact info
                        primaryContactName: `${ownerData.firstName} ${ownerData.lastName}`,
                        primaryContactEmail: ownerData.email,
                        primaryContactPhone: ownerData.phone,
                        supportEmail: ownerData.email,

                        // Address
                        hqAddressLine1: '123 Main Street',
                        hqCity: 'New York',
                        hqState: 'NY',
                        hqPostcode: '10001',
                        hqCountry: 'USA',
                        hqLatitude: 40.7128,
                        hqLongitude: -74.0060,

                        // Settings
                        isActive: true,
                        isVerified: true,
                    }
                });
            }

            console.log(`✅ Owner: ${ownerData.email} / owner123`);
            console.log(`   Company: ${company.legalName}`);
            console.log(`   Company Code: ${company.companyCode}\n`);
        }

        // Create some drivers for testing
        console.log('🚗 Creating Test Drivers:\n');

        const driverPassword = await bcrypt.hash('driver123', 10);

        const driversData = [
            { firstName: 'Tom', lastName: 'Wilson', email: 'driver1@test.com', phone: '+1234567894' },
            { firstName: 'Lisa', lastName: 'Davis', email: 'driver2@test.com', phone: '+1234567895' },
            { firstName: 'Mark', lastName: 'Taylor', email: 'driver3@test.com', phone: '+1234567896' }
        ];

        // Get first company to assign drivers to
        const firstCompany = await prisma.company.findFirst({
            where: { companyCode: 'CITY001' }
        });

        for (const driverData of driversData) {
            const driver = await prisma.user.upsert({
                where: { email: driverData.email },
                update: {
                    password: driverPassword,
                    isActive: true,
                    isVerified: true,
                    companyId: firstCompany?.id
                },
                create: {
                    firstName: driverData.firstName,
                    lastName: driverData.lastName,
                    email: driverData.email,
                    phone: driverData.phone,
                    password: driverPassword,
                    role: 'DRIVER',
                    isActive: true,
                    isVerified: true,
                    companyId: firstCompany?.id
                },
            });

            console.log(`✅ Driver: ${driverData.email} / driver123`);
        }

        console.log('\n📋 Login Credentials Summary:\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('SUPER ADMIN:');
        console.log('  admin@abtaxi.com / admin123\n');
        console.log('COMPANY OWNERS:');
        console.log('  owner@citytaxi.com / owner123');
        console.log('  owner@elitetaxi.com / owner123');
        console.log('  owner@metrorides.com / owner123\n');
        console.log('DRIVERS (for testing):');
        console.log('  driver1@test.com / driver123');
        console.log('  driver2@test.com / driver123');
        console.log('  driver3@test.com / driver123\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
