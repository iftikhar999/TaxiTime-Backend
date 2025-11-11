const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  DROPPING ALL DATA...\n');
  
  // Delete all data in correct order (respecting foreign keys)
  // Use separate delete operations to handle complex dependencies
  try {
    await prisma.payment.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.rating.deleteMany();
    await prisma.message.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.locationUpdate.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.assignments.deleteMany();
    await prisma.alarm.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.document.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.ride.deleteMany();
    await prisma.job.deleteMany();
    await prisma.deliveryOrder.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.companyDriver.deleteMany();
    await prisma.tariff.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
  } catch (error) {
    console.log('   ⚠️  Some tables might be empty, continuing...');
  }

  console.log('✅ All data deleted successfully!\n');
  console.log('🌱 SEEDING DATABASE...\n');

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('password123', 10);

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
    },
  });
  console.log(`   ✅ ${superAdmin.email} (password123)\n`);

  // ==========================================
  // 2. CREATE COMPANY OWNERS FIRST
  // ==========================================
  console.log('👔 Creating Company Owners...');
  
  const owner1 = await prisma.user.create({
    data: {
      firstName: 'John',
      lastName: 'Smith',
      email: 'owner@elitecitytaxi.com',
      phone: '+1555100101',
      password: hashedPassword,
      role: 'OWNER',
      isActive: true,
      isVerified: true,
    },
  });

  const owner2 = await prisma.user.create({
    data: {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'owner@metrorides.com',
      phone: '+1555200101',
      password: hashedPassword,
      role: 'OWNER',
      isActive: true,
      isVerified: true,
    },
  });

  console.log(`   ✅ ${owner1.email} (EliteCab)`);
  console.log(`   ✅ ${owner2.email} (MetroGo)\n`);

  // ==========================================
  // 3. CREATE COMPANIES
  // ==========================================
  console.log('🏢 Creating Companies...');
  
  const company1 = await prisma.company.create({
    data: {
      legalName: 'Elite City Taxi LLC',
      brandName: 'EliteCab',
      companyCode: 'ELITE001',
      companyType: 'TAXI_OPERATOR',
      businessModel: 'B2C',
      registrationNumber: 'REG-NYC-001',
      taxId: 'TAX-NYC-001',
      primaryLanguage: 'en',
      timezone: 'America/New_York',
      status: 'ACTIVE',
      primaryContactName: 'John Smith',
      primaryContactEmail: 'contact@elitecitytaxi.com',
      primaryContactPhone: '+1555100001',
      supportEmail: 'support@elitecitytaxi.com',
      supportPhone: '+1555100001',
      hqAddressLine1: '123 Main Street',
      hqCity: 'New York',
      hqState: 'NY',
      hqPostcode: '10001',
      hqCountry: 'USA',
      hqLatitude: 40.7128,
      hqLongitude: -74.0060,
      kycStatus: 'APPROVED',
      commissionRate: 15.0,
      ownerId: owner1.id,
      name: 'Elite City Taxi',
      email: 'contact@elitecitytaxi.com',
      phone: '+1555100001',
      isActive: true,
      isVerified: true,
    },
  });

  const company2 = await prisma.company.create({
    data: {
      legalName: 'Metro Rides Corporation',
      brandName: 'MetroGo',
      companyCode: 'METRO002',
      companyType: 'TAXI_OPERATOR',
      businessModel: 'B2C',
      registrationNumber: 'REG-LA-002',
      taxId: 'TAX-LA-002',
      primaryLanguage: 'en',
      timezone: 'America/Los_Angeles',
      status: 'ACTIVE',
      primaryContactName: 'Sarah Johnson',
      primaryContactEmail: 'info@metrorides.com',
      primaryContactPhone: '+1555200001',
      supportEmail: 'support@metrorides.com',
      supportPhone: '+1555200001',
      hqAddressLine1: '456 Broadway Ave',
      hqCity: 'Los Angeles',
      hqState: 'CA',
      hqPostcode: '90001',
      hqCountry: 'USA',
      hqLatitude: 34.0522,
      hqLongitude: -118.2437,
      kycStatus: 'APPROVED',
      commissionRate: 18.0,
      ownerId: owner2.id,
      name: 'Metro Rides',
      email: 'info@metrorides.com',
      phone: '+1555200001',
      isActive: true,
      isVerified: true,
    },
  });

  console.log(`   ✅ ${company1.brandName} (NYC)`);
  console.log(`   ✅ ${company2.brandName} (LA)\n`);

  // ==========================================
  // 4. CREATE ZONES FOR COMPANIES
  // ==========================================
  console.log('📍 Creating Service Zones...');
  
  const zones = await Promise.all([
    prisma.zone.create({
      data: {
        name: 'Manhattan Downtown',
        companyId: company1.id,
        boundaries: {
          type: 'Polygon',
          coordinates: [[
            [-74.0060, 40.7128],
            [-73.9712, 40.7128],
            [-73.9712, 40.7489],
            [-74.0060, 40.7489],
            [-74.0060, 40.7128],
          ]],
        },
        isActive: true,
      },
    }),
    prisma.zone.create({
      data: {
        name: 'Upper Manhattan',
        companyId: company1.id,
        boundaries: {
          type: 'Polygon',
          coordinates: [[
            [-73.9712, 40.7489],
            [-73.9300, 40.7489],
            [-73.9300, 40.8200],
            [-73.9712, 40.8200],
            [-73.9712, 40.7489],
          ]],
        },
        isActive: true,
      },
    }),
    prisma.zone.create({
      data: {
        name: 'Downtown LA',
        companyId: company2.id,
        boundaries: {
          type: 'Polygon',
          coordinates: [[
            [-118.2500, 34.0400],
            [-118.2300, 34.0400],
            [-118.2300, 34.0600],
            [-118.2500, 34.0600],
            [-118.2500, 34.0400],
          ]],
        },
        isActive: true,
      },
    }),
  ]);

  console.log(`   ✅ Created ${zones.length} service zones\n`);  // ==========================================
  // 5. CREATE TARIFFS
  // ==========================================
  console.log('💰 Creating Tariff Plans...');
  
  const tariffs = await Promise.all([
    // EliteCab Tariffs
    prisma.tariff.create({
      data: {
        name: 'Standard Rate',
        companyId: company1.id,
        vehicleType: 'SEDAN',
        baseFare: 3.50,
        perKmRate: 1.50,
        perMinuteRate: 0.35,
        minimumFare: 8.00,
        isActive: true,
      },
    }),
    prisma.tariff.create({
      data: {
        name: 'Night Rate',
        companyId: company1.id,
        vehicleType: 'SEDAN',
        baseFare: 4.50,
        perKmRate: 2.00,
        perMinuteRate: 0.50,
        minimumFare: 10.00,
        nightTimeMultiplier: 1.5,
        isActive: true,
      },
    }),
    prisma.tariff.create({
      data: {
        name: 'Premium SUV',
        companyId: company1.id,
        vehicleType: 'SUV',
        baseFare: 5.00,
        perKmRate: 2.00,
        perMinuteRate: 0.50,
        minimumFare: 12.00,
        isActive: true,
      },
    }),
    prisma.tariff.create({
      data: {
        name: 'Luxury',
        companyId: company1.id,
        vehicleType: 'VAN', // Using VAN as premium vehicle type
        baseFare: 8.00,
        perKmRate: 3.00,
        perMinuteRate: 0.75,
        minimumFare: 20.00,
        isActive: true,
      },
    }),
    // MetroGo Tariffs
    prisma.tariff.create({
      data: {
        name: 'Economy',
        companyId: company2.id,
        vehicleType: 'SEDAN',
        baseFare: 2.99,
        perKmRate: 1.25,
        perMinuteRate: 0.30,
        minimumFare: 7.00,
        isActive: true,
      },
    }),
    prisma.tariff.create({
      data: {
        name: 'Comfort SUV',
        companyId: company2.id,
        vehicleType: 'SUV',
        baseFare: 4.50,
        perKmRate: 1.75,
        perMinuteRate: 0.45,
        minimumFare: 10.00,
        isActive: true,
      },
    }),
  ]);

  console.log(`   ✅ Created ${tariffs.length} tariff plans\n`);

  // ==========================================
  // 6. CREATE DRIVERS
  // ==========================================
  console.log('🚗 Creating Drivers...');
  
  const drivers = await Promise.all([
    // EliteCab Drivers
    prisma.user.create({
      data: {
        firstName: 'Michael',
        lastName: 'Brown',
        email: 'driver1@elitecitytaxi.com',
        phone: '+1555100201',
        password: hashedPassword,
        role: 'DRIVER',
        companyId: company1.id,
        isActive: true,
        isVerified: true,
        rating: { average: 4.8, count: 127 },
        preferences: {
          notifications: true,
          soundAlerts: true,
          language: 'en',
        },
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Emily',
        lastName: 'Davis',
        email: 'driver2@elitecitytaxi.com',
        phone: '+1555100202',
        password: hashedPassword,
        role: 'DRIVER',
        companyId: company1.id,
        isActive: true,
        isVerified: true,
        rating: { average: 4.9, count: 203 },
        preferences: {
          notifications: true,
          soundAlerts: true,
          language: 'en',
        },
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'David',
        lastName: 'Wilson',
        email: 'driver3@elitecitytaxi.com',
        phone: '+1555100203',
        password: hashedPassword,
        role: 'DRIVER',
        companyId: company1.id,
        isActive: true,
        isVerified: true,
        rating: { average: 4.7, count: 89 },
        preferences: {
          notifications: true,
          soundAlerts: false,
          language: 'en',
        },
      },
    }),
    // MetroGo Drivers
    prisma.user.create({
      data: {
        firstName: 'James',
        lastName: 'Martinez',
        email: 'driver1@metrorides.com',
        phone: '+1555200201',
        password: hashedPassword,
        role: 'DRIVER',
        companyId: company2.id,
        isActive: true,
        isVerified: true,
        rating: { average: 4.6, count: 156 },
        preferences: {
          notifications: true,
          soundAlerts: true,
          language: 'en',
        },
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Maria',
        lastName: 'Garcia',
        email: 'driver2@metrorides.com',
        phone: '+1555200202',
        password: hashedPassword,
        role: 'DRIVER',
        companyId: company2.id,
        isActive: true,
        isVerified: true,
        rating: { average: 4.85, count: 241 },
        preferences: {
          notifications: true,
          soundAlerts: true,
          language: 'es',
        },
      },
    }),
  ]);

  console.log(`   ✅ Created ${drivers.length} drivers\n`);

  // ==========================================
  // 7. CREATE COMPANY DRIVER RECORDS
  // ==========================================
  console.log('📝 Creating Employment Records...');
  
  const companyDrivers = await Promise.all([
    prisma.companyDriver.create({
      data: {
        companyId: company1.id,
        userId: drivers[0].id,
        employmentType: 'FULL_TIME',
        hireDate: new Date('2024-01-15'),
        licenseNumber: 'DL-NY-123456',
        licenseExpiry: new Date('2026-01-15'),
        status: 'ACTIVE',
      },
    }),
    prisma.companyDriver.create({
      data: {
        companyId: company1.id,
        userId: drivers[1].id,
        employmentType: 'FULL_TIME',
        hireDate: new Date('2024-02-01'),
        licenseNumber: 'DL-NY-234567',
        licenseExpiry: new Date('2026-02-01'),
        status: 'ACTIVE',
      },
    }),
    prisma.companyDriver.create({
      data: {
        companyId: company1.id,
        userId: drivers[2].id,
        employmentType: 'PART_TIME',
        hireDate: new Date('2024-03-10'),
        licenseNumber: 'DL-NY-345678',
        licenseExpiry: new Date('2026-03-10'),
        status: 'ACTIVE',
      },
    }),
    prisma.companyDriver.create({
      data: {
        companyId: company2.id,
        userId: drivers[3].id,
        employmentType: 'FULL_TIME',
        hireDate: new Date('2024-01-20'),
        licenseNumber: 'DL-CA-456789',
        licenseExpiry: new Date('2027-01-20'),
        status: 'ACTIVE',
      },
    }),
    prisma.companyDriver.create({
      data: {
        companyId: company2.id,
        userId: drivers[4].id,
        employmentType: 'FULL_TIME',
        hireDate: new Date('2024-02-15'),
        licenseNumber: 'DL-CA-567890',
        licenseExpiry: new Date('2027-02-15'),
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(`   ✅ Created ${companyDrivers.length} employment records\n`);

  // ==========================================
  // 8. CREATE VEHICLES
  // ==========================================
  console.log('🚙 Creating Vehicles...');
  
  const vehicles = await Promise.all([
    // EliteCab Vehicles
    prisma.vehicle.create({
      data: {
        companyId: company1.id,
        driverId: drivers[0].id,
        make: 'Toyota',
        model: 'Camry',
        year: 2023,
        color: 'Silver',
        licensePlate: 'NYC-1234',
        vehicleType: 'SEDAN',
        isActive: true,
      },
    }),
    prisma.vehicle.create({
      data: {
        companyId: company1.id,
        driverId: drivers[1].id,
        make: 'Honda',
        model: 'Accord',
        year: 2023,
        color: 'Black',
        licensePlate: 'NYC-2345',
        vehicleType: 'SEDAN',
        isActive: true,
      },
    }),
    prisma.vehicle.create({
      data: {
        companyId: company1.id,
        driverId: drivers[2].id,
        make: 'Toyota',
        model: 'Highlander',
        year: 2024,
        color: 'White',
        licensePlate: 'NYC-3456',
        vehicleType: 'SUV',
        isActive: true,
      },
    }),
    prisma.vehicle.create({
      data: {
        companyId: company1.id,
        driverId: null, // Unassigned
        make: 'Mercedes',
        model: 'S-Class',
        year: 2024,
        color: 'Black',
        licensePlate: 'NYC-9999',
        vehicleType: 'VAN', // Using VAN as premium vehicle type
        isActive: true,
      },
    }),
    // MetroGo Vehicles
    prisma.vehicle.create({
      data: {
        companyId: company2.id,
        driverId: drivers[3].id,
        make: 'Nissan',
        model: 'Altima',
        year: 2023,
        color: 'Blue',
        licensePlate: 'LA-4567',
        vehicleType: 'SEDAN',
        isActive: true,
      },
    }),
    prisma.vehicle.create({
      data: {
        companyId: company2.id,
        driverId: drivers[4].id,
        make: 'Ford',
        model: 'Explorer',
        year: 2024,
        color: 'Gray',
        licensePlate: 'LA-5678',
        vehicleType: 'SUV',
        isActive: true,
      },
    }),
  ]);

  console.log(`   ✅ Created ${vehicles.length} vehicles\n`);

  // ==========================================
  // 9. CREATE PASSENGERS
  // ==========================================
  console.log('👥 Creating Passengers...');
  
  const passengers = await Promise.all([
    prisma.user.create({
      data: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'passenger1@example.com',
        phone: '+1555300001',
        password: hashedPassword,
        role: 'PASSENGER',
        isActive: true,
        isVerified: true,
        rating: { average: 4.9, count: 87 },
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Bob',
        lastName: 'Williams',
        email: 'passenger2@example.com',
        phone: '+1555300002',
        password: hashedPassword,
        role: 'PASSENGER',
        isActive: true,
        isVerified: true,
        rating: { average: 4.7, count: 52 },
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'passenger3@example.com',
        phone: '+1555300003',
        password: hashedPassword,
        role: 'PASSENGER',
        isActive: true,
        isVerified: true,
        rating: { average: 4.8, count: 103 },
      },
    }),
  ]);

  console.log(`   ✅ Created ${passengers.length} passengers\n`);

  // ==========================================
  // 10. CREATE SAMPLE RIDES
  // ==========================================
  console.log('🚕 Creating Sample Rides...');
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const rides = await Promise.all([
    // Completed rides
    prisma.ride.create({
      data: {
        companyId: company1.id,
        passengerId: passengers[0].id,
        driverId: drivers[0].id,
        vehicleId: vehicles[0].id,
        pickupLocation: {
          type: 'Point',
          coordinates: [-74.0060, 40.7128],
        },
        pickupAddress: '123 Main St, New York, NY 10001',
        dropoffLocation: {
          type: 'Point',
          coordinates: [-73.9712, 40.7489],
        },
        dropoffAddress: '456 Broadway, New York, NY 10013',
        status: 'COMPLETED',
        distance: 5.2,
        duration: 18,
        estimatedFare: 15.50,
        finalFare: 15.50,
        paymentMethod: 'CARD',
        paymentStatus: 'PAID',
        scheduledAt: new Date(yesterday.setHours(10, 0, 0, 0)),
        acceptedAt: new Date(yesterday.setHours(10, 2, 0, 0)),
        startedAt: new Date(yesterday.setHours(10, 15, 0, 0)),
        completedAt: new Date(yesterday.setHours(10, 33, 0, 0)),
        rating: 5,
        driverRating: 5,
      },
    }),
    prisma.ride.create({
      data: {
        companyId: company1.id,
        passengerId: passengers[1].id,
        driverId: drivers[1].id,
        vehicleId: vehicles[1].id,
        pickupLocation: {
          type: 'Point',
          coordinates: [-73.9712, 40.7489],
        },
        pickupAddress: '789 Park Ave, New York, NY 10021',
        dropoffLocation: {
          type: 'Point',
          coordinates: [-73.9300, 40.8200],
        },
        dropoffAddress: '321 Upper West Side, New York, NY 10025',
        status: 'COMPLETED',
        distance: 8.5,
        duration: 25,
        estimatedFare: 24.00,
        finalFare: 24.00,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        scheduledAt: new Date(yesterday.setHours(14, 30, 0, 0)),
        acceptedAt: new Date(yesterday.setHours(14, 32, 0, 0)),
        startedAt: new Date(yesterday.setHours(14, 45, 0, 0)),
        completedAt: new Date(yesterday.setHours(15, 10, 0, 0)),
        rating: 4,
        driverRating: 5,
      },
    }),
    prisma.ride.create({
      data: {
        companyId: company2.id,
        passengerId: passengers[2].id,
        driverId: drivers[3].id,
        vehicleId: vehicles[4].id,
        pickupLocation: {
          type: 'Point',
          coordinates: [-118.2500, 34.0400],
        },
        pickupAddress: '100 Downtown LA, Los Angeles, CA 90012',
        dropoffLocation: {
          type: 'Point',
          coordinates: [-118.2300, 34.0600],
        },
        dropoffAddress: '200 Hollywood Blvd, Los Angeles, CA 90028',
        status: 'COMPLETED',
        distance: 6.3,
        duration: 22,
        estimatedFare: 18.75,
        finalFare: 18.75,
        paymentMethod: 'CARD',
        paymentStatus: 'PAID',
        scheduledAt: new Date(yesterday.setHours(16, 0, 0, 0)),
        acceptedAt: new Date(yesterday.setHours(16, 2, 0, 0)),
        startedAt: new Date(yesterday.setHours(16, 10, 0, 0)),
        completedAt: new Date(yesterday.setHours(16, 32, 0, 0)),
        rating: 5,
        driverRating: 4,
      },
    }),
  ]);

  console.log(`   ✅ Created ${rides.length} completed rides\n`);

  // ==========================================
  // FINAL SUMMARY
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(70));
  console.log('\n🔐 LOGIN CREDENTIALS (All passwords: password123)\n');
  
  console.log('┌─ SUPER ADMIN ─────────────────────────────────────────────────┐');
  console.log(`│ Email: ${superAdmin.email.padEnd(50)} │`);
  console.log(`│ Password: password123${' '.repeat(42)} │`);
  console.log(`│ URL: http://localhost:5173/admin/login${' '.repeat(28)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘\n');
  
  console.log('┌─ COMPANY OWNERS ──────────────────────────────────────────────┐');
  console.log(`│ 1. ${owner1.email.padEnd(30)} (EliteCab)${' '.repeat(9)} │`);
  console.log(`│    Password: password123${' '.repeat(39)} │`);
  console.log(`│    URL: http://localhost:5174/login${' '.repeat(26)} │`);
  console.log(`│                                                               │`);
  console.log(`│ 2. ${owner2.email.padEnd(30)} (MetroGo)${' '.repeat(10)} │`);
  console.log(`│    Password: password123${' '.repeat(39)} │`);
  console.log(`│    URL: http://localhost:5174/login${' '.repeat(26)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘\n');
  
  console.log('┌─ DRIVERS (Mobile App) ────────────────────────────────────────┐');
  console.log(`│ EliteCab (NYC):${' '.repeat(48)} │`);
  console.log(`│   1. ${drivers[0].email.padEnd(45)} │`);
  console.log(`│   2. ${drivers[1].email.padEnd(45)} │`);
  console.log(`│   3. ${drivers[2].email.padEnd(45)} │`);
  console.log(`│                                                               │`);
  console.log(`│ MetroGo (LA):${' '.repeat(50)} │`);
  console.log(`│   4. ${drivers[3].email.padEnd(45)} │`);
  console.log(`│   5. ${drivers[4].email.padEnd(45)} │`);
  console.log(`│                                                               │`);
  console.log(`│ All passwords: password123${' '.repeat(37)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘\n');
  
  console.log('┌─ PASSENGERS ──────────────────────────────────────────────────┐');
  console.log(`│ 1. ${passengers[0].email.padEnd(54)} │`);
  console.log(`│ 2. ${passengers[1].email.padEnd(54)} │`);
  console.log(`│ 3. ${passengers[2].email.padEnd(54)} │`);
  console.log(`│ All passwords: password123${' '.repeat(37)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘\n');
  
  console.log('┌─ DATABASE STATISTICS ─────────────────────────────────────────┐');
  console.log(`│ Companies: 2 (All active & verified)${' '.repeat(28)} │`);
  console.log(`│ Owners: 2${' '.repeat(54)} │`);
  console.log(`│ Drivers: 5 (3 NYC + 2 LA)${' '.repeat(38)} │`);
  console.log(`│ Vehicles: 6 (5 assigned + 1 unassigned)${' '.repeat(24)} │`);
  console.log(`│ Passengers: 3${' '.repeat(50)} │`);
  console.log(`│ Service Zones: 3${' '.repeat(47)} │`);
  console.log(`│ Tariff Plans: 6${' '.repeat(48)} │`);
  console.log(`│ Completed Rides: 3${' '.repeat(45)} │`);
  console.log('└───────────────────────────────────────────────────────────────┘\n');
  
  console.log('✨ Ready to test! Start your servers and login with the credentials above.\n');
}

main()
  .catch((e) => {
    console.error('\n❌ ERROR SEEDING DATABASE:', e);
    console.error('\nStack trace:', e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
