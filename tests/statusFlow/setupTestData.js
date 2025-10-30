/**
 * Setup Test Data for Status Flow Tests
 * Creates test driver and customer if they don't exist
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function setupTestData() {
  try {
    console.log('🔧 Setting up test data...\n');

    // Find test company
    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { name: { contains: 'test', mode: 'insensitive' } },
          { email: { contains: 'test', mode: 'insensitive' } }
        ]
      }
    });

    if (!company) {
      console.error('❌ No test company found. Please create one first.');
      return;
    }

    console.log(`✓ Found test company: ${company.name} (${company.id})`);

    // Check for test driver
    let driver = await prisma.user.findFirst({
      where: {
        email: 'test-driver@test.com',
        role: 'DRIVER',
        companyId: company.id
      }
    });

    if (!driver) {
      console.log('Creating test driver...');
      
      const hashedPassword = await bcrypt.hash('Test123!', 10);
      
      driver = await prisma.user.create({
        data: {
          email: 'test-driver@test.com',
          password: hashedPassword,
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phone: '+1-555-1111',
          company: {
            connect: { id: company.id }
          },
          isActive: true,
          isVerified: true,
          companyDriverProfile: {
            create: {
              licenseNumber: 'TEST-DL-001',
              licenseExpiry: new Date('2026-12-31'),
              backgroundCheckStatus: 'APPROVED',
              status: 'ACTIVE',
              employmentType: 'FULL_TIME',
              hireDate: new Date(),
              company: {
                connect: { id: company.id }
              }
            }
          }
        },
        include: {
          companyDriverProfile: true
        }
      });

      console.log(`✓ Created test driver: ${driver.email} (${driver.id})`);
    } else {
      console.log(`✓ Test driver already exists: ${driver.email} (${driver.id})`);
    }

    // Check for test customer
    let customer = await prisma.user.findFirst({
      where: {
        email: 'test-customer@test.com',
        role: 'PASSENGER'
      }
    });

    if (!customer) {
      console.log('Creating test customer...');
      
      const hashedPassword = await bcrypt.hash('Test123!', 10);
      
      customer = await prisma.user.create({
        data: {
          email: 'test-customer@test.com',
          password: hashedPassword,
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Customer',
          phone: '+1-555-2222',
          isActive: true,
          isVerified: true
        }
      });

      console.log(`✓ Created test customer: ${customer.email} (${customer.id})`);
    } else {
      console.log(`✓ Test customer already exists: ${customer.email} (${customer.id})`);
    }

    // Check for test vehicle
    let vehicle = await prisma.vehicle.findFirst({
      where: {
        licensePlate: 'TEST-001',
        companyId: company.id
      }
    });

    if (!vehicle) {
      console.log('Creating test vehicle...');
      
      vehicle = await prisma.vehicle.create({
        data: {
          licensePlate: 'TEST-001',
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          color: 'White',
          isActive: true,
          isAvailable: true,
          company: {
            connect: { id: company.id }
          },
          driverId: driver.id,
          vehicleType: 'SEDAN',
          capacity: 4
        }
      });

      console.log(`✓ Created test vehicle: ${vehicle.licensePlate} (${vehicle.id})`);
    } else {
      console.log(`✓ Test vehicle already exists: ${vehicle.licensePlate} (${vehicle.id})`);
    }

    console.log('\n✅ Test data setup complete!\n');
    console.log('Test credentials:');
    console.log('  Driver: test-driver@test.com / Test123!');
    console.log('  Customer: test-customer@test.com / Test123!');
    console.log(`  Company ID: ${company.id}`);
    console.log(`  Driver ID: ${driver.id}`);
    console.log(`  Customer ID: ${customer.id}`);

  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupTestData().catch(console.error);
}

module.exports = setupTestData;
