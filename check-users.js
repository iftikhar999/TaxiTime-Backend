const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function checkUsers() {
    try {
        console.log('🔍 Checking owner and admin users...\n');

        // Check for owner users
        const owners = await prisma.user.findMany({
            where: { role: 'OWNER' },
            include: { ownedCompany: true, company: true }
        });

        console.log('👤 OWNER Users:');
        if (owners.length === 0) {
            console.log('  ⚠️  No OWNER users found!\n');
        } else {
            for (const owner of owners) {
                console.log(`  Email: ${owner.email}`);
                console.log(`  Name: ${owner.firstName} ${owner.lastName}`);
                console.log(`  isActive: ${owner.isActive}`);
                console.log(`  isVerified: ${owner.isVerified}`);
                console.log(`  Company: ${owner.ownedCompany?.legalName || owner.company?.legalName || 'None'}`);

                // Test password
                const testPass = await bcrypt.compare('owner123', owner.password);
                console.log(`  Password 'owner123' works: ${testPass ? '✅' : '❌'}`);
                console.log('');
            }
        }

        // Check for super admin users
        const admins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN' }
        });

        console.log('👤 SUPER_ADMIN Users:');
        if (admins.length === 0) {
            console.log('  ⚠️  No SUPER_ADMIN users found!\n');
        } else {
            for (const admin of admins) {
                console.log(`  Email: ${admin.email}`);
                console.log(`  Name: ${admin.firstName} ${admin.lastName}`);
                console.log(`  isActive: ${admin.isActive}`);
                console.log(`  isVerified: ${admin.isVerified}`);

                // Test password
                const testPass = await bcrypt.compare('admin123', admin.password);
                console.log(`  Password 'admin123' works: ${testPass ? '✅' : '❌'}`);
                console.log('');
            }
        }        // Check all user roles
        const usersByRole = await prisma.user.groupBy({
            by: ['role'],
            _count: true
        });

        console.log('📊 Users by role:');
        usersByRole.forEach(item => {
            console.log(`  ${item.role}: ${item._count}`);
        });

        // Check total users
        const totalUsers = await prisma.user.count();
        console.log(`\n📊 Total users in database: ${totalUsers}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
