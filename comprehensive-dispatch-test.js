/**
 * Comprehensive Dispatch Portal Test
 * 
 * This script tests all real-time updates on the dispatch portal:
 * 1. Driver location updates (map + table)
 * 2. Driver status changes (table + dropdowns + zone management)
 * 3. Zone changes (zone management + driver table)
 * 4. Job lifecycle (creation, progress, completion)
 */

const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const DRIVER_ID = 'cmgt7lmqs000ymxarz2f1edxx';
const DRIVER_NAME = 'Test Driver';
const VEHICLE_ID = 'cmgt7lmr6000zmxarv0cw1f7v';
const COMPANY_ID = 'cmgt7lmip0005mxarxkkjup1p';

// Test locations
const LOCATIONS = {
    ZONE_1: { latitude: 33.6844, longitude: 73.0479, name: 'Islamabad Center' },
    ZONE_2: { latitude: 33.7294, longitude: 73.0931, name: 'Bahria Town' },
    OUTSIDE: { latitude: 33.5651, longitude: 73.0169, name: 'Outside zones' },
};

const STATUSES = ['AVAILABLE', 'AWAY', 'BUSY'];

let driverSocket;
let testResults = {
    locationUpdates: 0,
    statusChanges: 0,
    zoneChanges: 0,
    jobUpdates: 0,
};

