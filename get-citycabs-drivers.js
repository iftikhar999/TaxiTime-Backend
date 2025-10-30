const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getDriverAccounts() {
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
            console.log('CityCabs company not found. Searching all companies...');
            const companies = await prisma.company.findMany({
                select: { id: true, name: true }
            });
            console.log('Available companies:', companies);
            return;
        }

        console.log('Found company:', company);

        // Find all drivers for CityCabs
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
        }); console.log('\nCityCabs Drivers:');
        console.log('================');

        if (drivers.length === 0) {
            console.log('No drivers found for CityCabs company.');
        } else {
            drivers.forEach((driver, index) => {
                const profile = driver.companyDriverProfile?.[0]; // It's an array, get first profile
                console.log(`\n${index + 1}. ${driver.firstName} ${driver.lastName}`);
                console.log(`   Email: ${driver.email}`);
                console.log(`   Phone: ${driver.phone || 'N/A'}`);
                console.log(`   Status: ${driver.isActive ? 'Active' : 'Inactive'}`);
                console.log(`   License: ${profile?.licenseNumber || 'N/A'}`);
                console.log(`   Driver Status: ${profile?.status || 'N/A'}`);
                console.log(`   Employment: ${profile?.employmentType || 'N/A'}`);
                console.log(`   Hire Date: ${profile?.hireDate || 'N/A'}`);
                console.log(`   Created: ${driver.createdAt}`);
            }); console.log(`\nTotal CityCabs drivers: ${drivers.length}`);
        }

    } catch (error) {
        console.error('Error fetching driver accounts:', error);
    } finally {
        await prisma.$disconnect();
    }
}

getDriverAccounts();