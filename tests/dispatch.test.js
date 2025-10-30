const request = require('supertest');
const app = require('../server');

describe('Dispatch API Integration Tests', () => {
  let authToken;
  let testUser;
  let testCompany;
  let testJob;
  let testDriver;

  beforeAll(async () => {
    // Create test company
    testCompany = await global.prisma.company.create({
      data: {
        name: 'Test Taxi Company',
        email: 'test@taxi.com',
        phone: '+1234567890',
        address: '123 Test St',
        ownerId: 'temp-owner-id',
        isActive: true,
      }
    });

    // Create test owner user
    testUser = await global.prisma.user.create({
      data: {
        email: 'admin@test.com',
        password: '$2a$10$7Q1B9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z', // 'password123'
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        companyId: testCompany.id,
        isActive: true,
      }
    });

    // Update company with real owner ID
    await global.prisma.company.update({
      where: { id: testCompany.id },
      data: { ownerId: testUser.id }
    });

    // Create test driver
    testDriver = await global.prisma.user.create({
      data: {
        email: 'driver@test.com',
        password: '$2a$10$7Q1B9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z',
        firstName: 'Test',
        lastName: 'Driver',
        role: 'DRIVER',
        companyId: testCompany.id,
        vehicleType: 'SEDAN',
        vehicleNumber: 'TEST-123',
        isActive: true,
      }
    });

    // Login to get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123'
      });

    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // Cleanup test data
    await global.prisma.job.deleteMany({
      where: { companyId: testCompany.id }
    });
    await global.prisma.user.deleteMany({
      where: { companyId: testCompany.id }
    });
    await global.prisma.company.delete({
      where: { id: testCompany.id }
    });
  });

  describe('Price Estimation', () => {
    test('POST /api/dispatch/estimate - should calculate price estimate', async () => {
      const response = await request(app)
        .post('/api/dispatch/estimate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pickupLatitude: 40.7128,
          pickupLongitude: -74.0060,
          dropoffLatitude: 40.7489,
          dropoffLongitude: -73.9857,
          vehicleType: 'SEDAN',
          jobType: 'TAXI'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('finalPrice');
      expect(response.body.data).toHaveProperty('distance');
      expect(response.body.data).toHaveProperty('estimatedTime');
      expect(response.body.data).toHaveProperty('breakdown');
      expect(typeof response.body.data.finalPrice).toBe('number');
      expect(response.body.data.finalPrice).toBeGreaterThan(0);
    });

    test('POST /api/dispatch/estimate - should handle invalid coordinates', async () => {
      const response = await request(app)
        .post('/api/dispatch/estimate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pickupLatitude: 'invalid',
          pickupLongitude: -74.0060,
          dropoffLatitude: 40.7489,
          dropoffLongitude: -73.9857,
          vehicleType: 'SEDAN'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Job Management', () => {
    test('POST /api/dispatch/jobs - should create a new taxi job', async () => {
      const response = await request(app)
        .post('/api/dispatch/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'TAXI',
          pickupAddress: '123 Main St, New York, NY',
          pickupLatitude: 40.7128,
          pickupLongitude: -74.0060,
          dropoffAddress: '456 Broadway, New York, NY',
          dropoffLatitude: 40.7489,
          dropoffLongitude: -73.9857,
          vehicleType: 'SEDAN',
          paymentMethod: 'CARD'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job).toHaveProperty('id');
      expect(response.body.data.job.type).toBe('TAXI');
      expect(response.body.data.job.status).toBe('PENDING');
      expect(response.body.data).toHaveProperty('priceBreakdown');

      testJob = response.body.data.job;
    });

    test('POST /api/dispatch/jobs - should create a delivery job', async () => {
      const response = await request(app)
        .post('/api/dispatch/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'DELIVERY',
          pickupAddress: 'Restaurant ABC, 789 Food St',
          pickupLatitude: 40.7580,
          pickupLongitude: -73.9855,
          dropoffAddress: '321 Customer Ave, New York, NY',
          dropoffLatitude: 40.7282,
          dropoffLongitude: -73.9942,
          vehicleType: 'MOTORCYCLE',
          recipientName: 'John Doe',
          recipientPhone: '+1234567890',
          packageDescription: 'Food delivery - Pizza and drinks'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.job.type).toBe('DELIVERY');
    });

    test('GET /api/dispatch/dispatch/jobs - should get active jobs for dispatch', async () => {
      const response = await request(app)
        .get('/api/dispatch/dispatch/jobs')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      const job = response.body.data[0];
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('customer');
      expect(job).toHaveProperty('status');
    });
  });

  describe('Driver Management', () => {
    beforeEach(async () => {
      // Create driver shift
      await global.prisma.shift.create({
        data: {
          driverId: testDriver.id,
          companyId: testCompany.id,
          status: 'ONLINE',
          startTime: new Date(),
        }
      });

      // Add driver location
      await global.prisma.locationUpdate.create({
        data: {
          driverId: testDriver.id,
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(),
        }
      });
    });

    test('GET /api/dispatch/dispatch/drivers - should get available drivers', async () => {
      const response = await request(app)
        .get('/api/dispatch/dispatch/drivers')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      if (response.body.data.length > 0) {
        const driver = response.body.data[0];
        expect(driver).toHaveProperty('id');
        expect(driver).toHaveProperty('firstName');
        expect(driver).toHaveProperty('lastName');
        expect(driver).toHaveProperty('isAvailable');
        expect(driver).toHaveProperty('currentLocation');
      }
    });

    test('GET /api/dispatch/dispatch/drivers with location filter', async () => {
      const response = await request(app)
        .get('/api/dispatch/dispatch/drivers?latitude=40.7128&longitude=-74.0060&radius=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Manual Assignment', () => {
    test('POST /api/dispatch/dispatch/assign - should manually assign job to driver', async () => {
      if (!testJob || !testDriver) {
        console.log('Skipping assignment test - missing test data');
        return;
      }

      const response = await request(app)
        .post('/api/dispatch/dispatch/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          jobId: testJob.id,
          driverId: testDriver.id
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.jobId).toBe(testJob.id);
      expect(response.body.data.driverId).toBe(testDriver.id);
    });

    test('POST /api/dispatch/dispatch/assign - should fail with invalid job ID', async () => {
      const response = await request(app)
        .post('/api/dispatch/dispatch/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          jobId: 'invalid-job-id',
          driverId: testDriver.id
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Driver Actions', () => {
    let driverAuthToken;

    beforeAll(async () => {
      // Login as driver
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'driver@test.com',
          password: 'password123'
        });

      driverAuthToken = loginResponse.body.token;
    });

    test('POST /api/dispatch/driver/location - should update driver location', async () => {
      const response = await request(app)
        .post('/api/dispatch/driver/location')
        .set('Authorization', `Bearer ${driverAuthToken}`)
        .send({
          latitude: 40.7489,
          longitude: -73.9857,
          heading: 45,
          speed: 25,
          accuracy: 5,
          timestamp: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.latitude).toBe(40.7489);
      expect(response.body.data.longitude).toBe(-73.9857);
    });

    test('GET /api/dispatch/driver/jobs - should get driver active jobs', async () => {
      const response = await request(app)
        .get('/api/dispatch/driver/jobs')
        .set('Authorization', `Bearer ${driverAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Job Status Updates', () => {
    let driverAuthToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'driver@test.com',
          password: 'password123'
        });

      driverAuthToken = loginResponse.body.token;
    });

    test('PATCH /api/dispatch/jobs/:jobId/status - should update job status', async () => {
      if (!testJob) {
        console.log('Skipping status update test - missing test job');
        return;
      }

      const response = await request(app)
        .patch(`/api/dispatch/jobs/${testJob.id}/status`)
        .set('Authorization', `Bearer ${driverAuthToken}`)
        .send({
          status: 'STARTED',
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
            timestamp: new Date().toISOString()
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('STARTED');
    });
  });

  describe('Job Tracking', () => {
    test('GET /api/dispatch/tracking/:jobId - should get job tracking data', async () => {
      if (!testJob) {
        console.log('Skipping tracking test - missing test job');
        return;
      }

      const response = await request(app)
        .get(`/api/dispatch/tracking/${testJob.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('job');
      expect(response.body.data.job).toHaveProperty('id');
      expect(response.body.data.job).toHaveProperty('pickup');
      expect(response.body.data.job).toHaveProperty('dropoff');
    });

    test('GET /api/dispatch/tracking/:jobId - should fail for unauthorized user', async () => {
      // Create a different user
      const otherUser = await global.prisma.user.create({
        data: {
          email: 'other@test.com',
          password: '$2a$10$7Q1B9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z9Z',
          firstName: 'Other',
          lastName: 'User',
          role: 'CUSTOMER',
          companyId: testCompany.id,
          isActive: true,
        }
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'other@test.com',
          password: 'password123'
        });

      const otherToken = loginResponse.body.token;

      if (testJob) {
        const response = await request(app)
          .get(`/api/dispatch/tracking/${testJob.id}`)
          .set('Authorization', `Bearer ${otherToken}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      }

      // Cleanup
      await global.prisma.user.delete({
        where: { id: otherUser.id }
      });
    });
  });

  describe('Error Handling', () => {
    test('Should require authentication', async () => {
      const response = await request(app)
        .get('/api/dispatch/dispatch/jobs');

      expect(response.status).toBe(401);
    });

    test('Should handle invalid job ID', async () => {
      const response = await request(app)
        .get('/api/dispatch/tracking/invalid-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('Should validate required fields for job creation', async () => {
      const response = await request(app)
        .post('/api/dispatch/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'TAXI'
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

module.exports = {
  testCompany,
  testUser,
  testDriver,
  testJob
};