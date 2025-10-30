const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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

  // Create a sample taxi company owner
  const ownerPassword = await bcrypt.hash('owner123', 10);
  
  const owner = await prisma.user.upsert({
    where: { email: 'owner@citytaxi.com' },
    update: {},
    create: {
      firstName: 'John',
      lastName: 'Smith',
      email: 'owner@citytaxi.com',
      phone: '+1234567891',
      password: ownerPassword,
      role: 'OWNER',
      isActive: true,
      isVerified: true,
    },
  });

  console.log('✅ Company Owner created:', owner.email);

  // Create a sample taxi company
  const company = await prisma.company.upsert({
    where: { email: 'admin@citytaxi.com' },
    update: {},
    create: {
      name: 'City Taxi Co.',
      email: 'admin@citytaxi.com',
      phone: '+1234567892',
      ownerId: owner.id,
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060
        }
      },
      services: ['TAXI'],
      subscription: {
        package: 'PREMIUM',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        maxDrivers: 50,
        maxVehicles: 50,
        features: ['taxi', 'food_delivery', 'courier']
      },
      settings: {
        autoDispatch: true,
        allowCashPayments: true,
        requireDriverApproval: true,
        minimumFare: 5.00,
        currency: 'USD',
        timezone: 'America/New_York',
        language: 'en'
      },
      isActive: true,
      isVerified: true
    },
  });

  console.log('✅ Sample Company created:', company.name);

  // Create sample driver
  const driverPassword = await bcrypt.hash('driver123', 10);
  
  const driver = await prisma.user.upsert({
    where: { email: 'driver@citytaxi.com' },
    update: {},
    create: {
      firstName: 'Mike',
      lastName: 'Johnson',
      email: 'driver@citytaxi.com',
      phone: '+1234567893',
      password: driverPassword,
      role: 'DRIVER',
      isActive: true,
      isVerified: true,
      companyId: company.id,
      rating: {
        average: 4.8,
        count: 124
      }
    },
  });

  console.log('✅ Sample Driver created:', driver.email);

  // Create sample passenger
  const passengerPassword = await bcrypt.hash('passenger123', 10);
  
  const passenger = await prisma.user.upsert({
    where: { email: 'passenger@example.com' },
    update: {},
    create: {
      firstName: 'Sarah',
      lastName: 'Wilson',
      email: 'passenger@example.com',
      phone: '+1234567894',
      password: passengerPassword,
      role: 'PASSENGER',
      isActive: true,
      isVerified: true,
      address: {
        street: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        zipCode: '10002',
        country: 'USA'
      },
      preferences: {
        language: 'en',
        currency: 'USD',
        notifications: {
          push: true,
          email: true,
          sms: true
        }
      }
    },
  });

  console.log('✅ Sample Passenger created:', passenger.email);

  // Create sample vehicle
  const vehicle = await prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Camry',
      year: 2022,
      color: 'Silver',
      licensePlate: 'NYC-1234',
      vehicleType: 'SEDAN',
      companyId: company.id,
      driverId: driver.id,
      capacity: 4,
      features: {
        airConditioning: true,
        gps: true,
        bluetooth: true,
        childSeats: false,
        wheelchair: false
      },
      isActive: true,
      isAvailable: true,
      insurance: {
        provider: 'State Farm',
        policyNumber: 'SF123456789',
        expiryDate: '2024-12-31'
      },
      registration: {
        number: 'REG123456',
        expiryDate: '2024-12-31'
      }
    }
  });

  console.log('✅ Sample Vehicle created:', vehicle.licensePlate);

  // Create sample restaurant for food delivery
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Mario\'s Pizza',
      email: 'contact@mariospizza.com',
      phone: '+1234567895',
      address: {
        street: '789 Pizza Lane',
        city: 'New York',
        state: 'NY',
        zipCode: '10003',
        country: 'USA',
        coordinates: {
          latitude: 40.7589,
          longitude: -73.9851
        }
      },
      cuisine: ['Italian', 'Pizza'],
      priceRange: '$$',
      rating: 4.5,
      ratingCount: 89,
      operatingHours: {
        monday: { start: '11:00', end: '23:00', isActive: true },
        tuesday: { start: '11:00', end: '23:00', isActive: true },
        wednesday: { start: '11:00', end: '23:00', isActive: true },
        thursday: { start: '11:00', end: '23:00', isActive: true },
        friday: { start: '11:00', end: '24:00', isActive: true },
        saturday: { start: '11:00', end: '24:00', isActive: true },
        sunday: { start: '12:00', end: '22:00', isActive: true }
      },
      menu: {
        categories: [
          {
            name: 'Pizza',
            items: [
              { name: 'Margherita', price: 12.99, description: 'Fresh mozzarella, tomato sauce, basil' },
              { name: 'Pepperoni', price: 14.99, description: 'Pepperoni, mozzarella, tomato sauce' }
            ]
          }
        ]
      },
      isActive: true,
      isOpen: true
    }
  });

  console.log('✅ Sample Restaurant created:', restaurant.name);

  // Get existing company to add tariffs
  const existingCompany = await prisma.company.findFirst({
    where: { email: 'admin@citytaxi.com' }
  });

  if (existingCompany) {
    // Check if tariffs already exist
    const existingTariffs = await prisma.companyTariff.findMany({
      where: { companyId: existingCompany.id }
    });

    if (existingTariffs.length === 0) {
      // Create sample company tariffs
      const economyTariff = await prisma.companyTariff.create({
        data: {
          companyId: existingCompany.id,
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
          isActive: true,
          currency: 'USD'
        }
      });

      const premiumTariff = await prisma.companyTariff.create({
        data: {
          companyId: existingCompany.id,
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
          peakHourMultiplier: 1.5,
          peakHourStart: '07:00',
          peakHourEnd: '09:00',
          peakHour2Start: '17:00',
          peakHour2End: '19:00',
          weekendMultiplier: 1.2,
          isActive: true,
          currency: 'USD'
        }
      });

      const airportTariff = await prisma.companyTariff.create({
        data: {
          companyId: existingCompany.id,
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
          airportFee: 5.00,
          isActive: true,
          currency: 'USD'
        }
      });

      console.log('✅ Sample Tariffs created:', economyTariff.name, premiumTariff.name, airportTariff.name);
    } else {
      console.log('✅ Tariffs already exist, skipping creation');
    }
  }

  console.log('🎉 Database seeded successfully!');
  console.log('\n📝 Login Credentials:');
  console.log('Super Admin: admin@abtaxi.com / admin123');
  console.log('Company Owner: owner@citytaxi.com / owner123');
  console.log('Driver: driver@citytaxi.com / driver123');
  console.log('Passenger: passenger@example.com / passenger123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });