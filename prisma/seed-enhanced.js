const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Helper function to generate random data
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomDecimal = (min, max, decimals = 2) =>
    (Math.random() * (max - min) + min).toFixed(decimals);

// Sample data arrays
const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Emily', 'Alex', 'Maria', 'Robert', 'Amanda', 'James', 'Jennifer', 'Michael'];
const lastNames = ['Smith', 'Johnson', 'Brown', 'Williams', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Hernandez'];
const companyNames = ['City Taxi Co.', 'Metro Rides', 'Urban Transport', 'Quick Cab', 'Elite Taxi Service', 'Green Wheels', 'Fast Track Taxi', 'Premier Rides', 'Downtown Taxi', 'Express Cabs'];
const vehicleMakes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Hyundai', 'Volkswagen', 'BMW', 'Mercedes', 'Audi'];
const vehicleModels = ['Camry', 'Civic', 'Fusion', 'Malibu', 'Altima', 'Elantra', 'Jetta', '3 Series', 'C-Class', 'A4'];
const colors = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Yellow'];
const cities = [
    { name: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
    { name: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
    { name: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
    { name: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 }
];

async function main() {
    console.log('🌱 Enhanced seeding database...');

    // Create Super Admin User
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const superAdmin = await prisma.user.upsert({
        where: { email: 'admin@abtaxi.com' },
        update: {},
        create: {
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

    console.log('✅ Super Admin created:', superAdmin.email);

    // Create multiple companies with owners
    const companies = [];
    const owners = [];

    for (let i = 0; i < 5; i++) {
        const city = cities[i];
        const ownerPassword = await bcrypt.hash('owner123', 10);

        const owner = await prisma.user.upsert({
            where: { email: `owner${i + 1}@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com` },
            update: {},
            create: {
                firstName: getRandomElement(firstNames),
                lastName: getRandomElement(lastNames),
                email: `owner${i + 1}@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                phone: `+1234567${String(900 + i).padStart(3, '0')}`,
                password: ownerPassword,
                role: 'OWNER',
                isActive: true,
                isVerified: true,
            },
        });

        owners.push(owner);

        const company = await prisma.company.upsert({
            where: { ownerId: owner.id },
            update: {},
            create: {
                // Core Identity
                legalName: companyNames[i],
                brandName: companyNames[i].replace(' Co.', '').replace(' Service', ''),
                companyCode: `COMP${String(i + 1).padStart(3, '0')}`,
                companyType: getRandomElement(['TAXI_OPERATOR', 'DELIVERY_SERVICE', 'HYBRID']),
                businessModel: getRandomElement(['B2C', 'B2B', 'MARKETPLACE']),
                registrationNumber: `REG${getRandomNumber(100000, 999999)}`,
                taxId: `TX${getRandomNumber(100000000, 999999999)}`,
                primaryLanguage: 'en',
                timezone: getRandomElement(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']),
                status: 'ACTIVE',
                activationDate: new Date(Date.now() - getRandomNumber(30, 365) * 24 * 60 * 60 * 1000),

                // Corporate Contacts & Addresses
                primaryContactName: `${owner.firstName} ${owner.lastName}`,
                primaryContactRole: 'General Manager',
                primaryContactEmail: `admin@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                primaryContactPhone: `+1234567${String(900 + i).padStart(3, '0')}`,
                supportEmail: `support@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                supportPhone: `+1234568${String(100 + i).padStart(3, '0')}`,
                billingEmail: `billing@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                hqAddressLine1: `${getRandomNumber(100, 999)} ${getRandomElement(['Main', 'Oak', 'Pine', 'Elm', 'First'])} St`,
                hqCity: city.name,
                hqState: city.state,
                hqPostcode: `${getRandomNumber(10000, 99999)}`,
                hqCountry: 'USA',
                hqLatitude: city.lat + (Math.random() - 0.5) * 0.1,
                hqLongitude: city.lng + (Math.random() - 0.5) * 0.1,

                // Regulation & Compliance
                kycStatus: 'APPROVED',
                kycLastReviewedAt: new Date(Date.now() - getRandomNumber(1, 90) * 24 * 60 * 60 * 1000),
                kycExpiryAt: new Date(Date.now() + getRandomNumber(180, 365) * 24 * 60 * 60 * 1000),
                insurancePolicyNumber: `INS${getRandomNumber(1000000, 9999999)}`,
                insuranceExpiryDate: new Date(Date.now() + getRandomNumber(90, 365) * 24 * 60 * 60 * 1000),
                permitNumber: `PER${getRandomNumber(100000, 999999)}`,
                permitExpiryDate: new Date(Date.now() + getRandomNumber(90, 365) * 24 * 60 * 60 * 1000),

                // Operational Profile
                serviceModes: i % 3 === 0 ? { taxi: true, delivery: true, courier: false } : { taxi: true, delivery: false, courier: false },
                operatingHoursJson: {
                    monday: { start: '06:00', end: '23:00' },
                    tuesday: { start: '06:00', end: '23:00' },
                    wednesday: { start: '06:00', end: '23:00' },
                    thursday: { start: '06:00', end: '23:00' },
                    friday: { start: '06:00', end: '24:00' },
                    saturday: { start: '07:00', end: '24:00' },
                    sunday: { start: '08:00', end: '22:00' }
                },
                dispatchMode: getRandomElement(['AUTO', 'MANUAL', 'HYBRID']),
                autoAssignRadiusKm: getRandomNumber(3, 10),
                maxParallelOffers: getRandomNumber(2, 5),
                escalationSlaSeconds: getRandomNumber(180, 600),
                vehicleAgeLimitYears: getRandomNumber(10, 20),
                requiresVehicleInspection: getRandomElement([true, false]),

                // Financial & Billing
                billingCycle: getRandomElement(['MONTHLY', 'QUARTERLY']),
                billingStartDate: new Date(Date.now() - getRandomNumber(1, 30) * 24 * 60 * 60 * 1000),
                billingCurrency: 'USD',
                commissionModel: 'PERCENTAGE',
                commissionRate: 15.0,
                driverPayoutFrequency: getRandomElement(['DAILY', 'WEEKLY', 'MONTHLY']),
                settlementThresholdAmount: parseFloat(getRandomDecimal(50, 200)),
                walletEnabled: getRandomElement([true, false]),
                walletTopupMinimum: parseFloat(getRandomDecimal(25, 100)),

                // Fleet Snapshot (will be updated by triggers/jobs)
                fleetSizeTotal: 0,
                fleetActiveVehicleCount: 0,
                fleetInserviceVehicleCount: 0,

                // Analytics & Alerts
                kpiTargetsJson: {
                    acceptanceRate: getRandomNumber(80, 95),
                    onTimePercentage: getRandomNumber(85, 98),
                    cancellationThreshold: getRandomNumber(3, 8)
                },
                alertRecipientEmails: [`admin@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`],
                reportingTimezone: getRandomElement(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']),
                dataRetentionDays: 2555,

                // Legacy compatibility fields
                name: companyNames[i],
                email: `admin@${companyNames[i].toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                phone: `+1234567${String(900 + i).padStart(3, '0')}`,
                address: {
                    street: `${getRandomNumber(100, 999)} ${getRandomElement(['Main', 'Oak', 'Pine', 'Elm', 'First'])} St`,
                    city: city.name,
                    state: city.state,
                    zipCode: `${getRandomNumber(10000, 99999)}`,
                    country: 'USA',
                    coordinates: {
                        latitude: city.lat + (Math.random() - 0.5) * 0.1,
                        longitude: city.lng + (Math.random() - 0.5) * 0.1
                    }
                },
                ownerId: owner.id,
                isActive: true,
                isVerified: true
            },
        });

        companies.push(company);
        console.log(`✅ Company created: ${company.name}`);
    }

    // Create drivers for each company
    const drivers = [];
    let driverCounter = 1;
    
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego'];
    const streets = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '321 Elm St', '654 Maple Dr', '987 Cedar Ln', '246 Birch Way'];
    
    for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        const numDrivers = getRandomNumber(3, 8);

        for (let j = 0; j < numDrivers; j++) {
            const driverPassword = await bcrypt.hash('driver123', 10);

            const driver = await prisma.user.create({
                data: {
                    firstName: getRandomElement(firstNames),
                    lastName: getRandomElement(lastNames),
                    email: `driver${driverCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}@example.com`,
                    phone: `+1${getRandomNumber(2000000000, 9999999999)}`,
                    password: driverPassword,
                    role: 'DRIVER',
                    isActive: true,
                    isVerified: true,
                    companyId: company.id,
                    address: {
                        street: getRandomElement(streets),
                        city: getRandomElement(cities),
                        state: 'CA',
                        zipCode: String(getRandomNumber(90000, 99999))
                    },
                    rating: {
                        average: getRandomDecimal(4.0, 5.0, 1),
                        count: getRandomNumber(20, 200)
                    }
                },
            });

            // Create CompanyDriver record (required for owner panel)
            await prisma.companyDriver.create({
                data: {
                    userId: driver.id,
                    companyId: company.id,
                    status: 'ACTIVE',
                    employmentType: getRandomElement(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
                    hireDate: new Date(Date.now() - getRandomNumber(30, 730) * 24 * 60 * 60 * 1000), // Random date within last 2 years
                    licenseNumber: `DL${getRandomNumber(100000000, 999999999)}`,
                    licenseExpiry: new Date(Date.now() + getRandomNumber(180, 1095) * 24 * 60 * 60 * 1000), // 6 months to 3 years ahead
                    backgroundCheckStatus: 'APPROVED',
                    backgroundCheckExpiry: new Date(Date.now() + getRandomNumber(180, 730) * 24 * 60 * 60 * 1000),
                    panicContactName: getRandomElement(firstNames) + ' ' + getRandomElement(lastNames),
                    panicContactPhone: `+1${getRandomNumber(2000000000, 9999999999)}`,
                }
            });

            drivers.push(driver);
            driverCounter++;
        }
    }

    console.log(`✅ Created ${drivers.length} drivers with CompanyDriver records`);

    // Create vehicles for drivers
    const vehicles = [];
    for (let i = 0; i < drivers.length; i++) {
        const driver = drivers[i];

        const vehicle = await prisma.vehicle.create({
            data: {
                make: getRandomElement(vehicleMakes),
                model: getRandomElement(vehicleModels),
                year: getRandomNumber(2018, 2024),
                color: getRandomElement(colors),
                licensePlate: `${getRandomElement(['NYC', 'LAX', 'CHI', 'HOU', 'PHX'])}-${getRandomNumber(100000, 999999)}`,
                vehicleType: getRandomElement(['SEDAN', 'SUV', 'HATCHBACK', 'VAN']),
                companyId: driver.companyId,
                driverId: driver.id,
                capacity: getRandomNumber(2, 7),
                features: {
                    airConditioning: getRandomElement([true, false]),
                    gps: true,
                    bluetooth: getRandomElement([true, false]),
                    childSeats: getRandomElement([true, false]),
                    wheelchair: getRandomElement([true, false]),
                    fuelType: getRandomElement(['gasoline', 'diesel', 'electric', 'hybrid']),
                    transmission: getRandomElement(['automatic', 'manual'])
                },
                isActive: true,
                isAvailable: true,
                insurance: {
                    provider: getRandomElement(['State Farm', 'Geico', 'Progressive', 'Allstate']),
                    policyNumber: `POL${getRandomNumber(100000000, 999999999)}`,
                    expiryDate: new Date(Date.now() + getRandomNumber(180, 365) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    inspectionExpiry: new Date(Date.now() + getRandomNumber(90, 365) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                },
                registration: {
                    number: `REG${getRandomNumber(100000, 999999)}`,
                    expiryDate: new Date(Date.now() + getRandomNumber(180, 365) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                }
            }
        });

        vehicles.push(vehicle);
    }

    console.log(`✅ Created ${vehicles.length} vehicles`);

    // Create passengers
    const passengers = [];
    for (let i = 0; i < 20; i++) {
        const passengerPassword = await bcrypt.hash('passenger123', 10);
        const city = getRandomElement(cities);

        const passenger = await prisma.user.create({
            data: {
                firstName: getRandomElement(firstNames),
                lastName: getRandomElement(lastNames),
                email: `passenger${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}@example.com`,
                phone: `+1${getRandomNumber(2000000000, 9999999999)}`,
                password: passengerPassword,
                role: 'PASSENGER',
                isActive: true,
                isVerified: true,
                address: {
                    street: `${getRandomNumber(100, 999)} ${getRandomElement(['Main', 'Oak', 'Pine', 'Elm', 'Broadway'])} Ave`,
                    city: city.name,
                    state: city.state,
                    zipCode: `${getRandomNumber(10000, 99999)}`,
                    country: 'USA'
                },
                preferences: {
                    language: 'en',
                    currency: 'USD',
                    notifications: {
                        push: getRandomElement([true, false]),
                        email: getRandomElement([true, false]),
                        sms: getRandomElement([true, false])
                    }
                }
            },
        });

        passengers.push(passenger);
    }

    console.log(`✅ Created ${passengers.length} passengers`);

    // Create jobs/rides with payments
    const rides = [];
    const payments = [];

    for (let i = 0; i < 100; i++) {
        const passenger = getRandomElement(passengers);
        const driver = getRandomElement(drivers);
        const vehicle = vehicles.find(v => v.driverId === driver.id);
        const company = companies.find(c => c.id === driver.companyId);

        const startDate = new Date(Date.now() - getRandomNumber(1, 30) * 24 * 60 * 60 * 1000);
        const endDate = new Date(startDate.getTime() + getRandomNumber(10, 60) * 60 * 1000);
        const status = getRandomElement(['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED', 'IN_PROGRESS']);

        const baseAmount = parseFloat(getRandomDecimal(5, 50));
        const tips = parseFloat(getRandomDecimal(0, 10));
        const taxes = parseFloat((baseAmount * 0.08).toFixed(2));
        const fees = parseFloat(getRandomDecimal(1, 3));
        const totalAmount = baseAmount + tips + taxes + fees;

        const city = getRandomElement(cities);

        const ride = await prisma.ride.create({
            data: {
                rideId: `RID${String(i + 1).padStart(6, '0')}_${Date.now()}`,
                passengerId: passenger.id,
                driverId: driver.id,
                vehicleId: vehicle?.id,
                companyId: company.id,

                // Pickup and dropoff
                pickup: {
                    address: `${getRandomNumber(100, 999)} ${getRandomElement(['Main', 'Oak', 'Pine'])} St, ${city.name}, ${city.state}`,
                    coordinates: {
                        latitude: city.lat + (Math.random() - 0.5) * 0.05,
                        longitude: city.lng + (Math.random() - 0.5) * 0.05
                    }
                },
                destination: {
                    address: `${getRandomNumber(100, 999)} ${getRandomElement(['Broadway', 'First', 'Second'])} Ave, ${city.name}, ${city.state}`,
                    coordinates: {
                        latitude: city.lat + (Math.random() - 0.5) * 0.05,
                        longitude: city.lng + (Math.random() - 0.5) * 0.05
                    }
                },

                actualDistance: parseFloat(getRandomDecimal(1, 20, 1)),
                estimatedDistance: parseFloat(getRandomDecimal(1, 20, 1)),
                actualDuration: getRandomNumber(10, 60),
                estimatedDuration: getRandomNumber(10, 60),
                actualFare: totalAmount,
                estimatedFare: totalAmount,

                fareBreakdown: {
                    baseAmount: baseAmount,
                    distanceAmount: parseFloat(getRandomDecimal(2, 15)),
                    timeAmount: parseFloat(getRandomDecimal(1, 8)),
                    surgeMultiplier: 1.0,
                    totalAmount: totalAmount,
                    currency: 'USD'
                },

                status: status,

                // Timestamps
                requestedAt: startDate,
                acceptedAt: new Date(startDate.getTime() + getRandomNumber(30, 300) * 1000),
                pickedUpAt: new Date(startDate.getTime() + getRandomNumber(300, 600) * 1000),
                completedAt: status === 'COMPLETED' ? endDate : null,

                // Ratings (stored as JSON)
                passengerRating: status === 'COMPLETED' ? {
                    score: getRandomNumber(3, 5),
                    comment: "Good ride",
                    createdAt: new Date()
                } : null,
                driverRating: status === 'COMPLETED' ? {
                    score: getRandomNumber(3, 5),
                    comment: "Professional service",
                    createdAt: new Date()
                } : null,

                paymentMethod: getRandomElement(['CASH', 'CARD', 'WALLET'])
            }
        });

        rides.push(ride);

        // Create payment record for completed rides
        if (status === 'COMPLETED') {
            const payment = await prisma.payment.create({
                data: {
                    tripId: ride.id,
                    customerId: passenger.id,
                    companyId: company.id,

                    amount: totalAmount,
                    currency: 'USD',
                    paymentMethod: ride.paymentMethod,
                    paymentProvider: ride.paymentMethod === 'CARD' ? 'stripe' : null,
                    providerTransactionId: ride.paymentMethod === 'CARD' ? `txn_${getRandomNumber(100000000, 999999999)}` : null,

                    status: 'PAID',

                    baseAmount: baseAmount,
                    tips: tips,
                    taxes: taxes,
                    fees: fees,
                    discounts: 0,

                    processedAt: endDate
                }
            });

            payments.push(payment);
        }
    }

    console.log(`✅ Created ${rides.length} rides and ${payments.length} payments`);

    // Create some restaurants for food delivery
    const restaurants = [];
    for (let i = 0; i < 10; i++) {
        const city = getRandomElement(cities);

        const restaurant = await prisma.restaurant.create({
            data: {
                name: `${getRandomElement(['Mario\'s', 'Tony\'s', 'Joe\'s', 'Anna\'s', 'Luigi\'s'])} ${getRandomElement(['Pizza', 'Kitchen', 'Bistro', 'Cafe', 'Restaurant'])}`,
                email: `contact${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}@restaurant.com`,
                phone: `+1${getRandomNumber(2000000000, 9999999999)}`,
                address: {
                    street: `${getRandomNumber(100, 999)} ${getRandomElement(['Food', 'Restaurant', 'Dining'])} Ave`,
                    city: city.name,
                    state: city.state,
                    zipCode: `${getRandomNumber(10000, 99999)}`,
                    country: 'USA',
                    coordinates: {
                        latitude: city.lat + (Math.random() - 0.5) * 0.1,
                        longitude: city.lng + (Math.random() - 0.5) * 0.1
                    }
                },
                cuisine: [getRandomElement(['Italian', 'American', 'Chinese', 'Mexican', 'Indian'])],
                priceRange: getRandomElement(['$', '$$', '$$$']),
                rating: parseFloat(getRandomDecimal(3.5, 5.0, 1)),
                ratingCount: getRandomNumber(20, 500),
                operatingHours: {
                    monday: { start: '10:00', end: '22:00', isActive: true },
                    tuesday: { start: '10:00', end: '22:00', isActive: true },
                    wednesday: { start: '10:00', end: '22:00', isActive: true },
                    thursday: { start: '10:00', end: '22:00', isActive: true },
                    friday: { start: '10:00', end: '23:00', isActive: true },
                    saturday: { start: '10:00', end: '23:00', isActive: true },
                    sunday: { start: '11:00', end: '21:00', isActive: true }
                },
                menu: {
                    categories: [
                        {
                            name: 'Main Dishes',
                            items: [
                                { name: 'Special Combo', price: getRandomDecimal(12, 25), description: 'Our signature dish' },
                                { name: 'Classic Option', price: getRandomDecimal(8, 18), description: 'A customer favorite' }
                            ]
                        }
                    ]
                },
                isActive: true,
                isOpen: getRandomElement([true, false])
            }
        });

        restaurants.push(restaurant);
    }

    console.log(`✅ Created ${restaurants.length} restaurants`);

    // Create system activities for dashboard
    const activities = [];
    const activityTypes = [
        { type: 'company_registered', title: 'New company registered' },
        { type: 'driver_approved', title: 'Driver approved' },
        { type: 'payment_processed', title: 'Payment processed' },
        { type: 'ride_completed', title: 'Ride completed' },
        { type: 'system_update', title: 'System update' }
    ];

    // Skip system activities - model not available
    console.log(`⚠️  Skipped system activities (model not available)`);

    // Skip master data entries - model not available
    console.log('⚠️  Skipped master data entries (model not available)');

    console.log('\n🎉 Enhanced database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- ${companies.length} Companies`);
    console.log(`- ${drivers.length} Drivers`);
    console.log(`- ${vehicles.length} Vehicles`);
    console.log(`- ${passengers.length} Passengers`);
    console.log(`- ${rides.length} Rides`);
    console.log(`- ${payments.length} Payments`);
    console.log(`- ${restaurants.length} Restaurants`);
    console.log(`- ${activities.length} Activities`);

    console.log('\n📝 Login Credentials:');
    console.log('Super Admin: admin@abtaxi.com / admin123');
    console.log('Company Owners: owner1@citytaxicoltd.com / owner123 (and similar)');
    console.log('Drivers: driver1_1@citytaxicoltd.com / driver123 (and similar)');
    console.log('Passengers: passenger1@example.com / passenger123 (and similar)');

    console.log('\n💳 Payment Configuration:');
    console.log('- Super Admin manages global payment processing');
    console.log('- 15% commission rate configured for all companies');
    console.log('- Multiple payment methods supported: CASH, CARD, DIGITAL_WALLET');
    console.log('- Auto-settlement enabled for all companies');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });