const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCompanyDrivers() {
    console.log('🔧 Fixing CompanyDriver records...\n');

    try {
        // Get all drivers who don't have CompanyDriver records
        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER',
                companyId: { not: null }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                companyId: true
            }
        });

        console.log(`Found ${drivers.length} drivers in User table`);

        // Check existing CompanyDriver records
        const existingCompanyDrivers = await prisma.companyDriver.findMany({
            select: { userId: true }
        });
        
        const existingUserIds = new Set(existingCompanyDrivers.map(cd => cd.userId));
        console.log(`Found ${existingCompanyDrivers.length} existing CompanyDriver records`);

        // Create CompanyDriver records for drivers who don't have them
        const driversToFix = drivers.filter(d => !existingUserIds.has(d.id));
        
        console.log(`\nCreating CompanyDriver records for ${driversToFix.length} drivers...\n`);

        const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
        const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Emily', 'Alex', 'Maria'];
        const lastNames = ['Smith', 'Johnson', 'Brown', 'Williams', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson'];

        let created = 0;
        for (const driver of driversToFix) {
            try {
                await prisma.companyDriver.create({
                    data: {
                        userId: driver.id,
                        companyId: driver.companyId,
                        status: 'ACTIVE',
                        employmentType: getRandomElement(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
                        hireDate: new Date(Date.now() - getRandomNumber(30, 730) * 24 * 60 * 60 * 1000),
                        licenseNumber: `DL${getRandomNumber(100000000, 999999999)}`,
                        licenseExpiry: new Date(Date.now() + getRandomNumber(180, 1095) * 24 * 60 * 60 * 1000),
                        backgroundCheckStatus: 'APPROVED',
                        backgroundCheckExpiry: new Date(Date.now() + getRandomNumber(180, 730) * 24 * 60 * 60 * 1000),
                        panicContactName: getRandomElement(firstNames) + ' ' + getRandomElement(lastNames),
                        panicContactPhone: `+1${getRandomNumber(2000000000, 9999999999)}`,
                    }
                });
                created++;
                console.log(`✅ Created CompanyDriver for ${driver.firstName} ${driver.lastName} (${driver.email})`);
            } catch (error) {
                console.error(`❌ Failed to create CompanyDriver for ${driver.email}:`, error.message);
            }
        }

        console.log(`\n✅ Successfully created ${created} CompanyDriver records!`);
        
        // Verify the fix
        const finalCount = await prisma.companyDriver.count();
        console.log(`\n📊 Final CompanyDriver count: ${finalCount}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixCompanyDrivers();
