import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { RideSummary } from '../types/rides';
import { Tariff } from '../types/tariff';

export type JobStatus =
  | 'IDLE'
  | 'INCOMING'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'STARTED'
  | 'ACTIVE'
  | 'REACHED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'UNASSIGNED';

export interface JobTimerState {
  elapsedSeconds: number;
  waitingSeconds: number;
  distanceMeters: number;
}

export interface ActiveJob extends RideSummary {
  countdownMs?: number;
  autoRejectAt?: string;
  tariff?: Tariff;
  status?: JobStatus;
  fare?: number;
  waitingFare?: number;
  distanceFare?: number;
}

interface JobContextValue {
  status: JobStatus;
  currentJob: ActiveJob | null;
  timer: JobTimerState;
  setIncomingJob: (job: ActiveJob) => void;
  acceptJob: () => void;
  rejectJob: () => void;
  updateStatus: (status: JobStatus) => void;
  updateTimer: (partial: Partial<JobTimerState>) => void;
  clearJob: () => void;
}

const JobContext = createContext<JobContextValue>(null as unknown as JobContextValue);

export const JobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [currentJob, setCurrentJob] = useState<ActiveJob | null>(null);
  const [timer, setTimer] = useState<JobTimerState>({ elapsedSeconds: 0, waitingSeconds: 0, distanceMeters: 0 });

  const setIncomingJob = useCallback((job: ActiveJob) => {
    setCurrentJob(job);
    setStatus('INCOMING');
  }, []);

  const clearJob = useCallback(() => {
    setStatus('IDLE');
    setCurrentJob(null);
    setTimer({ elapsedSeconds: 0, waitingSeconds: 0, distanceMeters: 0 });
  }, []);

  const acceptJob = useCallback(() => {
    if (!currentJob) {
      return;
    }

    setStatus('ASSIGNED');
    setCurrentJob({ ...currentJob, status: 'ASSIGNED' });
  }, [currentJob]);

  const rejectJob = useCallback(() => {
    setStatus('REJECTED');
    setCurrentJob((prev) => (prev ? { ...prev, status: 'REJECTED' } : prev));
    clearJob();
  }, [clearJob]);

  const updateStatus = useCallback(
    (nextStatus: JobStatus) => {
      if (!currentJob?.id) {
        console.warn("⚠️ JobContext: updateStatus called without an active job");
        return;
      }

      setPendingAction({
        type: "STATUS",
        jobId: String(currentJob.id),
        targetStatus: nextStatus,
      });

      emitJobProgress(currentJob.id, nextStatus, location ?? undefined);

      const driverStatusMap: Record<JobStatus, string | null> = {
        IDLE: null,
        INCOMING: null,
        ASSIGNED: "ROGER",
        ACCEPTED: "ROGER",
        ON_THE_WAY: "ROGER",
        ARRIVED: "ROGER",
        STARTED: "BUSY",
        ACTIVE: "BUSY",
        REACHED: "BUSY",
        COMPLETED: "AVAILABLE",
        REJECTED: "AVAILABLE",
        UNASSIGNED: "AVAILABLE",
        CANCELLED: "AVAILABLE",
      };

      const driverStatus = driverStatusMap[nextStatus];
      if (driverStatus) {
        emitDriverStatus(driverStatus, location ?? undefined);
      }

      if (["COMPLETED", "REJECTED", "UNASSIGNED", "CANCELLED"].includes(nextStatus)) {
        clearJob();
      } else {
        setStatus(nextStatus);
        setCurrentJob((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
    },
    [clearJob, currentJob, location]
  );

      if (['COMPLETED', 'REJECTED', 'UNASSIGNED', 'CANCELLED'].includes(nextStatus)) {
        clearJob();
      }
    },
    [clearJob]
  );

  const updateTimer = useCallback((partial: Partial<JobTimerState>) => {
    setTimer((prev) => ({ ...prev, ...partial }));
  }, []);

  const value = useMemo<JobContextValue>(
    () => ({
      status,
      currentJob,
      timer,
      setIncomingJob,
      acceptJob,
      rejectJob,
      updateStatus,
      updateTimer,
      clearJob
    }),
    [status, currentJob, timer, setIncomingJob, acceptJob, rejectJob, updateStatus, updateTimer, clearJob]
  );

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
};

export const useJob = (): JobContextValue => useContext(JobContext);
