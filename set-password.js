require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function setTestPassword() {
    try {
        const email = 'owner1@citytaxico.com';
        const password = 'password123';

        console.log(`🔐 Setting password for ${email}...`);

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });

        console.log('✅ Password updated successfully');
        console.log('\n🎯 Login Credentials:');
        console.log(`📧 Email: ${email}`);
        console.log(`🔒 Password: ${password}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

setTestPassword();