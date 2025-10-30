#!/usr/bin/env node

/**
 * Test Script for Job Creation and Edit Flow
 * 
 * This script tests:
 * 1. Creating a job with all possible fields
 * 2. Editing the job to update all fields
 * 3. Verifying field persistence in the database
 * 
 * Usage:
 *   node test-job-crud.js <AUTH_TOKEN>
 * 
 * Prerequisites:
 *   - Backend server running on http://localhost:3000
 *   - Valid authentication token
 *   - Database with at least one tariff configured
 */

const http = require('http');
const https = require('https');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.argv[2];

if (!AUTH_TOKEN) {
  console.error('❌ Error: Authentication token required');
  console.error('Usage: node test-job-crud.js <AUTH_TOKEN>');
  process.exit(1);
}

// Test Data
const TEST_JOB_CREATE = {
  // Customer info
  passengerName: 'Test Passenger',
  phone: '+1234567890',
  email: 'test@example.com',
  
  // Location
  pickup: {
    address: '123 Main St, New York, NY',
    lat: 40.7128,
    lng: -74.0060
  },
  destination: {
    address: '456 Park Ave, New York, NY',
    lat: 40.7580,
    lng: -73.9855
  },
  
  // Pricing - will be calculated by backend
  tariffId: 'default-tariff-id', // Replace with actual tariff ID
  estimatedDistance: 5.2,
  estimatedFare: 25.50,
  fareBreakdown: {
    base: 5.00,
    distance: 15.50,
    waiting: 5.00
  },
  
  // Schedule
  scheduledFor: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  
  // Job details
  notes: 'Please call upon arrival',
  validationCode: 'TEST123',
  requirements: {
    passengers: 2,
    bags: 3,
    wheelchairs: 0,
    vehiclesNeeded: 1,
    currency: 'USD'
  },
  
  // Payment
  paymentMethod: 'cash',
  
  // Driver assignment
  driverAssignment: 'auto'
};

const TEST_JOB_UPDATE = {
  // Update passenger info
  passengerName: 'Updated Passenger Name',
  phone: '+9876543210',
  email: 'updated@example.com',
  
  // Update locations
  pickup: {
    address: '789 Broadway, New York, NY',
    latitude: 40.7300,
    longitude: -73.9950
  },
  dropoff: {
    address: '321 Fifth Ave, New York, NY',
    latitude: 40.7484,
    longitude: -73.9857
  },
  
  // Update job details
  notes: 'Updated notes - meet at back entrance',
  passengers: 3,
  bags: 1,
  wheelchairs: 1,
  vehiclesNeeded: 1,
  paymentMethod: 'card',
  currency: 'USD',
  recalculateFare: true
};

// HTTP Request Helper
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: json });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || json.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test Functions
async function testJobCreation() {
  console.log('\n📝 TEST 1: Creating job with all fields...');
  console.log('Payload:', JSON.stringify(TEST_JOB_CREATE, null, 2));
  
  try {
    const response = await makeRequest('POST', '/api/dispatch/jobs', TEST_JOB_CREATE);
    console.log('✅ Job created successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.data && response.data.data.job) {
      return response.data.data.job.id || response.data.data.job.reference;
    } else if (response.data.data && response.data.data.id) {
      return response.data.data.id;
    } else {
      throw new Error('Could not extract job ID from response');
    }
  } catch (error) {
    console.error('❌ Job creation failed:', error.message);
    throw error;
  }
}

async function testJobRetrieval(jobId) {
  console.log(`\n🔍 TEST 2: Retrieving job ${jobId}...`);
  
  try {
    const response = await makeRequest('GET', `/api/dispatch/jobs?jobId=${jobId}`);
    console.log('✅ Job retrieved successfully');
    console.log('Job data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Job retrieval failed:', error.message);
    throw error;
  }
}

