import { useState, useEffect, useCallback, useRef } from 'react';
import * as jobService from '../services/v2/jobService';
import { checkV2Availability } from '../services/v2/apiClient';

export const useV2Jobs = (filters = {}, options = {}) => {
  const { autoRefresh = false, refreshInterval = 30000, serviceType = null, enabled = true } = options;

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiVersion, setApiVersion] = useState(null);
  const [total, setTotal] = useState(0);

  const intervalRef = useRef(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchJobs = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      await checkV2Availability();

      const queryFilters = { ...filtersRef.current };
      if (serviceType) queryFilters.serviceType = serviceType;

      const { data, version } = await jobService.getJobs(queryFilters);
      setJobs(data.jobs || data || []);
      setTotal(data.total || data.length || 0);
      setApiVersion(version);
    } catch (err) {
      console.error('[useV2Jobs] Error fetching jobs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [enabled, serviceType]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (autoRefresh && enabled) {
      intervalRef.current = setInterval(fetchJobs, refreshInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [autoRefresh, refreshInterval, fetchJobs, enabled]);

  const createJob = useCallback(
    async (jobData) => {
      const result = await jobService.createJob(jobData);
      await fetchJobs();
      return result;
    },
    [fetchJobs]
  );

  const updateStatus = useCallback(
    async (jobId, status, metadata) => {
      const result = await jobService.updateJobStatus(jobId, status, metadata);
      await fetchJobs();
      return result;
    },
    [fetchJobs]
  );

  const assignDriver = useCallback(
    async (jobId, driverId) => {
      const result = await jobService.assignDriver(jobId, driverId);
      await fetchJobs();
      return result;
    },
    [fetchJobs]
  );

  const cancelJob = useCallback(
    async (jobId, reason) => {
      const result = await jobService.cancelJob(jobId, reason);
      await fetchJobs();
      return result;
    },
    [fetchJobs]
  );

  return {
    jobs,
    loading,
    error,
    apiVersion,
    total,
    isV2: apiVersion === 'v2',
    refetch: fetchJobs,
    createJob,
    updateStatus,
    assignDriver,
    cancelJob,
  };
};

export const useV2Job = (jobId, options = {}) => {
  const { enabled = true } = options;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiVersion, setApiVersion] = useState(null);

  const fetchJob = useCallback(async () => {
    if (!enabled || !jobId) return;
    try {
      setLoading(true);
      setError(null);
      const { data, version } = await jobService.getJobById(jobId);
      setJob(data);
      setApiVersion(version);
    } catch (err) {
      console.error('[useV2Job] Error fetching job:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  return {
    job,
    loading,
    error,
    apiVersion,
    isV2: apiVersion === 'v2',
    refetch: fetchJob,
  };
};

export default useV2Jobs;
