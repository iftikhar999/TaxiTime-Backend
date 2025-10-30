/**
 * Location Tracking Test - Qatar
 * Keeps driver AVAILABLE and moves location rapidly around Qatar
 * Watch the dispatch portal map to see the driver marker moving in real-time
 */

const io = require('socket.io-client');
const prisma = require('./lib/prisma');

// City Cabs Company Data
const COMPANY_ID = 'cmgt7lmip0005mxarxkkjup1p';
const COMPANY_NAME = 'City Taxi Co. (City Cabs)';

// Driver1 from City Cabs
const DRIVER_ID = 'cmgt7lmqs000ymxarz2f1edxx';
const DRIVER_NAME = 'Driver1 City Cabs';

const BACKEND_URL = 'http://localhost:3000';

// Real locations around Qatar (Doha area)
const QATAR_LOCATIONS = [
    { name: 'The Pearl Qatar', lat: 25.3712, lng: 51.5392 },
    { name: 'Katara Cultural Village', lat: 25.3588, lng: 51.5322 },
    { name: 'Souq Waqif', lat: 25.2867, lng: 51.5333 },
    { name: 'Museum of Islamic Art', lat: 25.2961, lng: 51.5394 },
    { name: 'Aspire Park', lat: 25.2644, lng: 51.4425 },
    { name: 'Villaggio Mall', lat: 25.2608, lng: 51.4406 },
    { name: 'City Center Doha', lat: 25.2911, lng: 51.5208 },
    { name: 'Hamad International Airport', lat: 25.2731, lng: 51.6080 },
    { name: 'Education City', lat: 25.3172, lng: 51.4389 },
    { name: 'West Bay', lat: 25.3214, lng: 51.5311 },
    { name: 'Lusail City', lat: 25.4384, lng: 51.4978 },
    { name: 'Al Wakrah', lat: 25.1714, lng: 51.6006 },
];

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(message, color = 'white') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color] || ''}[${timestamp}] ${message}${colors.reset}`);
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
            log(`✓ Driver socket connected: ${DRIVER_NAME}`, 'green');

            // Authenticate to register handlers
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

function wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function setDriverAvailable(driverSocket) {
    log('→ Setting driver status to AVAILABLE...', 'yellow');

    await prisma.user.update({
        where: { id: DRIVER_ID },
        data: {
            preferences: {
                dispatch: {
                    status: 'AVAILABLE',
                    lastLocation: null,
                    lastStatusUpdate: new Date().toISOString()
                }
            }
        }
    });

    driverSocket.emit('driver:status:update', {
        userId: DRIVER_ID,
        status: 'AVAILABLE',
        timestamp: new Date().toISOString()
    });

    log('✓ Driver set to AVAILABLE', 'green');
}

async function moveDriverTo(driverSocket, location) {
    const speed = Math.floor(Math.random() * 60) + 20; // 20-80 km/h
    const heading = Math.floor(Math.random() * 360); // 0-360 degrees

    log(`→ Moving to: ${location.name} (${location.lat}, ${location.lng})`, 'cyan');

    driverSocket.emit('driver:location:update', {
        userId: DRIVER_ID,
        latitude: location.lat,
        longitude: location.lng,
        accuracy: 10,
        speed: speed,
        heading: heading,
        altitude: 50,
        timestamp: new Date().toISOString()
    });

    log(`✓ Location updated - Speed: ${speed} km/h, Heading: ${heading}°`, 'blue');
}

async function runTest() {
    let driverSocket;

    try {
        logSection('🗺️  QATAR LOCATION TRACKING TEST');
        log(`Company: ${COMPANY_NAME}`, 'cyan');
        log(`Driver: ${DRIVER_NAME}`, 'cyan');
        log(`Locations: ${QATAR_LOCATIONS.length} points around Qatar`, 'cyan');
        console.log('');
        log('⚠️  WATCH THE DISPATCH PORTAL MAP!', 'yellow');
        log('⚠️  The driver marker should move around Qatar in real-time', 'yellow');
        console.log('');

        // Connect driver
        logSection('Phase 1: Connecting Driver');
        driverSocket = await connectDriver();
        await wait(2);

        // Set driver to AVAILABLE and keep it that way
        logSection('Phase 2: Setting Driver AVAILABLE');
        await setDriverAvailable(driverSocket);
        await wait(2);

        // Start moving through Qatar locations
        logSection('Phase 3: Moving Around Qatar (Watch the Map!)');
        log('Moving driver through 12 locations in Qatar...', 'bright');
        log('Each location will update every 3 seconds', 'cyan');
        console.log('');

        for (let i = 0; i < QATAR_LOCATIONS.length; i++) {
            const location = QATAR_LOCATIONS[i];
            log(`[${i + 1}/${QATAR_LOCATIONS.length}] `, 'yellow');
            await moveDriverTo(driverSocket, location);
            await wait(3); // Wait 3 seconds between each location
        }

        await wait(2);

        logSection('✅ LOCATION TRACKING TEST COMPLETED');
        log('The driver moved through all 12 locations in Qatar!', 'green');
        log('Did you see the marker moving on the dispatch portal map?', 'cyan');
        console.log('');

    } catch (error) {
        log(`❌ TEST FAILED: ${error.message}`, 'red');
        console.error(error);
    } finally {
        log('\nClosing connection...', 'yellow');
        if (driverSocket) driverSocket.close();
        await prisma.$disconnect();
        log('Test finished.', 'white');
        process.exit(0);
    }
}

// Handle errors
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
