// Minimal export checks to ensure hooks compile and expose expected API surface
jest.mock('react', () => {
  const fn = () => {};
  return {
    __esModule: true,
    useState: (init) => [init, fn],
    useEffect: fn,
    useCallback: (cb) => cb,
    useRef: (val) => ({ current: val }),
  };
});

jest.mock('../services/v2/apiClient', () => ({
  checkV2Availability: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../services/v2/jobService', () => ({
  getJobs: jest.fn(() => Promise.resolve({ data: { jobs: [], total: 0 }, version: 'v2' })),
  getJobById: jest.fn(() => Promise.resolve({ data: {}, version: 'v2' })),
  createJob: jest.fn(() => Promise.resolve({ data: {}, version: 'v2' })),
  updateJobStatus: jest.fn(() => Promise.resolve({ data: {}, version: 'v2' })),
  assignDriver: jest.fn(() => Promise.resolve({ data: {}, version: 'v2' })),
  cancelJob: jest.fn(() => Promise.resolve({ data: {}, version: 'v2' })),
}));

jest.mock('../services/v2/stopService', () => ({
  getStopsByJobId: jest.fn(() => Promise.resolve({ stops: [], progress: null })),
  getNextStop: jest.fn(() => Promise.resolve(null)),
  updateStopStatus: jest.fn(() => Promise.resolve({})),
  arriveAtStop: jest.fn(() => Promise.resolve({})),
  completeStop: jest.fn(() => Promise.resolve({})),
  failStop: jest.fn(() => Promise.resolve({})),
  skipStop: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../services/v2/podService', () => ({
  getProofsByStop: jest.fn(() => Promise.resolve([])),
  getProofRequirements: jest.fn(() => Promise.resolve({ required: false })),
  captureSignature: jest.fn(() => Promise.resolve({})),
  capturePhoto: jest.fn(() => Promise.resolve({})),
  verifyPin: jest.fn(() => Promise.resolve({})),
}));

describe('useV2Jobs', () => {
  const { useV2Jobs, useV2Job } = require('../hooks/useV2Jobs');

  it('exports useV2Jobs hook', () => {
    expect(typeof useV2Jobs).toBe('function');
  });

  it('exports useV2Job hook', () => {
    expect(typeof useV2Job).toBe('function');
  });
});

describe('useV2Stops', () => {
  const { useV2Stops, useV2Pod } = require('../hooks/useV2Stops');

  it('exports useV2Stops hook', () => {
    expect(typeof useV2Stops).toBe('function');
  });

  it('exports useV2Pod hook', () => {
    expect(typeof useV2Pod).toBe('function');
  });
});