async function testJobEdit(jobId) {
  console.log(`\n✏️  TEST 3: Editing job ${jobId}...`);
  console.log('Update payload:', JSON.stringify(TEST_JOB_UPDATE, null, 2));
  
  try {
    const response = await makeRequest('PATCH', `/api/dispatch/jobs/${jobId}`, TEST_JOB_UPDATE);
    console.log('✅ Job updated successfully');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Job update failed:', error.message);
    throw error;
  }
}

async function verifyFields(jobId) {
  console.log(`\n🔬 TEST 4: Verifying field persistence for job ${jobId}...`);
  
  try {
    const response = await testJobRetrieval(jobId);
    const job = response.data || response;
    
    console.log('\n📊 Field Verification Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check requirements JSON fields
    const requirements = typeof job.requirements === 'string' 
      ? JSON.parse(job.requirements) 
      : job.requirements || {};
    
    const checks = [
      { field: 'Passenger Name', expected: TEST_JOB_UPDATE.passengerName, actual: requirements.passengerName },
      { field: 'Phone', expected: TEST_JOB_UPDATE.phone, actual: requirements.passengerPhone },
      { field: 'Email', expected: TEST_JOB_UPDATE.email, actual: requirements.passengerEmail },
      { field: 'Passengers', expected: TEST_JOB_UPDATE.passengers, actual: requirements.passengers },
      { field: 'Bags', expected: TEST_JOB_UPDATE.bags, actual: requirements.bags },
      { field: 'Wheelchairs', expected: TEST_JOB_UPDATE.wheelchairs, actual: requirements.wheelchairs },
      { field: 'Vehicles Needed', expected: TEST_JOB_UPDATE.vehiclesNeeded, actual: requirements.vehiclesNeeded },
      { field: 'Currency', expected: TEST_JOB_UPDATE.currency, actual: requirements.currency },
      { field: 'Payment Method', expected: TEST_JOB_UPDATE.paymentMethod, actual: job.paymentMethod },
      { field: 'Notes', expected: TEST_JOB_UPDATE.notes, actual: requirements.notes },
      { field: 'Pickup Address', expected: TEST_JOB_UPDATE.pickup.address, actual: job.pickupAddress },
      { field: 'Dropoff Address', expected: TEST_JOB_UPDATE.dropoff.address, actual: job.dropoffAddress },
    ];
    
    let passedChecks = 0;
    let failedChecks = 0;
    
    checks.forEach(check => {
      const passed = check.actual === check.expected || 
                     (check.actual && check.expected && String(check.actual) === String(check.expected));
      const status = passed ? '✅' : '❌';
      
      if (passed) {
        passedChecks++;
        console.log(`${status} ${check.field}: ${check.actual}`);
      } else {
        failedChecks++;
        console.log(`${status} ${check.field}: Expected "${check.expected}", got "${check.actual}"`);
      }
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📈 Summary: ${passedChecks}/${checks.length} checks passed`);
    
    if (failedChecks > 0) {
      console.log(`⚠️  ${failedChecks} field(s) did not persist correctly`);
    } else {
      console.log('🎉 All fields persisted correctly!');
    }
    
    return failedChecks === 0;
  } catch (error) {
    console.error('❌ Field verification failed:', error.message);
    throw error;
  }
}

// Main Test Flow
async function runTests() {
  console.log('🚀 Starting Job CRUD Test Suite');
  console.log('API Base URL:', API_BASE_URL);
  console.log('Auth Token:', AUTH_TOKEN.substring(0, 20) + '...');
  
  let jobId = null;
  
  try {
    // Test 1: Create job
    jobId = await testJobCreation();
    console.log(`\n✅ Job created with ID: ${jobId}`);
    
    // Wait a moment for database to settle
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Retrieve job
    await testJobRetrieval(jobId);
    
    // Wait a moment before editing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Edit job
    await testJobEdit(jobId);
    
    // Wait for edit to persist
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 4: Verify all fields persisted
    const allPassed = await verifyFields(jobId);
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('✅ ALL TESTS PASSED');
      console.log('='.repeat(50));
      process.exit(0);
    } else {
      console.log('⚠️  SOME TESTS FAILED');
      console.log('='.repeat(50));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();
