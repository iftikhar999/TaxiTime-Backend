const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixOwnerRelation() {
    try {
        const owner = await prisma.user.findUnique({
            where: { email: 'owner@testcompany.com' },
            include: { company: true }
        });

        if (!owner) {
            console.log('❌ Owner not found');
            return;
        }

        console.log('Current state:');
        console.log('  Owner companyId:', owner.companyId);
        console.log('  Company name:', owner.company?.name);

        if (owner.companyId) {
            // Update the company to have this user as ownerId
            const updated = await prisma.company.update({
                where: { id: owner.companyId },
                data: { ownerId: owner.id }
            });

            console.log('\n✅ Updated company ownerId to:', owner.id);
            console.log('Company:', updated.name);

            // Verify the relationship
            const verifyOwner = await prisma.user.findUnique({
                where: { email: 'owner@testcompany.com' },
                include: {
                    company: true,
                    ownedCompany: true
                }
            });

            console.log('\n✅ Verification:');
            console.log('  Has company (employee):', !!verifyOwner.company);
            console.log('  Has ownedCompany (owner):', !!verifyOwner.ownedCompany);
            console.log('  Owned company name:', verifyOwner.ownedCompany?.name);
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        await prisma.$disconnect();
    }
}

fixOwnerRelation();
