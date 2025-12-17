import v2Client, { checkV2Availability } from './apiClient';

export const STOP_STATUSES = {
  PENDING: 'PENDING',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

export const getStopsByJobId = async (jobId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.get(`/jobs/${jobId}/stops`);
  return res.data;
};

export const getNextStop = async (jobId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.get(`/jobs/${jobId}/stops/next`);
  return res.data;
};

export const updateStopStatus = async (jobId, stopId, status, metadata = {}) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.patch(`/jobs/${jobId}/stops/${stopId}/status`, { status, ...metadata });
  return res.data;
};

export const arriveAtStop = async (jobId, stopId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/arrive`);
  return res.data;
};

export const completeStop = async (jobId, stopId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/complete`);
  return res.data;
};

export const failStop = async (jobId, stopId, reason) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/fail`, { reason });
  return res.data;
};

export const skipStop = async (jobId, stopId, reason) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const res = await v2Client.post(`/jobs/${jobId}/stops/${stopId}/skip`, { reason });
  return res.data;
};

export const getStopProgress = async (jobId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for stop management');
  const { progress } = await getStopsByJobId(jobId);
  return progress;
};

export default {
  STOP_STATUSES,
  getStopsByJobId,
  getNextStop,
  updateStopStatus,
  arriveAtStop,
  completeStop,
  failStop,
  skipStop,
  getStopProgress,
};
