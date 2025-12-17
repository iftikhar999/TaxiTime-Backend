import v2Client, { checkV2Availability } from './apiClient';

export const OPTIMIZATION_ALGORITHMS = {
  NEAREST_NEIGHBOR: 'NEAREST_NEIGHBOR',
  CHRISTOFIDES: 'CHRISTOFIDES',
  GOOGLE_OPTIMIZE: 'GOOGLE_OPTIMIZE',
};

export const optimizeRoute = async (jobId, options = {}) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for route optimization');
  const res = await v2Client.post(`/jobs/${jobId}/optimize`, options);
  return res.data;
};

export const getOptimizedRoute = async (jobId) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for route optimization');
  const res = await v2Client.get(`/jobs/${jobId}/route`);
  return res.data;
};

export const reoptimizeRoute = async (jobId, skipStopIds = []) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for route optimization');
  const res = await v2Client.post(`/jobs/${jobId}/reoptimize`, { skipStopIds });
  return res.data;
};

export default {
  OPTIMIZATION_ALGORITHMS,
  optimizeRoute,
  getOptimizedRoute,
  reoptimizeRoute,
};
