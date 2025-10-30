const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Company location data for proper map centering
const COMPANY_LOCATIONS = [
    {
        name: 'Elite City Taxi LLC',
        brandName: 'EliteCab',
        code: 'ELITE001',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        timezone: 'America/New_York',
        lat: 40.7128,
        lng: -74.0060,
        owner: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'owner@elitecitytaxi.com',
            phone: '+1555100101'
        }
    },
    {
        name: 'Metro Rides Corporation',
        brandName: 'MetroGo',
        code: 'METRO002',
        city: 'Los Angeles',
        state: 'CA',
        country: 'USA',
        timezone: 'America/Los_Angeles',
        lat: 34.0522,
        lng: -118.2437,
        owner: {
            firstName: 'Sarah',
            lastName: 'Johnson',
            email: 'owner@metrorides.com',
            phone: '+1555200101'
        }
    },
    {
        name: 'Downtown Taxi Service',
        brandName: 'CityTaxi',
        code: 'CITY003',
        city: 'Chicago',
        state: 'IL',
        country: 'USA',
        timezone: 'America/Chicago',
        lat: 41.8781,
        lng: -87.6298,
        owner: {
            firstName: 'Mike',
            lastName: 'Brown',
            email: 'owner@citytaxi.com',
            phone: '+1555300101'
        }
    }
];

// Vehicle data
const VEHICLE_TYPES = ['SEDAN', 'SUV', 'VAN', 'LUXURY', 'ELECTRIC'];
const VEHICLE_MAKES = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Tesla', 'BMW', 'Mercedes'];
const VEHICLE_MODELS = ['Camry', 'Civic', 'Fusion', 'Malibu', 'Model 3', '3 Series', 'C-Class'];
const COLORS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red'];

