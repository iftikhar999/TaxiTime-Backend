const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting ADVANCED database seeding...');

  // Skip basic seeder since we already have data - let's get existing data
  console.log('📋 Getting existing data...');
  
  // Get existing data to build upon
  const companies = await prisma.company.findMany();
  const drivers = await prisma.user.findMany({ where: { role: 'DRIVER' } });
  const passengers = await prisma.user.findMany({ where: { role: 'PASSENGER' } });
  const vehicles = await prisma.vehicle.findMany();

  console.log(`Found: ${companies.length} companies, ${drivers.length} drivers, ${passengers.length} passengers, ${vehicles.length} vehicles`);

  if (companies.length === 0) {
    console.log('❌ No companies found. Please run the basic seeder first.');
    return;
  }

  // 1. MASTER DATA - Document Types & Fare Types
  const documentTypes = [
    { name: 'Driver License', code: 'DL', description: 'Driving license document', category: 'DRIVER' },
    { name: 'Vehicle Registration', code: 'VR', description: 'Vehicle registration certificate', category: 'VEHICLE' },
    { name: 'Insurance Certificate', code: 'IC', description: 'Insurance certificate', category: 'VEHICLE' },
    { name: 'Identity Card', code: 'ID', description: 'National identity card', category: 'DRIVER' },
    { name: 'Medical Certificate', code: 'MC', description: 'Medical fitness certificate', category: 'DRIVER' }
  ];

  for (const docType of documentTypes) {
    await prisma.documentTypeMaster.upsert({
      where: { code: docType.code },
      update: docType,
      create: docType
    });
  }

  const fareTypes = [
    { name: 'Base Fare', code: 'BASE', description: 'Initial fare charge' },
    { name: 'Distance Rate', code: 'DISTANCE', description: 'Per kilometer rate' },
    { name: 'Time Rate', code: 'TIME', description: 'Per minute rate' },
    { name: 'Waiting Fee', code: 'WAITING', description: 'Waiting time charge' },
    { name: 'Peak Hour', code: 'PEAK', description: 'Peak hour surcharge' }
  ];

  for (const fareType of fareTypes) {
    await prisma.fareType.upsert({
      where: { code: fareType.code },
      update: fareType,
      create: fareType
    });
  }
  console.log('✅ Master data created');

  // 2. DOCUMENTS - Driver & Vehicle Documents
  const documents = [];
  for (const driver of drivers) {
    // Driver License
    documents.push(await prisma.document.create({
      data: {
        driverId: driver.id,
        type: 'DRIVER_LICENSE',
        documentNumber: `DL${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
        fileUrl: `/uploads/documents/license_${driver.id}.pdf`,
        fileName: `${driver.firstName}_license.pdf`,
        fileSize: 1024000,
        issueDate: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000), // 2 years ago
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        status: 'APPROVED',
        verifiedAt: new Date(),
      }
    }));

    // ID Card
    documents.push(await prisma.document.create({
      data: {
        driverId: driver.id,
        type: 'ID_CARD',
        documentNumber: `ID${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
        fileUrl: `/uploads/documents/id_${driver.id}.pdf`,
        fileName: `${driver.firstName}_id.pdf`,
        fileSize: 512000,
        issueDate: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), // 5 years ago
        status: 'APPROVED',
        verifiedAt: new Date(),
      }
    }));

    // Vehicle documents for this driver's vehicle
    const vehicle = vehicles.find(v => v.driverId === driver.id);
    if (vehicle) {
      // Vehicle Registration
      documents.push(await prisma.document.create({
        data: {
          driverId: driver.id,
          type: 'VEHICLE_REGISTRATION',
          documentNumber: vehicle.licensePlate,
          fileUrl: `/uploads/documents/registration_${vehicle.id}.pdf`,
          fileName: `${vehicle.licensePlate}_registration.pdf`,
          fileSize: 768000,
          issueDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          status: 'APPROVED',
          verifiedAt: new Date(),
        }
      }));

      // Insurance
      documents.push(await prisma.document.create({
        data: {
          driverId: driver.id,
          type: 'INSURANCE',
          documentNumber: `INS${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
          fileUrl: `/uploads/documents/insurance_${vehicle.id}.pdf`,
          fileName: `${vehicle.licensePlate}_insurance.pdf`,
          fileSize: 896000,
          issueDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 months ago
          expiryDate: new Date(Date.now() + 185 * 24 * 60 * 60 * 1000), // ~6 months from now
          status: 'APPROVED',
          verifiedAt: new Date(),
        }
      }));
    }
  }
  console.log('✅ Documents created:', documents.length);

  // 3. COMPANY DOCUMENTS
  for (const company of companies) {
    await prisma.companyDocument.create({
      data: {
        companyId: company.id,
        type: 'OPERATING_LICENSE',
        description: 'Business operating license',
        fileName: `operating_license_${company.id}.pdf`,
        fileUrl: `/uploads/company/operating_license_${company.id}.pdf`,
        storagePath: `/uploads/company/operating_license_${company.id}.pdf`,
        fileSize: 2048000,
        status: 'APPROVED',
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years
      }
    });

    await prisma.companyDocument.create({
      data: {
        companyId: company.id,
        type: 'TAX_CERTIFICATE',
        description: 'Tax registration certificate',
        fileName: `tax_cert_${company.id}.pdf`,
        fileUrl: `/uploads/company/tax_cert_${company.id}.pdf`,
        storagePath: `/uploads/company/tax_cert_${company.id}.pdf`,
        fileSize: 1536000,
        status: 'APPROVED',
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
    });

    await prisma.companyDocument.create({
      data: {
        companyId: company.id,
        type: 'INSURANCE_POLICY',
        description: 'Company insurance policy',
        fileName: `insurance_${company.id}.pdf`,
        fileUrl: `/uploads/company/insurance_${company.id}.pdf`,
        storagePath: `/uploads/company/insurance_${company.id}.pdf`,
        fileSize: 1800000,
        status: 'APPROVED',
        reviewedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
    });
  }
  console.log('✅ Company documents created');

  // 4. DRIVER SHIFTS
  const shifts = [];
  for (const driver of drivers) {
    const driverCompany = companies.find(c => c.id === driver.companyId);
    
    // Skip if driver doesn't have a valid company
    if (!driverCompany) {
      console.log(`⚠️  Skipping shifts for driver ${driver.email} - no company found`);
      continue;
    }
    
    // Create shifts for the last 7 days
    for (let i = 0; i < 7; i++) {
      const shiftDate = new Date();
      shiftDate.setDate(shiftDate.getDate() - i);
      
      const startTime = new Date(shiftDate);
      startTime.setHours(Math.floor(Math.random() * 6) + 6); // Start between 6-11 AM
      
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + Math.floor(Math.random() * 8) + 6); // 6-14 hour shifts
      
      shifts.push(await prisma.shift.create({
        data: {
          driverId: driver.id,
          companyId: driverCompany.id,
          startTime,
          endTime,
          status: 'ONLINE',
          totalEarnings: Math.floor(Math.random() * 300) + 100, // $100-400
          totalTrips: Math.floor(Math.random() * 15) + 5, // 5-20 rides
          totalDistance: Math.floor(Math.random() * 200) + 50, // 50-250 km
        }
      }));
    }
  }
  console.log('✅ Driver shifts created:', shifts.length);

  // 5. MERCHANTS & RESTAURANTS
  const merchants = [];
  const restaurants = [];
  
  for (const company of companies) {
    console.log('Processing company:', company.name, 'ID:', company.id);
    const companyNameClean = (company.name || 'company').toLowerCase().replaceAll(/\s+/g, '');
    
    // Create merchants
    for (let i = 1; i <= 3; i++) {
      const merchantEmail = `merchant${i}_${company.id}@${companyNameClean}.com`;
      const merchant = await prisma.merchant.upsert({
        where: { email: merchantEmail },
        update: {},
        create: {
          name: `${company.name || 'Unknown Company'} Merchant ${i}`,
          email: merchantEmail,
          phone: `+1234567${8000 + i}${company.id.slice(-3)}`,
          address: {
            street: `${100 + i} Merchant St`,
            city: 'Business District',
            state: 'NY',
            zipCode: '10001',
            latitude: 40.758 + (Math.random() - 0.5) * 0.1,
            longitude: -73.9855 + (Math.random() - 0.5) * 0.1
          },
          businessType: ['RETAIL', 'PHARMACY', 'ELECTRONICS'][i - 1],
          companyId: company.id,
          cuisine: ['GENERAL'],
          priceRange: 'MODERATE',
          isActive: true,
          isOpen: true,
        }
      });
      merchants.push(merchant);
    }

    // Create restaurants
    for (let i = 1; i <= 5; i++) {
      const restaurantEmail = `restaurant${i}_${company.id}@${companyNameClean}.com`;
      const restaurant = await prisma.restaurant.upsert({
        where: { email: restaurantEmail },
        update: {},
        create: {
          name: `${['Pizza Palace', 'Burger Hub', 'Sushi Bar', 'Taco Corner', 'Coffee House'][i - 1]}`,
          email: restaurantEmail,
          phone: `+1234567${9000 + i}${company.id.slice(-3)}`,
          address: {
            street: `${200 + i} Food St`,
            city: 'Restaurant Row',
            state: 'NY',
            zipCode: '10002',
            latitude: 40.7505 + (Math.random() - 0.5) * 0.1,
            longitude: -73.9934 + (Math.random() - 0.5) * 0.1
          },
          cuisine: [['ITALIAN'], ['AMERICAN'], ['JAPANESE'], ['MEXICAN'], ['COFFEE']][i - 1],
          priceRange: ['MODERATE', 'BUDGET', 'PREMIUM', 'BUDGET', 'BUDGET'][i - 1],
          rating: Math.floor(Math.random() * 20) / 10 + 3, // 3.0-5.0 rating
          ratingCount: Math.floor(Math.random() * 100) + 10,
          isActive: true,
          isOpen: true,
        }
      });
      restaurants.push(restaurant);
    }
  }
  console.log('✅ Merchants created:', merchants.length);
  console.log('✅ Restaurants created:', restaurants.length);

  // 6. RIDES & RIDE OFFERS - Create realistic ride history
  const rides = [];
  const rideOffers = [];
  
  // Only create rides if we have passengers
  if (passengers.length === 0) {
    console.log('⚠️  No passengers found - skipping ride creation');
  } else {
    for (let i = 0; i < 50; i++) {
      const passenger = passengers[Math.floor(Math.random() * passengers.length)];
      const driver = drivers[Math.floor(Math.random() * drivers.length)];
      const company = companies.find(c => c.id === driver.companyId);
      
      // Skip if driver doesn't have a valid company
      if (!company) {
        continue;
      }
      
      const rideDate = new Date();
      rideDate.setDate(rideDate.getDate() - Math.floor(Math.random() * 30)); // Last 30 days
      
      const ride = await prisma.ride.create({
        data: {
          rideId: `RIDE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          passengerId: passenger.id,
          driverId: driver.id,
          companyId: company.id,
          vehicleId: vehicles.find(v => v.driverId === driver.id)?.id,
        pickup: {
          address: `${Math.floor(Math.random() * 999) + 1} Pickup St`,
          latitude: 40.7589 + (Math.random() - 0.5) * 0.05,
          longitude: -73.9851 + (Math.random() - 0.5) * 0.05
        },
        destination: {
          address: `${Math.floor(Math.random() * 999) + 1} Destination Ave`,
          latitude: 40.7489 + (Math.random() - 0.5) * 0.05,
          longitude: -73.9951 + (Math.random() - 0.5) * 0.05
        },
        estimatedDistance: Math.floor(Math.random() * 20) + 2, // 2-22 km
        estimatedDuration: Math.floor(Math.random() * 40) + 10, // 10-50 minutes
        estimatedFare: Math.floor(Math.random() * 50) + 15, // $15-65
        actualDistance: Math.floor(Math.random() * 20) + 2,
        actualDuration: Math.floor(Math.random() * 40) + 10,
        actualFare: Math.floor(Math.random() * 50) + 15,
        status: ['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED'][Math.floor(Math.random() * 4)],
        paymentMethod: ['CASH', 'CARD', 'WALLET'][Math.floor(Math.random() * 3)],
        paymentStatus: 'COMPLETED',
        requestedAt: rideDate,
        acceptedAt: new Date(rideDate.getTime() + 2 * 60 * 1000), // 2 min later
        pickedUpAt: new Date(rideDate.getTime() + 5 * 60 * 1000), // 5 min later
        completedAt: new Date(rideDate.getTime() + 35 * 60 * 1000), // 35 min later
        rideType: 'TAXI',
      }
    });
    rides.push(ride);

    // Create ride offers for this ride
    const offerCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < offerCount; j++) {
      const offerDriver = drivers[Math.floor(Math.random() * drivers.length)];
      if (offerDriver.id !== driver.id) {
        const rideOffer = await prisma.rideOffer.upsert({
          where: {
            rideId_driverId: {
              rideId: ride.id,
              driverId: offerDriver.id
            }
          },
          update: {},
          create: {
            rideId: ride.id,
            driverId: offerDriver.id,
            status: j === 0 && offerDriver.id === driver.id ? 'ACCEPTED' : 'REJECTED',
            offeredAt: new Date(rideDate.getTime() + j * 30 * 1000),
            respondedAt: new Date(rideDate.getTime() + (j + 1) * 30 * 1000),
          }
        });
        rideOffers.push(rideOffer);
      }
    }
  }
  }
  console.log('✅ Rides created:', rides.length);
  console.log('✅ Ride offers created:', rideOffers.length);

  // 7. DELIVERY ORDERS
  const deliveryOrders = [];
  // Only create orders if we have passengers
  if (passengers.length === 0) {
    console.log('⚠️  No passengers found - skipping delivery order creation');
  } else {
    for (let i = 0; i < 30; i++) {
      const passenger = passengers[Math.floor(Math.random() * passengers.length)];
      const driver = drivers[Math.floor(Math.random() * drivers.length)];
      const merchant = merchants[Math.floor(Math.random() * merchants.length)];
      
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * 15)); // Last 15 days
      
    deliveryOrders.push(await prisma.deliveryOrder.create({
      data: {
        orderId: `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        companyId: driver.companyId,
        customerId: passenger.id,
        type: 'FOOD',
        merchantId: merchant.id,
        pickupLocation: merchant.address,
        dropoffLocation: {
          street: `${Math.floor(Math.random() * 999) + 1} Delivery Ave`,
          city: 'Delivery District',
          state: 'NY',
          zipCode: '10003',
          latitude: 40.7489 + (Math.random() - 0.5) * 0.05,
          longitude: -73.9951 + (Math.random() - 0.5) * 0.05
        },
        items: {
          item1: { name: 'Pizza Margherita', quantity: 1, price: 15.99 },
          item2: { name: 'Soft Drink', quantity: 2, price: 2.50 }
        },
        totalAmount: Math.floor(Math.random() * 100) + 25, // $25-125
        deliveryFee: Math.floor(Math.random() * 8) + 5, // $5-13
        status: ['DELIVERED', 'DELIVERED', 'CANCELLED'][Math.floor(Math.random() * 3)],
        confirmedAt: orderDate,
        readyForPickupAt: new Date(orderDate.getTime() + 10 * 60 * 1000),
        pickedUpAt: new Date(orderDate.getTime() + 20 * 60 * 1000),
        deliveredAt: new Date(orderDate.getTime() + 50 * 60 * 1000),
      }
    }));
  }
  }
  console.log('✅ Delivery orders created:', deliveryOrders.length);

  // 8. JOBS & ASSIGNMENTS
  const jobs = [];
  const assignments = [];
  
  // Only create jobs if we have rides
  if (rides.length === 0) {
    console.log('⚠️  No rides found - skipping job creation');
  } else {
    for (let i = 0; i < 100; i++) {
      const driver = drivers[Math.floor(Math.random() * drivers.length)];
      const ride = rides[Math.floor(Math.random() * rides.length)];
      
      const job = await prisma.job.create({
        data: {
          jobId: `JOB_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          companyId: ride.companyId,
          type: 'TAXI',
          status: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'][Math.floor(Math.random() * 5)],
          tripId: ride.id,
          customerId: ride.passengerId,
          assignedDriverId: driver.id,
        priority: Math.floor(Math.random() * 5) + 1,
        estimatedDuration: Math.floor(Math.random() * 60) + 15,
        pickupAddress: ride.pickup.address,
        pickupLatitude: ride.pickup.latitude,
        pickupLongitude: ride.pickup.longitude,
        dropoffAddress: ride.destination.address,
        dropoffLatitude: ride.destination.latitude,
        dropoffLongitude: ride.destination.longitude,
        estimatedPrice: ride.estimatedFare,
        actualFare: ride.actualFare,
        createdAt: ride.requestedAt,
        scheduledAt: ride.acceptedAt,
      }
    });
    jobs.push(job);

    // Create assignment for this job
    assignments.push(await prisma.assignment.create({
      data: {
        jobId: job.id,
        driverId: driver.id,
        assignedBy: 'system', // System auto-assignment
        assignedAt: ride.acceptedAt || new Date(),
        status: 'COMPLETED',
        acceptedAt: ride.acceptedAt,
      }
    }));
  }
  }
  console.log('✅ Jobs created:', jobs.length);
  console.log('✅ Assignments created:', assignments.length);

  // 9. PAYMENTS & FINANCIAL RECORDS
  const payments = [];
  const walletTransactions = [];
  const driverEarnings = [];
  
  for (const ride of rides.filter(r => r.status === 'COMPLETED')) {
    // Create payment for ride
    const payment = await prisma.payment.create({
      data: {
        companyId: ride.companyId,
        tripId: ride.id,
        customerId: ride.passengerId,
        driverId: ride.driverId,
        amount: ride.actualFare,
        paymentMethod: ride.paymentMethod,
        status: 'COMPLETED',
        providerTransactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        processedAt: ride.completedAt,
        paidAt: ride.completedAt,
        completedAt: ride.completedAt,
        baseAmount: ride.actualFare * 0.9, // 90% base fare
        tips: Math.floor(Math.random() * 5), // Random tips
        taxes: ride.actualFare * 0.1, // 10% tax
        driverEarnings: ride.actualFare * 0.8, // 80% to driver
        currency: 'USD',
      }
    });
    payments.push(payment);

        // Create wallet transactions
        if (ride.paymentMethod === 'WALLET') {
          // Debit from passenger wallet  
          walletTransactions.push(await prisma.walletTransaction.create({
            data: {
              userId: ride.passengerId,
              amount: -ride.actualFare,
              type: 'DEBIT',
              description: `Payment for ride to ${ride.endLocation || 'destination'}`,
              balanceBefore: Math.random() * 500 + 100, // Random balance
              balanceAfter: Math.random() * 400 + 50,   // Lower balance after debit
            }
          }));      // Credit to driver wallet
      const driverShare = ride.actualFare * 0.8; // 80% to driver
      walletTransactions.push(await prisma.walletTransaction.create({
        data: {
          userId: ride.driverId,
          amount: driverShare,
          type: 'CREDIT',
          description: `Earning from ride from ${ride.pickupAddress}`,
          balanceBefore: Math.floor(Math.random() * 200) + 50,
          balanceAfter: Math.floor(Math.random() * 500) + 100,
        }
      }));
    }

    // Create driver earnings
    const driverShare = ride.actualFare * 0.8;
    const companyCommission = ride.actualFare * 0.2;
    
    driverEarnings.push(await prisma.driverEarning.create({
      data: {
        driverId: ride.driverId,
        companyId: ride.companyId,
        amount: driverShare, // Required field
        paymentMethod: ride.paymentMethod, // Required field
        totalAmount: ride.actualFare, // Required field
        driverEarnings: driverShare, // Required field - amount driver actually gets
        earnedAt: ride.completedAt,
        baseFare: ride.actualFare * 0.6,
        distanceFare: ride.actualFare * 0.3,
        timeFare: ride.actualFare * 0.1,
        companyCommission: companyCommission,
        commissionRate: 0.2,
      }
    }));
  }
  console.log('✅ Payments created:', payments.length);
  console.log('✅ Wallet transactions created:', walletTransactions.length);
  console.log('✅ Driver earnings created:', driverEarnings.length);

  // 10. LOCATION UPDATES - Recent driver locations
  const locationUpdates = [];
  for (const driver of drivers) {
    // Create location updates for the last 2 hours
    for (let i = 0; i < 20; i++) {
      const updateTime = new Date();
      updateTime.setMinutes(updateTime.getMinutes() - i * 6); // Every 6 minutes
      
      locationUpdates.push(await prisma.locationUpdate.create({
        data: {
          driverId: driver.id,
          latitude: 40.7589 + (Math.random() - 0.5) * 0.01,
          longitude: -73.9851 + (Math.random() - 0.5) * 0.01,
          speed: Math.floor(Math.random() * 60), // 0-60 km/h
          heading: Math.floor(Math.random() * 360), // 0-359 degrees
          accuracy: Math.floor(Math.random() * 10) + 3, // 3-13 meters
          altitude: Math.floor(Math.random() * 100) + 50, // 50-150 meters
          batteryLevel: Math.floor(Math.random() * 50) + 50, // 50-100%
          timestamp: updateTime,
        }
      }));
    }
  }
  console.log('✅ Location updates created:', locationUpdates.length);

  // 11. RATINGS & REVIEWS
  const ratings = [];
  for (const ride of rides.filter(r => r.status === 'COMPLETED')) {
    // Passenger rates driver
    if (Math.random() > 0.3) { // 70% of rides get rated
      ratings.push(await prisma.rating.create({
        data: {
          tripId: ride.id, // Changed from rideId to tripId
          raterId: ride.passengerId,
          rateeId: ride.driverId,
          rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars mostly
          comment: [
            'Great driver, very professional!',
            'Clean car and safe driving.',
            'On time and friendly service.',
            'Excellent experience, highly recommended!',
            'Good ride, no complaints.',
            null
          ][Math.floor(Math.random() * 6)],
          tags: ['professional', 'punctual'],
        }
      }));
    }

    // Driver rates passenger
    if (Math.random() > 0.5) { // 50% of drivers rate passengers
      ratings.push(await prisma.rating.create({
        data: {
          tripId: ride.id, // Changed from rideId to tripId
          raterId: ride.driverId,
          rateeId: ride.passengerId,
          rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars mostly
          comment: [
            'Polite and respectful passenger.',
            'On time and easy pickup.',
            'Good passenger.',
            null
          ][Math.floor(Math.random() * 4)],
          tags: ['polite', 'punctual'],
        }
      }));
    }
  }
  console.log('✅ Ratings created:', ratings.length);

  // 12. MESSAGES & NOTIFICATIONS
  const messages = [];
  const notifications = [];
  
  // Only create messages if we have rides
  if (rides.length === 0) {
    console.log('⚠️  No rides found - skipping message creation');
  } else {
    // Create ride-related messages
    for (let i = 0; i < 100; i++) {
      const ride = rides[Math.floor(Math.random() * rides.length)];
      messages.push(await prisma.message.create({
        data: {
          senderId: [ride.passengerId, ride.driverId][Math.floor(Math.random() * 2)],
          receiverId: [ride.passengerId, ride.driverId][Math.floor(Math.random() * 2)], // Changed from recipientId
          content: [
            'I am on my way to pickup location',
            'Where exactly are you?',
            'I can see you, coming in 2 minutes',
            'Thank you for the ride!',
            'Please rate me 5 stars',
            'Could you please hurry up?'
          ][Math.floor(Math.random() * 6)],
        messageType: 'TEXT',
        isRead: Math.random() > 0.3, // 70% read
      }
    }));
  }

  // Create notifications for each user
  for (const user of [...drivers, ...passengers]) {
    for (let i = 0; i < 5; i++) {
      const notifDate = new Date();
      notifDate.setDate(notifDate.getDate() - i);
      
      notifications.push(await prisma.notification.create({
        data: {
          userId: user.id,
          title: [
            'Ride Completed Successfully',
            'New Ride Request',
            'Payment Received',
            'Weekly Earnings Summary',
            'Profile Update Required',
            'New Feature Available',
            'Maintenance Reminder'
          ][Math.floor(Math.random() * 7)],
          body: 'Your ride has been completed successfully. Thank you for using our service!', // Changed from message to body
          type: ['JOB_ASSIGNED', 'JOB_COMPLETED', 'PAYMENT_RECEIVED', 'SYSTEM_ALERT', 'PROMOTION'][Math.floor(Math.random() * 5)],
          isRead: Math.random() > 0.4, // 60% read
          sentAt: notifDate,
        }
      }));
    }
  }
  }
  console.log('✅ Messages created:', messages.length);
  console.log('✅ Notifications created:', notifications.length);

  // 13. SUPPORT TICKETS
  const supportTickets = [];
  for (let i = 0; i < 20; i++) {
    const user = [...drivers, ...passengers][Math.floor(Math.random() * (drivers.length + passengers.length))];
    supportTickets.push(await prisma.supportTicket.create({
      data: {
        companyId: companies[Math.floor(Math.random() * companies.length)].id, // Changed from userId to companyId
        reporterId: user.id, // Changed from userId to reporterId
        ticketNumber: `TKT-${Date.now()}-${i}`, // Added required ticketNumber
        subject: [
          'Payment Issue',
          'App Not Working',
          'Driver Complaint',
          'Fare Dispute',
          'Account Problem',
          'Feature Request'
        ][Math.floor(Math.random() * 6)],
        description: 'I am experiencing an issue with the application and need assistance.',
        priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][Math.floor(Math.random() * 4)],
        status: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'][Math.floor(Math.random() * 4)],
        category: ['TECHNICAL', 'BILLING', 'GENERAL', 'COMPLAINT'][Math.floor(Math.random() * 4)],
      }
    }));
  }
  console.log('✅ Support tickets created:', supportTickets.length);

  // Skip promotional offers - no model exists for them
  console.log('⏭️ Skipping promotional offers - no model found');

  // 15. SYSTEM ALARMS
  const alarms = [];
  for (let i = 0; i < 10; i++) {
    alarms.push(await prisma.alarm.create({
      data: {
        companyId: companies[Math.floor(Math.random() * companies.length)].id, // Required field
        type: ['PANIC', 'EMERGENCY', 'MAINTENANCE', 'SYSTEM'][Math.floor(Math.random() * 4)], // Required enum field
        title: [
          'High CPU Usage Detected',
          'Database Connection Slow',
          'Payment Gateway Timeout',
          'Driver Offline Alert',
          'Unusual Ride Pattern',
          'System Maintenance Required'
        ][Math.floor(Math.random() * 6)],
        description: 'System alert requires attention from administrators.',
        severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
        status: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'][Math.floor(Math.random() * 3)],
        acknowledgedAt: Math.random() > 0.5 ? new Date() : null,
      }
    }));
  }
  console.log('✅ System alarms created:', alarms.length);

  // 16. ADVANCED CONFIGURATIONS
  for (const company of companies) {
    // Company-specific configurations
    await prisma.companyConfiguration.upsert({
      where: { 
        companyId_key: { // Changed from companyId_configKey to companyId_key
          companyId: company.id,
          key: 'MAX_RIDE_DISTANCE' // Changed from configKey to key
        }
      },
      update: { value: 50 }, // Changed from configValue to value
      create: {
        companyId: company.id,
        key: 'MAX_RIDE_DISTANCE', // Changed from configKey to key
        category: 'RIDE_SETTINGS',
        displayName: 'Maximum Ride Distance',
        description: 'Maximum ride distance in kilometers',
        dataType: 'NUMBER',
        value: 50, // Changed from configValue to value
      }
    });

    await prisma.companyConfiguration.upsert({
      where: { 
        companyId_key: { // Changed from companyId_configKey to companyId_key
          companyId: company.id,
          key: 'COMMISSION_RATE' // Changed from configKey to key
        }
      },
      update: { value: 0.2 }, // Changed from configValue to value
      create: {
        companyId: company.id,
        key: 'COMMISSION_RATE', // Changed from configKey to key
        category: 'FINANCE_SETTINGS',
        displayName: 'Commission Rate',
        description: 'Company commission rate (0.2 = 20%)',
        dataType: 'NUMBER',
        value: 0.2, // Changed from configValue to value
      }
    });

    // Company settings
    await prisma.companySettings.upsert({
      where: { companyId: company.id },
      update: {
        mapProvider: 'OPENSTREETMAP',
        defaultLanguage: 'en',
        defaultCurrency: 'USD',
        timezone: 'UTC',
        locationUpdateInterval: 2,
        heartbeatInterval: 30,
      },
      create: {
        companyId: company.id,
        mapProvider: 'OPENSTREETMAP',
        defaultLanguage: 'en',
        defaultCurrency: 'USD',
        timezone: 'UTC',
        locationUpdateInterval: 2,
        heartbeatInterval: 30,
      }
    });
  }
  console.log('✅ Advanced company configurations created');

  console.log('\n🎉 ADVANCED DATABASE SEEDING COMPLETED!');
  console.log('\n📊 COMPREHENSIVE DATA SUMMARY:');
  console.log(`   • ${rides.length} Completed Rides with Full History`);
  console.log(`   • ${driverEarnings.length} Driver Earnings Records`);
  console.log(`   • ${payments.length} Payment Transactions`);
  console.log(`   • ${documents.length} Document Uploads`);
  console.log(`   • ${shifts.length} Driver Work Shifts`);
  console.log(`   • ${merchants.length} Business Merchants`);
  console.log(`   • ${restaurants.length} Partner Restaurants`);
  console.log(`   • ${deliveryOrders.length} Delivery Orders`);
  console.log(`   • ${locationUpdates.length} Real-time Location Updates`);
  console.log(`   • ${ratings.length} Customer Reviews & Ratings`);
  console.log(`   • ${messages.length} In-app Messages`);
  console.log(`   • ${notifications.length} Push Notifications`);
  console.log(`   • ${supportTickets.length} Support Tickets`);
  console.log(`   • ${alarms.length} System Monitoring Alerts`);
  console.log('\n🚀 Your taxi platform is now FULLY OPERATIONAL with realistic data!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });