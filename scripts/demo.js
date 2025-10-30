#!/usr/bin/env node

/**
 * Comprehensive Taxi System Demo Script
 * 
 * This script demonstrates all the major features of the taxi system:
 * - Company and user management
 * - Job creation and dispatch
 * - Driver assignment and tracking
 * - Real-time updates
 * - Pricing calculations
 * - Payment processing
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jobService = require('../services/jobService');
const pricingService = require('../services/pricingService');

const prisma = new PrismaClient();

class TaxiSystemDemo {
  constructor() {
    this.demoData = {
      companies: [],
      users: [],
      jobs: [],
      tariffs: [],
    };
  }

  async runDemo() {
    console.log('🚀 Starting Comprehensive Taxi System Demo\n');

    try {
      await this.setupDemoData();
      await this.demonstrateJobCreation();
      await this.demonstrateDispatchSystem();
      await this.demonstratePricingEngine();
      await this.demonstrateRealTimeTracking();
      await this.demonstratePaymentFlow();
      await this.demonstrateAnalytics();

      console.log('\n✅ Demo completed successfully!');
      console.log('\n📊 Demo Summary:');
      this.printDemoSummary();

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async setupDemoData() {
    console.log('📋 Setting up demo data...');

    // First create users without companies
    const hashedPassword = await bcrypt.hash('demo123', 10);

    // Create company owners first (without company association)
    const owner1 = await prisma.user.create({
      data: {
        email: 'owner1@demo.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Smith',
        role: 'OWNER',
        phone: '+1-555-1001',
        isActive: true,
      }
    });

    const owner2 = await prisma.user.create({
      data: {
        email: 'owner2@demo.com',
        password: hashedPassword,
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'OWNER',
        phone: '+1-555-1002',
        isActive: true,
      }
    });

    // Now create demo companies with valid owner IDs
    const company1 = await prisma.company.create({
      data: {
        name: 'Metro Taxi Co.',
        email: 'info@metrotaxi.com',
        phone: '+1-555-0001',
        address: '123 Main St, New York, NY 10001',
        ownerId: owner1.id,
        isActive: true,
        isVerified: true,
        services: {
          taxi: true,
          delivery: true,
          courier: true
        },
        operatingHours: {
          monday: { open: '06:00', close: '23:00' },
          tuesday: { open: '06:00', close: '23:00' },
          wednesday: { open: '06:00', close: '23:00' },
          thursday: { open: '06:00', close: '23:00' },
          friday: { open: '06:00', close: '24:00' },
          saturday: { open: '07:00', close: '24:00' },
          sunday: { open: '08:00', close: '22:00' }
        }
      }
    });

    const company2 = await prisma.company.create({
      data: {
        name: 'Quick Delivery Services',
        email: 'hello@quickdelivery.com',
        phone: '+1-555-0002',
        address: '456 Business Ave, Brooklyn, NY 11201',
        ownerId: owner2.id,
        isActive: true,
        isVerified: true,
        services: {
          delivery: true,
          courier: true,
          taxi: false
        }
      }
    });

    // Update owners with company IDs
    await prisma.user.update({
      where: { id: owner1.id },
      data: { companyId: company1.id }
    });

    await prisma.user.update({
      where: { id: owner2.id },
      data: { companyId: company2.id }
    });

    this.demoData.companies = [company1, company2];

    // Create drivers
    const drivers = [];
    const driverData = [
      { firstName: 'Mike', lastName: 'Brown', vehicleType: 'SEDAN', vehicleNumber: 'NYC-001', companyId: company1.id },
      { firstName: 'Lisa', lastName: 'Davis', vehicleType: 'SUV', vehicleNumber: 'NYC-002', companyId: company1.id },
      { firstName: 'Alex', lastName: 'Wilson', vehicleType: 'MOTORCYCLE', vehicleNumber: 'BK-001', companyId: company2.id },
      { firstName: 'Emma', lastName: 'Garcia', vehicleType: 'VAN', vehicleNumber: 'BK-002', companyId: company2.id },
    ];

    for (const driver of driverData) {
      const user = await prisma.user.create({
        data: {
          email: `${driver.firstName.toLowerCase()}@demo.com`,
          password: hashedPassword,
          firstName: driver.firstName,
          lastName: driver.lastName,
          role: 'DRIVER',
          phone: `+1-555-20${drivers.length + 1}${drivers.length + 1}`,
          companyId: driver.companyId,
          rating: { overall: 4.5 + Math.random() * 0.5, totalRides: 150 + Math.floor(Math.random() * 50) }, // Rating as JSON
          isActive: true,
        }
      });

      // Create vehicle for driver
      const vehicle = await prisma.vehicle.create({
        data: {
          make: 'Toyota',
          model: driver.vehicleType === 'SEDAN' ? 'Camry' : driver.vehicleType === 'SUV' ? 'Highlander' : driver.vehicleType === 'MOTORCYCLE' ? 'Motorcycle' : 'Transit',
          year: 2020 + Math.floor(Math.random() * 4),
          color: ['Black', 'White', 'Silver', 'Blue'][Math.floor(Math.random() * 4)],
          licensePlate: driver.vehicleNumber,
          vehicleType: driver.vehicleType,
          companyId: driver.companyId,
          driverId: user.id,
          capacity: driver.vehicleType === 'SEDAN' ? 4 : driver.vehicleType === 'SUV' ? 6 : driver.vehicleType === 'MOTORCYCLE' ? 1 : 8,
          isActive: true,
          isAvailable: true,
        }
      });
      drivers.push(user);
    }

    // Create customers
    const customers = [];
    const customerData = [
      { firstName: 'Alice', lastName: 'Cooper', companyId: company1.id },
      { firstName: 'Bob', lastName: 'Miller', companyId: company1.id },
      { firstName: 'Carol', lastName: 'Taylor', companyId: company2.id },
    ];

    for (const customer of customerData) {
      const user = await prisma.user.create({
        data: {
          email: `${customer.firstName.toLowerCase()}@demo.com`,
          password: hashedPassword,
          firstName: customer.firstName,
          lastName: customer.lastName,
          role: 'PASSENGER',
          phone: `+1-555-30${customers.length + 1}${customers.length + 1}`,
          companyId: customer.companyId,
          isActive: true,
        }
      });
      customers.push(user);
    }

    this.demoData.users = [owner1, owner2, ...drivers, ...customers];

    // Create tariffs for pricing
    const tariff1 = await prisma.tariff.create({
      data: {
        name: 'Standard Taxi Rate',
        companyId: company1.id,
        vehicleType: 'SEDAN',
        baseFare: 3.50,
        perKmRate: 2.20,
        perMinuteRate: 0.50,
        minimumFare: 8.00,
        isActive: true,
      }
    });

    const tariff2 = await prisma.tariff.create({
      data: {
        name: 'Motorcycle Delivery Rate',
        companyId: company2.id,
        vehicleType: 'MOTORCYCLE',
        baseFare: 2.00,
        perKmRate: 1.50,
        perMinuteRate: 0.25,
        minimumFare: 5.00,
        isActive: true,
      }
    });

    this.demoData.tariffs = [tariff1, tariff2];

    // Create driver shifts (put drivers online)
    for (const driver of drivers) {
      await prisma.shift.create({
        data: {
          driverId: driver.id,
          companyId: driver.companyId,
          status: 'ONLINE',
          startTime: new Date(),
        }
      });

      // Add initial location for drivers
      await prisma.locationUpdate.create({
        data: {
          driverId: driver.id,
          latitude: 40.7128 + (Math.random() - 0.5) * 0.1, // Random location around NYC
          longitude: -74.0060 + (Math.random() - 0.5) * 0.1,
          accuracy: 5.0,
        }
      });
    }

    console.log('✅ Demo data setup complete');
    console.log(`   Created ${this.demoData.companies.length} companies`);
    console.log(`   Created ${this.demoData.users.length} users`);
    console.log(`   Created ${this.demoData.tariffs.length} tariffs`);
  }

  async demonstrateJobCreation() {
    console.log('\n🚗 Demonstrating Job Creation...');

    const company = this.demoData.companies[0];
    const customer = this.demoData.users.find(u => u.role === 'PASSENGER' && u.companyId === company.id);

    // Create a taxi job
    const taxiJobData = {
      type: 'TAXI',
      customerId: customer.id,
      companyId: company.id,
      pickupAddress: 'Times Square, New York, NY',
      pickupLatitude: 40.7580,
      pickupLongitude: -73.9855,
      dropoffAddress: 'Central Park, New York, NY',
      dropoffLatitude: 40.7829,
      dropoffLongitude: -73.9654,
      vehicleType: 'SEDAN',
      paymentMethod: 'CARD',
      status: 'PENDING',
    };

    const taxiJob = await jobService.createJob(taxiJobData);
    this.demoData.jobs.push(taxiJob);

    console.log(`✅ Created taxi job: ${taxiJob.id}`);
    console.log(`   From: ${taxiJob.trip?.pickup?.address || 'Unknown'}`);
    console.log(`   To: ${taxiJob.trip?.destination?.address || 'Unknown'}`);
    console.log(`   Status: ${taxiJob.status}`);

    // Wait a moment for offers to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check offers created
    const offers = await prisma.offer.findMany({
      where: { jobId: taxiJob.id },
      include: { driver: true }
    });

    console.log(`   Generated ${offers.length} offers to nearby drivers`);
    offers.forEach(offer => {
      console.log(`     - Driver: ${offer.driver.firstName} ${offer.driver.lastName} ($${offer.offerPrice})`);
    });

    // Create a delivery job
    const deliveryJobData = {
      type: 'DELIVERY',
      customerId: customer.id,
      companyId: company.id,
      pickupAddress: 'Pizza Palace, 123 Food St, NYC',
      pickupLatitude: 40.7505,
      pickupLongitude: -73.9934,
      dropoffAddress: '456 Customer Ave, NYC',
      dropoffLatitude: 40.7282,
      dropoffLongitude: -73.9942,
      vehicleType: 'MOTORCYCLE',
      paymentMethod: 'CASH',
      status: 'PENDING',
    };

    // Create delivery order data
    deliveryJobData.deliveryOrder = {
      create: {
        customerId: customer.id,
        companyId: company.id,
        recipientName: 'Jane Doe',
        recipientPhone: '+1-555-9999',
        packageDescription: 'Large pizza and drinks',
        pickupAddress: deliveryJobData.pickupAddress,
        pickupLatitude: deliveryJobData.pickupLatitude,
        pickupLongitude: deliveryJobData.pickupLongitude,
        dropoffAddress: deliveryJobData.dropoffAddress,
        dropoffLatitude: deliveryJobData.dropoffLatitude,
        dropoffLongitude: deliveryJobData.dropoffLongitude,
        estimatedPrice: 12.50,
        type: 'FOOD',
        status: 'CREATED',
      }
    };

    const deliveryJob = await jobService.createJob(deliveryJobData);
    this.demoData.jobs.push(deliveryJob);

    console.log(`✅ Created delivery job: ${deliveryJob.id}`);
    console.log(`   From: ${deliveryJob.deliveryOrder?.pickupLocation?.address || 'Restaurant'}`);
    console.log(`   To: ${deliveryJob.deliveryOrder?.dropoffLocation?.address || 'Customer'}`);
  }

  async demonstrateDispatchSystem() {
    console.log('\n📡 Demonstrating Dispatch System...');

    const job = this.demoData.jobs[0];
    const company = this.demoData.companies[0];
    const driver = this.demoData.users.find(u => u.role === 'DRIVER' && u.companyId === company.id);

    // Get offers for the job
    const offers = await prisma.offer.findMany({
      where: { jobId: job.id },
      include: { driver: true }
    });

    if (offers.length > 0) {
      // Accept first offer
      const acceptedOffer = offers[0];
      console.log(`🎯 Driver ${acceptedOffer.driver.firstName} accepting offer...`);

      const assignment = await jobService.acceptOffer(acceptedOffer.id, acceptedOffer.driverId);

      console.log(`✅ Job assigned to driver: ${acceptedOffer.driver.firstName} ${acceptedOffer.driver.lastName}`);
      console.log(`   Assignment ID: ${assignment.id}`);
      console.log(`   Status: ${assignment.status}`);

      // Update job status progression
      const statusProgression = ['STARTED', 'IN_PROGRESS', 'COMPLETED'];

      for (const status of statusProgression) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const locationData = {
          latitude: 40.7128 + Math.random() * 0.01,
          longitude: -74.0060 + Math.random() * 0.01,
          timestamp: new Date().toISOString(),
        };

        const updatedJob = await jobService.updateJobStatus(
          job.id,
          status,
          acceptedOffer.driverId,
          locationData
        );

        console.log(`📍 Job status updated to: ${status}`);
        if (status === 'COMPLETED') {
          console.log(`🏁 Trip completed! Customer charged: $${updatedJob.estimatedPrice}`);
        }
      }
    }
  }

  async demonstratePricingEngine() {
    console.log('\n💰 Demonstrating Pricing Engine...');

    const locations = [
      {
        name: 'Times Square to JFK Airport',
        pickup: { lat: 40.7580, lng: -73.9855 },
        dropoff: { lat: 40.6413, lng: -73.7781 }
      },
      {
        name: 'Short city trip',
        pickup: { lat: 40.7505, lng: -73.9934 },
        dropoff: { lat: 40.7282, lng: -73.9942 }
      },
      {
        name: 'Cross-borough delivery',
        pickup: { lat: 40.7128, lng: -74.0060 },
        dropoff: { lat: 40.6892, lng: -73.9442 }
      }
    ];

    const company = this.demoData.companies[0];

    for (const location of locations) {
      console.log(`\n🧮 Calculating price for: ${location.name}`);

      const estimate = await pricingService.calculatePrice({
        companyId: company.id,
        vehicleType: 'SEDAN',
        pickupLatitude: location.pickup.lat,
        pickupLongitude: location.pickup.lng,
        dropoffLatitude: location.dropoff.lat,
        dropoffLongitude: location.dropoff.lng,
        jobType: 'TAXI'
      });

      console.log(`   Distance: ${estimate.distance} km`);
      console.log(`   Estimated time: ${estimate.estimatedTime} minutes`);
      console.log(`   Base price: $${estimate.basePrice}`);
      console.log(`   Time multiplier: ${estimate.timeMultiplier}x`);
      console.log(`   Zone multiplier: ${estimate.zoneMultiplier}x`);
      console.log(`   Surge multiplier: ${estimate.surgeMultiplier}x`);
      console.log(`   Final price: $${estimate.finalPrice} ${estimate.currency}`);
    }
  }

  async demonstrateRealTimeTracking() {
    console.log('\n📍 Demonstrating Real-Time Tracking...');

    const job = this.demoData.jobs[0];
    const driver = this.demoData.users.find(u => u.role === 'DRIVER');

    // Simulate real-time location updates
    const route = [
      { lat: 40.7580, lng: -73.9855, status: 'Heading to pickup' },
      { lat: 40.7560, lng: -73.9845, status: 'Approaching pickup' },
      { lat: 40.7580, lng: -73.9855, status: 'Arrived at pickup' },
      { lat: 40.7600, lng: -73.9800, status: 'Trip in progress' },
      { lat: 40.7700, lng: -73.9700, status: 'Halfway to destination' },
      { lat: 40.7829, lng: -73.9654, status: 'Arrived at destination' },
    ];

    console.log(`🚗 Tracking driver ${driver.firstName} on job ${job.id.slice(-6)}...`);

    for (let i = 0; i < route.length; i++) {
      const point = route[i];

      await prisma.locationUpdate.create({
        data: {
          driverId: driver.id,
          tripId: job.tripId, // Link to the ride instead of job
          latitude: point.lat,
          longitude: point.lng,
          speed: 25 + Math.random() * 15, // Random speed 25-40 km/h
          heading: Math.random() * 360,
          accuracy: 5,
        }
      });

      console.log(`   📍 Location ${i + 1}/${route.length}: ${point.status}`);
      console.log(`      Coordinates: ${point.lat}, ${point.lng}`);

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Get trip route
    const tripRoute = await prisma.locationUpdate.findMany({
      where: {
        driverId: driver.id,
        tripId: job.tripId
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`✅ Trip tracking complete. Recorded ${tripRoute.length} location points`);
  }

  async demonstratePaymentFlow() {
    console.log('\n💳 Demonstrating Payment Flow...');

    const job = this.demoData.jobs.find(j => j.status === 'COMPLETED') || this.demoData.jobs[0];
    const customer = this.demoData.users.find(u => u.id === job.customerId);
    const driver = this.demoData.users.find(u => u.id === job.assignedDriverId);

    // Calculate final price for payment
    const finalPrice = 15.50; // Simulated final fare

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        customerId: customer.id,
        companyId: job.companyId,
        amount: finalPrice,
        currency: 'USD',
        paymentMethod: 'CARD',
        status: 'PAID',
        providerTransactionId: `txn_${Date.now()}`,
      }
    });

    console.log(`💰 Payment processed for job ${job.id.slice(-6)}`);
    console.log(`   Amount: $${finalPrice} ${payment.currency}`);
    console.log(`   Method: ${payment.paymentMethod}`);
    console.log(`   Transaction ID: ${payment.providerTransactionId}`);
    console.log(`   Status: ${payment.status}`);

    // Create wallet transactions
    const commission = payment.amount * 0.15; // 15% commission
    const driverEarnings = payment.amount - commission;

    // Driver earnings
    if (driver) {
      await prisma.walletTransaction.create({
        data: {
          userId: driver.id,
          paymentId: payment.id,
          type: 'CREDIT',
          amount: driverEarnings,
          currency: 'USD',
          description: `Earnings from job ${job.id.slice(-6)}`,
          createdAt: new Date(),
        }
      });

      console.log(`   Driver earnings: $${driverEarnings.toFixed(2)}`);
    }

    // Company commission
    const owner = this.demoData.users.find(u => u.companyId === job.companyId && u.role === 'OWNER');
    if (owner) {
      await prisma.walletTransaction.create({
        data: {
          userId: owner.id,
          paymentId: payment.id,
          type: 'COMMISSION',
          amount: commission,
          currency: 'USD',
          description: `Commission from job ${job.id.slice(-6)}`,
          createdAt: new Date(),
        }
      });

      console.log(`   Company commission: $${commission.toFixed(2)}`);
    }

    // Create rating
    const rating = await prisma.rating.create({
      data: {
        jobId: job.id,
        raterId: customer.id,
        ratedUserId: driver?.id,
        companyId: job.companyId,
        rating: 4.5,
        comment: 'Great service! Driver was punctual and friendly.',
        createdAt: new Date(),
      }
    });

    console.log(`⭐ Rating submitted: ${rating.rating}/5 stars`);
    console.log(`   Comment: "${rating.comment}"`);
  }

  async demonstrateAnalytics() {
    console.log('\n📊 Demonstrating Analytics...');

    const company = this.demoData.companies[0];
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Job analytics
    const totalJobs = await prisma.job.count({
      where: { companyId: company.id }
    });

    const completedJobs = await prisma.job.count({
      where: {
        companyId: company.id,
        status: 'COMPLETED'
      }
    });

    const weeklyJobs = await prisma.job.count({
      where: {
        companyId: company.id,
        createdAt: { gte: weekAgo }
      }
    });

    // Revenue analytics
    const payments = await prisma.payment.findMany({
      where: {
        companyId: company.id,
        status: 'COMPLETED'
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const averageJobValue = totalRevenue / payments.length || 0;

    // Driver analytics
    const activeDrivers = await prisma.user.count({
      where: {
        companyId: company.id,
        role: 'DRIVER',
        isActive: true
      }
    });

    const onlineDrivers = await prisma.shift.count({
      where: {
        companyId: company.id,
        status: 'ONLINE',
        endTime: null
      }
    });

    // Rating analytics
    const ratings = await prisma.rating.findMany({
      where: { companyId: company.id }
    });

    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 0;

    console.log(`📈 Analytics for ${company.name}:`);
    console.log(`   Total jobs: ${totalJobs}`);
    console.log(`   Completed jobs: ${completedJobs} (${((completedJobs / totalJobs) * 100).toFixed(1)}%)`);
    console.log(`   Jobs this week: ${weeklyJobs}`);
    console.log(`   Total revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`   Average job value: $${averageJobValue.toFixed(2)}`);
    console.log(`   Active drivers: ${activeDrivers}`);
    console.log(`   Online drivers: ${onlineDrivers}`);
    console.log(`   Average rating: ${averageRating.toFixed(1)}/5.0 stars`);
    console.log(`   Total ratings: ${ratings.length}`);
  }

  printDemoSummary() {
    console.log(`   Companies created: ${this.demoData.companies.length}`);
    console.log(`   Users created: ${this.demoData.users.length}`);
    console.log(`   Jobs processed: ${this.demoData.jobs.length}`);
    console.log(`   Tariffs configured: ${this.demoData.tariffs.length}`);

    const roles = this.demoData.users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    console.log(`   User roles: ${JSON.stringify(roles)}`);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up demo data...');

    try {
      // Delete in reverse dependency order
      await prisma.rating.deleteMany({
        where: {
          raterId: { in: this.demoData.users.map(u => u.id) }
        }
      });

      await prisma.walletTransaction.deleteMany({
        where: { userId: { in: this.demoData.users.map(u => u.id) } }
      });

      await prisma.payment.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.locationUpdate.deleteMany({
        where: { driverId: { in: this.demoData.users.filter(u => u.role === 'DRIVER').map(u => u.id) } }
      });

      await prisma.assignment.deleteMany({
        where: { driverId: { in: this.demoData.users.filter(u => u.role === 'DRIVER').map(u => u.id) } }
      });

      await prisma.offer.deleteMany({
        where: { driverId: { in: this.demoData.users.filter(u => u.role === 'DRIVER').map(u => u.id) } }
      });

      await prisma.shift.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.deliveryOrder.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.job.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.ride.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.tariff.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      await prisma.vehicle.deleteMany({
        where: { companyId: { in: this.demoData.companies.map(c => c.id) } }
      });

      // Delete companies first (cascade will handle user relations)
      await prisma.company.deleteMany({
        where: { id: { in: this.demoData.companies.map(c => c.id) } }
      });

      // Clean up any remaining users
      await prisma.user.deleteMany({
        where: { email: { in: this.demoData.users.map(u => u.email) } }
      });

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    } finally {
      await prisma.$disconnect();
    }
  }
}

// Run demo if called directly
if (require.main === module) {
  const demo = new TaxiSystemDemo();
  demo.runDemo()
    .then(() => {
      console.log('\n🎉 Demo finished successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Demo failed:', error);
      process.exit(1);
    });
}

module.exports = TaxiSystemDemo;