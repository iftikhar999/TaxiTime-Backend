const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting COMPLETE database seeding...\n');

  // 1. Create Super Admin User
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@abtaxi.com' },
    update: {
      firstName: 'Super',
      lastName: 'Admin',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true,
    },
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

  // 2. Create Subscription Plans
  const subscriptionPlans = [
    {
      name: 'Basic',
      description: 'Basic plan for small taxi companies',
      price: 99,
      billingCycle: 'monthly',
      driverLimit: 10,
      vehicleLimit: 10,
      features: ['basic_dispatch', 'driver_app', 'basic_reports'],
      isActive: true
    },
    {
      name: 'Professional',
      description: 'Professional plan for growing taxi companies',
      price: 199,
      billingCycle: 'monthly',
      driverLimit: 50,
      vehicleLimit: 50,
      features: ['advanced_dispatch', 'driver_app', 'passenger_app', 'advanced_reports', 'analytics'],
      isActive: true
    },
    {
      name: 'Enterprise',
      description: 'Enterprise plan for large taxi companies',
      price: 499,
      billingCycle: 'monthly',
      driverLimit: -1, // unlimited
      vehicleLimit: -1, // unlimited
      features: ['full_dispatch', 'driver_app', 'passenger_app', 'advanced_reports', 'analytics', 'api_access', 'white_label'],
      isActive: true
    }
  ];

  for (const plan of subscriptionPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
  }
  console.log('✅ Subscription plans created');

  // 3. Create Company Owners
  const owners = [
    {
      firstName: 'John',
      lastName: 'Smith',
      email: 'owner@citytaxi.com',
      phone: '+1234567891',
      companyName: 'City Taxi Co Ltd',
      companyCode: 'CITY001'
    },
    {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'owner@elitetaxi.com',
      phone: '+1234567892',
      companyName: 'Elite Taxi Service',
      companyCode: 'ELITE001'
    },
    {
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'owner@metrorides.com',
      phone: '+1234567893',
      companyName: 'Metro Rides Inc',
      companyCode: 'METRO001'
    }
  ];

  const ownerPassword = await bcrypt.hash('owner123', 10);
  const createdOwners = [];

  for (const ownerData of owners) {
    const owner = await prisma.user.upsert({
      where: { email: ownerData.email },
      update: {
        firstName: ownerData.firstName,
        lastName: ownerData.lastName,
        password: ownerPassword,
        role: 'OWNER',
        isActive: true,
        isVerified: true,
      },
      create: {
        firstName: ownerData.firstName,
        lastName: ownerData.lastName,
        email: ownerData.email,
        phone: ownerData.phone,
        password: ownerPassword,
        role: 'OWNER',
        isActive: true,
        isVerified: true,
      },
    });
    createdOwners.push({...owner, companyName: ownerData.companyName, companyCode: ownerData.companyCode});
  }
  console.log('✅ Company owners created:', createdOwners.length);

  // 4. Create Companies
  const professionalPlan = await prisma.subscriptionPlan.findFirst({ where: { name: 'Professional' } });
  const createdCompanies = [];

  for (const ownerData of createdOwners) {
    const company = await prisma.company.upsert({
      where: { ownerId: ownerData.id },
      update: {
        legalName: ownerData.companyName,
        brandName: ownerData.companyName,
        companyCode: ownerData.companyCode,
        ownerId: ownerData.id,
        isActive: true,
        subscriptionPlanId: professionalPlan?.id,
      },
      create: {
        legalName: ownerData.companyName,
        brandName: ownerData.companyName,
        companyCode: ownerData.companyCode,
        primaryContactEmail: ownerData.email,
        primaryContactPhone: ownerData.phone,
        primaryContactName: `${ownerData.firstName} ${ownerData.lastName}`,
        hqAddressLine1: '123 Business Street',
        hqCity: 'New York',
        hqState: 'NY',
        hqPostcode: '10001',
        hqCountry: 'USA',
        hqLatitude: 40.7128,
        hqLongitude: -74.0060,
        ownerId: ownerData.id,
        isActive: true,
        subscriptionPlanId: professionalPlan?.id,
        status: 'ACTIVE',
        timezone: 'America/New_York',
        billingCurrency: 'USD',
      },
    });
    createdCompanies.push(company);
  }
  console.log('✅ Companies created:', createdCompanies.length);

  // 5. Create Drivers for each company
  const driverPassword = await bcrypt.hash('driver123', 10);
  const createdDrivers = [];

  for (let i = 0; i < createdCompanies.length; i++) {
    const company = createdCompanies[i];
    
    // Create 3 drivers per company
    for (let j = 1; j <= 3; j++) {
      const driverNumber = (i * 3) + j;
      const driver = await prisma.user.upsert({
        where: { email: `driver${driverNumber}@${company.companyCode?.toLowerCase()}.com` },
        update: {
          firstName: `Driver${driverNumber}`,
          lastName: 'Test',
          password: driverPassword,
          role: 'DRIVER',
          isActive: true,
          isVerified: true,
          companyId: company.id,
        },
        create: {
          firstName: `Driver${driverNumber}`,
          lastName: 'Test',
          email: `driver${driverNumber}@${company.companyCode?.toLowerCase()}.com`,
          phone: `+123456789${driverNumber.toString().padStart(2, '0')}`,
          password: driverPassword,
          role: 'DRIVER',
          isActive: true,
          isVerified: true,
          companyId: company.id,
        },
      });
      createdDrivers.push(driver);

      // Create CompanyDriver relationship
      await prisma.companyDriver.upsert({
        where: {
          companyId_userId: {
            companyId: company.id,
            userId: driver.id
          }
        },
        update: {
          employmentType: 'FULL_TIME',
          hireDate: new Date(),
          licenseNumber: `DL${driverNumber.toString().padStart(6, '0')}`,
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE'
        },
        create: {
          companyId: company.id,
          userId: driver.id,
          employmentType: 'FULL_TIME',
          hireDate: new Date(),
          licenseNumber: `DL${driverNumber.toString().padStart(6, '0')}`,
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE'
        }
      });
    }
  }
  console.log('✅ Drivers created:', createdDrivers.length);

  // 6. Create Vehicles for each driver
  const vehicleTypes = ['SEDAN', 'SUV', 'HATCHBACK'];
  const vehicleMakes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan'];
  const vehicleModels = {
    Toyota: ['Camry', 'Corolla', 'Prius'],
    Honda: ['Civic', 'Accord', 'CR-V'],
    Ford: ['Focus', 'Fusion', 'Escape'],
    Chevrolet: ['Malibu', 'Cruze', 'Equinox'],
    Nissan: ['Altima', 'Sentra', 'Rogue']
  };

  for (let i = 0; i < createdDrivers.length; i++) {
    const driver = createdDrivers[i];
    const make = vehicleMakes[i % vehicleMakes.length];
    const model = vehicleModels[make][i % vehicleModels[make].length];
    
    await prisma.vehicle.upsert({
      where: { licensePlate: `NYC${(i + 1000).toString()}` },
      update: {
        make,
        model,
        year: 2020 + (i % 4),
        color: ['White', 'Black', 'Silver', 'Blue', 'Red'][i % 5],
        vehicleType: vehicleTypes[i % vehicleTypes.length],
        companyId: driver.companyId,
        driverId: driver.id,
        isActive: true,
      },
      create: {
        make,
        model,
        year: 2020 + (i % 4),
        color: ['White', 'Black', 'Silver', 'Blue', 'Red'][i % 5],
        licensePlate: `NYC${(i + 1000).toString()}`,
        vehicleType: vehicleTypes[i % vehicleTypes.length],
        companyId: driver.companyId,
        driverId: driver.id,
        capacity: 4,
        isActive: true,
      }
    });
  }
  console.log('✅ Vehicles created:', createdDrivers.length);

  // 7. Create Zones for each company
  const sampleZones = [
    {
      name: 'Downtown',
      coordinates: [
        [40.7128, -74.0060],
        [40.7614, -73.9776],
        [40.7489, -73.9680],
        [40.7128, -74.0060]
      ]
    },
    {
      name: 'Airport Zone',
      coordinates: [
        [40.6892, -74.1745],
        [40.6892, -74.1545],
        [40.7092, -74.1545],
        [40.7092, -74.1745],
        [40.6892, -74.1745]
      ]
    },
    {
      name: 'Midtown',
      coordinates: [
        [40.7414, -74.0057],
        [40.7614, -73.9776],
        [40.7714, -73.9776],
        [40.7514, -74.0057],
        [40.7414, -74.0057]
      ]
    }
  ];

  for (const company of createdCompanies) {
    for (let i = 0; i < sampleZones.length; i++) {
      const zone = sampleZones[i];
      await prisma.companyZone.upsert({
        where: {
          id: `${company.id}-${zone.name}`
        },
        update: {
          polygonGeojson: {
            type: 'Polygon',
            coordinates: [zone.coordinates]
          },
          isActive: true,
        },
        create: {
          id: `${company.id}-${zone.name}`,
          companyId: company.id,
          zoneName: zone.name,
          zoneType: 'SERVICE_AREA',
          description: `${zone.name} service area`,
          polygonGeojson: {
            type: 'Polygon',
            coordinates: [zone.coordinates]
          },
          isActive: true,
        }
      });
    }
  }
  console.log('✅ Company zones created');

  // 8. Create Tariffs for each company
  const tariffTemplates = [
    {
      name: 'Economy',
      description: 'Basic affordable rides',
      serviceMode: 'STANDARD',
      vehicleType: 'SEDAN',
      baseFare: 5.00,
      perKmRate: 1.50,
      perMinuteRate: 0.25,
      minimumFare: 8.00,
      waitingFeePerMinute: 0.50,
      cancellationFee: 3.00,
      bookingFee: 1.00,
    },
    {
      name: 'Premium',
      description: 'Luxury rides with premium vehicles',
      serviceMode: 'PREMIUM',
      vehicleType: 'SUV',
      baseFare: 8.00,
      perKmRate: 2.50,
      perMinuteRate: 0.40,
      minimumFare: 12.00,
      waitingFeePerMinute: 0.75,
      cancellationFee: 5.00,
      bookingFee: 2.00,
    },
    {
      name: 'Airport',
      description: 'Special rates for airport trips',
      serviceMode: 'AIRPORT',
      vehicleType: 'SEDAN',
      baseFare: 10.00,
      perKmRate: 2.00,
      perMinuteRate: 0.30,
      minimumFare: 15.00,
      waitingFeePerMinute: 0.60,
      cancellationFee: 7.50,
      bookingFee: 3.00,
    }
  ];

  for (const company of createdCompanies) {
    for (const tariffTemplate of tariffTemplates) {
      await prisma.companyTariff.upsert({
        where: {
          id: `${company.id}-${tariffTemplate.name}`
        },
        update: {
          ...tariffTemplate,
          isActive: true,
          currency: 'USD',
        },
        create: {
          id: `${company.id}-${tariffTemplate.name}`,
          ...tariffTemplate,
          companyId: company.id,
          isActive: true,
          currency: 'USD',
        }
      });
    }
  }
  console.log('✅ Company tariffs created');

  // 9. Create Passengers
  const passengerPassword = await bcrypt.hash('passenger123', 10);
  const passengers = [];

  for (let i = 1; i <= 5; i++) {
    const passenger = await prisma.user.upsert({
      where: { email: `passenger${i}@example.com` },
      update: {
        firstName: `Passenger${i}`,
        lastName: 'Test',
        password: passengerPassword,
        role: 'PASSENGER',
        isActive: true,
        isVerified: true,
      },
      create: {
        firstName: `Passenger${i}`,
        lastName: 'Test',
        email: `passenger${i}@example.com`,
        phone: `+1234567${String(8000 + i).padStart(4, '0')}`,
        password: passengerPassword,
        role: 'PASSENGER',
        isActive: true,
        isVerified: true,
      },
    });
    passengers.push(passenger);
  }
  console.log('✅ Passengers created:', passengers.length);

  // 10. Create Global Configurations
  const globalConfigs = [
    { 
      key: 'DEFAULT_CURRENCY', 
      category: 'SYSTEM',
      displayName: 'Default Currency',
      description: 'Default system currency',
      dataType: 'STRING',
      value: 'USD'
    },
    { 
      key: 'DEFAULT_TIMEZONE', 
      category: 'SYSTEM',
      displayName: 'Default Timezone',
      description: 'Default system timezone',
      dataType: 'STRING',
      value: 'America/New_York'
    },
    { 
      key: 'DEFAULT_LANGUAGE', 
      category: 'SYSTEM',
      displayName: 'Default Language',
      description: 'Default system language',
      dataType: 'STRING',
      value: 'en'
    },
    { 
      key: 'MIN_FARE_AMOUNT', 
      category: 'BUSINESS',
      displayName: 'Minimum Fare',
      description: 'Minimum fare amount across all companies',
      dataType: 'NUMBER',
      value: 5.00
    },
    { 
      key: 'MAX_DRIVER_RADIUS_KM', 
      category: 'BUSINESS',
      displayName: 'Max Driver Radius',
      description: 'Maximum radius for driver search',
      dataType: 'NUMBER',
      value: 10
    },
    { 
      key: 'BOOKING_TIMEOUT_SECONDS', 
      category: 'BUSINESS',
      displayName: 'Booking Timeout',
      description: 'Booking timeout in seconds',
      dataType: 'NUMBER',
      value: 300
    },
    { 
      key: 'DRIVER_LOCATION_UPDATE_INTERVAL', 
      category: 'TECHNICAL',
      displayName: 'Location Update Interval',
      description: 'Driver location update interval in seconds',
      dataType: 'NUMBER',
      value: 30
    }
  ];

  for (const config of globalConfigs) {
    await prisma.globalConfiguration.upsert({
      where: { key: config.key },
      update: { 
        category: config.category,
        displayName: config.displayName,
        description: config.description,
        dataType: config.dataType,
        value: config.value
      },
      create: config
    });
  }
  console.log('✅ Global configurations created');

  // 11. Create Vehicle Types
  const vehicleTypesList = [
    { name: 'SEDAN', code: 'SEDAN', capacity: 4, description: 'Standard sedan car' },
    { name: 'SUV', code: 'SUV', capacity: 6, description: 'Sport Utility Vehicle' },
    { name: 'HATCHBACK', code: 'HATCHBACK', capacity: 4, description: 'Compact hatchback car' },
    { name: 'VAN', code: 'VAN', capacity: 8, description: 'Large van for groups' },
    { name: 'LUXURY', code: 'LUXURY', capacity: 4, description: 'Luxury premium vehicle' }
  ];

  for (const vType of vehicleTypesList) {
    await prisma.vehicleTypeMaster.upsert({
      where: { name: vType.name },
      update: vType,
      create: vType
    });
  }
  console.log('✅ Vehicle types created');

  // 12. Create Countries and Service Cities
  const country = await prisma.country.upsert({
    where: { code: 'US' },
    update: { name: 'United States', currency: 'USD' },
    create: { 
      code: 'US', 
      name: 'United States', 
      currency: 'USD',
      isActive: true 
    }
  });

  const cities = [
    { name: 'New York', state: 'NY', latitude: 40.7128, longitude: -74.0060 },
    { name: 'Los Angeles', state: 'CA', latitude: 34.0522, longitude: -118.2437 },
    { name: 'Chicago', state: 'IL', latitude: 41.8781, longitude: -87.6298 }
  ];

  for (const city of cities) {
    await prisma.serviceCity.upsert({
      where: { 
        name_countryId: {
          name: city.name,
          countryId: country.id
        }
      },
      update: {
        ...city,
        timezone: 'America/New_York'
      },
      create: {
        ...city,
        code: city.name.toUpperCase().replace(/\s+/g, '_'),
        countryId: country.id,
        timezone: 'America/New_York',
        isActive: true
      }
    });
  }
  console.log('✅ Countries and service cities created');

  // 13. Create Currencies
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' }
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: currency,
      create: { ...currency, isActive: true }
    });
  }
  console.log('✅ Currencies created');

  console.log('\n🎉 COMPLETE Database seeding finished successfully!\n');
  console.log('📝 LOGIN CREDENTIALS:');
  console.log('🔐 Super Admin: admin@abtaxi.com / admin123');
  console.log('🏢 Company Owners:');
  console.log('   • owner@citytaxi.com / owner123 (City Taxi Co Ltd)');
  console.log('   • owner@elitetaxi.com / owner123 (Elite Taxi Service)');
  console.log('   • owner@metrorides.com / owner123 (Metro Rides Inc)');
  console.log('🚗 Drivers: driver1@city001.com, driver2@city001.com, etc. / driver123');
  console.log('👥 Passengers: passenger1@example.com, passenger2@example.com, etc. / passenger123');
  console.log('\n📊 DATA SUMMARY:');
  console.log(`   • ${createdCompanies.length} Companies`);
  console.log(`   • ${createdDrivers.length} Drivers`);
  console.log(`   • ${createdDrivers.length} Vehicles`);
  console.log(`   • ${createdCompanies.length * 3} Zones`);
  console.log(`   • ${createdCompanies.length * 3} Tariffs`);
  console.log(`   • ${passengers.length} Passengers`);
  console.log('   • 3 Subscription Plans');
  console.log('   • 7 Global Configurations');
  console.log('   • 5 Vehicle Types');
  console.log('   • 3 Service Cities');
  console.log('   • 3 Currencies\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });