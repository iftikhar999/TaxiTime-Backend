require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestOwner() {
    try {
        console.log('🔍 Checking existing users and companies...');

        // Check if we have any companies first
        const companies = await prisma.company.findMany({
            take: 3,
            select: { id: true, name: true, legalName: true, primaryContactEmail: true }
        });

        console.log('📊 Existing companies:');
        companies.forEach(company => {
            console.log(`  - ${company.name} (${company.primaryContactEmail})`);
        });

        if (companies.length === 0) {
            console.log('❌ No companies found. Creating a test company first...');

            const testCompany = await prisma.company.create({
                data: {
                    legalName: 'Test Taxi Company',
                    brandName: 'Test Taxi',
                    name: 'Test Taxi Company',
                    companyCode: 'TEST001',
                    companyType: 'INDIVIDUAL',
                    businessModel: 'B2C',
                    registrationNumber: 'REG123456',
                    taxId: 'TAX123456',
                    primaryLanguage: 'en',
                    timezone: 'America/New_York',
                    status: 'ACTIVE',
                    activationDate: new Date(),
                    primaryContactName: 'Test Owner',
                    primaryContactRole: 'Owner',
                    primaryContactEmail: 'owner@testcompany.com',
                    primaryContactPhone: '+1234567890',
                    supportEmail: 'support@testcompany.com',
                    supportPhone: '+1234567891',
                    billingEmail: 'billing@testcompany.com',
                    hqAddressLine1: '123 Test Street',
                    hqCity: 'Test City',
                    hqState: 'NY',
                    hqPostcode: '12345',
                    hqCountry: 'USA',
                    hqLatitude: 40.7128,
                    hqLongitude: -74.0060,
                    kycStatus: 'APPROVED',
                    email: 'owner@testcompany.com',
                    phone: '+1234567890',
                    address: {
                        street: '123 Test Street',
                        city: 'Test City',
                        state: 'NY',
                        zipCode: '12345',
                        country: 'USA',
                        coordinates: {
                            latitude: 40.7128,
                            longitude: -74.0060
                        }
                    },
                    isActive: true,
                    isVerified: true
                }
            });

            console.log('✅ Created test company:', testCompany.name);
            companies.push(testCompany);
        }

        // Check existing OWNER users
        const owners = await prisma.user.findMany({
            where: { role: 'OWNER' },
            select: { email: true, role: true, firstName: true, lastName: true, companyId: true }
        });

        console.log('👥 Existing owners:');
        owners.forEach(owner => {
            console.log(`  - ${owner.email} (${owner.role}) - CompanyID: ${owner.companyId}`);
        });

        // Create test owner if none exists
        const testEmail = 'owner@testcompany.com';
        const testPassword = 'password123';

        let testOwner = await prisma.user.findUnique({
            where: { email: testEmail }
        });

        if (!testOwner) {
            console.log('🔐 Creating test owner user...');

            const hashedPassword = await bcrypt.hash(testPassword, 10);

            testOwner = await prisma.user.create({
                data: {
                    firstName: 'Test',
                    lastName: 'Owner',
                    email: testEmail,
                    phone: `+1${Date.now().toString().slice(-9)}`, // Generate unique phone
                    password: hashedPassword,
                    role: 'OWNER',
                    isActive: true,
                    isVerified: true,
                    companyId: companies[0].id
                }
            });

            console.log('✅ Created test owner user');

            // CRITICAL: Set the user as the actual company owner
            await prisma.company.update({
                where: { id: companies[0].id },
                data: { ownerId: testOwner.id }
            });

            console.log('✅ Set user as company owner (ownerId)');
        } else if (testOwner.role !== 'OWNER') {
            console.log('🔄 Updating existing user to OWNER role...');

            await prisma.user.update({
                where: { email: testEmail },
                data: {
                    role: 'OWNER',
                    companyId: companies[0].id
                }
            });

            console.log('✅ Updated user role to OWNER');
        }

        console.log('\n🎯 Test Login Credentials:');
        console.log(`📧 Email: ${testEmail}`);
        console.log(`🔒 Password: ${testPassword}`);
        console.log(`🏢 Company: ${companies[0].name}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createTestOwner();