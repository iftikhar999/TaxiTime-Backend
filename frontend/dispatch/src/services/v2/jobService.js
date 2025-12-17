import v2Client, { v1Client, checkV2Availability } from './apiClient';

export const SERVICE_TYPES = {
  TAXI: 'TAXI',
  DELIVERY: 'DELIVERY',
  COURIER: 'COURIER',
};

export const getQuote = async (quoteParams) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.post('/jobs/quote', quoteParams);
      return { data: res.data, version: 'v2' };
    } catch (error) {
      console.warn('[JobService] V2 quote failed, fallback?', error.message);
      if (error.response?.status >= 400 && error.response?.status < 500) throw error;
    }
  }
  if (quoteParams.serviceType !== 'TAXI') {
    throw new Error('V2 API required for DELIVERY/COURIER quotes');
  }
  const res = await v1Client.post('/dispatch/quote', {
    pickup: quoteParams.pickupLocation,
    dropoff: quoteParams.dropoffLocation,
    vehicleType: quoteParams.vehicleType,
  });
  return { data: res.data, version: 'v1' };
};

export const createJob = async (jobData) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.post('/jobs', jobData);
      return { data: res.data, version: 'v2' };
    } catch (error) {
      console.warn('[JobService] V2 create failed:', error.message);
      if (error.response?.status >= 400 && error.response?.status < 500) throw error;
    }
  }
  if (jobData.serviceType && jobData.serviceType !== 'TAXI') {
    throw new Error('V2 API required for DELIVERY/COURIER jobs');
  }
  const v1Payload = {
    pickupAddress: jobData.pickupLocation?.address,
    pickupLatitude: jobData.pickupLocation?.latitude,
    pickupLongitude: jobData.pickupLocation?.longitude,
    dropoffAddress: jobData.dropoffLocation?.address,
    dropoffLatitude: jobData.dropoffLocation?.latitude,
    dropoffLongitude: jobData.dropoffLocation?.longitude,
    customerId: jobData.customerId,
    passengerName: jobData.pickupLocation?.contactName,
    passengerPhone: jobData.pickupLocation?.contactPhone,
    notes: jobData.notes,
  };
  const res = await v1Client.post('/dispatch/jobs', v1Payload);
  return { data: res.data, version: 'v1' };
};

export const getJobs = async (filters = {}) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.get('/jobs', { params: filters });
      return { data: res.data, version: 'v2' };
    } catch (error) {
      console.warn('[JobService] V2 getJobs failed:', error.message);
    }
  }
  const res = await v1Client.get('/dispatch/jobs', { params: filters });
  const jobs = Array.isArray(res.data) ? res.data : res.data.jobs || [];
  return {
    data: { jobs: jobs.map(normalizeV1Job), total: jobs.length },
    version: 'v1',
  };
};

export const getJobById = async (jobId) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    try {
      const res = await v2Client.get(`/jobs/${jobId}`);
      return { data: res.data, version: 'v2' };
    } catch (error) {
      if (error.response?.status === 404) throw error;
      console.warn('[JobService] V2 getJob failed:', error.message);
    }
  }
  const res = await v1Client.get(`/dispatch/jobs/${jobId}`);
  return { data: normalizeV1Job(res.data), version: 'v1' };
};

export const updateJobStatus = async (jobId, status, metadata = {}) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.patch(`/jobs/${jobId}/status`, { status, ...metadata });
    return { data: res.data, version: 'v2' };
  }
  const res = await v1Client.patch(`/dispatch/jobs/${jobId}`, { status });
  return { data: normalizeV1Job(res.data), version: 'v1' };
};

export const assignDriver = async (jobId, driverId) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.post(`/jobs/${jobId}/assign`, { driverId });
    return { data: res.data, version: 'v2' };
  }
  const res = await v1Client.post(`/dispatch/jobs/${jobId}/assign`, { driverId });
  return { data: res.data, version: 'v1' };
};

export const cancelJob = async (jobId, reason) => {
  const useV2 = await checkV2Availability();
  if (useV2) {
    const res = await v2Client.post(`/jobs/${jobId}/cancel`, { reason });
    return { data: res.data, version: 'v2' };
  }
  const res = await v1Client.post(`/dispatch/jobs/${jobId}/cancel`, { reason });
  return { data: res.data, version: 'v1' };
};

export const getJobsByServiceType = async (serviceType, filters = {}) => {
  const useV2 = await checkV2Availability();
  if (!useV2) throw new Error('V2 API required for service type filtering');
  const res = await v2Client.get('/jobs', { params: { ...filters, serviceType } });
  return { data: res.data, version: 'v2' };
};

const normalizeV1Job = (job) => {
  if (!job) return null;
  return {
    id: job.id,
    companyId: job.companyId,
    serviceType: job.type || 'TAXI',
    status: job.status,
    customerId: job.customerId,
    driverId: job.driverId,
    pickupLocation: {
      address: job.pickupAddress,
      latitude: job.pickupLatitude,
      longitude: job.pickupLongitude,
      contactName: job.passengerName,
      contactPhone: job.passengerPhone,
    },
    dropoffLocation: {
      address: job.dropoffAddress,
      latitude: job.dropoffLatitude,
      longitude: job.dropoffLongitude,
    },
    stops: [],
    fare: job.fare,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    _v1Original: job,
  };
};

export default {
  SERVICE_TYPES,
  getQuote,
  createJob,
  getJobs,
  getJobById,
  updateJobStatus,
  assignDriver,
  cancelJob,
  getJobsByServiceType,
};
