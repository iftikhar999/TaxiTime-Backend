/**
 * Run All Status Flow Tests
 * 
 * Orchestrates both database and socket tests
 * 
 * Usage: node tests/statusFlow/runAllTests.js
 */

const JobStatusFlowSimulator = require('./jobStatusFlowSimulator');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = {
  header: (msg) => console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`),
  title: (msg) => console.log(`${colors.magenta}${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
};

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runDatabaseTests() {
  log.header();
  log.title('RUNNING DATABASE STATUS FLOW TESTS');
  log.header();
  log.info('These tests verify database state transitions directly.\n');

  const simulator = new JobStatusFlowSimulator();
  
  try {
    await simulator.initialize();
    
    log.info('Running test suite...\n');
    
    await simulator.runFullFlow();
    await simulator.testRejectionFlow();
    await simulator.testCancellationFlow();
    await simulator.testNoShowFlow();
    await simulator.testClaimJobRaceCondition();
    
    simulator.printTestResults();
    
    return simulator.testResults;
  } catch (error) {
    console.error('Database tests failed:', error);
    return { passed: 0, failed: 1, tests: [] };
  } finally {
    await simulator.cleanup();
  }
}

async function provideFrontendTestInstructions() {
  log.header();
  log.title('FRONTEND MANUAL TEST CHECKLIST');
  log.header();
  
  console.log(`
${colors.yellow}Test 1: Button Functionality (Proceed to Pickup)${colors.reset}
  1. Open driver app and log in
  2. Accept a job
  3. ${colors.cyan}Immediately click "Proceed to Pickup"${colors.reset}
  4. ✓ Button should respond and change status to ON_THE_WAY
  
${colors.yellow}Test 2: Live Metrics Visibility${colors.reset}
  1. Accept a job → ${colors.cyan}Metrics should NOT be visible${colors.reset}
  2. Click "Proceed to Pickup" → ${colors.cyan}Metrics should NOT be visible${colors.reset}
  3. Click "Mark Arrived" → ${colors.cyan}Metrics should NOT be visible${colors.reset}
  4. Click "Start Ride" → ${colors.green}Metrics SHOULD be visible${colors.reset}
  
${colors.yellow}Test 3: Job Rejection${colors.reset}
  1. Have dispatcher create a job
  2. Driver receives offer
  3. Driver rejects job (or let it timeout)
  4. ✓ Job should return to dispatcher as UNASSIGNED
  5. ✓ Driver status should return to AVAILABLE
  6. ✓ Job should appear in other drivers' lists
  
${colors.yellow}Test 4: Race Condition Prevention${colors.reset}
  1. Have 2 drivers logged in and nearby
  2. Dispatcher creates a job
  3. Both drivers see the job
  4. First driver clicks to accept
  5. ✓ Job should disappear from second driver immediately
  6. ✓ Second driver cannot accept (gets error if they try)

${colors.yellow}Test 5: Status Synchronization${colors.reset}
  1. Open both driver app and dispatch panel
  2. Progress through a complete job lifecycle
  3. ✓ Both screens should show same status at all times
  4. ✓ No delays or desyncs between views
`);
}

async function main() {
  console.log(`
${colors.blue}╔══════════════════════════════════════════════════════════╗
║    JOB STATUS FLOW COMPREHENSIVE TEST SUITE             ║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info('This test suite verifies all job status transitions and driver status updates.');
  log.info('It includes database tests and frontend manual test instructions.\n');

  // Run database tests
  const dbResults = await runDatabaseTests();
  
  log.header();
  log.title('DATABASE TESTS SUMMARY');
  log.header();
  
  if (dbResults.failed === 0) {
    log.success(`All ${dbResults.passed} database tests passed! ✨`);
  } else {
    log.warn(`${dbResults.failed} test(s) failed. Review the output above for details.`);
  }
  
  // Provide frontend test instructions
  await provideFrontendTestInstructions();
  
  log.header();
  log.title('NEXT STEPS');
  log.header();
  
  console.log(`
${colors.cyan}1.${colors.reset} Review the database test results above
${colors.cyan}2.${colors.reset} If database tests passed, proceed with frontend manual tests
${colors.cyan}3.${colors.reset} Use the checklist above to verify UI behavior
${colors.cyan}4.${colors.reset} Report any failures with specific test case details

${colors.green}For socket event testing:${colors.reset}
Run: ${colors.yellow}node tests/statusFlow/socketEventSimulator.js${colors.reset}
(Requires updating with real credentials first)
  `);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runDatabaseTests, provideFrontendTestInstructions };
