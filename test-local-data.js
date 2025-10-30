require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testLocalData() {
    try {
        console.log('🎯 Testing LOCAL Database...');

        // Test basic counts
        const users = await prisma.user.count();
        const companies = await prisma.company.count();
        const zones = await prisma.zone.count();
        const tariffs = await prisma.tariff.count();
        const plans = await prisma.subscriptionPlan.count();

        console.log('📊 Data Counts:');
        console.log('   Users:', users);
        console.log('   Companies:', companies);
        console.log('   Zones:', zones);
        console.log('   Tariffs:', tariffs);
        console.log('   Subscription Plans:', plans);

        // Get sample data
        const companies_data = await prisma.company.findMany({
            include: {
                owner: true,
                subscriptionPlan: true
            },
            take: 3
        });

        console.log('\n🏢 Companies:');
        companies_data.forEach((company, index) => {
            console.log(`   ${index + 1}. ${company.brandName}`);
            console.log(`      Owner: ${company.owner.firstName} ${company.owner.lastName} (${company.owner.email})`);
            console.log(`      Plan: ${company.subscriptionPlan.name} ($${company.subscriptionPlan.price}/month)`);
            console.log(`      Status: ${company.status}`);
        });

        // Test API simulation
        console.log('\n🔌 API Test (Simulated):');
        const apiResponse = {
            success: true,
            data: {
                companies: companies_data.map(c => ({
                    id: c.id,
                    name: c.brandName,
                    status: c.status,
                    owner: `${c.owner.firstName} ${c.owner.lastName}`,
                    plan: c.subscriptionPlan.name
                }))
            },
            total: companies
        };

        console.log('   Response:', JSON.stringify(apiResponse, null, 2));

        await prisma.$disconnect();
        console.log('\n✅ Local database test completed successfully!');

    } catch (e) {
        console.error('❌ Error:', e.message);
        await prisma.$disconnect();
    }
}

testLocalData();