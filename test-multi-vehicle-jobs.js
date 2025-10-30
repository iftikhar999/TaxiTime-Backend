/**
 * Test script for multiple vehicle job creation
 */

const API_BASE = 'http://localhost:3000';

async function testMultiVehicleJobCreation() {
  console.log('🚗 Testing Multiple Vehicle Job Creation...\n');

  const jobPayload = {
    // Customer
    passengerName: 'John Doe',
    phone: '1234567890',
    email: 'john@example.com',

    // Locations
    pickup: {
      address: '123 Main St, City',
      lat: 40.7128,
      lng: -74.0060,
    },
    destination: {
      address: '456 Oak Ave, City',
      lat: 40.7589,
      lng: -73.9851,
    },

    // Pricing
    tariffId: 'standard',
    estimatedDistance: 5.2,
    estimatedFare: 15.50,

    // Job requirements - Testing multiple vehicles
    requirements: {
      passengers: 6, // Large group
      bags: 4,
      wheelchairs: 1,
      vehiclesNeeded: 2, // Multiple vehicles needed
    },

    // Schedule for later
    scheduledFor: new Date(Date.now() + 3600000), // 1 hour from now

    // Payment
    paymentMethod: 'cash',

    // Driver assignment
    driverAssignment: 'auto',

    // Notes
    notes: 'Large group requiring 2 vehicles for airport transfer',
  };

  try {
    console.log('📋 Job Payload:');
    console.log(JSON.stringify(jobPayload, null, 2));
    console.log('\n');

    const response = await fetch(`${API_BASE}/api/dispatch/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload),
    });

    const result = await response.json();
    
    console.log('✅ Job Creation Response:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');

    if (result.success) {
      console.log('🎉 Job created successfully!');
      console.log(`📄 Job ID: ${result.data.id}`);
      console.log(`🔖 Job Reference: ${result.data.rideId}`);
      
      // Test fetching the created job
      await testJobRetrieval(result.data.id);
    } else {
      console.log('❌ Job creation failed:', result.message);
    }

  } catch (error) {
    console.error('❌ Error testing job creation:', error.message);
  }
}

async function testJobRetrieval(jobId) {
  console.log('\n🔍 Testing Job Retrieval...');
  
  try {
    const response = await fetch(`${API_BASE}/api/dispatch/jobs`);
    const jobs = await response.json();
    
    if (Array.isArray(jobs.data)) {
      const createdJob = jobs.data.find(job => job.id === jobId);
      
      if (createdJob) {
        console.log('✅ Job found in listing:');
        console.log(`- ID: ${createdJob.id}`);
        console.log(`- Reference: ${createdJob.reference || createdJob.jobId}`);
        console.log(`- Status: ${createdJob.status}`);
        console.log(`- Passengers: ${createdJob.requirements?.passengers || createdJob.passengers || 'N/A'}`);
        console.log(`- Bags: ${createdJob.requirements?.bags || createdJob.bags || 'N/A'}`);
        console.log(`- Wheelchairs: ${createdJob.requirements?.wheelchairs || createdJob.wheelchairs || 'N/A'}`);
        console.log(`- Vehicles Needed: ${createdJob.requirements?.vehiclesNeeded || createdJob.vehiclesNeeded || 'N/A'}`);
        console.log(`- Scheduled: ${createdJob.scheduledFor ? 'Yes' : 'No'}`);
        console.log(`- Notes: ${createdJob.notes || 'N/A'}`);
      } else {
        console.log('❌ Created job not found in listing');
      }
    } else {
      console.log('❌ Invalid response format for jobs listing');
    }

  } catch (error) {
    console.error('❌ Error retrieving job:', error.message);
  }
}

// Run the test
testMultiVehicleJobCreation();