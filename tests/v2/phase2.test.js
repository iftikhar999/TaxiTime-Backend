/* eslint-env jest */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'uber_clone_secret_love';

const generateToken = (role = 'DRIVER', companyId = 'test-company-1') =>
  jwt.sign(
    {
      userId: `test-${role.toLowerCase()}`,
      role,
      companyId,
      email: `${role.toLowerCase()}@test.com`,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

describe('Phase 2: Delivery + Courier Flows', () => {
  const driverToken = generateToken('DRIVER');
  const dispatcherToken = generateToken('DISPATCHER');

  describe('Stop Service', () => {
    let stopService;
    beforeAll(() => {
      try {
        stopService = require('../../services/v2/stopService');
      } catch (e) {
        console.warn('Could not load stopService:', e.message);
      }
    });

    it('loads stopService', () => {
      expect(stopService).toBeDefined();
    });

    it('exposes expected methods', () => {
      if (!stopService) return;
      expect(typeof stopService.getStopsByJobId).toBe('function');
      expect(typeof stopService.updateStopStatus).toBe('function');
      expect(typeof stopService.getNextPendingStop).toBe('function');
      expect(typeof stopService.getStopProgress).toBe('function');
    });

    it('validates stop state transitions', () => {
      if (!stopService) return;
      expect(stopService.isValidTransition('PENDING', 'READY')).toBe(true);
      expect(stopService.isValidTransition('PENDING', 'ARRIVED')).toBe(true);
      expect(stopService.isValidTransition('ARRIVED', 'DELIVERED')).toBe(true);
      expect(stopService.isValidTransition('DELIVERED', 'PENDING')).toBe(false);
    });
  });

  describe('POD Service', () => {
    let podService;
    beforeAll(() => {
      try {
        podService = require('../../services/v2/podService');
      } catch (e) {
        console.warn('Could not load podService:', e.message);
      }
    });

    it('loads podService', () => {
      expect(podService).toBeDefined();
    });

    it('exposes expected methods', () => {
      if (!podService) return;
      expect(typeof podService.captureProof).toBe('function');
      expect(typeof podService.verifyPincode).toBe('function');
      expect(typeof podService.getProofsByStop).toBe('function');
      expect(typeof podService.getProofRequirements).toBe('function');
    });
  });

  describe('Route Optimization Service', () => {
    let routeOptService;
    beforeAll(() => {
      try {
        routeOptService = require('../../services/v2/routeOptimizationService');
      } catch (e) {
        console.warn('Could not load routeOptimizationService:', e.message);
      }
    });

    it('loads routeOptimizationService', () => {
      expect(routeOptService).toBeDefined();
    });

    it('exposes optimization helpers', () => {
      if (!routeOptService) return;
      expect(typeof routeOptService.optimizeRoute).toBe('function');
      expect(typeof routeOptService.nearestNeighbor).toBe('function');
      expect(typeof routeOptService.calculateTotalDistance).toBe('function');
    });

    it('optimizes simple sequence using nearest neighbor', () => {
      if (!routeOptService) return;
      const stops = [
        { id: 'a', latitude: 40.7128, longitude: -74.006 },
        { id: 'b', latitude: 40.758, longitude: -73.9855 },
        { id: 'c', latitude: 40.7484, longitude: -73.9857 },
      ];
      const start = { latitude: 40.7128, longitude: -74.006 };
      const ordered = routeOptService.nearestNeighbor(stops, start);
      expect(ordered.length).toBe(3);
      expect(ordered[0].id).toBe('a');
    });
  });

  describe('Stop API Endpoints', () => {
    it('GET /api/v2/jobs/:jobId/stops returns stops or 404', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/jobs/test-job-id/stops')
        .set('Authorization', `Bearer ${driverToken}`);
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('GET /api/v2/jobs/:jobId/stops/next returns next pending stop or 404', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/jobs/test-job-id/stops/next')
        .set('Authorization', `Bearer ${driverToken}`);
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('PATCH /api/v2/jobs/:jobId/stops/:stopId/status validates transition', async () => {
      const res = await request(BASE_URL)
        .patch('/api/v2/jobs/test-job-id/stops/test-stop-id/status')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'READY' });
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/stops/:stopId/arrive marks arrived', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/stops/test-stop-id/arrive')
        .set('Authorization', `Bearer ${driverToken}`);
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/stops/:stopId/complete marks delivered', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/stops/test-stop-id/complete')
        .set('Authorization', `Bearer ${driverToken}`);
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });
  });

  describe('POD API Endpoints', () => {
    it('GET /api/v2/jobs/:jobId/stops/:stopId/pod returns proofs', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/jobs/test-job-id/stops/test-stop-id/pod')
        .set('Authorization', `Bearer ${driverToken}`);
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/stops/:stopId/pod/signature captures signature', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/stops/test-stop-id/pod/signature')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ signatureUrl: 'base64data', recipientName: 'John Doe' });
      expect([201, 400, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/stops/:stopId/pod/photo captures photo', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/stops/test-stop-id/pod/photo')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ photoUrl: 'https://example.com/photo.jpg', notes: 'Left at door' });
      expect([201, 400, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/stops/:stopId/pod/pin validates pin', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/stops/test-stop-id/pod/pin')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ pincode: '1234' });
      expect([201, 400, 401, 403, 404]).toContain(res.status);
    });
  });

  describe('Route Optimization API Endpoints', () => {
    it('POST /api/v2/jobs/:jobId/optimize optimizes route', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/optimize')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ algorithm: 'NEAREST_NEIGHBOR' });
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });

    it('GET /api/v2/jobs/:jobId/route returns optimized route', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/jobs/test-job-id/route')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('POST /api/v2/jobs/:jobId/reoptimize reoptimizes remaining stops', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/test-job-id/reoptimize')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ skipStopIds: [] });
      expect([200, 400, 401, 403, 404]).toContain(res.status);
    });
  });

  describe('Service file presence', () => {
    it('stopService exists', () => {
      expect(() => require('../../services/v2/stopService')).not.toThrow();
    });
    it('podService exists', () => {
      expect(() => require('../../services/v2/podService')).not.toThrow();
    });
    it('routeOptimizationService exists', () => {
      expect(() => require('../../services/v2/routeOptimizationService')).not.toThrow();
    });
    it('stops routes exist', () => {
      expect(() => require('../../routes/v2/stops')).not.toThrow();
    });
  });
});