function log(message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] ${message}`);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDriver() {
    return new Promise((resolve, reject) => {
        log('🔌 Connecting test driver to server...');

        driverSocket = io(SERVER_URL, {
            auth: { userId: DRIVER_ID, role: 'DRIVER', companyId: COMPANY_ID },
            transports: ['websocket'],
        });

        driverSocket.on('connect', () => {
            log('✅ Driver connected successfully', { socketId: driverSocket.id });
            resolve();
        });

        driverSocket.on('connect_error', (error) => {
            log('❌ Connection failed', { error: error.message });
            reject(error);
        });

        driverSocket.on('disconnect', () => {
            log('🔌 Driver disconnected');
        });
    });
}

async function testLocationUpdates() {
    log('\n📍 TEST 1: Location Updates (Map + Driver Table)');
    log('═══════════════════════════════════════════════════');

    const locations = [
        LOCATIONS.ZONE_1,
        { ...LOCATIONS.ZONE_1, latitude: LOCATIONS.ZONE_1.latitude + 0.001 },
        { ...LOCATIONS.ZONE_1, latitude: LOCATIONS.ZONE_1.latitude + 0.002 },
        { ...LOCATIONS.ZONE_1, latitude: LOCATIONS.ZONE_1.latitude + 0.003 },
        { ...LOCATIONS.ZONE_1, latitude: LOCATIONS.ZONE_1.latitude + 0.004 },
    ];

    for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        log(`📍 Sending location update ${i + 1}/${locations.length}`, {
            latitude: location.latitude,
            longitude: location.longitude,
        });

        driverSocket.emit('driver:location:update', { location });
        testResults.locationUpdates++;

        await sleep(3000);
    }

    log('✅ Location updates test complete');
    log('👀 CHECK: Driver should be moving on the map and coordinates updating in table');
}

async function testStatusChanges() {
    log('\n🚦 TEST 2: Status Changes (Table + Dropdowns + Zone Management)');
    log('═══════════════════════════════════════════════════');

    for (const status of STATUSES) {
        log(`🚦 Changing status to: ${status}`);

        driverSocket.emit('driver:status:update', {
            status,
            location: LOCATIONS.ZONE_1
        });
        testResults.statusChanges++;

        await sleep(5000);
        log(`👀 CHECK: Driver status should show "${status}" in table and dropdowns`);
    }

    // Return to AVAILABLE
    log('🚦 Returning to AVAILABLE status');
    driverSocket.emit('driver:status:update', {
        status: 'AVAILABLE',
        location: LOCATIONS.ZONE_1
    });

    await sleep(3000);
    log('✅ Status changes test complete');
}

async function testZoneChanges() {
    log('\n🗺️  TEST 3: Zone Changes (Zone Management + Driver Table)');
    log('═══════════════════════════════════════════════════');

    // Move to Zone 1
    log('🗺️  Moving to Zone 1 (Islamabad Center)');
    driverSocket.emit('driver:location:update', { location: LOCATIONS.ZONE_1 });
    testResults.zoneChanges++;
    await sleep(4000);
    log('👀 CHECK: Driver should appear in Zone 1 queue');

    // Move outside zones
    log('🗺️  Moving outside all zones');
    driverSocket.emit('driver:location:update', { location: LOCATIONS.OUTSIDE });
    testResults.zoneChanges++;
    await sleep(4000);
    log('👀 CHECK: Driver should be removed from zone queues');

    // Move to Zone 2
    log('🗺️  Moving to Zone 2 (Bahria Town)');
    driverSocket.emit('driver:location:update', { location: LOCATIONS.ZONE_2 });
    testResults.zoneChanges++;
    await sleep(4000);
    log('👀 CHECK: Driver should appear in Zone 2 queue');

    // Return to Zone 1
    log('🗺️  Returning to Zone 1');
    driverSocket.emit('driver:location:update', { location: LOCATIONS.ZONE_1 });
    testResults.zoneChanges++;
    await sleep(4000);

    log('✅ Zone changes test complete');
}

async function testJobLifecycle() {
    log('\n💼 TEST 4: Job Lifecycle (Creation → Progress → Completion)');
    log('═══════════════════════════════════════════════════');

    const jobId = `TEST-JOB-${Date.now()}`;
    const customerId = 'cmgt7lmqz0012mxar8j5k2l3m';

    // Create job
    log('💼 Creating new job', { jobId });
    driverSocket.emit('driver:job:update', {
        jobId,
        customerId,
        pickupAddress: 'Test Pickup Location',
        pickupLatitude: LOCATIONS.ZONE_1.latitude,
        pickupLongitude: LOCATIONS.ZONE_1.longitude,
        dropoffAddress: 'Test Dropoff Location',
        dropoffLatitude: LOCATIONS.ZONE_2.latitude,
        dropoffLongitude: LOCATIONS.ZONE_2.longitude,
        status: 'ACCEPTED',
    });
    testResults.jobUpdates++;
    await sleep(4000);
    log('👀 CHECK: New job should appear in job list with status ASSIGNED');

    // Progress: Arrived at pickup
    log('💼 Progressing job: ARRIVED at pickup');
    driverSocket.emit('driver:job:progress', {
        jobId,
        progressStatus: 'ARRIVED'
    });
    testResults.jobUpdates++;
    await sleep(4000);
    log('👀 CHECK: Job status should update to ARRIVED');

    // Progress: Picked up passenger
    log('💼 Progressing job: PICKED_UP passenger');
    driverSocket.emit('driver:job:progress', {
        jobId,
        progressStatus: 'PICKED_UP'
    });
    testResults.jobUpdates++;
    await sleep(4000);
    log('👀 CHECK: Job status should update to ACTIVE/STARTED');

    // Simulate ride with location updates
    log('💼 Simulating ride with location updates...');
    for (let i = 0; i < 3; i++) {
        const progress = i / 2;
        const lat = LOCATIONS.ZONE_1.latitude + (LOCATIONS.ZONE_2.latitude - LOCATIONS.ZONE_1.latitude) * progress;
        const lng = LOCATIONS.ZONE_1.longitude + (LOCATIONS.ZONE_2.longitude - LOCATIONS.ZONE_1.longitude) * progress;

        driverSocket.emit('driver:location:update', {
            location: { latitude: lat, longitude: lng }
        });
        await sleep(2000);
    }
    log('👀 CHECK: Driver should be moving on map during ride');

    // Complete job
    log('💼 Completing job');
    driverSocket.emit('driver:job:progress', {
        jobId,
        progressStatus: 'COMPLETED'
    });
    testResults.jobUpdates++;
    await sleep(4000);
    log('👀 CHECK: Job should be marked as COMPLETED and driver status back to AVAILABLE');

    log('✅ Job lifecycle test complete');
}

async function runComprehensiveTest() {
    try {
        log('╔════════════════════════════════════════════════════╗');
        log('║   COMPREHENSIVE DISPATCH PORTAL TEST SUITE         ║');
        log('╚════════════════════════════════════════════════════╝');
        log('');
        log('📋 This test validates all real-time updates:');
        log('   ✓ Driver location (map + table)');
        log('   ✓ Driver status (table + dropdowns + zones)');
        log('   ✓ Zone changes (zone management)');
        log('   ✓ Job lifecycle (creation → completion)');
        log('');

        await connectDriver();
        await sleep(2000);

        // Start shift
        log('\n🚀 Starting driver shift...');
        driverSocket.emit('driver:shift:start', { vehicleId: VEHICLE_ID });
        await sleep(3000);

        // Set initial status
        log('🚦 Setting initial status to AVAILABLE');
        driverSocket.emit('driver:status:update', {
            status: 'AVAILABLE',
            location: LOCATIONS.ZONE_1
        });
        await sleep(3000);

        // Run all tests
        await testLocationUpdates();
        await sleep(2000);

        await testStatusChanges();
        await sleep(2000);

        await testZoneChanges();
        await sleep(2000);

        await testJobLifecycle();
        await sleep(2000);

        // End shift
        log('\n🏁 Ending driver shift...');
        driverSocket.emit('driver:shift:end');
        await sleep(2000);

        // Print summary
        log('\n╔════════════════════════════════════════════════════╗');
        log('║              TEST EXECUTION SUMMARY                ║');
        log('╚════════════════════════════════════════════════════╝');
        log(`📍 Location Updates Sent: ${testResults.locationUpdates}`);
        log(`🚦 Status Changes Sent: ${testResults.statusChanges}`);
        log(`🗺️  Zone Changes Sent: ${testResults.zoneChanges}`);
        log(`💼 Job Updates Sent: ${testResults.jobUpdates}`);
        log('');
        log('✅ All test events have been sent to the server.');
        log('');
        log('👀 MANUAL VERIFICATION REQUIRED:');
        log('   Please check the dispatch portal UI to confirm:');
        log('   1. Driver appears in driver table with correct status');
        log('   2. Driver location is visible and updating on the map');
        log('   3. Driver appears in correct zone queue in zone management');
        log('   4. Status changes reflect in dropdowns and filters');
        log('   5. Jobs appear and update correctly in job list');
        log('');

        driverSocket.disconnect();
        process.exit(0);
    } catch (error) {
        log('❌ Test failed with error:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Run the test
runComprehensiveTest();
