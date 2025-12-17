import * as apiClient from '../services/v2/apiClient';
import * as jobService from '../services/v2/jobService';
import * as stopService from '../services/v2/stopService';
import * as podService from '../services/v2/podService';
import * as routeService from '../services/v2/routeService';

const localStorageMock = {
  getItem: jest.fn(() => 'mock-token'),
  setItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

describe('V2 API Client', () => {
  it('exports availability helpers and clients', () => {
    expect(typeof apiClient.checkV2Availability).toBe('function');
    expect(typeof apiClient.refreshV2Availability).toBe('function');
    expect(typeof apiClient.isV2Available).toBe('function');
    expect(apiClient.v2Client).toBeDefined();
    expect(apiClient.v1Client).toBeDefined();
  });
});

describe('V2 Job Service', () => {
  it('exports SERVICE_TYPES', () => {
    expect(jobService.SERVICE_TYPES).toEqual({
      TAXI: 'TAXI',
      DELIVERY: 'DELIVERY',
      COURIER: 'COURIER',
    });
  });
  it('exports job helpers', () => {
    expect(typeof jobService.getQuote).toBe('function');
    expect(typeof jobService.createJob).toBe('function');
    expect(typeof jobService.getJobs).toBe('function');
    expect(typeof jobService.getJobById).toBe('function');
    expect(typeof jobService.updateJobStatus).toBe('function');
    expect(typeof jobService.assignDriver).toBe('function');
    expect(typeof jobService.cancelJob).toBe('function');
    expect(typeof jobService.getJobsByServiceType).toBe('function');
  });
});

describe('V2 Stop Service', () => {
  it('exports STOP_STATUSES', () => {
    expect(stopService.STOP_STATUSES).toEqual({
      PENDING: 'PENDING',
      EN_ROUTE: 'EN_ROUTE',
      ARRIVED: 'ARRIVED',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      SKIPPED: 'SKIPPED',
    });
  });
  it('exports stop helpers', () => {
    expect(typeof stopService.getStopsByJobId).toBe('function');
    expect(typeof stopService.getNextStop).toBe('function');
    expect(typeof stopService.updateStopStatus).toBe('function');
    expect(typeof stopService.arriveAtStop).toBe('function');
    expect(typeof stopService.completeStop).toBe('function');
    expect(typeof stopService.failStop).toBe('function');
    expect(typeof stopService.skipStop).toBe('function');
  });
});

describe('V2 POD Service', () => {
  it('exports PROOF_TYPES', () => {
    expect(podService.PROOF_TYPES).toEqual({
      SIGNATURE: 'SIGNATURE',
      PHOTO: 'PHOTO',
      PIN: 'PIN',
      BARCODE: 'BARCODE',
    });
  });
  it('exports pod helpers', () => {
    expect(typeof podService.getProofRequirements).toBe('function');
    expect(typeof podService.getProofsByStop).toBe('function');
    expect(typeof podService.captureSignature).toBe('function');
    expect(typeof podService.capturePhoto).toBe('function');
    expect(typeof podService.verifyPin).toBe('function');
  });
});

describe('V2 Route Service', () => {
  it('exports OPTIMIZATION_ALGORITHMS', () => {
    expect(routeService.OPTIMIZATION_ALGORITHMS).toEqual({
      NEAREST_NEIGHBOR: 'NEAREST_NEIGHBOR',
      CHRISTOFIDES: 'CHRISTOFIDES',
      GOOGLE_OPTIMIZE: 'GOOGLE_OPTIMIZE',
    });
  });
  it('exports route helpers', () => {
    expect(typeof routeService.optimizeRoute).toBe('function');
    expect(typeof routeService.getOptimizedRoute).toBe('function');
    expect(typeof routeService.reoptimizeRoute).toBe('function');
  });
});
