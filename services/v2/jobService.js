const prisma = require('../../lib/prisma');
const { generateId } = require('../../shared/utils');
const eventBus = require('./eventBus');

const STATE_MACHINES = {
  TAXI: {
    PENDING: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['ACCEPTED', 'CANCELLED', 'PENDING'],
    ACCEPTED: ['ON_THE_WAY', 'CANCELLED'],
    ON_THE_WAY: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['STARTED', 'CANCELLED', 'NOSHOW'],
    STARTED: ['IN_PROGRESS'],
    IN_PROGRESS: ['FINISHED', 'COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    FINISHED: [],
    CANCELLED: [],
    NOSHOW: [],
  },
  DELIVERY: {
    PENDING: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
  COURIER: {
    PENDING: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
};

class JobService {
  async createJob(params) {
    const {
      companyId,
      serviceType,
      customerId,
      pickupLocation,
      dropoffLocation,
      stops = [],
      items = [],
      pricingProfileId,
      channel = 'DISPATCH',
      deliveryType,
      tipAmount = 0,
      proofRequired = false,
      tags = [],
      actorId,
    } = params;

    const companyService = await prisma.company_services.findFirst({
      where: { companyId, serviceType, enabled: true },
    });
    if (!companyService) {
      throw new Error('SERVICE_DISABLED');
    }

    const jobStops =
      stops.length > 0
        ? stops
        : [
            {
              type: 'PICKUP',
              address: pickupLocation?.address,
              latitude: pickupLocation?.latitude,
              longitude: pickupLocation?.longitude,
              contactName: pickupLocation?.contactName,
              contactPhone: pickupLocation?.contactPhone,
            },
            {
              type: 'DROPOFF',
              address: dropoffLocation?.address,
              latitude: dropoffLocation?.latitude,
              longitude: dropoffLocation?.longitude,
              contactName: dropoffLocation?.contactName,
              contactPhone: dropoffLocation?.contactPhone,
              proofRequired,
            },
          ];

    const initialStatus = 'PENDING';
    const jobIdVal = generateId('job');

    const job = await prisma.$transaction(async (tx) => {
      const newJob = await tx.job.create({
        data: {
          id: jobIdVal,
          jobId: generateId('jobid'),
          companyId,
          type: serviceType,
          serviceType,
          status: initialStatus,
          customerId,
          channel,
          deliveryType,
          pricingProfileId,
          tipAmount,
          stopCount: jobStops.length,
          proofRequired: this.requiresPOD(serviceType, jobStops),
          tags,
          pickupLatitude: pickupLocation?.latitude,
          pickupLongitude: pickupLocation?.longitude,
          pickupAddress: pickupLocation?.address,
          dropoffLatitude: dropoffLocation?.latitude,
          dropoffLongitude: dropoffLocation?.longitude,
          dropoffAddress: dropoffLocation?.address,
        },
      });

      if (jobStops.length > 0) {
        await tx.job_stops.createMany({
          data: jobStops.map((stop, idx) => ({
            id: generateId('stp'),
            jobId: newJob.id,
            sequence: idx + 1,
            type: stop.type || 'DROPOFF',
            status: 'PENDING',
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            contactName: stop.contactName,
            contactPhone: stop.contactPhone,
            proofRequired: stop.proofRequired || false,
            proofType: stop.proofType,
            pincode: stop.pincode,
            instructions: stop.instructions,
          })),
        });
      }

      if (items.length > 0 && jobStops.length > 0) {
        const firstStop = await tx.job_stops.findFirst({
          where: { jobId: newJob.id },
          orderBy: { sequence: 'asc' },
          select: { id: true },
        });
        if (firstStop?.id) {
          await tx.job_stop_items.createMany({
            data: items.map((item) => ({
              id: generateId('itm'),
              stopId: firstStop.id,
              name: item.name,
              qty: item.qty || 1,
              weightGrams: item.weightGrams,
              volumeCubicCm: item.volumeCubicCm,
              price: item.price,
            })),
          });
        }
      }

      await tx.job_events.create({
        data: {
          id: generateId('evt'),
          jobId: newJob.id,
          event: 'JOB_CREATED',
          fromStatus: null,
          toStatus: initialStatus,
          actorId: actorId || customerId,
          actorRole: 'USER',
          data: { serviceType, channel, stopCount: jobStops.length },
        },
      });

      return newJob;
    });

    await eventBus.publish('job.created', {
      jobId: job.id,
      companyId,
      serviceType,
      status: job.status,
      channel,
      customerId,
      pickupLocation,
      dropoffLocation,
      stopCount: jobStops.length,
      headers: {
        traceId: generateId('trc'),
        serviceType,
        companyId,
        timestamp: new Date().toISOString(),
      },
    });

    const stopsWithData = await prisma.job_stops.findMany({
      where: { jobId: job.id },
      orderBy: { sequence: 'asc' },
      include: {
        job_stop_items: true,
        job_stop_proofs: true,
      },
    });

    return { ...job, stops: stopsWithData };
  }

  async updateJobStatus(jobId, newStatus, actorId, actorRole = 'SYSTEM', data = {}) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('JOB_NOT_FOUND');

    const serviceType = job.serviceType || job.type;
    if (!this.isValidTransition(serviceType, job.status, newStatus)) {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    const updatedJob = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id: jobId },
        data: { status: newStatus, updatedAt: new Date() },
      });
      await tx.job_events.create({
        data: {
          id: generateId('evt'),
          jobId,
          event: 'STATUS_CHANGED',
          fromStatus: job.status,
          toStatus: newStatus,
          actorId,
          actorRole,
          data,
        },
      });
      return updated;
    });

    await eventBus.publish('job.status.updated', {
      jobId,
      companyId: job.companyId,
      serviceType,
      fromStatus: job.status,
      toStatus: newStatus,
      actorId,
      actorRole,
      headers: {
        traceId: generateId('trc'),
        serviceType,
        companyId: job.companyId,
        timestamp: new Date().toISOString(),
      },
    });

    return updatedJob;
  }

  isValidTransition(serviceType, currentStatus, newStatus) {
    const machine = STATE_MACHINES[serviceType];
    if (!machine) return false;
    const allowed = machine[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  requiresPOD(serviceType, stops) {
    if (serviceType === 'TAXI') return false;
    if (serviceType === 'DELIVERY') return true;
    if (serviceType === 'COURIER') {
      return stops.some((s) => s.proofRequired || s.type === 'DROPOFF');
    }
    return false;
  }

  async getCompanyService(companyId, serviceType) {
    return prisma.company_services.findFirst({
      where: { companyId, serviceType, enabled: true },
    });
  }

  async getJobById(jobId, includeStops = true) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) return null;

    if (includeStops) {
      const stops = await prisma.job_stops.findMany({
        where: { jobId },
        orderBy: { sequence: 'asc' },
        include: {
          job_stop_items: true,
          job_stop_proofs: true,
        },
      });
      return { ...job, stops };
    }

    return job;
  }
}

module.exports = new JobService();
