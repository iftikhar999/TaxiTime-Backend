/**
 * Socket Event Flow Simulator
 * 
 * This script simulates socket events for job status transitions
 * to verify real-time updates work correctly.
 * 
 * Usage: node tests/statusFlow/socketEventSimulator.js
 */

const io = require('socket.io-client');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  event: (name, data) => console.log(`${colors.magenta}[EVENT]${colors.reset} ${name}`, JSON.stringify(data, null, 2)),
};

class SocketEventSimulator {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.driverSocket = null;
    this.dispatchSocket = null;
    this.receivedEvents = {
      driver: [],
      dispatch: []
    };
  }

  async connectDriverSocket(driverId, companyId, token) {
    log.info(`Connecting driver socket for driver ${driverId}...`);

    this.driverSocket = io(`${this.serverUrl}/driver`, {
      auth: { token },
      query: { driverId, companyId }
    });

    return new Promise((resolve, reject) => {
      this.driverSocket.on('connect', () => {
        log.success(`Driver socket connected: ${this.driverSocket.id}`);
        this.setupDriverListeners();
        resolve(this.driverSocket);
      });

      this.driverSocket.on('connect_error', (error) => {
        log.error(`Driver socket connection error: ${error.message}`);
        reject(error);
      });
    });
  }

  async connectDispatchSocket(dispatcherId, companyId, token) {
    log.info(`Connecting dispatch socket for company ${companyId}...`);

    this.dispatchSocket = io(`${this.serverUrl}/dispatch`, {
      auth: { token },
      query: { dispatcherId, companyId }
    });

    return new Promise((resolve, reject) => {
      this.dispatchSocket.on('connect', () => {
        log.success(`Dispatch socket connected: ${this.dispatchSocket.id}`);
        this.setupDispatchListeners();
        resolve(this.dispatchSocket);
      });

      this.dispatchSocket.on('connect_error', (error) => {
        log.error(`Dispatch socket connection error: ${error.message}`);
        reject(error);
      });
    });
  }

  setupDriverListeners() {
    const events = [
      'job_assigned',
      'jobAssigned',
      'job_unassigned',
      'jobUnassigned',
      'job:data:updated',
      'job:progress:updated',
      'job:available:nearby',
      'server:job:confirmed',
      'server:job:error',
      'driver:status:updated',
    ];

    events.forEach(event => {
      this.driverSocket.on(event, (data) => {
        log.event(`DRIVER: ${event}`, data);
        this.receivedEvents.driver.push({ event, data, timestamp: new Date() });
      });
    });

    log.info('Driver listeners registered for events: ' + events.join(', '));
  }

  setupDispatchListeners() {
    const events = [
      'job:data:updated',
      'job:progress:updated',
      'driver:status:updated',
      'driver:location:updated',
      'offerRejected',
    ];

    events.forEach(event => {
      this.dispatchSocket.on(event, (data) => {
        log.event(`DISPATCH: ${event}`, data);
        this.receivedEvents.dispatch.push({ event, data, timestamp: new Date() });
      });
    });

    log.info('Dispatch listeners registered for events: ' + events.join(', '));
  }

  async emitDriverStatus(status, location = null) {
    log.info(`Emitting driver status: ${status}`);
    
    const payload = {
      status,
      timestamp: new Date().toISOString(),
      ...(location && { location })
    };

    this.driverSocket.emit('driver:status:update', payload);
    
    // Wait a bit for response
    await this.wait(500);
  }

  async emitJobProgress(jobId, status, location = null) {
    log.info(`Emitting job progress: ${jobId} → ${status}`);

    const payload = {
      jobId,
      status,
      timestamp: new Date().toISOString(),
      ...(location && { location })
    };

    this.driverSocket.emit('job:progress:update', payload);
    
    // Wait for server to process
    await this.wait(500);
  }

  async simulateJobLifecycle(jobId, driverId) {
    log.info('\n' + '='.repeat(60));
    log.info('SIMULATING COMPLETE JOB LIFECYCLE VIA SOCKET EVENTS');
    log.info('='.repeat(60) + '\n');

    const location = {
      latitude: 25.286106,
      longitude: 51.534817
    };

    // Step 1: Driver accepts job
    log.info('Step 1: Driver accepts job (OFFERED → ASSIGNED)');
    await this.emitJobProgress(jobId, 'ASSIGNED', location);
    await this.emitDriverStatus('ROGER', location);

    // Step 2: Driver proceeds to pickup
    log.info('Step 2: Driver proceeds to pickup (ASSIGNED → ON_THE_WAY)');
    await this.emitJobProgress(jobId, 'ON_THE_WAY', location);

    // Step 3: Driver arrives
    log.info('Step 3: Driver arrives at pickup (ON_THE_WAY → ARRIVED)');
    await this.emitJobProgress(jobId, 'ARRIVED', location);

    // Step 4: Driver starts ride
    log.info('Step 4: Driver starts ride (ARRIVED → STARTED)');
    await this.emitJobProgress(jobId, 'STARTED', location);
    await this.emitDriverStatus('BUSY', location);

    // Step 5: Ride in progress
    log.info('Step 5: Ride in progress (STARTED → IN_PROGRESS)');
    await this.emitJobProgress(jobId, 'IN_PROGRESS', location);

    // Step 6: Complete ride
    log.info('Step 6: Complete ride (IN_PROGRESS → COMPLETED)');
    await this.emitJobProgress(jobId, 'COMPLETED', location);
    await this.emitDriverStatus('AVAILABLE', location);

    log.success('Job lifecycle simulation complete!');
  }

  async simulateRejection(jobId) {
    log.info('\n' + '='.repeat(60));
    log.info('SIMULATING JOB REJECTION');
    log.info('='.repeat(60) + '\n');

    const location = {
      latitude: 25.286106,
      longitude: 51.534817
    };

    log.info('Driver rejects job (OFFERED → REJECTED → UNASSIGNED)');
    await this.emitJobProgress(jobId, 'REJECTED', location);
    await this.emitDriverStatus('AVAILABLE', location);

    log.success('Rejection simulation complete!');
  }

  async simulateCancellation(jobId) {
    log.info('\n' + '='.repeat(60));
    log.info('SIMULATING JOB CANCELLATION');
    log.info('='.repeat(60) + '\n');

    const location = {
      latitude: 25.286106,
      longitude: 51.534817
    };

    log.info('Job cancelled (ASSIGNED → CANCELLED)');
    await this.emitJobProgress(jobId, 'CANCELLED', location);
    await this.emitDriverStatus('AVAILABLE', location);

    log.success('Cancellation simulation complete!');
  }

  printEventSummary() {
    log.info('\n' + '='.repeat(60));
    log.info('EVENT SUMMARY');
    log.info('='.repeat(60));

    console.log(`\n${colors.blue}Driver Events Received: ${this.receivedEvents.driver.length}${colors.reset}`);
    this.receivedEvents.driver.forEach((evt, idx) => {
      console.log(`  ${idx + 1}. ${evt.event} at ${evt.timestamp.toISOString()}`);
    });

    console.log(`\n${colors.magenta}Dispatch Events Received: ${this.receivedEvents.dispatch.length}${colors.reset}`);
    this.receivedEvents.dispatch.forEach((evt, idx) => {
      console.log(`  ${idx + 1}. ${evt.event} at ${evt.timestamp.toISOString()}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    if (this.driverSocket) {
      this.driverSocket.disconnect();
      log.info('Driver socket disconnected');
    }
    if (this.dispatchSocket) {
      this.dispatchSocket.disconnect();
      log.info('Dispatch socket disconnected');
    }
  }
}

// Example usage
async function runSocketTests() {
  const simulator = new SocketEventSimulator('http://localhost:3000');

  try {
    // You'll need to provide real test credentials
    const testDriver = {
      id: 'test-driver-id',
      companyId: 'test-company-id',
      token: 'test-driver-token'
    };

    const testDispatcher = {
      id: 'test-dispatcher-id',
      companyId: 'test-company-id',
      token: 'test-dispatcher-token'
    };

    // Connect sockets
    await simulator.connectDriverSocket(testDriver.id, testDriver.companyId, testDriver.token);
    await simulator.connectDispatchSocket(testDispatcher.id, testDispatcher.companyId, testDispatcher.token);

    // Wait for connections to stabilize
    await simulator.wait(1000);

    // Run simulations with a test job ID
    const testJobId = 'test-job-id-12345';

    // Test 1: Complete lifecycle
    await simulator.simulateJobLifecycle(testJobId, testDriver.id);
    await simulator.wait(2000);

    // Test 2: Rejection
    const rejectJobId = 'test-job-reject-12345';
    await simulator.simulateRejection(rejectJobId);
    await simulator.wait(2000);

    // Test 3: Cancellation
    const cancelJobId = 'test-job-cancel-12345';
    await simulator.simulateCancellation(cancelJobId);
    await simulator.wait(2000);

    // Print summary
    simulator.printEventSummary();

  } catch (error) {
    log.error(`Socket test failed: ${error.message}`);
    console.error(error);
  } finally {
    simulator.disconnect();
  }
}

if (require.main === module) {
  log.warn('This socket simulator requires real credentials and a running server.');
  log.info('Please update the testDriver and testDispatcher objects with real values.');
  log.info('Then run: node tests/statusFlow/socketEventSimulator.js');
  
  // Uncomment to run with real credentials
  // runSocketTests().catch(console.error);
}

module.exports = SocketEventSimulator;
