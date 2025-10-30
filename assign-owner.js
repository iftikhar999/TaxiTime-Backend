require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function assignOwnerToCompany() {
    try {
        console.log('🔍 Finding existing owner and company...');

        // Get first company
        const company = await prisma.company.findFirst({
            select: { id: true, name: true, primaryContactEmail: true }
        });

        if (!company) {
            console.log('❌ No companies found');
            return;
        }

        console.log(`🏢 Using company: ${company.name}`);

        // Get first owner without company
        const owner = await prisma.user.findFirst({
            where: {
                role: 'OWNER',
                companyId: null
            },
            select: { id: true, email: true, firstName: true, lastName: true }
        });

        if (!owner) {
            console.log('❌ No unassigned owners found');
            return;
        }

        console.log(`👤 Using owner: ${owner.email}`);

        // Assign owner to company
        await prisma.user.update({
            where: { id: owner.id },
            data: { companyId: company.id }
        });

        console.log('✅ Successfully assigned owner to company');

        console.log('\n🎯 Test Login Credentials:');
        console.log(`📧 Email: ${owner.email}`);
        console.log(`🔒 Password: password123 (if you set it) or check your records`);
        console.log(`🏢 Company: ${company.name}`);

        // Also check if we need to reset password to known value
        console.log('\n💡 To set a known password for testing, you can use:');
        console.log(`UPDATE "users" SET password = '$2a$10$...' WHERE email = '${owner.email}';`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

assignOwnerToCompany();