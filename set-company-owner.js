require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function setCompanyOwner() {
    try {
        const ownerEmail = 'owner1@citytaxico.com';

        console.log(`🔍 Finding owner: ${ownerEmail}...`);

        const owner = await prisma.user.findUnique({
            where: { email: ownerEmail },
            select: { id: true, email: true, role: true }
        });

        if (!owner) {
            console.log('❌ Owner not found');
            return;
        }

        if (owner.role !== 'OWNER') {
            console.log('❌ User is not an OWNER');
            return;
        }

        console.log(`✅ Found owner: ${owner.email}`);

        // Find City Taxi Co. company
        const company = await prisma.company.findFirst({
            where: { name: 'City Taxi Co.' },
            select: { id: true, name: true, ownerId: true }
        });

        if (!company) {
            console.log('❌ Company not found');
            return;
        }

        console.log(`🏢 Found company: ${company.name}`);

        // Set the company's ownerId to our owner
        await prisma.company.update({
            where: { id: company.id },
            data: { ownerId: owner.id }
        });

        console.log('✅ Successfully set company owner');

        // Verify the relationship
        const updatedOwner = await prisma.user.findUnique({
            where: { id: owner.id },
            include: { ownedCompany: true }
        });

        if (updatedOwner.ownedCompany) {
            console.log(`✅ Verification: ${updatedOwner.email} now owns ${updatedOwner.ownedCompany.name}`);
        } else {
            console.log('❌ Verification failed: No owned company found');
        }

        console.log('\n🎯 Test Login Credentials:');
        console.log(`📧 Email: ${ownerEmail}`);
        console.log(`🔒 Password: password123`);
        console.log(`🏢 Company: ${company.name}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

setCompanyOwner();