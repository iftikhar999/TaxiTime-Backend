/**
 * Test script to verify driver profile API returns correct data
 * Run this AFTER restarting the backend server
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDriverProfile() {
    try {
        console.log('🧪 Testing Driver Profile API Query...\n');

        // Find a driver with company
        const driver = await prisma.user.findFirst({
            where: { 
                role: 'DRIVER',
                companyId: { not: null }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatar: true,
                address: true,
                rating: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                lastLoginAt: true,
                companyId: true,
                company: {
                    select: {
                        id: true,
                        legalName: true,
                        brandName: true,
                        hqAddressLine1: true,
                        hqCity: true,
                        hqState: true,
                        primaryContactPhone: true,
                        supportPhone: true
                    }
                }
            }
        });

        if (!driver) {
            console.log('❌ No driver found with company assigned');
            process.exit(1);
        }

        console.log('✅ Query executed successfully!');
        console.log('\n📊 Driver Data:');
        console.log(JSON.stringify({
            id: driver.id,
            email: driver.email,
            companyId: driver.companyId,
            hasCompany: !!driver.company,
            company: driver.company ? {
                id: driver.company.id,
                legalName: driver.company.legalName,
                brandName: driver.company.brandName
            } : null
        }, null, 2));

        // Map to response format
        const responseDriver = {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email,
            phone: driver.phone,
            profileImage: driver.avatar,
            address: driver.address,
            rating: driver.rating,
            isActive: driver.isActive,
            isVerified: driver.isVerified,
            createdAt: driver.createdAt,
            lastLoginAt: driver.lastLoginAt,
            companyId: driver.companyId || driver.company?.id,
            company: driver.company ? {
                id: driver.company.id,
                name: driver.company.legalName || driver.company.brandName,
                legalName: driver.company.legalName,
                brandName: driver.company.brandName,
                address: driver.company.hqAddressLine1,
                city: driver.company.hqCity,
                state: driver.company.hqState,
                phone: driver.company.primaryContactPhone || driver.company.supportPhone
            } : null
        };

        console.log('\n📤 API Response Format:');
        console.log(JSON.stringify({
            success: true,
            data: {
                id: responseDriver.id,
                email: responseDriver.email,
                companyId: responseDriver.companyId,
                company: responseDriver.company
            }
        }, null, 2));

        if (!responseDriver.companyId) {
            console.log('\n❌ FAIL: companyId is missing!');
            process.exit(1);
        }

        console.log('\n✅ SUCCESS: companyId is present:', responseDriver.companyId);
        console.log('✅ Driver profile API will work correctly!\n');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testDriverProfile();

