/**
 * City Cabs Dispatch Test
 * Tests real-time driver data updates on dispatch portal
 * Using actual City Cabs company data and Driver1
 */

const io = require('socket.io-client');
const prisma = require('./lib/prisma');

// City Cabs Company Data
const COMPANY_ID = 'cmgt7lmip0005mxarxkkjup1p';
const COMPANY_NAME = 'City Taxi Co. (City Cabs)';

// Driver1 from City Cabs
const DRIVER_ID = 'cmgt7lmqs000ymxarz2f1edxx';
const DRIVER_NAME = 'Driver1 City Cabs';

// Real zones for City Cabs
const ZONE_DOHA = {
    id: 'cmgvbmigl00019k8q24ik7twa',
    name: 'Doha',
    centerPoint: { lat: 25.30525846432973, lng: 51.30763575549136 }
};

const ZONE_MARKHIYA = {
    id: 'cmgvbnepo00099k8qcucfitsx',
    name: 'markhiya',
    centerPoint: { lat: 25.17570153734664, lng: 51.41185834901394 }
};

const BACKEND_URL = 'http://localhost:3000';

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

function log(message, color = 'white') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(80));
    log(title, 'bright');
    console.log('='.repeat(80) + '\n');
}

async function connectDriver() {
    return new Promise((resolve, reject) => {
        const socket = io(`${BACKEND_URL}/driver`, {
            auth: { userId: DRIVER_ID, role: 'DRIVER' },
            transports: ['websocket']
        });

        socket.on('connect', () => {
            log(`✓ Driver connected: ${DRIVER_NAME} (${DRIVER_ID})`, 'green');
            resolve(socket);
        });

        socket.on('connect_error', (err) => {
            log(`✗ Driver connection failed: ${err.message}`, 'red');
            reject(err);
        });

        socket.on('error', (err) => {
            log(`✗ Driver socket error: ${err}`, 'red');
        });
    });
}

