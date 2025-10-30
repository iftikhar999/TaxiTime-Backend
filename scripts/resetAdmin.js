const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    const email = process.env.ADMIN_EMAIL || 'admin@abtaxi.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    console.log('🔐 Resetting Super Admin credentials...');
    console.log(` - Email: ${email}`);

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashed,
            role: 'SUPER_ADMIN',
            isActive: true,
            isVerified: true,
        },
        create: {
            firstName: 'Super',
            lastName: 'Admin',
            email,
            phone: '+10000000000',
            password: hashed,
            role: 'SUPER_ADMIN',
            isActive: true,
            isVerified: true,
        },
    });

    console.log('✅ Super Admin ensured:', user.email, user.role);
}

main()
    .catch((e) => {
        console.error('❌ Failed to reset Super Admin:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
