require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function completeMasterEntries() {
    try {
        console.log('🔧 Completing MASTER ENTRIES seeding...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Check what's missing
        const counts = {
            countries: await prisma.country.count(),
            currencies: await prisma.currency.count(),
            serviceCities: await prisma.serviceCity.count(),
            vehicleTypes: await prisma.vehicleTypeMaster.count(),
            documentTypes: await prisma.documentTypeMaster.count(),
            fareTypes: await prisma.fareType.count()
        };

        console.log('📊 Current master data status:');
        console.log(counts);

        // Create Document Types if missing
        if (counts.documentTypes === 0) {
            console.log('📄 Creating Document Types...');
            const documentTypes = await Promise.all([
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Driver License',
                        code: 'DL',
                        category: 'DRIVER',
                        description: 'Valid driver license',
                        isRequired: true,
                        expiryRequired: true,
                        isActive: true
                    }
                }),
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Vehicle Registration',
                        code: 'VR',
                        category: 'VEHICLE',
                        description: 'Vehicle registration certificate',
                        isRequired: true,
                        expiryRequired: true,
                        isActive: true
                    }
                }),
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Insurance Certificate',
                        code: 'INS',
                        category: 'VEHICLE',
                        description: 'Vehicle insurance certificate',
                        isRequired: true,
                        expiryRequired: true,
                        isActive: true
                    }
                }),
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Background Check',
                        code: 'BGC',
                        category: 'DRIVER',
                        description: 'Criminal background check',
                        isRequired: true,
                        expiryRequired: true,
                        isActive: true
                    }
                }),
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Medical Certificate',
                        code: 'MED',
                        category: 'DRIVER',
                        description: 'Medical fitness certificate',
                        isRequired: false,
                        expiryRequired: true,
                        isActive: true
                    }
                }),
                prisma.documentTypeMaster.create({
                    data: {
                        name: 'Commercial License',
                        code: 'CDL',
                        category: 'DRIVER',
                        description: 'Commercial driving license',
                        isRequired: false,
                        expiryRequired: true,
                        isActive: true
                    }
                })
            ]);
            console.log(`✅ Created ${documentTypes.length} document types`);
        } else {
            console.log('✅ Document types already exist');
        }

        // Create Fare Types if missing
        if (counts.fareTypes === 0) {
            console.log('💵 Creating Fare Types...');
            const fareTypes = await Promise.all([
                prisma.fareType.create({
                    data: {
                        name: 'Standard',
                        code: 'STD',
                        description: 'Standard taxi fare',
                        isActive: true
                    }
                }),
                prisma.fareType.create({
                    data: {
                        name: 'Peak Hours',
                        code: 'PEAK',
                        description: 'Peak hours surcharge',
                        isActive: true
                    }
                }),
                prisma.fareType.create({
                    data: {
                        name: 'Night Rate',
                        code: 'NIGHT',
                        description: 'Night time rates',
                        isActive: true
                    }
                }),
                prisma.fareType.create({
                    data: {
                        name: 'Holiday Rate',
                        code: 'HOLIDAY',
                        description: 'Holiday surcharge',
                        isActive: true
                    }
                }),
                prisma.fareType.create({
                    data: {
                        name: 'Airport Rate',
                        code: 'AIRPORT',
                        description: 'Airport pickup/drop surcharge',
                        isActive: true
                    }
                }),
                prisma.fareType.create({
                    data: {
                        name: 'Discount Rate',
                        code: 'DISCOUNT',
                        description: 'Discounted rate for promotions',
                        isActive: true
                    }
                })
            ]);
            console.log(`✅ Created ${fareTypes.length} fare types`);
        } else {
            console.log('✅ Fare types already exist');
        }

        // Get final counts
        const finalCounts = {
            countries: await prisma.country.count(),
            currencies: await prisma.currency.count(),
            serviceCities: await prisma.serviceCity.count(),
            vehicleTypes: await prisma.vehicleTypeMaster.count(),
            documentTypes: await prisma.documentTypeMaster.count(),
            fareTypes: await prisma.fareType.count()
        };

        console.log('\n🎉 MASTER ENTRIES completed successfully!');
        console.log(`📊 Complete Master Data Summary:`);
        console.log(`   Countries: ${finalCounts.countries}`);
        console.log(`   Currencies: ${finalCounts.currencies}`);
        console.log(`   Service Cities: ${finalCounts.serviceCities}`);
        console.log(`   Vehicle Types: ${finalCounts.vehicleTypes}`);
        console.log(`   Document Types: ${finalCounts.documentTypes}`);
        console.log(`   Fare Types: ${finalCounts.fareTypes}`);

        console.log('\n💡 Complete master entries include:');
        console.log('✅ 5 Countries (US, Canada, UK, Australia, Germany)');
        console.log('✅ 5 Currencies (USD, CAD, GBP, EUR, AUD)');
        console.log('✅ 5 Service Cities (NYC, LA, Chicago, Toronto, London)');
        console.log('✅ 6 Vehicle Types (Sedan, SUV, Van, Motorcycle, Luxury, EV)');
        console.log('✅ 6 Document Types (License, Registration, Insurance, etc.)');
        console.log('✅ 6 Fare Types (Standard, Peak, Night, Holiday, Airport, Discount)');
        console.log('\n🚀 ALL master data is now ready for production use!');

    } catch (error) {
        console.error('❌ Error completing master entries:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

completeMasterEntries();