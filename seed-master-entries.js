require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedMasterEntries() {
    try {
        console.log('🗃️ Starting MASTER ENTRIES seeding...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Check if master entries already exist
        const existingCountries = await prisma.country.count();
        if (existingCountries > 0) {
            console.log('⚠️ Master entries already exist. Skipping creation.');
            return;
        }

        console.log('🌍 Creating Countries...');
        const countries = await Promise.all([
            prisma.country.create({
                data: {
                    name: 'United States',
                    code: 'US',
                    code3: 'USA',
                    phoneCode: '+1',
                    currency: 'USD',
                    isActive: true
                }
            }),
            prisma.country.create({
                data: {
                    name: 'Canada',
                    code: 'CA',
                    code3: 'CAN',
                    phoneCode: '+1',
                    currency: 'CAD',
                    isActive: true
                }
            }),
            prisma.country.create({
                data: {
                    name: 'United Kingdom',
                    code: 'GB',
                    code3: 'GBR',
                    phoneCode: '+44',
                    currency: 'GBP',
                    isActive: true
                }
            }),
            prisma.country.create({
                data: {
                    name: 'Australia',
                    code: 'AU',
                    code3: 'AUS',
                    phoneCode: '+61',
                    currency: 'AUD',
                    isActive: true
                }
            }),
            prisma.country.create({
                data: {
                    name: 'Germany',
                    code: 'DE',
                    code3: 'DEU',
                    phoneCode: '+49',
                    currency: 'EUR',
                    isActive: true
                }
            })
        ]);
        console.log(`✅ Created ${countries.length} countries`);

        console.log('💰 Creating Currencies...');
        const currencies = await Promise.all([
            prisma.currency.create({
                data: {
                    name: 'US Dollar',
                    code: 'USD',
                    symbol: '$',
                    decimalPlaces: 2,
                    isActive: true
                }
            }),
            prisma.currency.create({
                data: {
                    name: 'Canadian Dollar',
                    code: 'CAD',
                    symbol: 'C$',
                    decimalPlaces: 2,
                    isActive: true
                }
            }),
            prisma.currency.create({
                data: {
                    name: 'British Pound',
                    code: 'GBP',
                    symbol: '£',
                    decimalPlaces: 2,
                    isActive: true
                }
            }),
            prisma.currency.create({
                data: {
                    name: 'Euro',
                    code: 'EUR',
                    symbol: '€',
                    decimalPlaces: 2,
                    isActive: true
                }
            }),
            prisma.currency.create({
                data: {
                    name: 'Australian Dollar',
                    code: 'AUD',
                    symbol: 'A$',
                    decimalPlaces: 2,
                    isActive: true
                }
            })
        ]);
        console.log(`✅ Created ${currencies.length} currencies`);

        console.log('🏙️ Creating Service Cities...');
        const serviceCities = await Promise.all([
            prisma.serviceCity.create({
                data: {
                    name: 'New York',
                    code: 'NYC',
                    countryId: countries[0].id,
                    state: 'New York',
                    latitude: 40.7128,
                    longitude: -74.0060,
                    timezone: 'America/New_York',
                    isActive: true
                }
            }),
            prisma.serviceCity.create({
                data: {
                    name: 'Los Angeles',
                    code: 'LAX',
                    countryId: countries[0].id,
                    state: 'California',
                    latitude: 34.0522,
                    longitude: -118.2437,
                    timezone: 'America/Los_Angeles',
                    isActive: true
                }
            }),
            prisma.serviceCity.create({
                data: {
                    name: 'Chicago',
                    code: 'CHI',
                    countryId: countries[0].id,
                    state: 'Illinois',
                    latitude: 41.8781,
                    longitude: -87.6298,
                    timezone: 'America/Chicago',
                    isActive: true
                }
            }),
            prisma.serviceCity.create({
                data: {
                    name: 'Toronto',
                    code: 'YYZ',
                    countryId: countries[1].id,
                    state: 'Ontario',
                    latitude: 43.6532,
                    longitude: -79.3832,
                    timezone: 'America/Toronto',
                    isActive: true
                }
            }),
            prisma.serviceCity.create({
                data: {
                    name: 'London',
                    code: 'LDN',
                    countryId: countries[2].id,
                    state: 'England',
                    latitude: 51.5074,
                    longitude: -0.1278,
                    timezone: 'Europe/London',
                    isActive: true
                }
            })
        ]);
        console.log(`✅ Created ${serviceCities.length} service cities`);

        console.log('🚗 Creating Vehicle Types...');
        const vehicleTypes = await Promise.all([
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Sedan',
                    code: 'SEDAN',
                    capacity: 4,
                    description: 'Standard 4-door sedan',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'SUV',
                    code: 'SUV',
                    capacity: 6,
                    description: 'Sport Utility Vehicle',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Van',
                    code: 'VAN',
                    capacity: 8,
                    description: 'Large capacity van',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Motorcycle',
                    code: 'MOTO',
                    capacity: 1,
                    description: 'Motorcycle for delivery',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Luxury Sedan',
                    code: 'LUX_SEDAN',
                    capacity: 4,
                    description: 'Premium luxury sedan',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Electric Vehicle',
                    code: 'EV',
                    capacity: 4,
                    description: 'Electric vehicle',
                    isActive: true
                }
            })
        ]);
        console.log(`✅ Created ${vehicleTypes.length} vehicle types`);

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

        console.log('💵 Creating Fare Types...');
        const fareTypes = await Promise.all([
            prisma.fareType.create({
                data: {
                    name: 'Standard',
                    code: 'STD',
                    description: 'Standard taxi fare',
                    multiplier: 1.0,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Peak Hours',
                    code: 'PEAK',
                    description: 'Peak hours surcharge',
                    multiplier: 1.5,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Night Rate',
                    code: 'NIGHT',
                    description: 'Night time rates',
                    multiplier: 1.3,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Holiday Rate',
                    code: 'HOLIDAY',
                    description: 'Holiday surcharge',
                    multiplier: 2.0,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Airport Rate',
                    code: 'AIRPORT',
                    description: 'Airport pickup/drop surcharge',
                    multiplier: 1.2,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Discount Rate',
                    code: 'DISCOUNT',
                    description: 'Discounted rate for promotions',
                    multiplier: 0.8,
                    isActive: true
                }
            })
        ]);
        console.log(`✅ Created ${fareTypes.length} fare types`);

        // Get final counts
        const finalCounts = {
            countries: await prisma.country.count(),
            currencies: await prisma.currency.count(),
            serviceCities: await prisma.serviceCity.count(),
            vehicleTypes: await prisma.vehicleTypeMaster.count(),
            documentTypes: await prisma.documentTypeMaster.count(),
            fareTypes: await prisma.fareType.count()
        };

        console.log('\n🎉 MASTER ENTRIES seeding completed successfully!');
        console.log(`📊 Master Data Summary:`);
        console.log(`   Countries: ${finalCounts.countries}`);
        console.log(`   Currencies: ${finalCounts.currencies}`);
        console.log(`   Service Cities: ${finalCounts.serviceCities}`);
        console.log(`   Vehicle Types: ${finalCounts.vehicleTypes}`);
        console.log(`   Document Types: ${finalCounts.documentTypes}`);
        console.log(`   Fare Types: ${finalCounts.fareTypes}`);

        console.log('\n💡 Master entries include:');
        console.log('✅ 5 Countries (US, Canada, UK, Australia, Germany)');
        console.log('✅ 5 Currencies (USD, CAD, GBP, EUR, AUD)');
        console.log('✅ 5 Service Cities (NYC, LA, Chicago, Toronto, London)');
        console.log('✅ 6 Vehicle Types (Sedan, SUV, Van, Motorcycle, Luxury, EV)');
        console.log('✅ 6 Document Types (License, Registration, Insurance, etc.)');
        console.log('✅ 6 Fare Types (Standard, Peak, Night, Holiday, Airport, Discount)');
        console.log('\n🚀 Master data is now ready for production use!');

    } catch (error) {
        console.error('❌ Error seeding master entries:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedMasterEntries();