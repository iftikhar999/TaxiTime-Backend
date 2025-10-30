const express = require('express');
const jobService = require('../services/jobService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Create a new job (quick booking for testing)
router.post('/create-job', async (req, res) => {
  try {
    const {
      type = 'TAXI',
      customerId,
      companyId,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      dropoffAddress,
      dropoffLatitude,
      dropoffLongitude,
      vehicleType = 'SEDAN',
      paymentMethod = 'CASH',
      instructions
    } = req.body;

    // Validate required fields
    if (!customerId || !companyId || !pickupLatitude || !pickupLongitude || !dropoffLatitude || !dropoffLongitude) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customerId', 'companyId', 'pickupLatitude', 'pickupLongitude', 'dropoffLatitude', 'dropoffLongitude']
      });
    }

    const job = await jobService.createJob({
      type,
      customerId,
      companyId,
      pickupAddress: pickupAddress || 'Pickup Location',
      pickupLatitude: parseFloat(pickupLatitude),
      pickupLongitude: parseFloat(pickupLongitude),
      dropoffAddress: dropoffAddress || 'Dropoff Location',
      dropoffLatitude: parseFloat(dropoffLatitude),
      dropoffLongitude: parseFloat(dropoffLongitude),
      vehicleType,
      paymentMethod,
      instructions
    });

    res.json({
      message: 'Job created successfully',
      job: {
        id: job.id,
        jobId: job.jobId,
        type: job.type,
        status: job.status,
        estimatedPrice: job.estimatedPrice,
        estimatedDistance: job.estimatedDistance,
        estimatedDuration: job.estimatedDuration,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress
      }
    });

  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error.message
    });
  }
});

// Get job details
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      error: 'Failed to get job',
      message: error.message
    });
  }
});

// Driver accepts offer
router.post('/offer/:offerId/accept', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    const result = await jobService.acceptOffer(offerId, driverId);
    res.json({
      message: 'Offer accepted successfully',
      assignment: result
    });

  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({
      error: 'Failed to accept offer',
      message: error.message
    });
  }
});

// Update job status
router.put('/job/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, driverId, latitude, longitude } = req.body;

    if (!status || !driverId) {
      return res.status(400).json({ error: 'Status and driver ID are required' });
    }

    const locationData = latitude && longitude ? { latitude, longitude } : null;
    const updatedJob = await jobService.updateJobStatus(jobId, status, driverId, locationData);

    res.json({
      message: 'Job status updated successfully',
      job: updatedJob
    });

  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({
      error: 'Failed to update job status',
      message: error.message
    });
  }
});

// Get active jobs for company (dispatch view)
router.get('/company/:companyId/jobs', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { status = 'all', page = 1, limit = 20 } = req.query;

    const jobs = await jobService.getCompanyJobs(companyId, status, parseInt(page), parseInt(limit));

    res.json({
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: jobs.length
      }
    });

  } catch (error) {
    console.error('Get company jobs error:', error);
    res.status(500).json({
      error: 'Failed to get company jobs',
      message: error.message
    });
  }
});

// Quick test endpoint to create test data
router.post('/test/create-sample-job', async (req, res) => {
  try {
    // Create a test job with sample data
    const job = await jobService.createJob({
      type: 'TAXI',
      customerId: 'test-customer',
      companyId: 'cmge4v0sa00069kkke9hhobam', // Use existing company ID
      pickupAddress: '123 Main St, New York, NY',
      pickupLatitude: 40.7128,
      pickupLongitude: -74.0060,
      dropoffAddress: '456 Broadway, New York, NY',
      dropoffLatitude: 40.7589,
      dropoffLongitude: -73.9851,
      vehicleType: 'SEDAN',
      paymentMethod: 'CASH',
      instructions: 'Test ride booking'
    });

    res.json({
      message: 'Test job created successfully',
      job
    });

  } catch (error) {
    console.error('Create test job error:', error);
    res.status(500).json({
      error: 'Failed to create test job',
      message: error.message
    });
  }
});

// Test job assignment endpoint (no auth required for testing)
router.post('/assign-job', async (req, res) => {
  try {
    const { jobId, driverId } = req.body;

    if (!jobId || !driverId) {
      return res.status(400).json({
        error: 'Missing required fields: jobId and driverId'
      });
    }

    // Get Socket.IO instance from req
    const io = req.io;

    console.log('🧪 TEST: Attempting to assign job', { jobId, driverId });    // Call assignDriver with Socket.IO instance
    const assignment = await jobService.assignDriver(jobId, driverId, io);

    res.json({
      message: 'Job assigned successfully (test)',
      assignment
    });

  } catch (error) {
    console.error('Test assign job error:', error);
    res.status(500).json({
      error: 'Failed to assign job',
      message: error.message
    });
  }
});

// Test socket emission directly (no database needed)
router.post('/test-socket', async (req, res) => {
  try {
    const { driverId, companyId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        error: 'Missing required field: driverId'
      });
    }

    // Get Socket.IO instance from req
    const io = req.io;

    if (!io) {
      return res.status(500).json({
        error: 'Socket.IO not available'
      });
    } console.log('🧪 TEST: Emitting job_assigned event to driver', { driverId, companyId });

    // Create mock job data
    const mockJobData = {
      id: `test-job-${Date.now()}`,
      jobId: `test-job-${Date.now()}`,
      pickupAddress: "123 Test Pickup St",
      pickupLatitude: 40.7128,
      pickupLongitude: -74.0060,
      dropoffAddress: "456 Test Destination Ave",
      dropoffLatitude: 40.7589,
      dropoffLongitude: -73.9851,
      customerName: "Test Customer",
      customerPhone: "+1-555-0123",
      fare: 25.50,
      distance: 5.2,
      duration: 15
    };

    // Emit to driver namespace
    io.of('/driver').emit('job_assigned', mockJobData);

    console.log('✅ TEST: job_assigned event emitted successfully');

    res.json({
      message: 'Test socket event emitted successfully',
      event: 'job_assigned',
      data: mockJobData,
      target: 'all drivers in /driver namespace'
    });

  } catch (error) {
    console.error('Test socket emit error:', error);
    res.status(500).json({
      error: 'Failed to emit test socket event',
      message: error.message
    });
  }
});

// Test complete job assignment flow (create job + assign to driver)
router.post('/test-job-assignment', async (req, res) => {
  try {
    const { driverId, companyId } = req.body;

    if (!driverId || !companyId) {
      return res.status(400).json({
        error: 'Missing required fields: driverId and companyId'
      });
    }

    // Get Socket.IO instance from req
    const io = req.io;

    if (!io) {
      return res.status(500).json({
        error: 'Socket.IO not available'
      });
    }

    console.log('🧪 TEST: Testing complete job assignment flow', { driverId, companyId });

    // Create a test job first
    const testJobData = {
      type: 'TAXI',
      customerId: 'test-customer-123',
      companyId: companyId,
      pickupAddress: '123 Test Pickup Street, New York, NY',
      pickupLatitude: 40.7128,
      pickupLongitude: -74.0060,
      dropoffAddress: '456 Test Destination Ave, New York, NY',
      dropoffLatitude: 40.7589,
      dropoffLongitude: -73.9851,
      vehicleType: 'SEDAN',
      paymentMethod: 'CASH',
      instructions: 'Test ride for Socket.IO verification'
    };

    // Create the job using jobService
    const job = await jobService.createJob(testJobData);
    console.log('✅ TEST: Job created successfully', job.id);

    // Assign the job to the driver (this should trigger Socket.IO notification)
    const assignment = await jobService.assignDriver(job.id, driverId, 'test-dispatcher', io);
    console.log('✅ TEST: Job assigned successfully', assignment.id);

    res.json({
      message: 'Test job assignment completed successfully',
      jobId: job.id,
      assignmentId: assignment.id,
      driverId: driverId,
      status: 'Socket.IO notification should have been sent to driver'
    });

  } catch (error) {
    console.error('Test job assignment error:', error);
    res.status(500).json({
      error: 'Failed to test job assignment',
      message: error.message
    });
  }
});

// Simple Socket.IO connectivity test
router.get('/socket-test', (req, res) => {
  try {
    const io = req.app.get('io');

    if (!io) {
      return res.json({
        error: 'Socket.IO not available',
        status: 'failed'
      });
    }

    // Test sending a message to a test room
    const testDriverId = 'test-driver-123';
    const testRoom = `driver_${testDriverId}`;

    console.log('📡 TEST: Testing Socket.IO connectivity...');
    console.log('📡 TEST: Emitting to room:', testRoom);

    // Emit a test message
    io.of('/driver').to(testRoom).emit('job_assigned', {
      jobId: 'test-job-123',
      message: 'This is a Socket.IO test message',
      timestamp: new Date().toISOString(),
      testMessage: true
    });

    console.log('✅ TEST: Socket.IO test message sent successfully');

    res.json({
      status: 'success',
      message: 'Socket.IO test completed',
      namespace: '/driver',
      room: testRoom,
      event: 'job_assigned',
      socketIOAvailable: true
    });

  } catch (error) {
    console.error('Socket.IO test error:', error);
    res.status(500).json({
      error: 'Socket.IO test failed',
      message: error.message
    });
  }
});

module.exports = router;