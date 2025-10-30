const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedMasterData() {
    console.log('🌱 Seeding Master Data...');

    // 1. Seed Countries
    console.log('📍 Seeding Countries...');
    const countries = [
        { name: 'United States', code: 'US', code3: 'USA', numericCode: '840', phoneCode: '+1', currency: 'USD', flag: '🇺🇸' },
        { name: 'United Kingdom', code: 'GB', code3: 'GBR', numericCode: '826', phoneCode: '+44', currency: 'GBP', flag: '🇬🇧' },
        { name: 'Canada', code: 'CA', code3: 'CAN', numericCode: '124', phoneCode: '+1', currency: 'CAD', flag: '🇨🇦' },
        { name: 'Australia', code: 'AU', code3: 'AUS', numericCode: '036', phoneCode: '+61', currency: 'AUD', flag: '🇦🇺' },
        { name: 'India', code: 'IN', code3: 'IND', numericCode: '356', phoneCode: '+91', currency: 'INR', flag: '🇮🇳' },
        { name: 'Germany', code: 'DE', code3: 'DEU', numericCode: '276', phoneCode: '+49', currency: 'EUR', flag: '🇩🇪' },
        { name: 'France', code: 'FR', code3: 'FRA', numericCode: '250', phoneCode: '+33', currency: 'EUR', flag: '🇫🇷' },
        { name: 'Japan', code: 'JP', code3: 'JPN', numericCode: '392', phoneCode: '+81', currency: 'JPY', flag: '🇯🇵' },
        { name: 'China', code: 'CN', code3: 'CHN', numericCode: '156', phoneCode: '+86', currency: 'CNY', flag: '🇨🇳' },
        { name: 'Brazil', code: 'BR', code3: 'BRA', numericCode: '076', phoneCode: '+55', currency: 'BRL', flag: '🇧🇷' },
    ];

    for (const country of countries) {
        await prisma.country.upsert({
            where: { code: country.code },
            update: country,
            create: country,
        });
    }
    console.log(`✅ Seeded ${countries.length} countries`);

    // 2. Seed Currencies
    console.log('💰 Seeding Currencies...');
    const currencies = [
        { name: 'US Dollar', code: 'USD', symbol: '$', decimalPlaces: 2 },
        { name: 'Euro', code: 'EUR', symbol: '€', decimalPlaces: 2 },
        { name: 'British Pound', code: 'GBP', symbol: '£', decimalPlaces: 2 },
        { name: 'Canadian Dollar', code: 'CAD', symbol: 'CA$', decimalPlaces: 2 },
        { name: 'Australian Dollar', code: 'AUD', symbol: 'A$', decimalPlaces: 2 },
        { name: 'Indian Rupee', code: 'INR', symbol: '₹', decimalPlaces: 2 },
        { name: 'Japanese Yen', code: 'JPY', symbol: '¥', decimalPlaces: 0 },
        { name: 'Chinese Yuan', code: 'CNY', symbol: '¥', decimalPlaces: 2 },
        { name: 'Brazilian Real', code: 'BRL', symbol: 'R$', decimalPlaces: 2 },
    ];

    for (const currency of currencies) {
        await prisma.currency.upsert({
            where: { code: currency.code },
            update: currency,
            create: currency,
        });
    }
    console.log(`✅ Seeded ${currencies.length} currencies`);

    // 3. Seed Vehicle Types
    console.log('🚗 Seeding Vehicle Types...');
    const vehicleTypes = [
        { name: 'Sedan', code: 'SEDAN', description: 'Standard 4-door car', capacity: 4, icon: '🚗' },
        { name: 'SUV', code: 'SUV', description: 'Sport Utility Vehicle', capacity: 6, icon: '🚙' },
        { name: 'Van', code: 'VAN', description: 'Large passenger van', capacity: 8, icon: '🚐' },
        { name: 'Luxury Sedan', code: 'LUXURY', description: 'Premium luxury vehicle', capacity: 4, icon: '🚙' },
        { name: 'Minivan', code: 'MINIVAN', description: 'Family minivan', capacity: 7, icon: '🚐' },
        { name: 'Hatchback', code: 'HATCHBACK', description: 'Compact car', capacity: 4, icon: '🚗' },
        { name: 'Electric', code: 'ELECTRIC', description: 'Electric vehicle', capacity: 4, icon: '⚡' },
        { name: 'Wagon', code: 'WAGON', description: 'Station wagon', capacity: 5, icon: '🚗' },
    ];

    for (const vehicleType of vehicleTypes) {
        await prisma.vehicleTypeMaster.upsert({
            where: { code: vehicleType.code },
            update: vehicleType,
            create: vehicleType,
        });
    }
    console.log(`✅ Seeded ${vehicleTypes.length} vehicle types`);

    // 4. Seed Service Cities (need country IDs first)
    console.log('🏙️ Seeding Service Cities...');
    const usCountry = await prisma.country.findUnique({ where: { code: 'US' } });
    const ukCountry = await prisma.country.findUnique({ where: { code: 'GB' } });
    const caCountry = await prisma.country.findUnique({ where: { code: 'CA' } });
    const inCountry = await prisma.country.findUnique({ where: { code: 'IN' } });

    const cities = [
        { name: 'New York', code: 'NYC', countryId: usCountry.id, state: 'New York', timezone: 'America/New_York', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Los Angeles', code: 'LAX', countryId: usCountry.id, state: 'California', timezone: 'America/Los_Angeles', latitude: 34.0522, longitude: -118.2437 },
        { name: 'Chicago', code: 'CHI', countryId: usCountry.id, state: 'Illinois', timezone: 'America/Chicago', latitude: 41.8781, longitude: -87.6298 },
        { name: 'London', code: 'LON', countryId: ukCountry.id, state: 'England', timezone: 'Europe/London', latitude: 51.5074, longitude: -0.1278 },
        { name: 'Toronto', code: 'TOR', countryId: caCountry.id, state: 'Ontario', timezone: 'America/Toronto', latitude: 43.6532, longitude: -79.3832 },
        { name: 'Mumbai', code: 'BOM', countryId: inCountry.id, state: 'Maharashtra', timezone: 'Asia/Kolkata', latitude: 19.0760, longitude: 72.8777 },
        { name: 'Delhi', code: 'DEL', countryId: inCountry.id, state: 'Delhi', timezone: 'Asia/Kolkata', latitude: 28.7041, longitude: 77.1025 },
        { name: 'San Francisco', code: 'SFO', countryId: usCountry.id, state: 'California', timezone: 'America/Los_Angeles', latitude: 37.7749, longitude: -122.4194 },
    ];

    for (const city of cities) {
        await prisma.serviceCity.upsert({
            where: { code: city.code },
            update: city,
            create: city,
        });
    }
    console.log(`✅ Seeded ${cities.length} service cities`);

    // 5. Seed Fare Types
    console.log('💵 Seeding Fare Types...');
    const fareTypes = [
        { name: 'Base Fare', code: 'BASE', description: 'Initial fixed charge for ride' },
        { name: 'Distance Fare', code: 'DISTANCE', description: 'Per kilometer/mile charge' },
        { name: 'Time Fare', code: 'TIME', description: 'Per minute charge' },
        { name: 'Surge Fare', code: 'SURGE', description: 'Dynamic pricing during peak hours' },
        { name: 'Waiting Fare', code: 'WAITING', description: 'Charge for waiting time' },
        { name: 'Airport Fee', code: 'AIRPORT', description: 'Additional fee for airport pickups/dropoffs' },
        { name: 'Toll Fee', code: 'TOLL', description: 'Highway toll charges' },
        { name: 'Cancellation Fee', code: 'CANCELLATION', description: 'Fee for ride cancellation' },
    ];

    for (const fareType of fareTypes) {
        await prisma.fareType.upsert({
            where: { code: fareType.code },
            update: fareType,
            create: fareType,
        });
    }
    console.log(`✅ Seeded ${fareTypes.length} fare types`);

    // 6. Seed Document Types
    console.log('📄 Seeding Document Types...');
    const documentTypes = [
        { name: "Driver's License", code: 'DRIVER_LICENSE', description: 'Valid driver license', category: 'DRIVER', isRequired: true, expiryRequired: true },
        { name: 'Vehicle Registration', code: 'VEHICLE_REGISTRATION', description: 'Vehicle registration certificate', category: 'VEHICLE', isRequired: true, expiryRequired: true },
        { name: 'Insurance Certificate', code: 'INSURANCE', description: 'Vehicle insurance certificate', category: 'VEHICLE', isRequired: true, expiryRequired: true },
        { name: 'Background Check', code: 'BACKGROUND_CHECK', description: 'Background verification certificate', category: 'DRIVER', isRequired: true, expiryRequired: true },
        { name: 'Medical Certificate', code: 'MEDICAL_CERT', description: 'Medical fitness certificate', category: 'DRIVER', isRequired: false, expiryRequired: true },
        { name: 'Taxi Permit', code: 'TAXI_PERMIT', description: 'Taxi operating permit', category: 'VEHICLE', isRequired: true, expiryRequired: true },
        { name: 'Business License', code: 'BUSINESS_LICENSE', description: 'Company business license', category: 'COMPANY', isRequired: true, expiryRequired: true },
        { name: 'Tax Registration', code: 'TAX_REGISTRATION', description: 'Tax identification documents', category: 'COMPANY', isRequired: true, expiryRequired: false },
        { name: 'Proof of Address', code: 'PROOF_ADDRESS', description: 'Address verification document', category: 'DRIVER', isRequired: false, expiryRequired: false },
        { name: 'Vehicle Inspection', code: 'VEHICLE_INSPECTION', description: 'Vehicle safety inspection certificate', category: 'VEHICLE', isRequired: true, expiryRequired: true },
    ];

    for (const docType of documentTypes) {
        await prisma.documentTypeMaster.upsert({
            where: { code: docType.code },
            update: docType,
            create: docType,
        });
    }
    console.log(`✅ Seeded ${documentTypes.length} document types`);

    console.log('\n✅ Master Data Seeding Complete!\n');
}

seedMasterData()
    .catch((e) => {
        console.error('❌ Error seeding master data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
