/**
 * Manual Test Script for Claim Job Endpoint
 * 
 * This script tests the /mobile/driver/jobs/:jobId/claim endpoint
 * to verify if it's working correctly before testing from the mobile app.
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_JOB_ID = 'YOUR_JOB_ID_HERE'; // Replace with actual job ID from database
const DRIVER_TOKEN = 'YOUR_DRIVER_JWT_TOKEN_HERE'; // Replace with actual driver token

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}→${colors.reset} ${msg}`),
};

async function testClaimJobEndpoint() {
  console.log('\n' + colors.bright + '='.repeat(60) + colors.reset);
  console.log(colors.bright + 'Testing Claim Job Endpoint' + colors.reset);
  console.log(colors.bright + '='.repeat(60) + colors.reset + '\n');

  // Step 1: Check configuration
  log.step('Step 1: Checking configuration...');
  if (TEST_JOB_ID === 'YOUR_JOB_ID_HERE') {
    log.error('Please update TEST_JOB_ID in the script');
    return;
  }
  if (DRIVER_TOKEN === 'YOUR_DRIVER_JWT_TOKEN_HERE') {
    log.error('Please update DRIVER_TOKEN in the script');
    return;
  }
  log.success('Configuration OK');

  // Step 2: Test endpoint existence
  log.step('\nStep 2: Testing endpoint with POST request...');
  const endpoint = `${BASE_URL}/mobile/driver/jobs/${TEST_JOB_ID}/claim`;
  log.info(`Endpoint: ${endpoint}`);
  log.info(`Method: POST`);
  log.info(`Token: ${DRIVER_TOKEN.substring(0, 20)}...`);

  try {
    const response = await axios.post(
      endpoint,
      {}, // Empty body
      {
        headers: {
          'Authorization': `Bearer ${DRIVER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // Don't throw on any status
      }
    );

    log.step('\nStep 3: Response received');
    console.log('\n' + colors.cyan + 'Response Details:' + colors.reset);
    console.log('━'.repeat(60));
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, JSON.stringify(response.headers, null, 2));
    console.log(`Data:`, JSON.stringify(response.data, null, 2));
    console.log('━'.repeat(60));

    if (response.status === 200) {
      log.success('\n✅ Endpoint is working! Status 200 OK');
    } else if (response.status === 400) {
      log.warn('\n⚠️  400 Bad Request - Check backend logs for details');
      if (response.data?.message) {
        log.error(`Error message: ${response.data.message}`);
      }
    } else if (response.status === 401) {
      log.error('\n❌ 401 Unauthorized - Token is invalid or expired');
    } else if (response.status === 404) {
      log.error('\n❌ 404 Not Found - Endpoint does not exist or job not found');
    } else {
      log.warn(`\n⚠️  Unexpected status: ${response.status}`);
    }

  } catch (error) {
    log.step('\nStep 3: Error occurred');
    console.log('\n' + colors.red + 'Error Details:' + colors.reset);
    console.log('━'.repeat(60));
    
    if (error.response) {
      console.log('Server responded with error:');
      console.log(`Status: ${error.response.status}`);
      console.log(`Data:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('No response received from server');
      console.log('Request:', error.request);
      log.error('\n❌ Backend server might be down or unreachable');
    } else {
      console.log('Error setting up request:', error.message);
    }
    console.log('━'.repeat(60));
  }

  console.log('\n' + colors.bright + '='.repeat(60) + colors.reset);
  console.log(colors.bright + 'Test Complete' + colors.reset);
  console.log(colors.bright + '='.repeat(60) + colors.reset + '\n');
}

// Instructions
console.log('\n' + colors.bright + 'Instructions:' + colors.reset);
console.log('1. Get a real job ID from the database (must be UNASSIGNED/PENDING/OFFERED)');
console.log('2. Get a valid driver JWT token (login from driver app and copy from network)');
console.log('3. Update TEST_JOB_ID and DRIVER_TOKEN in this script');
console.log('4. Make sure backend is running on port 3000');
console.log('5. Run: node test-claim-job.js\n');

// Quick helper to get data from database
console.log(colors.cyan + 'Quick SQL queries to get test data:' + colors.reset);
console.log(`
-- Get an unassigned job:
SELECT id, status, "assignedDriverId", "pickupAddress" 
FROM jobs 
WHERE status IN ('UNASSIGNED', 'PENDING', 'OFFERED') 
LIMIT 1;

-- Get a driver ID:
SELECT id, "firstName", "lastName", email 
FROM users 
WHERE role = 'DRIVER' 
LIMIT 1;
`);

// Run if configuration is set
if (TEST_JOB_ID !== 'YOUR_JOB_ID_HERE' && DRIVER_TOKEN !== 'YOUR_DRIVER_JWT_TOKEN_HERE') {
  testClaimJobEndpoint();
} else {
  log.warn('Please update the configuration before running the test');
}
