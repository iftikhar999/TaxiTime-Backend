const prisma = require('../../lib/prisma');
const { generateId } = require('../../shared/utils');
const eventBus = require('./eventBus');

// Align stop states with schema enum CourierStopStatus
const STOP_STATES = {
  PENDING: ['READY', 'ARRIVED', 'CANCELLED'],
  READY: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED', 'CANCELLED'],
  DELIVERED: [],
  FAILED: ['PENDING'], // allow retry
  CANCELLED: [],
};

class StopService {
  isValidTransition(currentStatus, newStatus) {
    const allowed = STOP_STATES[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  async getStopsByJobId(jobId) {
    return prisma.job_stops.findMany({
      where: { jobId },
      orderBy: { sequence: 'asc' },
      include: {
        job_stop_items: true,
        job_stop_proofs: true,
      },
    });
  }

  async getStopById(stopId) {
    return prisma.job_stops.findUnique({
      where: { id: stopId },
      include: {
        job_stop_items: true,
        job_stop_proofs: true,
        jobs: true,
      },
    });
  }

  async updateStopStatus(stopId, newStatus, actorId, actorType = 'DRIVER', data = {}) {
    const stop = await prisma.job_stops.findUnique({
      where: { id: stopId },
      include: { jobs: true },
    });
    if (!stop) throw new Error('STOP_NOT_FOUND');

    if (!this.isValidTransition(stop.status, newStatus)) {
      throw new Error('INVALID_STOP_TRANSITION');
    }

    if (newStatus === 'DELIVERED' && stop.proofRequired) {
      const hasProof = await this.hasValidProof(stopId, stop.proofType);
      if (!hasProof) {
        throw new Error('POD_REQUIRED');
      }
    }

    const updatedStop = await prisma.$transaction(async (tx) => {
      const updated = await tx.job_stops.update({
        where: { id: stopId },
        data: {
          status: newStatus,
          arrivedAt: newStatus === 'ARRIVED' ? new Date() : stop.arrivedAt,
          completedAt: newStatus === 'DELIVERED' ? new Date() : stop.completedAt,
          metadata: data.reason
            ? { ...(stop.metadata || {}), failureReason: data.reason }
            : stop.metadata,
          updatedAt: new Date(),
        },
      });

      await tx.job_events.create({
        data: {
          id: generateId('evt'),
          jobId: stop.jobId,
          stopId,
          event: 'STOP_STATUS_CHANGED',
          fromStatus: stop.status,
          toStatus: newStatus,
          actorId,
          actorRole: actorType,
          data: { stopSequence: stop.sequence, ...data },
        },
      });

      return updated;
    });

    await eventBus.publish('stop.status.updated', {
      jobId: stop.jobId,
      stopId,
      companyId: stop.jobs.companyId,
      serviceType: stop.jobs.serviceType,
      sequence: stop.sequence,
      fromStatus: stop.status,
      toStatus: newStatus,
      headers: {
        traceId: generateId('trc'),
        serviceType: stop.jobs.serviceType,
        companyId: stop.jobs.companyId,
        timestamp: new Date().toISOString(),
      },
    });

    await this.checkJobCompletion(stop.jobId);
    return updatedStop;
  }

  async hasValidProof(stopId, requiredProofType) {
    const proofs = await prisma.job_stop_proofs.findMany({
      where: { stopId },
    });
    if (proofs.length === 0) return false;

    switch (requiredProofType) {
      case 'SIGNATURE':
        return proofs.some((p) => p.type === 'SIGNATURE');
      case 'PHOTO':
        return proofs.some((p) => p.type === 'PHOTO');
      case 'PIN':
        return proofs.some((p) => p.metadata?.pincodeVerified === true);
      default:
        return proofs.length > 0;
    }
  }

  async checkJobCompletion(jobId) {
    const stops = await prisma.job_stops.findMany({ where: { jobId } });
    const allDelivered = stops.length > 0 && stops.every((s) => s.status === 'DELIVERED');
    const anyOpen = stops.some((s) =>
      ['PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT'].includes(s.status)
    );

    const job = await prisma.jobs.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (allDelivered) {
      await prisma.jobs.update({
        where: { id: jobId },
        data: { status: 'COMPLETED' },
      });
      await eventBus.publish('job.completed', {
        jobId,
        companyId: job.companyId,
        serviceType: job.serviceType,
      });
    } else if (!anyOpen) {
      await prisma.jobs.update({
        where: { id: jobId },
        data: { status: 'CANCELLED' },
      });
    }
  }

  async getNextPendingStop(jobId) {
    return prisma.job_stops.findFirst({
      where: { jobId, status: { in: ['PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT'] } },
      orderBy: { sequence: 'asc' },
    });
  }

  async getStopProgress(jobId) {
    const stops = await prisma.job_stops.findMany({
      where: { jobId },
      orderBy: { sequence: 'asc' },
    });
    const total = stops.length;
    const delivered = stops.filter((s) => s.status === 'DELIVERED').length;
    const failed = stops.filter((s) => s.status === 'FAILED').length;
    const current = stops.find((s) =>
      ['PENDING', 'READY', 'ARRIVED', 'PICKED_UP', 'IN_TRANSIT'].includes(s.status)
    );

    return {
      total,
      delivered,
      failed,
      remaining: total - delivered - failed,
      currentStop: current ? current.sequence : null,
      percentComplete: total === 0 ? 0 : Math.round((delivered / total) * 100),
    };
  }
}

module.exports = new StopService();
