import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Simple cache to avoid hammering /health
let v2AvailabilityCache = {
  available: null,
  checkedAt: null,
  ttlMs: 60000,
};

export const checkV2Availability = async () => {
  const now = Date.now();
  if (
    v2AvailabilityCache.available !== null &&
    v2AvailabilityCache.checkedAt &&
    now - v2AvailabilityCache.checkedAt < v2AvailabilityCache.ttlMs
  ) {
    return v2AvailabilityCache.available;
  }

  try {
    const res = await axios.get(`${API_BASE}/api/v2/health`, {
      timeout: 2000,
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    v2AvailabilityCache = { available: res.status === 200, checkedAt: now, ttlMs: 60000 };
  } catch (error) {
    console.warn('[V2 Client] V2 API not available:', error.message);
    v2AvailabilityCache = { available: false, checkedAt: now, ttlMs: 30000 };
  }

  return v2AvailabilityCache.available;
};

export const refreshV2Availability = () => {
  v2AvailabilityCache = { available: null, checkedAt: null, ttlMs: 60000 };
  return checkV2Availability();
};

export const isV2Available = () => v2AvailabilityCache.available === true;

export const v2Client = axios.create({
  baseURL: `${API_BASE}/api/v2`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

v2Client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (config.method === 'post' && !config.headers['Idempotency-Key']) {
      config.headers['Idempotency-Key'] = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

v2Client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error('[V2 Client] API Error:', {
        status: error.response.status,
        code: error.response.data?.code,
        message: error.response.data?.message,
      });
      if (error.response.status === 404) {
        v2AvailabilityCache.available = false;
      }
    }
    return Promise.reject(error);
  }
);

export const v1Client = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

v1Client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

export default v2Client;
