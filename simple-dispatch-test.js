/**
 * Simple City Cabs Dispatch Test
 * Tests ONLY status, location, and zone updates (no job creation)
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

// ANSI color codes
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
            log(`✓ Driver socket connected: ${DRIVER_NAME} (${DRIVER_ID})`, 'green');

            // Send authenticate event to register handlers
            socket.emit('authenticate', {
                userId: DRIVER_ID,
                companyId: COMPANY_ID
            });

            log(`✓ Driver authenticated with company: ${COMPANY_ID}`, 'green');
            resolve(socket);
        });

        socket.on('connect_error', (err) => {
            log(`✗ Driver connection failed: ${err.message}`, 'red');
            reject(err);
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
            log(`   Watching for events in company room: dispatch_${COMPANY_ID}`, 'cyan');
            resolve(socket);
        });

        socket.on('connect_error', (err) => {
            log(`✗ Dispatch connection failed: ${err.message}`, 'red');
            reject(err);
        });

        // Monitor all driver update events
        socket.on('driver:status:update', (data) => {
            log(`📡 DISPATCH RECEIVED - Status: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('driver:location:update', (data) => {
            log(`📡 DISPATCH RECEIVED - Location: ${JSON.stringify(data)}`, 'magenta');
        });

        socket.on('driver:zone:updated', (data) => {
            log(`📡 DISPATCH RECEIVED - Zone: ${JSON.stringify(data)}`, 'magenta');
        });
    });
}

function wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function updateDriverStatus(driverSocket, status) {
    log(`→ Setting driver status to: ${status}`, 'yellow');

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

    log(`✓ Status update emitted: ${status}`, 'green');
}

async function updateDriverLocation(driverSocket, lat, lng, zone) {
    log(`→ Moving driver to: ${zone.name} (${lat}, ${lng})`, 'yellow');

    driverSocket.emit('driver:location:update', {
        userId: DRIVER_ID,
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        speed: 25,
        heading: 180,
        altitude: 50,
        timestamp: new Date().toISOString()
    });

    log(`✓ Location update emitted: ${zone.name}`, 'green');
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

    log(`✓ Zone change emitted: ${zone.name}`, 'green');
}

async function runTest() {
    let driverSocket, dispatchSocket;

    try {
        logSection(`🚖 SIMPLE CITY CABS DISPATCH TEST`);
        log(`Company: ${COMPANY_NAME} (${COMPANY_ID})`, 'cyan');
        log(`Driver: ${DRIVER_NAME} (${DRIVER_ID})`, 'cyan');
        log(`Zones: ${ZONE_DOHA.name}, ${ZONE_MARKHIYA.name}`, 'cyan');
        console.log('');
        log('⚠️  IMPORTANT: Make sure dispatch portal is REFRESHED before running!', 'yellow');
        log('⚠️  Check console shows: companyId: "cmgt7lmip0005mxarxkkjup1p"', 'yellow');
        console.log('');

        // Connect sockets
        logSection('Phase 1: Establishing Connections');
        driverSocket = await connectDriver();
        await wait(1);
        dispatchSocket = await authenticateDispatch();
        await wait(2);

        // Test 1: Status Changes
        logSection('Phase 2: Testing Status Updates (4 changes)');
        log('Watch the dispatch portal - driver status should update in real-time!', 'cyan');
        await wait(2);

        await updateDriverStatus(driverSocket, 'AVAILABLE');
        await wait(4);

        await updateDriverStatus(driverSocket, 'BUSY');
        await wait(4);

        await updateDriverStatus(driverSocket, 'AWAY');
        await wait(4);

        await updateDriverStatus(driverSocket, 'OFFLINE');
        await wait(4);

        // Test 2: Location Updates
        logSection('Phase 3: Testing Location Updates (2 locations)');
        log('Watch the map - driver marker should move!', 'cyan');
        await wait(2);

        await updateDriverLocation(driverSocket, 25.2854467, 51.5310383, ZONE_MARKHIYA);
        await wait(4);

        await updateDriverLocation(driverSocket, 25.30525846, 51.30763575, ZONE_DOHA);
        await wait(4);

        // Test 3: Zone Changes
        logSection('Phase 4: Testing Zone Changes (2 zones)');
        log('Watch the zones list - driver zone should update!', 'cyan');
        await wait(2);

        await changeDriverZone(driverSocket, ZONE_DOHA);
        await wait(4);

        await changeDriverZone(driverSocket, ZONE_MARKHIYA);
        await wait(4);

        // Final status
        logSection('Phase 5: Final - Setting AVAILABLE');
        await updateDriverStatus(driverSocket, 'AVAILABLE');
        await wait(3);

        logSection('✅ TEST COMPLETED SUCCESSFULLY');
        log('All events have been sent!', 'green');
        log('', 'white');
        log('IF YOU SEE MAGENTA "DISPATCH RECEIVED" MESSAGES ABOVE:', 'bright');
        log('  → Backend is broadcasting events correctly', 'green');
        log('  → Check if dispatch portal updated in real-time', 'cyan');
        log('', 'white');
        log('IF YOU DO NOT SEE MAGENTA MESSAGES:', 'bright');
        log('  → Dispatch is not receiving events', 'red');
        log('  → Check dispatch console for companyId (should NOT be undefined)', 'red');
        log('  → You MUST refresh dispatch portal page!', 'red');

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

// Run the test
runTest();
