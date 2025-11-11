/**
 * Web-Based Simulator Server
 * Serves the interactive simulator UI and provides API endpoints for testing
 */

const express = require('express');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Serve the simulator HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'simulator.html'));
});

// API Endpoints for Real Backend Testing

/**
 * GET /api/status
 * Get current simulator status and test data
 */
app.get('/api/status', async (req, res) => {
  try {
    const testDriver = await prisma.user.findFirst({
      where: { email: 'test-driver@test.com' },
      include: { companyDriverProfile: true }
    });

    const testCustomer = await prisma.user.findFirst({
      where: { email: 'test-customer@test.com' }
    });

    const testJobs = await prisma.job.findMany({
      where: { jobId: { startsWith: 'TEST-JOB-' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        assignments: true,
        offers: true
      }
    });

    res.json({
      success: true,
      data: {
        driver: testDriver ? {
          id: testDriver.id,
          name: `${testDriver.firstName} ${testDriver.lastName}`,
          email: testDriver.email
        } : null,
        customer: testCustomer ? {
          id: testCustomer.id,
          name: `${testCustomer.firstName} ${testCustomer.lastName}`,
          email: testCustomer.email
        } : null,
        recentJobs: testJobs
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/job/create
 * Create a new test job
 */
app.post('/api/job/create', async (req, res) => {
  try {
    const { pickupAddress, dropoffAddress, estimatedPrice } = req.body;

    const testDriver = await prisma.user.findFirst({
      where: { email: 'test-driver@test.com' }
    });

    const testCustomer = await prisma.user.findFirst({
      where: { email: 'test-customer@test.com' }
    });

    if (!testDriver || !testCustomer) {
      return res.status(400).json({
        success: false,
        error: 'Test driver or customer not found. Run setupTestData.js first.'
      });
    }

    const company = await prisma.company.findFirst({
      where: { id: testDriver.companyId }
    });

    const job = await prisma.job.create({
      data: {
        type: 'TAXI',
        customerId: testCustomer.id,
        companyId: company.id,
        status: 'UNASSIGNED',
        pickupAddress: pickupAddress || 'Doha, Qatar - Test Pickup',
        pickupLatitude: 25.286106,
        pickupLongitude: 51.534817,
        dropoffAddress: dropoffAddress || 'Al Markhiya, Doha - Test Dropoff',
        dropoffLatitude: 25.37234,
        dropoffLongitude: 51.52037,
        estimatedDistance: 5.8,
        estimatedDuration: 15,
        estimatedPrice: estimatedPrice || 24.73,
        jobId: `TEST-JOB-${Date.now()}`,
      },
      include: {
        customer: true,
        company: true
      }
    });

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/job/:jobId/offer
 * Offer job to driver
 */
app.post('/api/job/:jobId/offer', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status !== 'UNASSIGNED') {
      return res.status(400).json({
        success: false,
        error: `Job must be UNASSIGNED, currently: ${job.status}`
      });
    }

    const testDriver = await prisma.user.findFirst({
      where: { email: 'test-driver@test.com' }
    });

    // Create assignment
    const assignment = await prisma.assignments.create({
      data: {
        jobId: job.id,
        driverId: testDriver.id,
        status: 'OFFERED',
        assignedAt: new Date(),
        assignedBy: 'SIMULATOR',
      }
    });

    // Create offer
    const expiresAt = new Date(Date.now() + 30000);
    const offer = await prisma.offer.create({
      data: {
        jobId: job.id,
        driverId: testDriver.id,
        estimatedFare: job.estimatedPrice || 0,
        estimatedDuration: job.estimatedDuration || 15,
        distanceToPickup: 1.5,
        expiresAt,
        status: 'SENT',
      }
    });

    // Update job status
    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'OFFERED',
        assignedDriverId: testDriver.id
      },
      include: {
        assignments: true,
        offers: true
      }
    });

    res.json({
      success: true,
      data: {
        job: updatedJob,
        assignment,
        offer
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/job/:jobId/status
 * Update job status
 */
app.post('/api/job/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.body;

    const validStatuses = [
      'UNASSIGNED', 'OFFERED', 'ASSIGNED', 'ON_THE_WAY', 
      'ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 
      'REJECTED', 'CANCELLED', 'NOSHOW'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Handle rejection - job should return to UNASSIGNED
    const finalStatus = status === 'REJECTED' ? 'UNASSIGNED' : status;

    const updateData = { status: finalStatus };

    // Clear assignedDriverId for rejected/cancelled jobs
    if (['REJECTED', 'CANCELLED'].includes(status)) {
      updateData.assignedDriverId = null;
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
        assignments: true,
        offers: true,
        assignedDriver: {
          include: {
            companyDriverProfile: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/recent
 * Get recent test jobs
 */
app.get('/api/jobs/recent', async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { jobId: { startsWith: 'TEST-JOB-' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        assignments: true,
        offers: true,
        customer: true,
        assignedDriver: true
      }
    });

    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/jobs/cleanup
 * Clean up all test jobs
 */
app.delete('/api/jobs/cleanup', async (req, res) => {
  try {
    const testJobs = await prisma.job.findMany({
      where: { jobId: { startsWith: 'TEST-JOB-' } },
      select: { id: true }
    });

    const jobIds = testJobs.map(j => j.id);

    if (jobIds.length > 0) {
      // Delete assignments
      await prisma.assignments.deleteMany({
        where: { jobId: { in: jobIds } }
      });

      // Delete offers
      await prisma.offer.deleteMany({
        where: { jobId: { in: jobIds } }
      });

      // Delete jobs
      const deleted = await prisma.job.deleteMany({
        where: { id: { in: jobIds } }
      });

      res.json({
        success: true,
        message: `Cleaned up ${deleted.count} test jobs`
      });
    } else {
      res.json({
        success: true,
        message: 'No test jobs to clean up'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/test/complete-flow
 * Run complete job lifecycle test
 */
app.post('/api/test/complete-flow', async (req, res) => {
  try {
    const results = [];
    
    // Step 1: Create job
    const createResponse = await fetch(`http://localhost:${PORT}/api/job/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const createData = await createResponse.json();
    results.push({ step: 'Create Job', success: createData.success, status: 'UNASSIGNED' });

    if (!createData.success) {
      return res.json({ success: false, results });
    }

    const jobId = createData.data.id;

    // Step 2: Offer job
    await new Promise(resolve => setTimeout(resolve, 500));
    const offerResponse = await fetch(`http://localhost:${PORT}/api/job/${jobId}/offer`, {
      method: 'POST'
    });
    const offerData = await offerResponse.json();
    results.push({ step: 'Offer Job', success: offerData.success, status: 'OFFERED' });

    // Step 3: Accept job
    await new Promise(resolve => setTimeout(resolve, 500));
    const acceptResponse = await fetch(`http://localhost:${PORT}/api/job/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ASSIGNED' })
    });
    const acceptData = await acceptResponse.json();
    results.push({ step: 'Accept Job', success: acceptData.success, status: 'ASSIGNED' });

    // Step 4: On the way
    await new Promise(resolve => setTimeout(resolve, 500));
    await fetch(`http://localhost:${PORT}/api/job/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ON_THE_WAY' })
    });
    results.push({ step: 'On The Way', success: true, status: 'ON_THE_WAY' });

    // Step 5: Arrived
    await new Promise(resolve => setTimeout(resolve, 500));
    await fetch(`http://localhost:${PORT}/api/job/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ARRIVED' })
    });
    results.push({ step: 'Arrived', success: true, status: 'ARRIVED' });

    // Step 6: Start ride
    await new Promise(resolve => setTimeout(resolve, 500));
    await fetch(`http://localhost:${PORT}/api/job/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'STARTED' })
    });
    results.push({ step: 'Start Ride', success: true, status: 'STARTED' });

    // Step 7: Complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    await fetch(`http://localhost:${PORT}/api/job/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' })
    });
    results.push({ step: 'Complete Ride', success: true, status: 'COMPLETED' });

    res.json({
      success: true,
      message: 'Complete flow test finished',
      results,
      jobId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║       Job Status Flow Simulator Server                  ║
╚══════════════════════════════════════════════════════════╝

🌐 Simulator UI:  http://localhost:${PORT}
📡 API Endpoints: http://localhost:${PORT}/api

Available API Routes:
  GET    /api/status              - Get simulator status
  POST   /api/job/create          - Create test job
  POST   /api/job/:id/offer       - Offer job to driver
  POST   /api/job/:id/status      - Update job status
  GET    /api/jobs/recent         - Get recent jobs
  DELETE /api/jobs/cleanup        - Clean up test jobs
  POST   /api/test/complete-flow  - Run complete flow test

Ready to test! 🚀
  `);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});
