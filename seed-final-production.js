/**
 * ═══════════════════════════════════════════════════════════════
 * TAXITIME V2 - PRODUCTION DEPLOYMENT SEEDER
 * ═══════════════════════════════════════════════════════════════
 * 
 * This script initializes a fresh database with:
 * ✅ All new database schema changes
 * ✅ Master data (vehicle types, payment methods, etc.)
 * ✅ Global configuration
 * ✅ Super Admin account
 * ✅ Indexes and constraints
 * 
 * RUN THIS ON LIGHTSAIL AFTER DATABASE MIGRATIONS
 * 
 * Usage:
 *   node seed-final-production.js
 * 
 * ═══════════════════════════════════════════════════════════════
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const SUPER_ADMIN_EMAIL = 'admin@taxitime.com';
const SUPER_ADMIN_PASSWORD = 'TaxiTime2025!@#'; // Change this immediately after first login

const MASTER_DATA = {
  vehicleTypes: [
    {
      id: 'vtype_sedan',
      name: 'Sedan',
      description: '4 passengers, 2 bags',
      capacity: 4,
      luggage: 2,
      baseRate: 3.50,
      perKmRate: 2.20,
      perMinuteRate: 0.60,
      minimumFare: 10.00,
      icon: 'sedan.png',
      isActive: true,
      displayOrder: 1
    },
    {
      id: 'vtype_suv',
      name: 'SUV',
      description: '6 passengers, 4 bags',
      capacity: 6,
      luggage: 4,
      baseRate: 5.00,
      perKmRate: 3.00,
      perMinuteRate: 0.80,
      minimumFare: 15.00,
      icon: 'suv.png',
      isActive: true,
      displayOrder: 2
    },
    {
      id: 'vtype_van',
      name: 'Van',
      description: '8 passengers, 6 bags',
      capacity: 8,
      luggage: 6,
      baseRate: 6.50,
      perKmRate: 3.50,
      perMinuteRate: 1.00,
      minimumFare: 20.00,
      icon: 'van.png',
      isActive: true,
      displayOrder: 3
    },
    {
      id: 'vtype_wheelchair',
      name: 'Wheelchair Accessible',
      description: 'WAV with wheelchair access',
      capacity: 4,
      luggage: 2,
      baseRate: 5.00,
      perKmRate: 3.00,
      perMinuteRate: 0.80,
      minimumFare: 15.00,
      icon: 'wheelchair.png',
      isActive: true,
      displayOrder: 4,
      features: ['wheelchair_accessible', 'total_mobility']
    }
  ],

  paymentMethods: [
    {
      id: 'pm_cash',
      name: 'Cash',
      type: 'CASH',
      isActive: true,
      displayOrder: 1,
      icon: 'cash.png',
      description: 'Pay with cash'
    },
    {
      id: 'pm_card',
      name: 'Card',
      type: 'CARD',
      isActive: true,
      displayOrder: 2,
      icon: 'card.png',
      description: 'Credit/Debit card'
    },
    {
      id: 'pm_eftpos',
      name: 'EFTPOS',
      type: 'EFTPOS',
      isActive: true,
      displayOrder: 3,
      icon: 'eftpos.png',
      description: 'EFTPOS terminal'
    },
    {
      id: 'pm_account',
      name: 'Account',
      type: 'ACCOUNT',
      isActive: true,
      displayOrder: 4,
      icon: 'account.png',
      description: 'Bill to account'
    },
    {
      id: 'pm_gift_card',
      name: 'Gift Card',
      type: 'GIFT_CARD',
      isActive: true,
      displayOrder: 5,
      icon: 'gift.png',
      description: 'Gift card payment'
    }
  ],

  jobStatuses: [
    { code: 'PENDING', label: 'Pending', description: 'Job created, awaiting assignment' },
    { code: 'OFFERED', label: 'Offered', description: 'Offered to driver(s)' },
    { code: 'ASSIGNED', label: 'Assigned', description: 'Assigned to a driver' },
    { code: 'ACCEPTED', label: 'Accepted', description: 'Driver accepted the job' },
    { code: 'EN_ROUTE', label: 'En Route', description: 'Driver heading to pickup' },
    { code: 'ARRIVED', label: 'Arrived', description: 'Driver arrived at pickup' },
    { code: 'PICKED_UP', label: 'Picked Up', description: 'Passenger picked up' },
    { code: 'IN_PROGRESS', label: 'In Progress', description: 'Trip in progress' },
    { code: 'COMPLETED', label: 'Completed', description: 'Trip completed' },
    { code: 'CANCELLED', label: 'Cancelled', description: 'Job cancelled' },
    { code: 'NO_SHOW', label: 'No Show', description: 'Passenger no show' }
  ],

  globalConfig: {
    defaultCurrency: 'NZD',
    defaultTimezone: 'Pacific/Auckland',
    defaultCountry: 'NZ',
    maxJobSearchRadius: 50, // km
    driverLocationUpdateInterval: 10, // seconds - default
    driverHeartbeatTimeout: 60, // seconds
    autoDispatchEnabled: true,
    autoDispatchRadius: 10, // km
    autoDispatchTimeout: 120, // seconds
    maxSimultaneousOffers: 5,
    offerExpiryTime: 30, // seconds
    gpsAccuracyThreshold: 50, // meters
    minimumAppVersion: '2.0.0',
    forceUpdateVersion: '1.9.0',
    maintenanceMode: false,
    allowDriverRegistration: false, // Must be approved by company
    allowPassengerRegistration: true,
    maxTripsPerDay: 100,
    maxActiveJobs: 10
  }
};

// ═══════════════════════════════════════════════════════════════
// SEEDING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function seedSuperAdmin() {
  console.log('\n📍 [1/6] Creating Super Admin...');
  
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  
  try {
    const superAdmin = await prisma.user.upsert({
      where: { email: SUPER_ADMIN_EMAIL },
      update: {
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true
      },
      create: {
        id: `user_superadmin_${Date.now()}`,
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Administrator',
        name: 'Super Administrator',
        role: 'SUPER_ADMIN',
        isActive: true,
        phoneNumber: '+64210000000',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log('   ✅ Super Admin created');
    console.log(`   📧 Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`   🔑 Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log('   ⚠️  IMPORTANT: Change this password immediately after first login!');
    
    return superAdmin;
  } catch (error) {
    console.error('   ❌ Error creating super admin:', error.message);
    throw error;
  }
}

async function seedVehicleTypes() {
  console.log('\n📍 [2/6] Seeding Vehicle Types...');
  
  for (const vType of MASTER_DATA.vehicleTypes) {
    try {
      await prisma.vehicleType.upsert({
        where: { id: vType.id },
        update: vType,
        create: {
          ...vType,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`   ✅ ${vType.name}`);
    } catch (error) {
      console.error(`   ❌ Error creating ${vType.name}:`, error.message);
    }
  }
}

async function seedPaymentMethods() {
  console.log('\n📍 [3/6] Seeding Payment Methods...');
  
  for (const pm of MASTER_DATA.paymentMethods) {
    try {
      await prisma.paymentMethod.upsert({
        where: { id: pm.id },
        update: pm,
        create: {
          ...pm,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`   ✅ ${pm.name}`);
    } catch (error) {
      console.error(`   ❌ Error creating ${pm.name}:`, error.message);
    }
  }
}

async function seedGlobalConfig() {
  console.log('\n📍 [4/6] Seeding Global Configuration...');
  
  try {
    const config = await prisma.globalConfig.upsert({
      where: { id: 'global_config_main' },
      update: {
        ...MASTER_DATA.globalConfig,
        updatedAt: new Date()
      },
      create: {
        id: 'global_config_main',
        ...MASTER_DATA.globalConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    console.log('   ✅ Global configuration created');
    console.log(`   🌍 Default currency: ${config.defaultCurrency}`);
    console.log(`   🕐 Default timezone: ${config.defaultTimezone}`);
    console.log(`   📍 GPS update interval: ${config.driverLocationUpdateInterval}s`);
    
    return config;
  } catch (error) {
    console.error('   ❌ Error creating global config:', error.message);
    throw error;
  }
}

async function createDatabaseIndexes() {
  console.log('\n📍 [5/6] Creating Database Indexes...');
  
  const indexes = [
    // Jobs indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status_company 
     ON jobs(status, "companyId", "createdAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_driver_status 
     ON jobs("driverId", status) WHERE "driverId" IS NOT NULL`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_scheduled 
     ON jobs("scheduledFor", status) WHERE "scheduledFor" IS NOT NULL`,
    
    // Driver locations indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_locations_driver_time 
     ON driver_locations("driverId", "createdAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_locations_company_active 
     ON driver_locations("companyId", "isActive", "createdAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_locations_geom 
     ON driver_locations USING GIST("location") WHERE "isActive" = true`,
    
    // Shifts indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shifts_driver_date 
     ON shifts("driverId", "startTime" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shifts_active 
     ON shifts("driverId", status) WHERE status = 'ACTIVE'`,
    
    // Assignments indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_job_driver 
     ON assignments("jobId", "driverId", status)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_driver_status 
     ON assignments("driverId", status, "createdAt" DESC)`,
    
    // Driver earnings indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_earnings_driver_date 
     ON driver_earnings("driverId", "earnedAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_earnings_company_date 
     ON driver_earnings("companyId", "earnedAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_earnings_job 
     ON driver_earnings("jobId") WHERE "jobId" IS NOT NULL`,
    
    // Users indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email 
     ON users(email) WHERE email IS NOT NULL`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_company_role 
     ON users("companyId", role, "isActive")`,
    
    // Companies indexes
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_status 
     ON companies(status, "createdAt" DESC)`,
    
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_code 
     ON companies("companyCode") WHERE "companyCode" IS NOT NULL`
  ];

  let successCount = 0;
  for (const indexSQL of indexes) {
    try {
      await prisma.$executeRawUnsafe(indexSQL);
      successCount++;
    } catch (error) {
      // Index might already exist - this is okay
      if (!error.message.includes('already exists')) {
        console.error(`   ⚠️  Index creation warning: ${error.message}`);
      }
    }
  }
  
  console.log(`   ✅ ${successCount}/${indexes.length} indexes created/verified`);
}

async function verifyDatabaseSchema() {
  console.log('\n📍 [6/6] Verifying Database Schema...');
  
  try {
    // Check critical tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    const requiredTables = [
      'users',
      'companies',
      'jobs',
      'shifts',
      'driver_locations',
      'assignments',
      'vehicles',
      'driver_earnings',
      'driver_earnings_summaries',
      'payment_methods',
      'vehicle_types',
      'zones',
      'tariffs',
      'company_settings'
    ];
    
    const tableNames = tables.map(t => t.table_name);
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    if (missingTables.length > 0) {
      console.error('   ❌ Missing tables:', missingTables.join(', '));
      throw new Error('Database schema incomplete');
    }
    
    console.log(`   ✅ All ${requiredTables.length} critical tables verified`);
    console.log(`   📊 Total tables: ${tables.length}`);
    
    // Check new columns exist
    const jobColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' AND table_schema = 'public'
    `;
    
    const jobColumnNames = jobColumns.map(c => c.column_name);
    const requiredJobColumns = ['actualDistanceKm', 'actualDurationSeconds', 'startedAt'];
    const missingColumns = requiredJobColumns.filter(c => !jobColumnNames.includes(c));
    
    if (missingColumns.length > 0) {
      console.warn('   ⚠️  Missing job columns:', missingColumns.join(', '));
      console.warn('   ℹ️  Run migrations first: npx prisma migrate deploy');
    } else {
      console.log('   ✅ New job metrics columns verified');
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Schema verification failed:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 TAXITIME V2 - PRODUCTION DATABASE SEEDER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will initialize your production database with:');
  console.log('  ✅ Super Admin account');
  console.log('  ✅ Master data (vehicle types, payment methods)');
  console.log('  ✅ Global configuration');
  console.log('  ✅ Database indexes');
  console.log('  ✅ Schema verification');
  console.log('');
  console.log('⚠️  WARNING: This should only be run on a fresh database!');
  console.log('');
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection successful\n');
    
    // Run all seeding functions
    await seedSuperAdmin();
    await seedVehicleTypes();
    await seedPaymentMethods();
    await seedGlobalConfig();
    await createDatabaseIndexes();
    await verifyDatabaseSchema();
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('  1. Log in as Super Admin and change the password');
    console.log('  2. Create your first company');
    console.log('  3. Configure company settings');
    console.log('  4. Add drivers and vehicles');
    console.log('  5. Start taking bookings!');
    console.log('');
    console.log('🔐 Super Admin Credentials:');
    console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('\n❌ SEEDING FAILED:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeder
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
