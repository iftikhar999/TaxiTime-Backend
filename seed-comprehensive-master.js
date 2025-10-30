require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedComprehensiveDatabase() {
    try {
        console.log('🌱 Starting COMPREHENSIVE database seeding with all master entries...');

        // First check connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Clean existing data first (except super admin)
        console.log('🧹 Cleaning existing data...');
        await prisma.walletTransaction.deleteMany();
        await prisma.payment.deleteMany();
        await prisma.payout.deleteMany();
        await prisma.settlement.deleteMany();
        await prisma.billingRecord.deleteMany();
        await prisma.invoice.deleteMany();
        await prisma.companyPayment.deleteMany();
        await prisma.ride.deleteMany();
        await prisma.job.deleteMany();
        await prisma.shift.deleteMany();
        await prisma.companyDriver.deleteMany();
        await prisma.companyVehicle.deleteMany();
        await prisma.vehicle.deleteMany();
        await prisma.zoneTariff.deleteMany();
        await prisma.vehicleZone.deleteMany();
        await prisma.companyTariff.deleteMany();
        await prisma.companyZone.deleteMany();
        await prisma.tariff.deleteMany();
        await prisma.zone.deleteMany();
        await prisma.companySettings.deleteMany();
        await prisma.companyConfiguration.deleteMany();
        await prisma.globalConfiguration.deleteMany();
        await prisma.company.deleteMany();
        await prisma.user.deleteMany({
            where: { role: { not: 'SUPER_ADMIN' } }
        });
        await prisma.subscriptionPlan.deleteMany();

        // Clean master data
        await prisma.serviceCity.deleteMany();
        await prisma.country.deleteMany();
        await prisma.currency.deleteMany();
        await prisma.vehicleTypeMaster.deleteMany();
        await prisma.documentTypeMaster.deleteMany();
        await prisma.fareType.deleteMany();

        console.log('✅ Existing data cleaned');

        // Create master entries first
        console.log('🗃️ Creating master entries...');

        // Countries
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
            })
        ]);        // Currencies
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
            })
        ]);

        // Service Cities
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
            })
        ]);        // Vehicle Types
        const vehicleTypes = await Promise.all([
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Sedan',
                    category: 'TAXI',
                    capacity: 4,
                    description: 'Standard 4-door sedan',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'SUV',
                    category: 'TAXI',
                    capacity: 6,
                    description: 'Sport Utility Vehicle',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Van',
                    category: 'TAXI',
                    capacity: 8,
                    description: 'Large capacity van',
                    isActive: true
                }
            }),
            prisma.vehicleTypeMaster.create({
                data: {
                    name: 'Motorcycle',
                    category: 'DELIVERY',
                    capacity: 1,
                    description: 'Motorcycle for delivery',
                    isActive: true
                }
            })
        ]);

        // Document Types
        const documentTypes = await Promise.all([
            prisma.documentTypeMaster.create({
                data: {
                    name: 'Driver License',
                    category: 'DRIVER',
                    description: 'Valid driver license',
                    isRequired: true,
                    hasExpiry: true,
                    isActive: true
                }
            }),
            prisma.documentTypeMaster.create({
                data: {
                    name: 'Vehicle Registration',
                    category: 'VEHICLE',
                    description: 'Vehicle registration certificate',
                    isRequired: true,
                    hasExpiry: true,
                    isActive: true
                }
            }),
            prisma.documentTypeMaster.create({
                data: {
                    name: 'Insurance Certificate',
                    category: 'VEHICLE',
                    description: 'Vehicle insurance certificate',
                    isRequired: true,
                    hasExpiry: true,
                    isActive: true
                }
            }),
            prisma.documentTypeMaster.create({
                data: {
                    name: 'Background Check',
                    category: 'DRIVER',
                    description: 'Criminal background check',
                    isRequired: true,
                    hasExpiry: true,
                    isActive: true
                }
            })
        ]);

        // Fare Types
        const fareTypes = await Promise.all([
            prisma.fareType.create({
                data: {
                    name: 'Standard',
                    description: 'Standard taxi fare',
                    multiplier: 1.0,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Peak Hours',
                    description: 'Peak hour surcharge',
                    multiplier: 1.5,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Night Time',
                    description: 'Night time surcharge',
                    multiplier: 1.3,
                    isActive: true
                }
            }),
            prisma.fareType.create({
                data: {
                    name: 'Airport',
                    description: 'Airport pickup/drop surcharge',
                    multiplier: 1.8,
                    isActive: true
                }
            })
        ]);

        console.log('✅ Master entries created');

        // Global Configuration
        console.log('⚙️ Creating global configuration...');
        const globalConfig = await prisma.globalConfiguration.create({
            data: {
                key: 'SYSTEM_SETTINGS',
                value: {
                    systemName: 'A&B Taxi Management System',
                    version: '1.0.0',
                    defaultCurrency: 'USD',
                    defaultCountry: 'US',
                    defaultTimezone: 'UTC',
                    maintenanceMode: false,
                    allowNewRegistrations: true,
                    maxCompaniesPerPlan: {
                        basic: 1,
                        professional: 5,
                        enterprise: -1
                    },
                    systemLimits: {
                        maxDriversPerCompany: 1000,
                        maxVehiclesPerCompany: 500,
                        maxZonesPerCompany: 50,
                        maxTariffsPerCompany: 20
                    },
                    featureFlags: {
                        enableRealtimeTracking: true,
                        enableAdvancedReports: true,
                        enableWalletSystem: true,
                        enableMultiLanguage: false
                    }
                },
                description: 'Global system configuration',
                isActive: true
            }
        });

        // Create subscription plans
        console.log('📋 Creating subscription plans...');
        const basicPlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Basic Plan',
                description: 'Basic features for small taxi companies',
                price: 99.99,
                billingCycle: 'monthly',
                vehicleLimit: 10,
                driverLimit: 10,
                rideCommission: 10.0,
                features: ['Basic Dispatch', 'Driver Management', 'Basic Reports', 'Customer Support'],
                isActive: true,
                trialDays: 7,
                setupFee: 0.0
            }
        });

        const proPlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Professional Plan',
                description: 'Advanced features for growing companies',
                price: 199.99,
                billingCycle: 'monthly',
                vehicleLimit: 50,
                driverLimit: 50,
                rideCommission: 8.0,
                features: ['Advanced Dispatch', 'Fleet Management', 'Advanced Analytics', 'API Access', 'Zone Management', 'Custom Tariffs'],
                isActive: true,
                trialDays: 14,
                setupFee: 50.0
            }
        });

        const enterprisePlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Enterprise Plan',
                description: 'Enterprise features for large taxi fleets',
                price: 499.99,
                billingCycle: 'monthly',
                vehicleLimit: -1,
                driverLimit: -1,
                rideCommission: 5.0,
                features: ['Full Platform Access', 'White Label', 'Custom Integrations', 'Priority Support', 'Advanced Analytics', 'Multi-tenant', 'Custom Reports'],
                isActive: true,
                trialDays: 30,
                setupFee: 200.0
            }
        });

        console.log('✅ Subscription plans created');

        // Create companies with comprehensive data
        console.log('🏢 Creating companies with comprehensive data...');

        const companies = [];
        const companyData = [
            {
                legalName: 'Metro Taxi Services Inc',
                brandName: 'Metro Taxi',
                companyCode: 'METRO001',
                registrationNumber: 'REG123456',
                taxId: 'TAX789012',
                primaryContactName: 'John Smith',
                primaryContactEmail: 'john@metrotaxi.com',
                primaryContactPhone: '+1234567891',
                hqAddressLine1: '123 Main Street',
                hqCity: 'New York',
                hqState: 'NY',
                hqPostcode: '10001',
                hqCountry: 'USA',
                hqLatitude: 40.7128,
                hqLongitude: -74.0060,
                plan: basicPlan,
                serviceCityId: serviceCities[0].id
            },
            {
                legalName: 'City Cabs Ltd',
                brandName: 'City Cabs',
                companyCode: 'CITY002',
                registrationNumber: 'REG234567',
                taxId: 'TAX890123',
                primaryContactName: 'Sarah Johnson',
                primaryContactEmail: 'sarah@citycabs.com',
                primaryContactPhone: '+1234567892',
                hqAddressLine1: '456 Oak Avenue',
                hqCity: 'Los Angeles',
                hqState: 'CA',
                hqPostcode: '90001',
                hqCountry: 'USA',
                hqLatitude: 34.0522,
                hqLongitude: -118.2437,
                plan: proPlan,
                serviceCityId: serviceCities[1].id
            },
            {
                legalName: 'Quick Ride Co',
                brandName: 'Quick Ride',
                companyCode: 'QUICK003',
                registrationNumber: 'REG345678',
                taxId: 'TAX901234',
                primaryContactName: 'Mike Brown',
                primaryContactEmail: 'mike@quickride.com',
                primaryContactPhone: '+1234567893',
                hqAddressLine1: '789 Pine Street',
                hqCity: 'Chicago',
                hqState: 'IL',
                hqPostcode: '60601',
                hqCountry: 'USA',
                hqLatitude: 41.8781,
                hqLongitude: -87.6298,
                plan: enterprisePlan,
                serviceCityId: serviceCities[2].id
            }
        ];

        for (const companyInfo of companyData) {
            // Create owner user
            const ownerPassword = await bcrypt.hash('owner123', 10);
            const owner = await prisma.user.create({
                data: {
                    firstName: companyInfo.primaryContactName.split(' ')[0],
                    lastName: companyInfo.primaryContactName.split(' ')[1] || 'Owner',
                    email: companyInfo.primaryContactEmail,
                    phone: companyInfo.primaryContactPhone,
                    password: ownerPassword,
                    role: 'OWNER',
                    isActive: true,
                    isVerified: true
                }
            });

            // Create company
            const company = await prisma.company.create({
                data: {
                    legalName: companyInfo.legalName,
                    brandName: companyInfo.brandName,
                    companyCode: companyInfo.companyCode,
                    registrationNumber: companyInfo.registrationNumber,
                    taxId: companyInfo.taxId,
                    primaryContactName: companyInfo.primaryContactName,
                    primaryContactEmail: companyInfo.primaryContactEmail,
                    primaryContactPhone: companyInfo.primaryContactPhone,
                    hqAddressLine1: companyInfo.hqAddressLine1,
                    hqCity: companyInfo.hqCity,
                    hqState: companyInfo.hqState,
                    hqPostcode: companyInfo.hqPostcode,
                    hqCountry: companyInfo.hqCountry,
                    hqLatitude: companyInfo.hqLatitude,
                    hqLongitude: companyInfo.hqLongitude,
                    ownerId: owner.id,
                    subscriptionPlanId: companyInfo.plan.id,
                    status: 'ACTIVE',
                    kycStatus: 'APPROVED',
                    billingCurrency: 'USD',
                    commissionRate: 15.0,
                    subscriptionStartDate: new Date(),
                    subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next month
                }
            });

            // Update user with company relationship
            await prisma.user.update({
                where: { id: owner.id },
                data: { companyId: company.id }
            });

            // Create company configuration
            await prisma.companyConfiguration.create({
                data: {
                    companyId: company.id,
                    key: 'COMPANY_SETTINGS',
                    value: {
                        businessHours: {
                            monday: { open: '06:00', close: '23:00', isActive: true },
                            tuesday: { open: '06:00', close: '23:00', isActive: true },
                            wednesday: { open: '06:00', close: '23:00', isActive: true },
                            thursday: { open: '06:00', close: '23:00', isActive: true },
                            friday: { open: '06:00', close: '23:00', isActive: true },
                            saturday: { open: '07:00', close: '22:00', isActive: true },
                            sunday: { open: '08:00', close: '20:00', isActive: true }
                        },
                        dispatchSettings: {
                            autoAssignEnabled: true,
                            maxAssignDistance: 5,
                            assignmentTimeout: 30,
                            maxParallelOffers: 3
                        },
                        paymentSettings: {
                            acceptCash: true,
                            acceptCard: true,
                            acceptWallet: true,
                            tipEnabled: true,
                            defaultTipPercentage: 15
                        },
                        notifications: {
                            emailEnabled: true,
                            smsEnabled: true,
                            pushEnabled: true
                        }
                    },
                    isActive: true
                }
            });

            // Create company settings
            await prisma.companySettings.create({
                data: {
                    companyId: company.id,
                    timezone: 'UTC',
                    currency: 'USD',
                    language: 'en',
                    dateFormat: 'MM/DD/YYYY',
                    timeFormat: '12h',
                    distanceUnit: 'miles',
                    autoBackupEnabled: true,
                    maxDriverShiftHours: 12,
                    enableRealTimeTracking: true,
                    enablePanicButton: true,
                    enableRatings: true,
                    minimumRating: 1.0,
                    maximumRating: 5.0
                }
            });

            // Create billing record
            await prisma.billingRecord.create({
                data: {
                    companyId: company.id,
                    subscriptionPlanId: companyInfo.plan.id,
                    billingPeriodStart: new Date(),
                    billingPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    basePlanCost: companyInfo.plan.price,
                    vehicleCost: 0.0,
                    commissionAmount: 0.0,
                    setupFee: companyInfo.plan.setupFee,
                    totalAmount: companyInfo.plan.price + companyInfo.plan.setupFee,
                    status: 'PAID',
                    paidAt: new Date()
                }
            });

            companies.push({ company, owner, plan: companyInfo.plan });
            console.log(`✅ Created company: ${company.brandName} with owner: ${owner.firstName} ${owner.lastName}`);
        }

        // Create zones for each company
        console.log('🗺️ Creating zones...');
        for (const { company } of companies) {
            const zones = await Promise.all([
                prisma.zone.create({
                    data: {
                        companyId: company.id,
                        name: `${company.brandName} Downtown`,
                        description: 'City center and business district',
                        boundaries: [
                            [40.7128, -74.0060],
                            [40.7200, -74.0060],
                            [40.7200, -73.9950],
                            [40.7128, -73.9950]
                        ],
                        isActive: true,
                        type: 'SERVICE_AREA',
                        surgeMultiplier: 1.0
                    }
                }),
                prisma.zone.create({
                    data: {
                        companyId: company.id,
                        name: `${company.brandName} Airport Zone`,
                        description: 'Airport service area',
                        boundaries: [
                            [40.6413, -73.7781],
                            [40.6500, -73.7781],
                            [40.6500, -73.7600],
                            [40.6413, -73.7600]
                        ],
                        isActive: true,
                        type: 'AIRPORT',
                        surgeMultiplier: 1.5
                    }
                })
            ]);

            console.log(`✅ Created zones for ${company.brandName}`);
        }

        // Create tariffs for each company
        console.log('💰 Creating tariffs...');
        for (const { company } of companies) {
            const tariffs = await Promise.all([
                prisma.tariff.create({
                    data: {
                        companyId: company.id,
                        name: `${company.brandName} Standard Rate`,
                        description: 'Standard city taxi rates',
                        baseFare: 3.50,
                        perKmRate: 2.20,
                        perMinuteRate: 0.50,
                        minimumFare: 5.00,
                        waitingFee: 0.30,
                        extraStopFee: 2.50,
                        isActive: true,
                        validFrom: new Date(),
                        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }
                }),
                prisma.tariff.create({
                    data: {
                        companyId: company.id,
                        name: `${company.brandName} Airport Rate`,
                        description: 'Special rates for airport trips',
                        baseFare: 5.00,
                        perKmRate: 2.80,
                        perMinuteRate: 0.60,
                        minimumFare: 15.00,
                        waitingFee: 0.50,
                        airportFee: 5.00,
                        extraStopFee: 5.00,
                        isActive: true,
                        validFrom: new Date(),
                        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }
                })
            ]);

            console.log(`✅ Created tariffs for ${company.brandName}`);
        }

        // Create drivers for each company
        console.log('🚗 Creating drivers with comprehensive data...');
        for (const { company } of companies) {
            for (let i = 1; i <= 3; i++) {
                const driverPassword = await bcrypt.hash('driver123', 10);

                // Create driver user
                const driverUser = await prisma.user.create({
                    data: {
                        firstName: `Driver${i}`,
                        lastName: `${company.brandName}`,
                        email: `driver${i}@${company.brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                        phone: `+123456789${company.id.slice(-1)}${i}`,
                        password: driverPassword,
                        role: 'DRIVER',
                        companyId: company.id,
                        isActive: true,
                        isVerified: true
                    }
                });

                // Create driver profile
                await prisma.companyDriver.create({
                    data: {
                        userId: driverUser.id,
                        companyId: company.id,
                        employmentType: 'FULL_TIME',
                        hireDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random hire date within last year
                        licenseNumber: `DL${Date.now()}${i}`,
                        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                        status: 'ACTIVE',
                        backgroundCheckStatus: 'APPROVED',
                        backgroundCheckExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        trainingCompletedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                        panicContactName: `Emergency Contact ${i}`,
                        panicContactPhone: `+1555555555${i}`
                    }
                });

                console.log(`✅ Created driver: ${driverUser.firstName} ${driverUser.lastName} for ${company.brandName}`);
            }
        }

        // Create dispatchers for each company
        console.log('📡 Creating dispatchers...');
        for (const { company } of companies) {
            const dispatcherPassword = await bcrypt.hash('dispatch123', 10);

            const dispatcher = await prisma.user.create({
                data: {
                    firstName: 'Dispatcher',
                    lastName: company.brandName.split(' ')[0],
                    email: `dispatch@${company.brandName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                    phone: `+1234567800${company.id.slice(-1)}`,
                    password: dispatcherPassword,
                    role: 'DISPATCHER',
                    companyId: company.id,
                    isActive: true,
                    isVerified: true
                }
            });

            console.log(`✅ Created dispatcher: ${dispatcher.firstName} ${dispatcher.lastName} for ${company.brandName}`);
        }

        // Create passengers/customers
        console.log('👥 Creating passengers...');
        const passengerNames = [
            { first: 'Alice', last: 'Cooper', email: 'alice.cooper@email.com' },
            { first: 'Bob', last: 'Wilson', email: 'bob.wilson@email.com' },
            { first: 'Carol', last: 'Davis', email: 'carol.davis@email.com' },
            { first: 'David', last: 'Miller', email: 'david.miller@email.com' },
            { first: 'Emma', last: 'Garcia', email: 'emma.garcia@email.com' },
            { first: 'Frank', last: 'Brown', email: 'frank.brown@email.com' },
            { first: 'Grace', last: 'Taylor', email: 'grace.taylor@email.com' },
            { first: 'Henry', last: 'Jones', email: 'henry.jones@email.com' }
        ];

        for (const passengerInfo of passengerNames) {
            const passengerPassword = await bcrypt.hash('passenger123', 10);

            const passenger = await prisma.user.create({
                data: {
                    firstName: passengerInfo.first,
                    lastName: passengerInfo.last,
                    email: passengerInfo.email,
                    phone: `+1555${Math.floor(Math.random() * 900) + 100}${Math.floor(Math.random() * 9000) + 1000}`,
                    password: passengerPassword,
                    role: 'PASSENGER',
                    isActive: true,
                    isVerified: true,
                    address: {
                        street: `${Math.floor(Math.random() * 9999) + 1} ${['Main', 'Oak', 'Pine', 'Elm', 'Park'][Math.floor(Math.random() * 5)]} St`,
                        city: ['New York', 'Los Angeles', 'Chicago'][Math.floor(Math.random() * 3)],
                        state: ['NY', 'CA', 'IL'][Math.floor(Math.random() * 3)],
                        zipCode: `${Math.floor(Math.random() * 90000) + 10000}`
                    },
                    preferences: {
                        preferredPaymentMethod: ['CASH', 'CARD', 'WALLET'][Math.floor(Math.random() * 3)],
                        notifications: {
                            email: true,
                            sms: true,
                            push: true
                        },
                        accessibility: {
                            wheelchairAccess: Math.random() > 0.9,
                            visualImpairment: Math.random() > 0.95,
                            hearingImpairment: Math.random() > 0.95
                        }
                    }
                }
            });

            console.log(`✅ Created passenger: ${passenger.firstName} ${passenger.lastName}`);
        }

        // Create sample vehicles for companies
        console.log('🚙 Creating vehicles...');
        for (const { company } of companies) {
            for (let i = 1; i <= 2; i++) {
                const vehicle = await prisma.vehicle.create({
                    data: {
                        make: ['Toyota', 'Honda', 'Ford', 'Chevrolet'][Math.floor(Math.random() * 4)],
                        model: ['Camry', 'Accord', 'Fusion', 'Malibu'][Math.floor(Math.random() * 4)],
                        year: 2020 + Math.floor(Math.random() * 4),
                        licensePlate: `ABC${Math.floor(Math.random() * 9000) + 1000}`,
                        vin: `1HGBH41JXMN${Math.floor(Math.random() * 900000) + 100000}`,
                        color: ['White', 'Black', 'Silver', 'Blue'][Math.floor(Math.random() * 4)],
                        capacity: 4,
                        fuelType: 'GASOLINE',
                        status: 'ACTIVE',
                        mileage: Math.floor(Math.random() * 100000) + 10000,
                        lastServiceDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
                        nextServiceDate: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000),
                        insuranceExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        registrationExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }
                });

                // Create company vehicle relationship
                await prisma.companyVehicle.create({
                    data: {
                        companyId: company.id,
                        vehicleId: vehicle.id,
                        ownershipType: 'COMPANY_OWNED',
                        acquisitionDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
                        status: 'ACTIVE',
                        maintenanceSchedule: {
                            lastMaintenance: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
                            nextMaintenance: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000),
                            maintenanceInterval: 90
                        }
                    }
                });

                console.log(`✅ Created vehicle: ${vehicle.make} ${vehicle.model} for ${company.brandName}`);
            }
        }

        // Get final counts
        const userCount = await prisma.user.count();
        const companyCount = await prisma.company.count();
        const driverCount = await prisma.companyDriver.count();
        const passengerCount = await prisma.user.count({ where: { role: 'PASSENGER' } });
        const vehicleCount = await prisma.vehicle.count();
        const zoneCount = await prisma.zone.count();
        const tariffCount = await prisma.tariff.count();
        const planCount = await prisma.subscriptionPlan.count();
        const billingCount = await prisma.billingRecord.count();
        const masterDataCount = {
            countries: await prisma.country.count(),
            currencies: await prisma.currency.count(),
            serviceCities: await prisma.serviceCity.count(),
            vehicleTypes: await prisma.vehicleTypeMaster.count(),
            documentTypes: await prisma.documentTypeMaster.count(),
            fareTypes: await prisma.fareType.count()
        };

        console.log('\n🎉 COMPREHENSIVE Database seeding completed successfully!');
        console.log(`📊 Final counts:`);
        console.log(`   Users: ${userCount}`);
        console.log(`   Companies: ${companyCount}`);
        console.log(`   Drivers: ${driverCount}`);
        console.log(`   Passengers: ${passengerCount}`);
        console.log(`   Vehicles: ${vehicleCount}`);
        console.log(`   Zones: ${zoneCount}`);
        console.log(`   Tariffs: ${tariffCount}`);
        console.log(`   Subscription Plans: ${planCount}`);
        console.log(`   Billing Records: ${billingCount}`);
        console.log(`\n🗃️ Master Data:`);
        console.log(`   Countries: ${masterDataCount.countries}`);
        console.log(`   Currencies: ${masterDataCount.currencies}`);
        console.log(`   Service Cities: ${masterDataCount.serviceCities}`);
        console.log(`   Vehicle Types: ${masterDataCount.vehicleTypes}`);
        console.log(`   Document Types: ${masterDataCount.documentTypes}`);
        console.log(`   Fare Types: ${masterDataCount.fareTypes}`);

        console.log('\n🔑 Login credentials:');
        console.log('Super Admin: admin@abtaxi.com / admin123');
        console.log('Company Owners: [owner-email] / owner123');
        console.log('Drivers: [driver-email] / driver123');
        console.log('Dispatchers: [dispatcher-email] / dispatch123');
        console.log('Passengers: [passenger-email] / passenger123');

        console.log('\n🏢 Company Details:');
        for (const { company, owner, plan } of companies) {
            console.log(`   ${company.brandName}:`);
            console.log(`     Owner: ${owner.email} / owner123`);
            console.log(`     Plan: ${plan.name} ($${plan.price}/month)`);
            console.log(`     Status: ${company.status}`);
            console.log(`     KYC: ${company.kycStatus}`);
        }

        console.log('\n💡 Features included:');
        console.log('✅ Master data (Countries, Currencies, Cities, Vehicle Types, Document Types, Fare Types)');
        console.log('✅ Comprehensive company profiles with full address and contact details');
        console.log('✅ Subscription plans with billing records and payment tracking');
        console.log('✅ Company settings and configurations');
        console.log('✅ Zones with geographical boundaries and surge pricing');
        console.log('✅ Multiple tariff structures per company');
        console.log('✅ Driver profiles with employment details and document tracking');
        console.log('✅ Vehicle fleet management with maintenance schedules');
        console.log('✅ Passenger profiles with preferences and accessibility options');
        console.log('✅ Global system configuration');
        console.log('✅ Ready for payments, billing, and reporting modules');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seedComprehensiveDatabase();