async function authenticateDispatch() {
    return new Promise((resolve, reject) => {
        const socket = io(`${BACKEND_URL}/dispatch`, {
            auth: { userId: 'dispatch-test-user', role: 'DISPATCHER', companyId: COMPANY_ID },
            transports: ['websocket']
        });

        socket.on('connect', () => {
            log(`✓ Dispatch observer connected for ${COMPANY_NAME}`, 'cyan');
            resolve(socket);
        });

        socket.on('connect_error', (err) => {
            log(`✗ Dispatch connection failed: ${err.message}`, 'red');
            reject(err);
        });

        // Monitor all driver update events
        socket.on('driver:status:update', (data) => {
            log(`📡 DISPATCH RECEIVED - Status Update: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('driver:location:update', (data) => {
            log(`📡 DISPATCH RECEIVED - Location Update: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('driver:zone:updated', (data) => {
            log(`📡 DISPATCH RECEIVED - Zone Update: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('driver:job:updated', (data) => {
            log(`📡 DISPATCH RECEIVED - Job Update: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('error', (err) => {
            log(`✗ Dispatch socket error: ${err}`, 'red');
        });
    });
}

function wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function updateDriverStatus(driverSocket, status) {
    log(`→ Updating driver status to: ${status}`, 'yellow');

    await prisma.user.update({
        where: { id: DRIVER_ID },
        data: {
            preferences: {
                dispatch: {
                    status: status,
                    lastLocation: null,
                    lastStatusUpdate: new Date().toISOString()
                }
            }
        }
    });

    driverSocket.emit('driver:status:update', {
        userId: DRIVER_ID,
        status: status,
        timestamp: new Date().toISOString()
    });

    log(`✓ Status update sent: ${status}`, 'green');
}

async function updateDriverLocation(driverSocket, lat, lng, zone) {
    log(`→ Updating driver location to: (${lat}, ${lng}) in ${zone.name}`, 'yellow');

    const locationData = {
        userId: DRIVER_ID,
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        speed: 25,
        heading: 180,
        altitude: 50,
        timestamp: new Date().toISOString()
    };

    driverSocket.emit('driver:location:update', locationData);
    log(`✓ Location update sent: ${zone.name}`, 'green');
}

async function changeDriverZone(driverSocket, zone) {
    log(`→ Changing driver zone to: ${zone.name}`, 'yellow');

    await prisma.user.update({
        where: { id: DRIVER_ID },
        data: {
            preferences: {
                dispatch: {
                    status: 'AVAILABLE',
                    currentZone: {
                        id: zone.id,
                        name: zone.name,
                        updatedAt: new Date().toISOString(),
                        queuePosition: 1
                    },
                    lastZoneCheck: {
                        zoneId: zone.id,
                        latitude: zone.centerPoint.lat,
                        longitude: zone.centerPoint.lng,
                        updatedAt: new Date().toISOString()
                    },
                    lastStatusUpdate: new Date().toISOString()
                },
                lastLocation: {
                    latitude: zone.centerPoint.lat,
                    longitude: zone.centerPoint.lng,
                    timestamp: new Date().toISOString()
                }
            }
        }
    });

    driverSocket.emit('driver:zone:changed', {
        userId: DRIVER_ID,
        zoneId: zone.id,
        zoneName: zone.name,
        position: { lat: zone.centerPoint.lat, lng: zone.centerPoint.lng },
        timestamp: new Date().toISOString()
    });

    log(`✓ Zone change sent: ${zone.name}`, 'green');
}

async function createJob(driverSocket) {
    log('→ Creating new job for driver...', 'yellow');

    // Generate a unique jobId
    const jobId = `JOB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create a job in the database
    const job = await prisma.job.create({
        data: {
            jobId: jobId,
            companyId: COMPANY_ID,
            assignedDriverId: DRIVER_ID,
            status: 'ASSIGNED',
            pickupAddress: '123 Test Street, Doha',
            pickupLatitude: 25.2854467,
            pickupLongitude: 51.5310383,
            dropoffAddress: '456 Destination Ave, Doha',
            dropoffLatitude: 25.3054467,
            dropoffLongitude: 51.5510383,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    log(`✓ Job created in database: ${job.id}`, 'green');

    // Emit job update event
    driverSocket.emit('driver:job:updated', {
        userId: DRIVER_ID,
        jobId: job.id,
        status: 'ASSIGNED',
        timestamp: new Date().toISOString()
    });

    log(`✓ Job assignment event sent`, 'green');

    return job;
}

async function updateJobStatus(driverSocket, jobId, status) {
    log(`→ Updating job ${jobId} status to: ${status}`, 'yellow');

    await prisma.job.update({
        where: { id: jobId },
        data: {
            status: status,
            updatedAt: new Date()
        }
    });

    driverSocket.emit('driver:job:updated', {
        userId: DRIVER_ID,
        jobId: jobId,
        status: status,
        timestamp: new Date().toISOString()
    });

    log(`✓ Job status update sent: ${status}`, 'green');
}

async function runTest() {
    let driverSocket, dispatchSocket;

    try {
        logSection(`🚖 CITY CABS DISPATCH TEST - ${COMPANY_NAME}`);
        log(`Company ID: ${COMPANY_ID}`, 'cyan');
        log(`Driver: ${DRIVER_NAME} (${DRIVER_ID})`, 'cyan');
        log(`Zones: ${ZONE_DOHA.name}, ${ZONE_MARKHIYA.name}`, 'cyan');
        console.log('');

        // Connect sockets
        logSection('Phase 1: Establishing Connections');
        driverSocket = await connectDriver();
        await wait(1);
        dispatchSocket = await authenticateDispatch();
        await wait(2);

        // Test 1: Status Changes
        logSection('Phase 2: Testing Status Updates');
        await updateDriverStatus(driverSocket, 'AVAILABLE');
        await wait(3);
        await updateDriverStatus(driverSocket, 'BUSY');
        await wait(3);
        await updateDriverStatus(driverSocket, 'AWAY');
        await wait(3);

        // Test 2: Location Updates
        logSection('Phase 3: Testing Location Updates');
        await updateDriverLocation(driverSocket, 25.2854467, 51.5310383, ZONE_MARKHIYA);
        await wait(3);
        await updateDriverLocation(driverSocket, 25.30525846, 51.30763575, ZONE_DOHA);
        await wait(3);

        // Test 3: Zone Changes
        logSection('Phase 4: Testing Zone Changes');
        await changeDriverZone(driverSocket, ZONE_DOHA);
        await wait(3);
        await changeDriverZone(driverSocket, ZONE_MARKHIYA);
        await wait(3);

        // Test 4: Job Lifecycle
        logSection('Phase 5: Testing Job Creation and Updates');
        const job = await createJob(driverSocket);
        await wait(3);
        await updateJobStatus(driverSocket, job.id, 'STARTED');
        await wait(3);
        await updateJobStatus(driverSocket, job.id, 'IN_PROGRESS');
        await wait(3);
        await updateJobStatus(driverSocket, job.id, 'COMPLETED');
        await wait(3);        // Final status
        logSection('Phase 6: Returning to AVAILABLE');
        await updateDriverStatus(driverSocket, 'AVAILABLE');
        await wait(3);

        logSection('✅ TEST COMPLETED SUCCESSFULLY');
        log('All events have been sent. Check dispatch portal for updates.', 'green');
        log('Monitor the magenta-colored "DISPATCH RECEIVED" messages above to verify socket delivery.', 'cyan');

    } catch (error) {
        log(`❌ TEST FAILED: ${error.message}`, 'red');
        console.error(error);
    } finally {
        log('\nClosing connections...', 'yellow');
        if (driverSocket) driverSocket.close();
        if (dispatchSocket) dispatchSocket.close();
        await prisma.$disconnect();
        log('Test script finished.', 'white');
        process.exit(0);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    log(`Unhandled Rejection: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});

// Run the test
runTest();
