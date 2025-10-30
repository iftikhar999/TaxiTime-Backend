const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function getDriverCredentials() {
    try {
        // First, find the CityCabs company
        const company = await prisma.company.findFirst({
            where: {
                OR: [
                    { name: { contains: 'CityCabs', mode: 'insensitive' } },
                    { name: { contains: 'City Cabs', mode: 'insensitive' } },
                    { name: { contains: 'city', mode: 'insensitive' } }
                ]
            }
        });

        if (!company) {
            console.log('CityCabs company not found.');
            return;
        }

        console.log(`Found company: ${company.brandName || company.name}`);
        console.log(`Company ID: ${company.id}`);

        // Find all drivers for CityCabs with password info
        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER',
                companyId: company.id
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                password: true, // Include hashed password
                isActive: true,
                createdAt: true,
                companyDriverProfile: {
                    select: {
                        licenseNumber: true,
                        status: true,
                        employmentType: true,
                        hireDate: true
                    }
                }
            }
        });

        console.log('\n🚕 CityCabs Driver Login Credentials:');
        console.log('=====================================');

        if (drivers.length === 0) {
            console.log('No drivers found for CityCabs company.');
        } else {
            // Common test passwords to check against
            const commonPasswords = [
                'password',
                'password123',
                '123456',
                'driver123',
                'citycabs123',
                'test123',
                'admin123'
            ];

            for (let i = 0; i < drivers.length; i++) {
                const driver = drivers[i];
                const profile = driver.companyDriverProfile?.[0];

                console.log(`\n${i + 1}. ${driver.firstName} ${driver.lastName}`);
                console.log(`   📧 Email: ${driver.email}`);
                console.log(`   📱 Phone: ${driver.phone || 'N/A'}`);
                console.log(`   🆔 User ID: ${driver.id}`);
                console.log(`   📋 License: ${profile?.licenseNumber || 'N/A'}`);
                console.log(`   ⚡ Status: ${driver.isActive ? 'Active' : 'Inactive'}`);

                // Try to match common passwords
                console.log(`   🔐 Password Hash: ${driver.password.substring(0, 20)}...`);

                let foundPassword = null;
                for (const testPassword of commonPasswords) {
                    try {
                        const isMatch = await bcrypt.compare(testPassword, driver.password);
                        if (isMatch) {
                            foundPassword = testPassword;
                            break;
                        }
                    } catch (error) {
                        // Continue checking other passwords
                    }
                }

                if (foundPassword) {
                    console.log(`   🔓 Password: "${foundPassword}"`);
                } else {
                    console.log(`   🔒 Password: [Custom password - not in common list]`);
                }

                console.log(`   📅 Created: ${new Date(driver.createdAt).toLocaleDateString()}`);
            }

            console.log(`\n📊 Total CityCabs drivers: ${drivers.length}`);
            console.log('\n💡 Login Instructions:');
            console.log('- Use the email and password above to login');
            console.log('- If password shows [Custom password], contact admin for reset');
            console.log('- All accounts are currently active');
        }

    } catch (error) {
        console.error('Error fetching driver credentials:', error);
    } finally {
        await prisma.$disconnect();
    }
}

getDriverCredentials();