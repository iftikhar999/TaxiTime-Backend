require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createSuperAdmin() {
    try {
        console.log('👑 Creating Super Admin user...');

        // Check if super admin already exists
        const existingAdmin = await prisma.user.findFirst({
            where: { role: 'SUPER_ADMIN' }
        });

        if (existingAdmin) {
            console.log('✅ Super Admin already exists:', existingAdmin.email);
            return;
        }

        // Create super admin user
        const adminPassword = await bcrypt.hash('admin123', 10);

        const superAdmin = await prisma.user.create({
            data: {
                firstName: 'Super',
                lastName: 'Admin',
                email: 'admin@abtaxi.com',
                phone: '+1234567890',
                password: adminPassword,
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true
            }
        });

        console.log('✅ Super Admin created successfully!');
        console.log('   Email:', superAdmin.email);
        console.log('   Password: admin123');
        console.log('   Role:', superAdmin.role);

        await prisma.$disconnect();

    } catch (error) {
        console.error('❌ Error creating Super Admin:', error);
        await prisma.$disconnect();
    }
}

createSuperAdmin();