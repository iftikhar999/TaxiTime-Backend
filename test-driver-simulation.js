const { io } = require('socket.io-client');

// --- Configuration ---
const SOCKET_URL = 'http://localhost:4000'; // Make sure this matches your server's port
const DRIVER_ID = 'cmgt7lmqs000ymxarz2f1edxx';
const COMPANY_ID = 'cmgt7lmip0005mxarxkkjup1p';
const VEHICLE_ID = 'clovehic10001clb6wh2t9999'; // Example vehicle ID from seed data

const JOB_ID = `JOB-${Date.now()}`;
const CUSTOMER_ID = 'cmgt7lmnb000imxarw2df05u1'; // Example customer from seed

const LOCATIONS = {
    OUTSIDE_ZONE: { latitude: 33.6, longitude: 73.0 },
    IN_ZONE_1: { latitude: 33.6844, longitude: 73.0479 }, // Islamabad
    PICKUP: { latitude: 33.7380, longitude: 73.0844 },   // Faisal Mosque
    DROPOFF: { latitude: 33.6993, longitude: 72.9743 },  // Daman-e-Koh
};

const log = (message, data = '') => {
    console.log(`[SIMULATOR] ${new Date().toLocaleTimeString()}: ${message}`, data);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const driverSocket = io(`${SOCKET_URL}/driver`, {
    transports: ['websocket'],
    reconnection: true,
});

driverSocket.on('connect', () => {
    log('Driver connected to server.');
    driverSocket.emit('authenticate', { userId: DRIVER_ID, companyId: COMPANY_ID });
    log('Authentication request sent.');
    runSimulation();
});

driverSocket.on('disconnect', () => {
    log('Driver disconnected.');
});

driverSocket.on('server:status:confirmed', (data) => log('Server confirmed status update:', data));
driverSocket.on('server:job:update:confirmed', (data) => log('Server confirmed job update:', data));
driverSocket.on('server:job:confirmed', (data) => log('Server confirmed job progress:', data));
driverSocket.on('server:shift:confirmed', (data) => log('Server confirmed shift update:', data));
driverSocket.on('server:queue:position', (data) => log('Received queue position:', data));


const SIMULATION_DURATION_MS = 2 * 60 * 1000; // 2 minutes

const getRandomLocation = (base) => {
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lngOffset = (Math.random() - 0.5) * 0.01;
    return { latitude: base.latitude + latOffset, longitude: base.longitude + lngOffset };
};

async function runSimulation() {
    log('--- Starting Continuous Driver Simulation for 2 Minutes ---');
    const startTime = Date.now();
    let isAvailable = true;

    // 1. Go Online
    log('Step 1: Going online and setting status to AVAILABLE.');
    driverSocket.emit('driver:shift:start', { vehicleId: VEHICLE_ID });
    await sleep(1000);
    driverSocket.emit('driver:status:update', { status: 'AVAILABLE', location: LOCATIONS.IN_ZONE_1 });
    await sleep(2000);

    while (Date.now() - startTime < SIMULATION_DURATION_MS) {
        const action = Math.random();

        if (action < 0.6) { // 60% chance: Update location
            const newLocation = getRandomLocation(LOCATIONS.IN_ZONE_1);
            log('Action: Updating location.', newLocation);
            driverSocket.emit('driver:location:update', { location: newLocation });
            await sleep(5000); // Update location every 5 seconds

        } else if (action < 0.8 && isAvailable) { // 20% chance: Simulate a full job cycle if available
            log('Action: Starting a new job cycle.');
            const currentJobId = `JOB-${Date.now()}`;

            // Create and accept job
            const jobPayload = {
                jobId: currentJobId,
                customerId: CUSTOMER_ID,
                pickupAddress: 'Random Pickup',
                pickupLatitude: getRandomLocation(LOCATIONS.IN_ZONE_1).latitude,
                pickupLongitude: getRandomLocation(LOCATIONS.IN_ZONE_1).longitude,
                dropoffAddress: 'Random Dropoff',
                dropoffLatitude: getRandomLocation(LOCATIONS.DROPOFF).latitude,
                dropoffLongitude: getRandomLocation(LOCATIONS.DROPOFF).longitude,
                status: 'ACCEPTED',
            };
            driverSocket.emit('driver:job:update', jobPayload);
            isAvailable = false;
            await sleep(2000);

            // Arrive at pickup
            log(`Job ${currentJobId}: Arrived at pickup.`);
            driverSocket.emit('driver:job:progress', { jobId: currentJobId, progressStatus: 'ARRIVED' });
            await sleep(3000);

            // Start ride
            log(`Job ${currentJobId}: Ride started.`);
            driverSocket.emit('driver:job:progress', { jobId: currentJobId, progressStatus: 'PICKED_UP' });
            await sleep(5000);

            // Complete ride
            log(`Job ${currentJobId}: Completing ride.`);
            driverSocket.emit('driver:job:progress', { jobId: currentJobId, progressStatus: 'COMPLETED' });
            isAvailable = true;
            await sleep(4000);

        } else { // 20% chance: Toggle status
            if (isAvailable) {
                log('Action: Taking a break (AWAY).');
                driverSocket.emit('driver:status:update', { status: 'AWAY' });
                isAvailable = false;
            } else {
                log('Action: Becoming available.');
                driverSocket.emit('driver:status:update', { status: 'AVAILABLE' });
                isAvailable = true;
            }
            await sleep(8000); // Wait a bit after status change
        }
    }

    // End of simulation
    log('--- Simulation Finished ---');
    log('Going offline.');
    driverSocket.emit('driver:shift:end');
    await sleep(2000);
    driverSocket.disconnect();
}