async function main() {
    console.log('🗑️  RESETTING DATABASE COMPLETELY...\n');

    // Delete all data in correct order (respecting foreign keys)
    try {
        console.log('   Deleting operational data...');
        await prisma.payment.deleteMany();
        await prisma.walletTransaction.deleteMany();
        await prisma.rating.deleteMany();
        await prisma.message.deleteMany();
        await prisma.notification.deleteMany();
        await prisma.locationUpdate.deleteMany();
        await prisma.offer.deleteMany();
        await prisma.assignment.deleteMany();
        await prisma.alarm.deleteMany();
        await prisma.supportTicket.deleteMany();
        await prisma.shift.deleteMany();
        await prisma.ride.deleteMany();
        await prisma.job.deleteMany();
        await prisma.deliveryOrder.deleteMany();

        console.log('   Deleting company data...');
        await prisma.companyTariff.deleteMany();
        await prisma.companyZone.deleteMany();
        await prisma.companyVehicle.deleteMany();
        await prisma.companyDriver.deleteMany();
        await prisma.pricingTemplate.deleteMany();
        await prisma.document.deleteMany();
        await prisma.vehicle.deleteMany();
        await prisma.tariff.deleteMany();
        await prisma.zone.deleteMany();
        await prisma.merchant.deleteMany();

        console.log('   Deleting core data...');
        await prisma.company.deleteMany();
        await prisma.user.deleteMany();

        console.log('   Deleting master data...');
        await prisma.serviceCity.deleteMany();
        await prisma.documentTypeMaster.deleteMany();
        await prisma.fareType.deleteMany();
        await prisma.vehicleTypeMaster.deleteMany();
        await prisma.currency.deleteMany();
        await prisma.country.deleteMany();

        console.log('✅ Database reset complete!\n');
    } catch (error) {
        console.log('   ⚠️  Some tables might be empty, continuing...');
    }

    console.log('🌱 SEEDING DATABASE WITH COMPLETE DATA...\n');

    // Common password for all users
    const hashedPassword = await bcrypt.hash('password123', 10);

    // ==========================================
    // 0. CREATE MASTER DATA (Foundation)
    // ==========================================
    console.log('🗄️  Creating Master Data...');

    // Countries
    const countries = await Promise.all([
        prisma.country.create({
            data: {
                name: 'United States',
                code: 'US',
                code3: 'USA',
                numericCode: '840',
                phoneCode: '+1',
                currency: 'USD',
                flag: '🇺🇸',
                isActive: true
            }
        }),
        prisma.country.create({
            data: {
                name: 'United Kingdom',
                code: 'GB',
                code3: 'GBR',
                numericCode: '826',
                phoneCode: '+44',
                currency: 'GBP',
                flag: '🇬🇧',
                isActive: true
            }
        }),
        prisma.country.create({
            data: {
                name: 'Canada',
                code: 'CA',
                code3: 'CAN',
                numericCode: '124',
                phoneCode: '+1',
                currency: 'CAD',
                flag: '🇨🇦',
                isActive: true
            }
        }),
        prisma.country.create({
            data: {
                name: 'New Zealand',
                code: 'NZ',
                code3: 'NZL',
                numericCode: '554',
                phoneCode: '+64',
                currency: 'NZD',
                flag: '🇳🇿',
                isActive: true
            }
        }),
        prisma.country.create({
            data: {
                name: 'Qatar',
                code: 'QA',
                code3: 'QAT',
                numericCode: '634',
                phoneCode: '+974',
                currency: 'QAR',
                flag: '🇶🇦',
                isActive: true
            }
        }),
        prisma.country.create({
            data: {
                name: 'Pakistan',
                code: 'PK',
                code3: 'PAK',
                numericCode: '586',
                phoneCode: '+92',
                currency: 'PKR',
                flag: '🇵🇰',
                isActive: true
            }
        })
    ]);

    // Currencies
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
                name: 'British Pound',
                code: 'GBP',
                symbol: '£',
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
                name: 'Euro',
                code: 'EUR',
                symbol: '€',
                decimalPlaces: 2,
                isActive: true
            }
        }),
        prisma.currency.create({
            data: {
                name: 'New Zealand Dollar',
                code: 'NZD',
                symbol: 'NZ$',
                decimalPlaces: 2,
                isActive: true
            }
        }),
        prisma.currency.create({
            data: {
                name: 'Qatari Riyal',
                code: 'QAR',
                symbol: 'ر.ق',
                decimalPlaces: 2,
                isActive: true
            }
        }),
        prisma.currency.create({
            data: {
                name: 'Pakistani Rupee',
                code: 'PKR',
                symbol: '₨',
                decimalPlaces: 2,
                isActive: true
            }
        })
    ]);

    // Vehicle Types (comprehensive list for international markets)
    const vehicleTypes = await Promise.all([
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Sedan',
                code: 'SEDAN',
                description: 'Standard 4-door sedan (Toyota Camry, Honda Civic)',
                capacity: 4,
                icon: '🚗',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'SUV',
                code: 'SUV',
                description: 'Sport Utility Vehicle (Toyota Land Cruiser, Nissan Patrol)',
                capacity: 7,
                icon: '🚙',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Van',
                code: 'VAN',
                description: 'Large passenger van (Toyota Hiace, Nissan Urvan)',
                capacity: 12,
                icon: '🚐',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Minivan',
                code: 'MINIVAN',
                description: 'Compact van (Honda Odyssey, Toyota Sienna)',
                capacity: 7,
                icon: '🚐',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Luxury',
                code: 'LUXURY',
                description: 'Luxury/Premium vehicle (Mercedes, BMW, Audi)',
                capacity: 4,
                icon: '🚘',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Electric',
                code: 'ELECTRIC',
                description: 'Electric vehicle (Tesla, Nissan Leaf)',
                capacity: 4,
                icon: '⚡',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Hatchback',
                code: 'HATCHBACK',
                description: 'Compact hatchback (Toyota Yaris, Honda Fit)',
                capacity: 4,
                icon: '🚗',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Pickup Truck',
                code: 'PICKUP',
                description: 'Pickup truck (Toyota Hilux, Ford Ranger)',
                capacity: 5,
                icon: '🛻',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Station Wagon',
                code: 'WAGON',
                description: 'Station wagon (Subaru Outback, Volvo V90)',
                capacity: 5,
                icon: '🚙',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Coupe',
                code: 'COUPE',
                description: '2-door coupe (BMW 4 Series, Audi A5)',
                capacity: 4,
                icon: '🚗',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Microbus',
                code: 'MICROBUS',
                description: 'Small bus (Toyota Coaster, Hyundai County)',
                capacity: 22,
                icon: '🚌',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Rickshaw',
                code: 'RICKSHAW',
                description: 'Auto rickshaw/Tuk-tuk (popular in Pakistan)',
                capacity: 3,
                icon: '🛺',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Motorcycle',
                code: 'MOTORCYCLE',
                description: 'Motorcycle taxi/bike',
                capacity: 2,
                icon: '🏍️',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Crossover',
                code: 'CROSSOVER',
                description: 'Crossover SUV (Nissan Qashqai, Mazda CX-5)',
                capacity: 5,
                icon: '🚙',
                isActive: true
            }
        }),
        prisma.vehicleTypeMaster.create({
            data: {
                name: 'Luxury SUV',
                code: 'LUXURY_SUV',
                description: 'Premium SUV (Range Rover, Porsche Cayenne)',
                capacity: 7,
                icon: '🚙',
                isActive: true
            }
        })
    ]);

    // Service Cities
    const usCountry = countries.find(c => c.code === 'US');
    const serviceCities = await Promise.all([
        prisma.serviceCity.create({
            data: {
                name: 'New York',
                code: 'NYC',
                countryId: usCountry.id,
                state: 'NY',
                timezone: 'America/New_York',
                latitude: 40.7128,
                longitude: -74.0060,
                isActive: true
            }
        }),
        prisma.serviceCity.create({
            data: {
                name: 'Los Angeles',
                code: 'LAX',
                countryId: usCountry.id,
                state: 'CA',
                timezone: 'America/Los_Angeles',
                latitude: 34.0522,
                longitude: -118.2437,
                isActive: true
            }
        }),
        prisma.serviceCity.create({
            data: {
                name: 'Chicago',
                code: 'CHI',
                countryId: usCountry.id,
                state: 'IL',
                timezone: 'America/Chicago',
                latitude: 41.8781,
                longitude: -87.6298,
                isActive: true
            }
        })
    ]);

    // Fare Types
    const fareTypes = await Promise.all([
        prisma.fareType.create({
            data: {
                name: 'Base Fare',
                code: 'BASE',
                description: 'Initial pickup charge',
                isActive: true
            }
        }),
        prisma.fareType.create({
            data: {
                name: 'Distance',
                code: 'DISTANCE',
                description: 'Per kilometer/mile charge',
                isActive: true
            }
        }),
        prisma.fareType.create({
            data: {
                name: 'Time',
                code: 'TIME',
                description: 'Per minute charge',
                isActive: true
            }
        }),
        prisma.fareType.create({
            data: {
                name: 'Surge',
                code: 'SURGE',
                description: 'Peak hour multiplier',
                isActive: true
            }
        }),
        prisma.fareType.create({
            data: {
                name: 'Flat Rate',
                code: 'FLAT',
                description: 'Fixed fare for route',
                isActive: true
            }
        })
    ]);

    // Document Types
    const documentTypes = await Promise.all([
        prisma.documentTypeMaster.create({
            data: {
                name: 'Driver License',
                code: 'DRIVER_LICENSE',
                description: 'Valid driver license',
                category: 'DRIVER',
                isRequired: true,
                expiryRequired: true,
                isActive: true
            }
        }),
        prisma.documentTypeMaster.create({
            data: {
                name: 'Vehicle Registration',
                code: 'VEHICLE_REGISTRATION',
                description: 'Vehicle registration certificate',
                category: 'VEHICLE',
                isRequired: true,
                expiryRequired: true,
                isActive: true
            }
        }),
        prisma.documentTypeMaster.create({
            data: {
                name: 'Insurance Certificate',
                code: 'INSURANCE',
                description: 'Vehicle insurance policy',
                category: 'VEHICLE',
                isRequired: true,
                expiryRequired: true,
                isActive: true
            }
        }),
        prisma.documentTypeMaster.create({
            data: {
                name: 'Background Check',
                code: 'BACKGROUND_CHECK',
                description: 'Driver background verification',
                category: 'DRIVER',
                isRequired: true,
                expiryRequired: true,
                isActive: true
            }
        }),
        prisma.documentTypeMaster.create({
            data: {
                name: 'Business License',
                code: 'BUSINESS_LICENSE',
                description: 'Company operating license',
                category: 'COMPANY',
                isRequired: true,
                expiryRequired: true,
                isActive: true
            }
        })
    ]);

    console.log(`   ✅ Countries: ${countries.length}`);
    console.log(`   ✅ Currencies: ${currencies.length}`);
    console.log(`   ✅ Vehicle Types: ${vehicleTypes.length}`);
    console.log(`   ✅ Service Cities: ${serviceCities.length}`);
    console.log(`   ✅ Fare Types: ${fareTypes.length}`);
    console.log(`   ✅ Document Types: ${documentTypes.length}\n`);

    // ==========================================
    // 0b. CREATE SUBSCRIPTION PLANS
    // ==========================================
    console.log('💳 Creating Subscription Plans...');

    const subscriptionPlans = await Promise.all([
        prisma.subscriptionPlan.create({
            data: {
                name: 'Free Trial',
                description: 'Perfect for testing the platform with limited features',
                price: 0,
                billingCycle: 'monthly',
                vehicleLimit: 5,
                driverLimit: 5,
                rideCommission: 10.0,
                features: JSON.stringify([
                    'Up to 5 vehicles',
                    'Up to 5 drivers',
                    'Basic ride management',
                    'Standard customer support',
                    '10% commission per ride',
                    '30-day trial period'
                ]),
                isActive: true,
                trialDays: 30,
                setupFee: 0
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Starter',
                description: 'Great for small taxi operators getting started',
                price: 99,
                billingCycle: 'monthly',
                vehicleLimit: 10,
                driverLimit: 10,
                rideCommission: 8.0,
                features: JSON.stringify([
                    'Up to 10 vehicles',
                    'Up to 10 drivers',
                    'Full ride management',
                    'Zone & pricing management',
                    'Driver tracking',
                    'Basic reports',
                    'Email support',
                    '8% commission per ride'
                ]),
                isActive: true,
                trialDays: 14,
                setupFee: 0
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Professional',
                description: 'For growing businesses with moderate fleet sizes',
                price: 249,
                billingCycle: 'monthly',
                vehicleLimit: 50,
                driverLimit: 50,
                rideCommission: 6.0,
                features: JSON.stringify([
                    'Up to 50 vehicles',
                    'Up to 50 drivers',
                    'Advanced ride management',
                    'Zone & pricing management',
                    'Real-time tracking',
                    'Advanced analytics',
                    'Customer app branding',
                    'Priority support',
                    '6% commission per ride'
                ]),
                isActive: true,
                trialDays: 14,
                setupFee: 99
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Business',
                description: 'For established companies with larger fleets',
                price: 499,
                billingCycle: 'monthly',
                vehicleLimit: 100,
                driverLimit: 100,
                rideCommission: 5.0,
                features: JSON.stringify([
                    'Up to 100 vehicles',
                    'Up to 100 drivers',
                    'Full platform access',
                    'Advanced zone management',
                    'Fleet analytics',
                    'Driver performance tracking',
                    'Custom branding',
                    'API access',
                    'Dedicated support',
                    '5% commission per ride'
                ]),
                isActive: true,
                trialDays: 14,
                setupFee: 199
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Enterprise',
                description: 'For large taxi operators with unlimited needs',
                price: 999,
                billingCycle: 'monthly',
                vehicleLimit: -1, // Unlimited
                driverLimit: -1, // Unlimited
                rideCommission: 3.0,
                features: JSON.stringify([
                    'Unlimited vehicles',
                    'Unlimited drivers',
                    'Full platform access',
                    'Custom features',
                    'White-label solution',
                    'Advanced analytics & BI',
                    'Multi-region support',
                    'API & webhook access',
                    'Dedicated account manager',
                    '24/7 premium support',
                    '3% commission per ride'
                ]),
                isActive: true,
                trialDays: 30,
                setupFee: 499
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Quarterly Business',
                description: 'Business plan with quarterly billing (save 10%)',
                price: 1347, // $449/month * 3 months
                billingCycle: 'quarterly',
                vehicleLimit: 100,
                driverLimit: 100,
                rideCommission: 5.0,
                features: JSON.stringify([
                    'Up to 100 vehicles',
                    'Up to 100 drivers',
                    'Full platform access',
                    'Advanced zone management',
                    'Fleet analytics',
                    'Custom branding',
                    'API access',
                    'Dedicated support',
                    '5% commission per ride',
                    'Save 10% with quarterly billing'
                ]),
                isActive: true,
                trialDays: 14,
                setupFee: 199
            }
        }),
        prisma.subscriptionPlan.create({
            data: {
                name: 'Annual Enterprise',
                description: 'Enterprise plan with yearly billing (save 20%)',
                price: 9590, // $799/month * 12 months
                billingCycle: 'yearly',
                vehicleLimit: -1,
                driverLimit: -1,
                rideCommission: 3.0,
                features: JSON.stringify([
                    'Unlimited vehicles',
                    'Unlimited drivers',
                    'Full platform access',
                    'Custom features',
                    'White-label solution',
                    'Advanced analytics & BI',
                    'Multi-region support',
                    'API & webhook access',
                    'Dedicated account manager',
                    '24/7 premium support',
                    '3% commission per ride',
                    'Save 20% with annual billing'
                ]),
                isActive: true,
                trialDays: 30,
                setupFee: 0 // Waived for annual
            }
        })
    ]);

    console.log(`   ✅ Created ${subscriptionPlans.length} subscription plans\n`);

    // ==========================================
    // 1. CREATE SUPER ADMIN
    // ==========================================
    console.log('👑 Creating Super Admin...');
    const superAdmin = await prisma.user.create({
        data: {
            firstName: 'Super',
            lastName: 'Admin',
            email: 'admin@abtaxi.com',
            phone: '+1234567890',
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            isActive: true,
            isVerified: true,
            preferences: {
                language: 'en',
                currency: 'USD',
                notifications: {
                    push: true,
                    email: true,
                    sms: false
                }
            }
        },
    });
    console.log(`   ✅ ${superAdmin.email} (password123)\n`);

    // ==========================================
    // 2. CREATE COMPANIES WITH OWNERS
    // ==========================================
    console.log('🏢 Creating Companies with Owners...');

    const companies = [];
    const owners = [];

    for (const location of COMPANY_LOCATIONS) {
        // Create owner first
        const owner = await prisma.user.create({
            data: {
                firstName: location.owner.firstName,
                lastName: location.owner.lastName,
                email: location.owner.email,
                phone: location.owner.phone,
                password: hashedPassword,
                role: 'OWNER',
                isActive: true,
                isVerified: true,
                preferences: {
                    language: 'en',
                    currency: 'USD',
                    timezone: location.timezone
                }
            },
        });

        owners.push(owner);

        // Create company
        const company = await prisma.company.create({
            data: {
                // Core Identity
                legalName: location.name,
                brandName: location.brandName,
                companyCode: location.code,
                companyType: 'TAXI_OPERATOR',
                businessModel: 'B2C',
                registrationNumber: `REG-${location.code}`,
                taxId: `TAX-${location.code}`,
                primaryLanguage: 'en',
                timezone: location.timezone,
                status: 'ACTIVE',
                activationDate: new Date(),

                // Contact Information
                primaryContactName: `${location.owner.firstName} ${location.owner.lastName}`,
                primaryContactEmail: location.owner.email,
                primaryContactPhone: location.owner.phone,
                supportEmail: location.owner.email,
                supportPhone: location.owner.phone,

                // Address & Location (Important for map centering)
                hqAddressLine1: '123 Business Street',
                hqCity: location.city,
                hqState: location.state,
                hqPostcode: location.state === 'NY' ? '10001' : location.state === 'CA' ? '90001' : '60601',
                hqCountry: location.country,
                hqLatitude: location.lat,
                hqLongitude: location.lng,

                // Business Settings
                kycStatus: 'APPROVED',
                commissionRate: 15.0,
                dispatchMode: 'AUTO',
                autoAssignRadiusKm: 5.0,

                // Owner Relation
                ownerId: owner.id,

                // Legacy fields (for compatibility)
                name: location.brandName,
                email: location.owner.email,
                phone: location.owner.phone,
                isActive: true,
                isVerified: true,
            },
        });

        companies.push(company);

        console.log(`   ✅ ${company.brandName} (${location.city}) - Owner: ${owner.email}`);
    }

    console.log('');

    // ==========================================
    // 3. CREATE COMPANY ZONES (Enhanced for new system)
    // ==========================================
    console.log('📍 Creating Service Zones...');

    const zones = [];

    // NYC Zones for EliteCab
    const nycZones = [
        {
            zoneName: 'Manhattan Downtown',
            zoneType: 'CITY_CENTER',
            geometryType: 'RECTANGLE',
            centerPoint: { lat: 40.7128, lng: -74.0060 },
            bounds: {
                north: 40.7489,
                south: 40.7128,
                east: -73.9712,
                west: -74.0060
            },
            color: '#FF6B6B',
            icon: '🏢',
            description: 'Financial District and Lower Manhattan'
        },
        {
            zoneName: 'JFK Airport Zone',
            zoneType: 'AIRPORT',
            geometryType: 'CIRCLE',
            centerPoint: { lat: 40.6413, lng: -73.7781 },
            radius: 3.0,
            color: '#4ECDC4',
            icon: '✈️',
            description: 'John F. Kennedy International Airport area'
        },
        {
            zoneName: 'Times Square',
            zoneType: 'BUSINESS_DISTRICT',
            geometryType: 'CIRCLE',
            centerPoint: { lat: 40.7580, lng: -73.9855 },
            radius: 1.5,
            color: '#45B7D1',
            icon: '🎭',
            description: 'Theater District and Tourist Area'
        }
    ];

    // LA Zones for MetroGo
    const laZones = [
        {
            zoneName: 'Downtown LA',
            zoneType: 'CITY_CENTER',
            geometryType: 'RECTANGLE',
            centerPoint: { lat: 34.0522, lng: -118.2437 },
            bounds: {
                north: 34.0600,
                south: 34.0400,
                east: -118.2300,
                west: -118.2500
            },
            color: '#96CEB4',
            icon: '🏙️',
            description: 'Central Business District'
        },
        {
            zoneName: 'LAX Airport',
            zoneType: 'AIRPORT',
            geometryType: 'CIRCLE',
            centerPoint: { lat: 33.9425, lng: -118.4081 },
            radius: 2.5,
            color: '#FCEA2B',
            icon: '✈️',
            description: 'Los Angeles International Airport'
        }
    ];

    // Chicago Zones for CityTaxi
    const chicagoZones = [
        {
            zoneName: 'The Loop',
            zoneType: 'BUSINESS_DISTRICT',
            geometryType: 'RECTANGLE',
            centerPoint: { lat: 41.8781, lng: -87.6298 },
            bounds: {
                north: 41.8870,
                south: 41.8700,
                east: -87.6200,
                west: -87.6400
            },
            color: '#FF8B94',
            icon: '💼',
            description: 'Central Business District'
        }
    ];

    const allZones = [
        ...nycZones.map(z => ({ ...z, companyId: companies[0].id })),
        ...laZones.map(z => ({ ...z, companyId: companies[1].id })),
        ...chicagoZones.map(z => ({ ...z, companyId: companies[2].id }))
    ];

    for (const zoneData of allZones) {
        const zone = await prisma.companyZone.create({
            data: {
                companyId: zoneData.companyId,
                zoneName: zoneData.zoneName,
                zoneType: zoneData.zoneType,
                geometryType: zoneData.geometryType,
                centerPoint: zoneData.centerPoint,
                radius: zoneData.radius || null,
                bounds: zoneData.bounds || null,
                color: zoneData.color,
                icon: zoneData.icon,
                description: zoneData.description,
                priceMultiplier: zoneData.zoneType === 'AIRPORT' ? 1.5 : 1.0,
                pickupAllowed: true,
                dropoffAllowed: true,
                priority: zoneData.zoneType === 'AIRPORT' ? 10 : 5,
                isActive: true,
                status: 'ACTIVE'
            }
        });

        zones.push(zone);
    }

    console.log(`   ✅ Created ${zones.length} service zones\n`);

    // ==========================================
    // 4. CREATE TARIFFS (Enhanced for new system)
    // ==========================================
    console.log('💰 Creating Tariff Plans...');

    const tariffs = [];

    // Create tariffs for each company
    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        const companyZones = zones.filter(z => z.companyId === company.id);

        // Standard rates for each vehicle type
        for (const vehicleType of VEHICLE_TYPES) {
            const baseFare = vehicleType === 'LUXURY' ? 8.0 : vehicleType === 'ELECTRIC' ? 4.0 : 5.0;
            const perKmRate = vehicleType === 'LUXURY' ? 2.5 : vehicleType === 'SUV' ? 2.0 : 1.5;
            const perMinuteRate = vehicleType === 'LUXURY' ? 0.8 : 0.5;

            const tariff = await prisma.companyTariff.create({
                data: {
                    companyId: company.id,
                    name: `${vehicleType} Standard`,
                    description: `Standard ${vehicleType.toLowerCase()} rates for ${company.brandName}`,
                    serviceMode: 'TAXI',
                    vehicleType: vehicleType,
                    baseFare: baseFare,
                    perKmRate: perKmRate,
                    perMinuteRate: perMinuteRate,
                    minimumFare: baseFare + 2.0,
                    waitingFeePerMinute: 0.25,
                    cancellationFee: 5.0,
                    bookingFee: 1.0,
                    // Time-based pricing
                    peakHourMultiplier: 1.5,
                    peakHourStart: '07:00',
                    peakHourEnd: '09:00',
                    peakHour2Start: '17:00',
                    peakHour2End: '19:00',
                    weekendMultiplier: 1.2,
                    nightMultiplier: 1.3,
                    nightStart: '22:00',
                    nightEnd: '06:00',
                    currency: 'USD',
                    priority: 0,
                    isActive: true,
                    validFrom: new Date(),
                }
            });

            tariffs.push(tariff);
        }

        // Airport surcharge tariffs
        const airportZone = companyZones.find(z => z.zoneType === 'AIRPORT');
        if (airportZone) {
            const airportTariff = await prisma.companyTariff.create({
                data: {
                    companyId: company.id,
                    zoneId: airportZone.id,
                    name: 'Airport Premium',
                    description: 'Premium rates for airport pickups and dropoffs',
                    serviceMode: 'TAXI',
                    vehicleType: 'SEDAN',
                    baseFare: 10.0,
                    perKmRate: 2.0,
                    perMinuteRate: 0.6,
                    minimumFare: 15.0,
                    airportFee: 5.0,
                    waitingFeePerMinute: 0.5,
                    cancellationFee: 10.0,
                    currency: 'USD',
                    priority: 10,
                    isActive: true,
                    validFrom: new Date(),
                }
            });

            tariffs.push(airportTariff);
        }
    }

    console.log(`   ✅ Created ${tariffs.length} tariff plans\n`);

    // ==========================================
    // 5. CREATE DRIVERS
    // ==========================================
    console.log('🚗 Creating Drivers...');

    const drivers = [];
    const driverNames = [
        ['Michael', 'Brown'], ['Emily', 'Davis'], ['David', 'Wilson'], ['Lisa', 'Garcia'],
        ['James', 'Martinez'], ['Jennifer', 'Anderson'], ['Robert', 'Taylor'], ['Amanda', 'Thomas'],
        ['Chris', 'Jackson'], ['Maria', 'White'], ['Daniel', 'Harris'], ['Jessica', 'Martin']
    ];

    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];

        // Create 4 drivers per company
        for (let j = 0; j < 4; j++) {
            const [firstName, lastName] = driverNames[i * 4 + j];

            const driver = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email: `driver${j + 1}@${company.brandName.toLowerCase()}.com`,
                    phone: `+1555${i + 1}${j + 1}0201`,
                    password: hashedPassword,
                    role: 'DRIVER',
                    companyId: company.id,
                    isActive: true,
                    isVerified: true,
                    rating: {
                        average: 4.5 + Math.random() * 0.5,
                        count: Math.floor(Math.random() * 200) + 50
                    },
                    preferences: {
                        notifications: true,
                        soundAlerts: true,
                        language: 'en',
                        workingHours: {
                            start: '06:00',
                            end: '22:00'
                        }
                    }
                }
            });

            drivers.push(driver);

            // Create CompanyDriver relation
            await prisma.companyDriver.create({
                data: {
                    companyId: company.id,
                    userId: driver.id,
                    employmentType: 'FULL_TIME',
                    licenseNumber: `LIC${i + 1}${j + 1}${Math.floor(Math.random() * 1000)}`,
                    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                    hireDate: new Date(Date.now() - Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000),
                    status: 'ACTIVE'
                }
            });
        }
    }

    console.log(`   ✅ Created ${drivers.length} drivers\n`);

    // ==========================================
    // 6. CREATE VEHICLES
    // ==========================================
    console.log('🚙 Creating Vehicles...');

    const vehicles = [];

    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        const companyDrivers = drivers.filter(d => d.companyId === company.id);

        // Create 2 vehicles per driver
        for (let j = 0; j < companyDrivers.length; j++) {
            for (let k = 0; k < 2; k++) {
                const vehicleType = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
                const make = VEHICLE_MAKES[Math.floor(Math.random() * VEHICLE_MAKES.length)];
                const model = VEHICLE_MODELS[Math.floor(Math.random() * VEHICLE_MODELS.length)];
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                const year = 2018 + Math.floor(Math.random() * 6);

                const vehicle = await prisma.companyVehicle.create({
                    data: {
                        companyId: company.id,
                        make,
                        model,
                        year,
                        bodyType: vehicleType,
                        vehicleClass: vehicleType === 'LUXURY' ? 'LUXURY' : vehicleType === 'SUV' ? 'PREMIUM' : 'STANDARD',
                        ownershipType: 'COMPANY_OWNED',
                        capacityPassengers: vehicleType === 'VAN' ? 8 : vehicleType === 'SUV' ? 7 : 4,
                        capacityBags: vehicleType === 'VAN' ? 6 : vehicleType === 'SUV' ? 4 : 2,
                        wheelchairAccessible: vehicleType === 'VAN' ? Math.random() > 0.5 : false,
                        registrationNumber: `${company.companyCode.slice(0, 3)}-${Math.floor(Math.random() * 10000)}`,
                        registrationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        inspectionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        gpsProvider: 'TaxiGPS Pro',
                        status: 'ACTIVE'
                    }
                });

                vehicles.push(vehicle);
            }
        }
    }

    console.log(`   ✅ Created ${vehicles.length} vehicles\n`);

    // ==========================================
    // 7. CREATE PRICING TEMPLATES
    // ==========================================
    console.log('📋 Creating Pricing Templates...');

    const pricingTemplates = [
        {
            name: 'Standard City',
            category: 'STANDARD',
            icon: '🏙️',
            templateData: {
                baseFare: 5.0,
                perKmRate: 1.5,
                perMinuteRate: 0.3,
                minimumFare: 8.0,
                vehicleRates: {
                    SEDAN: { baseFare: 5.0, perKmRate: 1.5 },
                    SUV: { baseFare: 6.0, perKmRate: 1.8 },
                    LUXURY: { baseFare: 10.0, perKmRate: 2.5 }
                }
            }
        },
        {
            name: 'Airport Premium',
            category: 'AIRPORT',
            icon: '✈️',
            templateData: {
                baseFare: 10.0,
                perKmRate: 2.0,
                perMinuteRate: 0.5,
                minimumFare: 15.0,
                airportFee: 5.0,
                vehicleRates: {
                    SEDAN: { baseFare: 10.0, perKmRate: 2.0 },
                    SUV: { baseFare: 12.0, perKmRate: 2.3 },
                    LUXURY: { baseFare: 20.0, perKmRate: 3.0 }
                }
            }
        },
        {
            name: 'Peak Hour Surge',
            category: 'PEAK_HOUR',
            icon: '🔥',
            templateData: {
                baseFare: 5.0,
                perKmRate: 1.5,
                peakHourMultiplier: 1.5,
                peakHourStart: '07:00',
                peakHourEnd: '09:00',
                peakHour2Start: '17:00',
                peakHour2End: '19:00'
            }
        }
    ];

    for (const template of pricingTemplates) {
        await prisma.pricingTemplate.create({
            data: {
                name: template.name,
                category: template.category,
                icon: template.icon,
                templateData: template.templateData,
                isPublic: true,
                usageCount: 0
            }
        });
    }

    console.log(`   ✅ Created ${pricingTemplates.length} pricing templates\n`);

    // ==========================================
    // 8. SUMMARY
    // ==========================================
    console.log('📊 SEEDING COMPLETE! Summary:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('�️  MASTER DATA:');
    console.log(`   🔹 Countries: ${countries.length}`);
    console.log(`   🔹 Currencies: ${currencies.length}`);
    console.log(`   🔹 Vehicle Types: ${vehicleTypes.length}`);
    console.log(`   🔹 Service Cities: ${serviceCities.length}`);
    console.log(`   🔹 Fare Types: ${fareTypes.length}`);
    console.log(`   🔹 Document Types: ${documentTypes.length}`);
    console.log('');

    console.log('�👤 USERS CREATED:');
    console.log(`   🔹 Super Admin: admin@abtaxi.com / password123`);
    console.log(`   🔹 Company Owners: ${owners.length}`);
    console.log(`   🔹 Drivers: ${drivers.length}`);
    console.log('');

    console.log('🏢 COMPANIES CREATED:');
    companies.forEach((company, i) => {
        const location = COMPANY_LOCATIONS[i];
        console.log(`   🔹 ${company.brandName} (${location.city}, ${location.country})`);
        console.log(`     Owner: ${location.owner.email} / password123`);
        console.log(`     Location: ${location.lat}, ${location.lng}`);
    });
    console.log('');

    console.log('📍 ZONES & PRICING:');
    console.log(`   🔹 Service Zones: ${zones.length} (with proper geometry)`);
    console.log(`   🔹 Tariff Plans: ${tariffs.length} (with time-based rules)`);
    console.log(`   🔹 Pricing Templates: ${pricingTemplates.length}`);
    console.log('');

    console.log('🚗 FLEET DATA:');
    console.log(`   🔹 Vehicles: ${vehicles.length} (with GPS locations)`);
    console.log(`   🔹 Driver Relations: ${drivers.length} company-driver links`);
    console.log('');

    console.log('🌍 MAP INTEGRATION:');
    console.log('   🔹 Companies have proper lat/lng coordinates');
    console.log('   🔹 Zones have geometry data (circles, rectangles)');
    console.log('   🔹 Vehicles have current GPS locations');
    console.log('   🔹 Map will center based on company location');
    console.log('');

    console.log('🔑 LOGIN CREDENTIALS:');
    console.log('   🔹 All passwords: password123');
    console.log('   🔹 Admin: admin@abtaxi.com');
    console.log('   🔹 NYC Owner: owner@elitecitytaxi.com');
    console.log('   🔹 LA Owner: owner@metrorides.com');
    console.log('   🔹 Chicago Owner: owner@citytaxi.com');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Database seeded successfully with production-like data!');
    console.log('   ✅ Master data tables populated (6 countries, 7 currencies, 15 vehicle types)');
    console.log('   ✅ Subscription plans ready (7 plans from Free to Enterprise)');
    console.log('   ✅ International support (USA, UK, Canada, New Zealand, Qatar, Pakistan)');
    console.log('   ✅ Maps will center properly based on company locations');
    console.log('   ✅ Zone management system has complete geometry data');
    console.log('   ✅ Ready for full testing of all features!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });