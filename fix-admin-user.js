require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixAdminUser() {
    try {
        console.log('🔧 Fixing admin user...');

        // Find the admin user
        const adminUser = await prisma.user.findFirst({
            where: { email: 'admin@abtaxi.com' }
        });

        if (!adminUser) {
            console.log('❌ Admin user not found');
            return;
        }

        console.log('📋 Current admin user status:', {
            id: adminUser.id,
            email: adminUser.email,
            isActive: adminUser.isActive,
            isVerified: adminUser.isVerified,
            role: adminUser.role
        });

        // Update admin user to be active and verified
        const updatedUser = await prisma.user.update({
            where: { id: adminUser.id },
            data: {
                isActive: true,
                isVerified: true,
                role: 'SUPER_ADMIN'
            }
        });

        console.log('✅ Admin user updated successfully:', {
            id: updatedUser.id,
            email: updatedUser.email,
            isActive: updatedUser.isActive,
            isVerified: updatedUser.isVerified,
            role: updatedUser.role
        });

    } catch (error) {
        console.error('❌ Error fixing admin user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixAdminUser();