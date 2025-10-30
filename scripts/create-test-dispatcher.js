const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestDispatcher() {
    try {
        console.log('🔍 Checking for existing dispatcher...');

        // Check if dispatcher already exists
        const existing = await prisma.user.findUnique({
            where: { email: 'dispatcher@citytaxi.com' }
        });

        if (existing) {
            console.log('✅ Test dispatcher already exists!');
            console.log('Email:', existing.email);
            console.log('Role:', existing.role);
            console.log('Active:', existing.isActive);
            return;
        }

        console.log('📝 Creating test dispatcher account...');

        // Get or create a test company
        let company = await prisma.company.findFirst({
            where: { name: 'City Taxi Co.' }
        });

        if (!company) {
            console.log('Creating test company...');
            company = await prisma.company.create({
                data: {
                    name: 'City Taxi Co.',
                    email: 'admin@citytaxi.com',
                    phone: '+97412345678',
                    address: 'Downtown Doha, Qatar',
                    isActive: true,
                    subscriptionStatus: 'ACTIVE'
                }
            });
            console.log('✅ Test company created:', company.name);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash('dispatcher123', 10);

        // Create dispatcher user
        const dispatcher = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Dispatcher',
                email: 'dispatcher@citytaxi.com',
                phone: '+97444444444',
                password: hashedPassword,
                role: 'DISPATCHER',
                companyId: company.id,
                isActive: true,
                isVerified: true
            }
        });

        console.log('✅ Test dispatcher created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 Email: dispatcher@citytaxi.com');
        console.log('🔑 Password: dispatcher123');
        console.log('🏢 Company:', company.name);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('❌ Error creating test dispatcher:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

createTestDispatcher()
    .then(() => {
        console.log('✨ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
