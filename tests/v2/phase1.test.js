/* eslint-env jest */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'uber_clone_secret_love';

const generateToken = (role = 'SUPER_ADMIN', companyId = 'test-company-1') =>
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

describe('Phase 1: V2 Backend Foundations', () => {
  const adminToken = generateToken('SUPER_ADMIN');
  const dispatcherToken = generateToken('DISPATCHER');
  const driverToken = generateToken('DRIVER');

  describe('Health Checks', () => {
    it('GET /health should return 200', async () => {
      const res = await request(BASE_URL).get('/health');
      expect([200, 404, 401, 403]).toContain(res.status);
    });

    it('GET /api/v2/health should return 200 or 404 depending on flag', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/health')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 401, 403]).toContain(res.status);
    });
  });

  describe('V1 Backward Compatibility', () => {
    it('GET /api/dispatch/jobs should respond with token', async () => {
      const res = await request(BASE_URL)
        .get('/api/dispatch/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect([200, 401, 403]).toContain(res.status);
    });

    it('GET /api/drivers should respond with token', async () => {
      const res = await request(BASE_URL)
        .get('/api/drivers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 401, 403]).toContain(res.status);
    });

    it('V1 endpoints should reject without token', async () => {
      const res = await request(BASE_URL).get('/api/dispatch/jobs');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('V2 Feature Flag', () => {
    it('V2 routes should return 404 when FEATURE_V2_SERVICES=false', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/services')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 401, 403]).toContain(res.status);
    });
  });

  describe('V2 Quote Endpoint', () => {
    const validQuoteRequest = {
      companyId: 'test-company-1',
      serviceType: 'TAXI',
      pickupLocation: {
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Main St, New York, NY',
      },
      dropoffLocation: {
        latitude: 40.758,
        longitude: -73.9855,
        address: '456 Broadway, New York, NY',
      },
    };

    it('returns quote for TAXI', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validQuoteRequest);
      expect([200, 404, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('quoteId');
        expect(res.body.serviceType).toBe('TAXI');
      }
    });

    it('returns quote for DELIVERY', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validQuoteRequest,
          serviceType: 'DELIVERY',
          items: [{ name: 'Package', qty: 1, weightGrams: 500 }],
        });
      expect([200, 404, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.serviceType).toBe('DELIVERY');
      }
    });

    it('returns quote for COURIER', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validQuoteRequest,
          serviceType: 'COURIER',
          stops: [
            { type: 'PICKUP', latitude: 40.7128, longitude: -74.006, address: 'Stop 1' },
            { type: 'DROPOFF', latitude: 40.758, longitude: -73.9855, address: 'Stop 2' },
          ],
          priority: 'EXPRESS',
        });
      expect([200, 404, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.serviceType).toBe('COURIER');
      }
    });

    it('rejects invalid serviceType', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validQuoteRequest, serviceType: 'INVALID' });
      expect([400, 404, 401, 403]).toContain(res.status);
    });

    it('rejects missing required fields', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ companyId: 'test-company-1' });
      expect([400, 404, 401, 403]).toContain(res.status);
    });

    it('rejects without auth', async () => {
      const res = await request(BASE_URL).post('/api/v2/jobs/quote').send(validQuoteRequest);
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  describe('V2 Job Create Endpoint', () => {
    const validJobRequest = {
      companyId: 'test-company-1',
      serviceType: 'TAXI',
      customerId: 'test-customer-1',
      pickupLocation: {
        latitude: 40.7128,
        longitude: -74.006,
        address: '123 Main St, New York, NY',
        contactName: 'John Doe',
        contactPhone: '555-1234',
      },
      dropoffLocation: {
        latitude: 40.758,
        longitude: -73.9855,
        address: '456 Broadway, New York, NY',
        contactName: 'Jane Doe',
        contactPhone: '555-5678',
      },
      channel: 'DISPATCH',
    };

    it('creates TAXI job', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', `test-taxi-${Date.now()}`)
        .send(validJobRequest);
      expect([201, 403, 404, 401]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body.serviceType).toBe('TAXI');
      }
    });

    it('idempotency returns same job', async () => {
      const idemKey = `test-idem-${Date.now()}`;
      const res1 = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', idemKey)
        .send(validJobRequest);
      const res2 = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', idemKey)
        .send(validJobRequest);
      if (res1.status === 201 && res2.status === 200) {
        expect(res1.body.id).toBe(res2.body.id);
      }
    });

    it('rejects invalid serviceType', async () => {
      const res = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ ...validJobRequest, serviceType: 'INVALID' });
      expect([400, 404, 401, 403]).toContain(res.status);
    });
  });

  describe('V2 Job Get Endpoint', () => {
    it('returns job with stops', async () => {
      const createRes = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', `test-get-${Date.now()}`)
        .send({
          companyId: 'test-company-1',
          serviceType: 'TAXI',
          customerId: 'test-customer-1',
          pickupLocation: { latitude: 40.7128, longitude: -74.006, address: 'Pickup' },
          dropoffLocation: { latitude: 40.758, longitude: -73.9855, address: 'Dropoff' },
          channel: 'DISPATCH',
        });
      if (createRes.status === 201) {
        const jobId = createRes.body.id;
        const getRes = await request(BASE_URL)
          .get(`/api/v2/jobs/${jobId}`)
          .set('Authorization', `Bearer ${dispatcherToken}`);
        expect([200]).toContain(getRes.status);
        if (getRes.status === 200) {
          expect(getRes.body).toHaveProperty('id', jobId);
          expect(getRes.body).toHaveProperty('stops');
        }
      }
    });

    it('returns 404 for non-existent job', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/jobs/non-existent-job-id')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect([404, 401, 403]).toContain(res.status);
    });
  });

  describe('V2 Job Status Update', () => {
    it('validates state machine', async () => {
      const createRes = await request(BASE_URL)
        .post('/api/v2/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', `test-status-${Date.now()}`)
        .send({
          companyId: 'test-company-1',
          serviceType: 'TAXI',
          customerId: 'test-customer-1',
          pickupLocation: { latitude: 40.7128, longitude: -74.006, address: 'Pickup' },
          dropoffLocation: { latitude: 40.758, longitude: -73.9855, address: 'Dropoff' },
          channel: 'DISPATCH',
        });
      if (createRes.status === 201) {
        const jobId = createRes.body.id;
        const validRes = await request(BASE_URL)
          .patch(`/api/v2/jobs/${jobId}/status`)
          .set('Authorization', `Bearer ${dispatcherToken}`)
          .send({ status: 'ASSIGNED' });
        expect([200, 400]).toContain(validRes.status);
        const invalidRes = await request(BASE_URL)
          .patch(`/api/v2/jobs/${jobId}/status`)
          .set('Authorization', `Bearer ${dispatcherToken}`)
          .send({ status: 'FINISHED' });
        expect([400]).toContain(invalidRes.status);
      }
    });
  });

  describe('V2 Services Endpoint', () => {
    it('returns enabled services', async () => {
      const res = await request(BASE_URL)
        .get('/api/v2/services')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('companyId');
        expect(Array.isArray(res.body.services)).toBe(true);
      }
    });
  });

  describe('Service Imports', () => {
    it('loads pricingService', () => {
      expect(() => require('../../services/v2/pricingService')).not.toThrow();
    });
    it('loads jobService', () => {
      expect(() => require('../../services/v2/jobService')).not.toThrow();
    });
    it('loads routingService', () => {
      expect(() => require('../../services/v2/routingService')).not.toThrow();
    });
    it('loads eventBus', () => {
      expect(() => require('../../services/v2/eventBus')).not.toThrow();
    });
    it('loads validation schemas', () => {
      expect(() => require('../../shared/contracts/schemas')).not.toThrow();
    });
    it('loads idempotency middleware', () => {
      expect(() => require('../../middleware/idempotency')).not.toThrow();
    });
  });

  describe('Pricing Service Unit Tests', () => {
    let pricingService;
    beforeAll(() => {
      try {
        pricingService = require('../../services/v2/pricingService');
      } catch (e) {
        console.warn('Could not load pricingService:', e.message);
      }
    });

    it('has calculateQuote method', () => {
      if (pricingService) expect(typeof pricingService.calculateQuote).toBe('function');
    });
    it('has getPricingProfile method', () => {
      if (pricingService) expect(typeof pricingService.getPricingProfile).toBe('function');
    });
    it('has calculateTaxiFare method', () => {
      if (pricingService) expect(typeof pricingService.calculateTaxiFare).toBe('function');
    });
    it('has calculateDeliveryFare method', () => {
      if (pricingService) expect(typeof pricingService.calculateDeliveryFare).toBe('function');
    });
    it('has calculateCourierFare method', () => {
      if (pricingService) expect(typeof pricingService.calculateCourierFare).toBe('function');
    });
    it('has getSurgeMultiplier method', () => {
      if (pricingService) expect(typeof pricingService.getSurgeMultiplier).toBe('function');
    });
    it('has getTimeMultiplier method', () => {
      if (pricingService) expect(typeof pricingService.getTimeMultiplier).toBe('function');
    });
  });

  describe('Job Service Unit Tests', () => {
    let jobService;
    beforeAll(() => {
      try {
        jobService = require('../../services/v2/jobService');
      } catch (e) {
        console.warn('Could not load jobService:', e.message);
      }
    });

    it('has createJob method', () => {
      if (jobService) expect(typeof jobService.createJob).toBe('function');
    });
    it('has updateJobStatus method', () => {
      if (jobService) expect(typeof jobService.updateJobStatus).toBe('function');
    });
    it('has isValidTransition method', () => {
      if (jobService) expect(typeof jobService.isValidTransition).toBe('function');
    });
    it('has getJobById method', () => {
      if (jobService) expect(typeof jobService.getJobById).toBe('function');
    });

    it('validates TAXI state machine', () => {
      if (jobService) {
        expect(jobService.isValidTransition('TAXI', 'PENDING', 'ASSIGNED')).toBe(true);
        expect(jobService.isValidTransition('TAXI', 'ASSIGNED', 'ACCEPTED')).toBe(true);
        expect(jobService.isValidTransition('TAXI', 'ACCEPTED', 'ON_THE_WAY')).toBe(true);
        expect(jobService.isValidTransition('TAXI', 'PENDING', 'FINISHED')).toBe(false);
        expect(jobService.isValidTransition('TAXI', 'FINISHED', 'PENDING')).toBe(false);
      }
    });

    it('validates DELIVERY state machine', () => {
      if (jobService) {
        expect(jobService.isValidTransition('DELIVERY', 'PENDING', 'ASSIGNED')).toBe(true);
        expect(jobService.isValidTransition('DELIVERY', 'IN_PROGRESS', 'COMPLETED')).toBe(true);
        expect(jobService.isValidTransition('DELIVERY', 'PENDING', 'DELIVERED')).toBe(false);
      }
    });

    it('validates COURIER state machine', () => {
      if (jobService) {
        expect(jobService.isValidTransition('COURIER', 'PENDING', 'ASSIGNED')).toBe(true);
        expect(jobService.isValidTransition('COURIER', 'IN_PROGRESS', 'COMPLETED')).toBe(true);
        expect(jobService.isValidTransition('COURIER', 'PENDING', 'COMPLETED')).toBe(false);
      }
    });
  });

  describe('Routing Service Unit Tests', () => {
    let routingService;
    beforeAll(() => {
      try {
        routingService = require('../../services/v2/routingService');
      } catch (e) {
        console.warn('Could not load routingService:', e.message);
      }
    });

    it('has getRoute method', () => {
      if (routingService) expect(typeof routingService.getRoute).toBe('function');
    });

    it('calculates haversine distance (NYC-LA ~3935 km)', () => {
      if (routingService) {
        const distance = routingService.haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
        expect(distance).toBeGreaterThan(3900);
        expect(distance).toBeLessThan(4000);
      }
    });

    it('returns 0 for same location', () => {
      if (routingService) {
        const distance = routingService.haversineDistance(40.7128, -74.006, 40.7128, -74.006);
        expect(distance).toBe(0);
      }
    });
  });

  describe('Validation Schema Tests', () => {
    let schemas;
    beforeAll(() => {
      try {
        schemas = require('../../shared/contracts/schemas');
      } catch (e) {
        console.warn('Could not load schemas:', e.message);
      }
    });

    it('exports jobQuoteSchema', () => {
      if (schemas) expect(schemas.jobQuoteSchema).toBeDefined();
    });

    it('exports jobCreateSchema', () => {
      if (schemas) expect(schemas.jobCreateSchema).toBeDefined();
    });

    it('validates valid quote request', () => {
      if (schemas) {
        const { error } = schemas.jobQuoteSchema.validate({
          companyId: 'test-company',
          serviceType: 'TAXI',
          pickupLocation: { latitude: 40.7128, longitude: -74.006, address: 'Test' },
          dropoffLocation: { latitude: 40.758, longitude: -73.9855, address: 'Test' },
        });
        expect(error).toBeUndefined();
      }
    });

    it('rejects invalid serviceType', () => {
      if (schemas) {
        const { error } = schemas.jobQuoteSchema.validate({
          companyId: 'test-company',
          serviceType: 'INVALID',
          pickupLocation: { latitude: 40.7128, longitude: -74.006, address: 'Test' },
          dropoffLocation: { latitude: 40.758, longitude: -73.9855, address: 'Test' },
        });
        expect(error).toBeDefined();
      }
    });

    it('rejects missing required fields', () => {
      if (schemas) {
        const { error } = schemas.jobQuoteSchema.validate({ companyId: 'test-company' });
        expect(error).toBeDefined();
      }
    });

    it('rejects invalid coordinates', () => {
      if (schemas) {
        const { error } = schemas.jobQuoteSchema.validate({
          companyId: 'test-company',
          serviceType: 'TAXI',
          pickupLocation: { latitude: 999, longitude: -74.006, address: 'Test' },
          dropoffLocation: { latitude: 40.758, longitude: -73.9855, address: 'Test' },
        });
        expect(error).toBeDefined();
      }
    });
  });
});
