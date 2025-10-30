require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function updateDispatcherPassword() {
    try {
        const email = 'dispatcher@citytaxi.com';
        const password = 'dispatcher123';

        console.log(`🔐 Updating password for ${email}...`);

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log('❌ User not found. Creating dispatcher user...');

            const hashedPassword = await bcrypt.hash(password, 10);

            await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: 'City Taxi Dispatcher',
                    role: 'DISPATCHER',
                    phone: '+97412345678',
                    isActive: true
                }
            });

            console.log('✅ Dispatcher user created successfully');
        } else {
            // Update existing user password
            const hashedPassword = await bcrypt.hash(password, 10);

            await prisma.user.update({
                where: { email },
                data: {
                    password: hashedPassword,
                    role: 'DISPATCHER',
                    isActive: true
                }
            });

            console.log('✅ Password updated successfully');
        }

        console.log('\n🎯 Dispatcher Login Credentials:');
        console.log(`📧 Email: ${email}`);
        console.log(`🔒 Password: ${password}`);
        console.log(`👤 Role: DISPATCHER`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateDispatcherPassword();
