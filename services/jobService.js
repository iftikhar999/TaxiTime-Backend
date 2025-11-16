const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

// Temporary aliases while legacy code is migrated to new Prisma model names
prisma.offer = prisma.offers;
prisma.ride = prisma.rides;
prisma.locationUpdates = prisma.location_updates;

const JOB_FLOW_V2_ENABLED = String(process.env.FEATURE_JOB_FLOW_V2 || '')
  .toLowerCase() === 'true';
const JOB_OFFER_TIMEOUT_MS = JOB_FLOW_V2_ENABLED ? 30 * 1000 : 2 * 60 * 1000;

const getNamespace = (key) => {
  try {
    return global?.[key] ?? null;
  } catch (error) {
    return null;
  }
};

const ACTIVE_DRIVER_JOB_STATUSES = new Set([
  'OFFERED',
  'ASSIGNED',
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'STARTED',
  'ACTIVE',
  'IN_PROGRESS',
  'REACHED',
]);

const TERMINAL_DRIVER_JOB_STATUSES = new Set([
  'COMPLETED',
  'FINISHED',
  'CANCELLED',
  'CANCELED',
  'REJECTED',
  'NOSHOW',
  'NO_SHOW',
  'RECALL',
  'RECALLED',
  'UNASSIGNED',
  'PENDING',
]);

const updateDriverCurrentJobReference = async (client, driverId, jobId = null) => {
  if (!driverId) {
    return;
  }

  const prismaClient = client || prisma;

  try {
    await prismaClient.user.update({
      where: { id: driverId },
      data: {
        currentJobId: jobId ?? null,
      },
    });
  } catch (error) {
    console.warn(
      `[JobService] Failed to update current job reference for driver ${driverId}:`,
      error?.message || error
    );
  }
};

class JobService {
  constructor() {
    this.offerExpiryTimers = new Map();
  }

  isJobFlowV2Enabled() {
    return JOB_FLOW_V2_ENABLED;
  }

  clearOfferExpiryTimer(jobId) {
    const timerEntry = this.offerExpiryTimers.get(jobId);
    if (timerEntry) {
      clearTimeout(timerEntry.timer);
      this.offerExpiryTimers.delete(jobId);
    }
  }

  scheduleOfferExpiryTimer({ job, assignment, offer, io, expiresAt, reason }) {
    if (
      !this.isJobFlowV2Enabled() ||
      !job ||
      !assignment ||
      !offer ||
      !expiresAt
    ) {
      return;
    }

    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    this.clearOfferExpiryTimer(job.id);

    const timer = setTimeout(async () => {
      try {
        const freshAssignment = await prisma.assignments.findUnique({
          where: { id: assignment.id },
          select: { status: true, driverId: true },
        });

        if (!freshAssignment || freshAssignment.status !== 'OFFERED') {
          return;
        }

        const freshJob = await prisma.job.findUnique({
          where: { id: job.id },
          select: {
            id: true,
            jobId: true,
            status: true,
            assignedDriverId: true,
            companyId: true,
          },
        });

        if (
          !freshJob ||
          freshJob.status !== 'OFFERED' ||
          freshJob.assignedDriverId !== freshAssignment.driverId
        ) {
          return;
        }

        await prisma.offers.update({
          where: { id: offer.id },
          data: {
            status: 'EXPIRED',
            response: 'TIMEOUT',
            respondedAt: new Date(),
          },
        });

        const unassignReason = reason || 'Offer expired (no response)';
        await this.unassignDriver(
          job.id,
          'SYSTEM_TIMEOUT',
          unassignReason,
          io
        );
      } catch (error) {
        console.error(
          `⚠️ Offer expiry timer failed for job ${job.id}:`,
          error?.message || error
        );
      } finally {
        this.offerExpiryTimers.delete(job.id);
      }
    }, delay);

    this.offerExpiryTimers.set(job.id, { timer, expiresAt });
  }

  buildDriverAssignmentPayload({
    job,
    assignment,
    offer,
    driverId,
    expiresAt,
    statusOverride = null,
  }) {
    const pickup = {
      address: job.pickupAddress,
      latitude: job.pickupLatitude,
      longitude: job.pickupLongitude,
    };

    const dropoff = {
      address: job.dropoffAddress,
      latitude: job.dropoffLatitude,
      longitude: job.dropoffLongitude,
    };

    const legacyPayload = {
      id: job.id,
      jobId: job.id,
      jobType: job.type || 'TAXI',
      status: statusOverride || 'OFFERED',
      pickupAddress: pickup.address,
      pickupLatitude: pickup.latitude,
      pickupLongitude: pickup.longitude,
      dropoffAddress: dropoff.address,
      dropoffLatitude: dropoff.latitude,
      dropoffLongitude: dropoff.longitude,
      distance: job.estimatedDistance,
      fare: job.estimatedPrice,
      estimatedPrice: job.estimatedPrice,
      estimatedDistance: job.estimatedDistance,
      estimatedDuration: job.estimatedDuration,
      customerId: job.customer?.id,
      customerName: job.customer
        ? `${job.customer.firstName} ${job.customer.lastName}`.trim()
        : 'Unknown',
      customerPhone: job.customer?.phone || '',
      scheduledTime: job.scheduledTime,
      createdAt: job.createdAt,
      assignedAt: assignment?.assignedAt ?? null,
      company: job.company
        ? {
            id: job.company.id,
            name: job.company.legalName || job.company.brandName,
          }
        : null,
    };

    const modernPayload = {
      jobId: this.isJobFlowV2Enabled() ? job.jobId ?? job.id : legacyPayload.jobId,
      internalJobId: job.id,
      assignmentId: assignment?.id ?? null,
      offerId: offer?.id ?? null,
      driverId: driverId ?? assignment?.driverId ?? offer?.driverId ?? null,
      status: legacyPayload.status,
      pickup,
      dropoff,
      company: legacyPayload.company,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      legacyJobId: job.id,
    };

    return { ...legacyPayload, ...modernPayload };
  }

  // Create a new job (taxi/delivery/courier)
  async createJob(jobData) {
    try {
      const jobType = (jobData.type || 'TAXI').toUpperCase();
      // Generate a unique business job ID
      const jobId = `JOB_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Calculate estimated price if not provided
      const estimatedPrice = jobData.estimatedPrice || await this.calculatePrice(
        jobData.pickupLatitude,
        jobData.pickupLongitude,
        jobData.dropoffLatitude,
        jobData.dropoffLongitude,
        jobData.vehicleType,
        jobData.companyId
      );

      // Calculate estimated distance and duration if not provided
      const routeData = await this.calculateRouteData(
        jobData.pickupLatitude,
        jobData.pickupLongitude,
        jobData.dropoffLatitude,
        jobData.dropoffLongitude
      );

      // If it's a taxi job, create a ride first
      let ride = null;
      if (jobType === 'TAXI') {
        const rideId = `RIDE_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        ride = await prisma.rides.create({
          data: {
            id: randomUUID(),
            rideId,
            passengerId: jobData.customerId,
            companyId: jobData.companyId,
            rideType: 'TAXI',
            createdAt: new Date(),
            updatedAt: new Date(),
            pickup: {
              address: jobData.pickupAddress,
              latitude: jobData.pickupLatitude,
              longitude: jobData.pickupLongitude,
            },
            destination: {
              address: jobData.dropoffAddress,
              latitude: jobData.dropoffLatitude,
              longitude: jobData.dropoffLongitude,
            },
            status: 'REQUESTED',
            paymentMethod: jobData.paymentMethod || 'CASH',
            estimatedFare: estimatedPrice,
            estimatedDistance: routeData.distance,
            estimatedDuration: routeData.duration,
            requirements: jobData.vehicleType ? { vehicleType: jobData.vehicleType } : null,
          }
        });
      }

      const requestedStatus =
        typeof jobData.status === 'string'
          ? jobData.status.trim().toUpperCase()
          : null;
      const allowedInitialStatuses = new Set([
        'UNASSIGNED',
        'PENDING',
        'OFFERED',
        'REJECTED',
        'NOSHOW',
        'RECALLED',
      ]);
      const initialStatus = requestedStatus && allowedInitialStatuses.has(requestedStatus)
        ? requestedStatus
        : 'UNASSIGNED';

      const jobUuid = randomUUID();
      const jobRecord = await prisma.job.create({
        data: {
          id: jobUuid,
          jobId,
          type: jobType,
          customerId: jobData.customerId,
          companyId: jobData.companyId,
          status: initialStatus,
          tripId: ride?.id,
          priority: jobData.priority || 0,
          scheduledAt: jobData.scheduledAt,
          vehicleType: jobData.vehicleType,
          pickupAddress: jobData.pickupAddress,
          pickupLatitude: jobData.pickupLatitude,
          pickupLongitude: jobData.pickupLongitude,
          dropoffAddress: jobData.dropoffAddress,
          dropoffLatitude: jobData.dropoffLatitude,
          dropoffLongitude: jobData.dropoffLongitude,
          estimatedPrice: estimatedPrice,
          estimatedDistance: routeData.distance,
          estimatedDuration: routeData.duration,
          estimatedArrival: new Date(Date.now() + (routeData.duration * 60 * 1000)),
          paymentMethod: jobData.paymentMethod,
          requirements: jobData.requirements,
          instructions: jobData.instructions,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        include: {
          // Fixed relation names
          users_jobs_customerIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          companies: true,
          rides: true,
          delivery_orders: true,
        },
      });

      const job = {
        ...jobRecord,
        customer: jobRecord.users_jobs_customerIdTousers ?? null,
        company: jobRecord.companies ?? null,
        trip: jobRecord.rides ?? null,
        deliveryOrder: jobRecord.delivery_orders ?? null,
      };
      delete job.users_jobs_customerIdTousers;
      delete job.companies;
      delete job.rides;
      delete job.delivery_orders;

      // Create offers for nearby drivers (don't wait for this)
      this.createOffersForJob(job).catch(error => {
        console.error(`Failed to create offers for job ${job.id}:`, error);
      });

      // Broadcast new job to all nearby available drivers in real-time
      this.broadcastNewJobToNearbyDrivers(job).catch(error => {
        console.error(`Failed to broadcast new job ${job.id} to nearby drivers:`, error);
      });

      return job;
    } catch (error) {
      console.error('Job creation error:', error);
      throw new Error(`Failed to create job: ${error.message}`);
    }
  }

  // Find nearby drivers and create offers
  async createOffersForJob(job) {
    try {
      // Find active drivers within radius
      const nearbyDrivers = await this.findNearbyDrivers(
        job.pickupLatitude,
        job.pickupLongitude,
        job.companyId,
        5 // 5km radius
      );

      // Create offers for top 5 drivers
      const driverNamespace = getNamespace('driverNamespace');

      const offerPromises = nearbyDrivers.slice(0, 5).map(async driver => {
        try {
          const expiresAt = new Date(Date.now() + JOB_OFFER_TIMEOUT_MS);
          const offer = await prisma.offers.create({
            data: {
              id: randomUUID(),
              jobId: job.id,
              driverId: driver.id,
              estimatedFare: job.estimatedPrice || 10.00,
              estimatedDuration: Math.round(job.estimatedDuration || 15),
              distanceToPickup: driver.distanceToPickup || 1.0,
              expiresAt,
              status: 'SENT',
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          });

          if (this.isJobFlowV2Enabled() && driverNamespace) {
            const payload = this.buildDriverAssignmentPayload({
              job,
              assignment: null,
              offer,
              driverId: driver.id,
              expiresAt,
            });

            driverNamespace.to(`driver_${driver.id}`).emit('job_assigned', payload);
            driverNamespace.to(`driver_${driver.id}`).emit('jobAssigned', payload);
          }

          return offer;
        } catch (error) {
          console.error(`Failed to create offer for driver ${driver.id}:`, error);
          return null;
        }
      });

      const offers = await Promise.all(offerPromises);
      const validOffers = offers.filter(offer => offer !== null);

      if (!this.isJobFlowV2Enabled()) {
        validOffers.forEach(offer => {
          console.log(`Offer queued for driver ${offer.driverId}`);
        });
      } else if (!driverNamespace) {
        validOffers.forEach(offer => {
          console.warn(
            `⚠️ Driver namespace unavailable - offer notification skipped for driver ${offer.driverId}`
          );
        });
      }

      return validOffers;
    } catch (error) {
      console.error('Error creating offers:', error);
    }
  }

  // Find nearby active drivers
  async findNearbyDrivers(latitude, longitude, companyId, radiusKm = 5) {
    try {
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
        return [];
      }

      // Get drivers who are online and available
      const activeDrivers = await prisma.user.findMany({
        where: {
          role: 'DRIVER',
          companyId: companyId,
          isActive: true,
          shifts: {
            some: {
              status: 'ONLINE',
              endTime: null, // Currently on shift
            }
          }
        },
        include: {
          // Fixed relation names
          location_updates: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Filter by distance (simplified distance calculation)
      const nearbyDrivers = activeDrivers
        .map(driver => {
          const lastLocation = driver.location_updates[0];
          if (!lastLocation) return null;

          const distance = this.calculateDistance(
            latitude, longitude,
            lastLocation.latitude,
            lastLocation.longitude
          );

          return {
            ...driver,
            distanceToPickup: distance,
          };
        })
        .filter(Boolean)
        .filter(driver => driver.distanceToPickup <= radiusKm);

      // Sort by distance and rating
      return nearbyDrivers.sort((a, b) => {
        if (a.distanceToPickup === b.distanceToPickup) {
          const ratingA = a.rating?.average || 0;
          const ratingB = b.rating?.average || 0;
          return ratingB - ratingA;
        }

        return a.distanceToPickup - b.distanceToPickup;
      });
    } catch (error) {
      throw new Error(`Failed to find nearby drivers: ${error.message}`);
    }
  }

  // Calculate distance between two points (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(value) {
    return value * Math.PI / 180;
  }

  /**
   * Broadcast a newly created job to all nearby available drivers in real-time
   * This allows drivers to see new jobs immediately without polling
   */
  async broadcastNewJobToNearbyDrivers(job) {
    try {
      const driverNamespace = getNamespace('driverNamespace');
      
      if (!driverNamespace) {
        console.warn('⚠️ Driver namespace unavailable - cannot broadcast new job');
        return;
      }

      // Only broadcast UNASSIGNED or PENDING jobs
      if (job.status !== 'UNASSIGNED' && job.status !== 'PENDING') {
        return;
      }

      // Find nearby drivers within 20km radius
      const nearbyDrivers = await this.findNearbyDrivers(
        job.pickupLatitude,
        job.pickupLongitude,
        job.companyId,
        20 // 20km radius for notifications
      );

      if (nearbyDrivers.length === 0) {
        console.log(`📡 No nearby drivers found for job ${job.id}`);
        return;
      }

      // Build the job payload for drivers
      const jobPayload = {
        id: job.id,
        jobId: job.jobId || job.id,
        status: job.status,
        pickup: {
          address: job.pickupAddress,
          latitude: job.pickupLatitude,
          longitude: job.pickupLongitude,
        },
        dropoff: {
          address: job.dropoffAddress,
          latitude: job.dropoffLatitude,
          longitude: job.dropoffLongitude,
        },
        scheduledAt: job.scheduledAt,
        estimatedFare: job.estimatedPrice,
        estimatedDistance: job.estimatedDistance,
        estimatedDuration: job.estimatedDuration,
        customer: job.customer ? {
          id: job.customer.id,
          firstName: job.customer.firstName,
          lastName: job.customer.lastName,
          phone: job.customer.phone,
        } : null,
        createdAt: job.createdAt,
      };

      // Broadcast to each nearby driver with their specific distance
      let broadcastCount = 0;
      for (const driver of nearbyDrivers) {
        const driverRoom = `driver_${driver.id}`;
        const payloadWithDistance = {
          ...jobPayload,
          distanceToPickup: driver.distanceToPickup,
        };

        driverNamespace.to(driverRoom).emit('job:available:nearby', payloadWithDistance);
        broadcastCount++;
      }

      console.log(`📡 Broadcast new job ${job.id} to ${broadcastCount} nearby drivers`);
    } catch (error) {
      console.error(`Error broadcasting new job ${job.id}:`, error);
    }
  }

  estimateTravelTime(job) {
    if (job.estimatedDuration) {
      return job.estimatedDuration;
    }

    if (job.pickupLatitude && job.pickupLongitude && job.dropoffLatitude && job.dropoffLongitude) {
      const distance = this.calculateDistance(
        job.pickupLatitude,
        job.pickupLongitude,
        job.dropoffLatitude,
        job.dropoffLongitude
      );

      return Math.round(distance * 2); // fallback estimate: 2 minutes per km
    }

    return 10; // default fallback
  }

  // Calculate offer price based on distance, time, surge, etc.
  calculateOfferPrice(job, driver) {
    const baseFare = 2.50;
    const perKmRate = 1.20;
    const perMinuteRate = 0.25;

    // Estimate distance and time
    const distance = job.estimatedDistance || (
      job.pickupLatitude && job.pickupLongitude && job.dropoffLatitude && job.dropoffLongitude
        ? this.calculateDistance(
          job.pickupLatitude,
          job.pickupLongitude,
          job.dropoffLatitude,
          job.dropoffLongitude
        )
        : 0
    );

    const estimatedTime = this.estimateTravelTime(job);

    let price = baseFare + (distance * perKmRate) + (estimatedTime * perMinuteRate);

    // Apply surge pricing if needed
    // TODO: Implement surge pricing logic

    return Math.round(price * 100) / 100; // Round to 2 decimal places
  }

  // Accept an offer
  async acceptOffer(offerId, driverId) {
    try {
      // Update offer status
      const offer = await prisma.offers.update({
        where: { id: offerId },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          response: 'ACCEPTED',
        },
        include: {
          // Fixed relation names
          job: true,
          driver: true,
        }
      });

      // Create assignment
      const assignment = await prisma.assignments.create({
        data: {
          id: randomUUID(),
          jobId: offer.jobId,
          driverId: driverId,
          status: 'ASSIGNED',
          assignedAt: new Date(),
          assignedBy: 'SYSTEM',
          updatedAt: new Date(),
        }
      });

      // Update job status
      await prisma.job.update({
        where: { id: offer.jobId },
        data: {
          status: 'ASSIGNED',
          assignedDriverId: driverId,
          updatedAt: new Date(),
        }
      });

      this.clearOfferExpiryTimer(offer.jobId);

      // Reject other pending offers for this job
      await prisma.offers.updateMany({
        where: {
          jobId: offer.jobId,
          status: 'SENT',
          id: { not: offerId }
        },
        data: {
          status: 'REJECTED',
          respondedAt: new Date(),
          response: 'TIMEOUT',
        }
      });

      // Send notifications
      // TODO: Implement real-time notifications

      return assignment;
    } catch (error) {
      throw new Error(`Failed to accept offer: ${error.message}`);
    }
  }

  async assignDriver(jobId, driverId, assignedBy, io = null) {
    const jobAuditService = require('./jobAuditService');

    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          // Fixed relation names
          companies: true,
          users_jobs_customerIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            }
          },
          assignments: {
            orderBy: { assignedAt: 'desc' },
            take: 1,
          },
        }
      });

      if (!job) {
        throw new Error('Job not found');
      }

      if (['STARTED', 'IN_PROGRESS', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'ACTIVE'].includes(job.status)) {
        throw new Error('Cannot reassign an active job');
      }

      const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          companyId: true,
          role: true,
        }
      });

      if (!driver || driver.role !== 'DRIVER') {
        throw new Error('Invalid driver');
      }

      if (driver.companyId !== job.companyId) {
        throw new Error('Driver does not belong to this company');
      }

      if (job.assignedDriverId && job.assignedDriverId === driverId) {
        return {
          message: 'Job already assigned to this driver',
          jobId,
          driverId,
        };
      }

      // Ensure driver is available (no other active job assignments)
      const activeAssignments = await prisma.job.count({
        where: {
          assignedDriverId: driverId,
          id: { not: jobId },
          status: {
            in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'IN_PROGRESS', 'REACHED'],
          },
        },
      });

      if (activeAssignments > 0) {
        throw new Error('Driver is currently busy with another job');
      }

      if (job.assignedDriverId && job.assignedDriverId !== driverId) {
        await prisma.assignments.updateMany({
          where: {
            jobId,
            driverId: job.assignedDriverId,
            status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: new Date(),
            rejectionReason: 'Dispatcher reassigned job',
          },
        });
      }

      const previousStatus = job.status;

      const assignment = await prisma.assignments.create({
        data: {
          id: randomUUID(),
          jobId,
          driverId,
          status: 'OFFERED',
          assignedAt: new Date(),
          assignedBy,
          updatedAt: new Date(),
        },
      });

      const expiresAt = new Date(Date.now() + JOB_OFFER_TIMEOUT_MS);

      let offerRecord = await prisma.offers.findFirst({
        where: {
          jobId,
          driverId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (offerRecord) {
        offerRecord = await prisma.offers.update({
          where: { id: offerRecord.id },
          data: {
            status: 'SENT',
            expiresAt,
            respondedAt: null,
            response: null,
            estimatedFare: job.estimatedPrice || offerRecord.estimatedFare,
            estimatedDuration:
              Math.round(job.estimatedDuration || offerRecord.estimatedDuration || 15),
          },
        });
      } else {
        offerRecord = await prisma.offers.create({
          data: {
            id: randomUUID(),
            jobId,
            driverId,
            estimatedFare: job.estimatedPrice || 0,
            estimatedDuration: Math.round(job.estimatedDuration || 15),
            distanceToPickup: 0, // Set to 0 instead of null since schema requires Float
            expiresAt,
            status: 'SENT',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      const updatedJobRecord = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'OFFERED',
          assignedDriverId: driverId,
          updatedAt: new Date(),
        },
      });

      await updateDriverCurrentJobReference(prisma, driverId, jobId);

      // Log the assignment action
      await jobAuditService.logAssignment(
        jobId,
        driverId,
        assignedBy,
        previousStatus,
        {
          assignedAt: assignment.assignedAt.toISOString(),
          previousDriverId: job.assignedDriverId !== driverId ? job.assignedDriverId : null,
          offerExpiresAt: expiresAt.toISOString(),
          offerId: offerRecord?.id ?? null,
        }
      );

      console.log(`📝 [JobService] Job ${jobId} assigned to driver ${driverId} - ${previousStatus} → OFFERED`);

      if (offerRecord?.id) {
        await prisma.offers.updateMany({
          where: {
            jobId,
            status: 'SENT',
            id: { not: offerRecord.id },
          },
          data: {
            status: 'REJECTED',
            respondedAt: new Date(),
            response: 'TIMEOUT',
          },
        });
      }

      const jobForPayload = {
        ...(updatedJobRecord || job),
        status: 'OFFERED',
        assignedDriverId: driverId,
      };

      const driverNamespace =
        (io && io.of ? io.of('/driver') : getNamespace('driverNamespace')) || null;
      const dispatchNamespace =
        (io && io.of ? io.of('/dispatch') : getNamespace('dispatchNamespace')) || null;

      const jobData = this.buildDriverAssignmentPayload({
        job: jobForPayload,
        assignment,
        offer: offerRecord,
        driverId,
        expiresAt,
      });

      if (driverNamespace) {
        console.log(
          `🚨 JobService: Emitting job_assigned to driver_${driverId} for job ${job.jobId || job.id}`
        );
        console.log(`📡 Driver namespace connected sockets:`, driverNamespace.sockets.size);
        console.log(`📡 Sockets in room driver_${driverId}:`, driverNamespace.adapter.rooms.get(`driver_${driverId}`)?.size || 0);
        console.log(`📡 Job data being sent:`, JSON.stringify(jobData, null, 2));
        
        driverNamespace.to(`driver_${driverId}`).emit('job_assigned', jobData);
        if (this.isJobFlowV2Enabled()) {
          driverNamespace.to(`driver_${driverId}`).emit('jobAssigned', jobData);
        }
        console.log(`✅ Job assignment notification sent to driver ${driverId}`);
      } else {
        console.warn('⚠️ Socket.IO driver namespace not available - driver will not receive real-time notification');
      }

      if (dispatchNamespace) {
        const dispatchPayload = {
          jobId: jobData.jobId,
          internalJobId: job.id,
          status: 'OFFERED',
          driverId,
          assignmentId: assignment.id,
          offerId: offerRecord?.id ?? null,
          assignedAt: assignment.assignedAt,
          expiresAt: jobData.expiresAt,
        };
        dispatchNamespace
          .to(`dispatch_${job.companyId}`)
          .emit('job:progress:updated', dispatchPayload);

        if (this.isJobFlowV2Enabled()) {
          dispatchNamespace
            .to(`dispatch_${job.companyId}`)
            .emit('job:data:updated', { job: jobData });
        }

        console.log(
          `✅ Job assignment notification sent to dispatch portal for company ${job.companyId}`
        );
      } else {
        console.warn('⚠️ Dispatch namespace not available - dispatch portal not notified');
      }

      this.scheduleOfferExpiryTimer({
        job: jobForPayload,
        assignment,
        offer: offerRecord,
        io,
        expiresAt,
        reason: 'Offer expired (no response)',
      });

      return assignment;
    } catch (error) {
      throw new Error(`Failed to assign driver: ${error.message}`);
    }
  }

  async claimJob(jobId, driverId, io = null) {
    console.log('🎯 [CLAIM JOB] Step 1: Starting job claim', { jobId, driverId });
    
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, companyId: true, role: true },
    });
    console.log('🎯 [CLAIM JOB] Step 2: Driver fetched', { driver });

    if (!driver || driver.role !== 'DRIVER') {
      console.error('❌ [CLAIM JOB] Step 2 FAILED: Invalid driver', { driver });
      throw new Error('Invalid driver');
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
          // Fixed relation names
        companies: true,
        users_jobs_customerIdTousers: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 5,
        },
      },
    });
    console.log('🎯 [CLAIM JOB] Step 3: Job fetched', { 
      jobId: job?.id, 
      status: job?.status, 
      assignedDriverId: job?.assignedDriverId,
      companyId: job?.companyId 
    });

    if (!job) {
      console.error('❌ [CLAIM JOB] Step 3 FAILED: Job not found', { jobId });
      throw new Error('Job not found');
    }

    if (job.companyId !== driver.companyId) {
      console.error('❌ [CLAIM JOB] Step 4 FAILED: Company mismatch', { 
        jobCompanyId: job.companyId, 
        driverCompanyId: driver.companyId 
      });
      throw new Error('Job belongs to another company');
    }
    console.log('🎯 [CLAIM JOB] Step 4: Company verified');

    if (job.assignedDriverId && job.assignedDriverId !== driverId) {
      console.error('❌ [CLAIM JOB] Step 5 FAILED: Already assigned to another driver', { 
        assignedTo: job.assignedDriverId, 
        requestedBy: driverId 
      });
      throw new Error('Job already assigned to another driver');
    }
    console.log('🎯 [CLAIM JOB] Step 5: Driver assignment verified');

    const claimableStatuses = new Set(['PENDING', 'UNASSIGNED']);

    const hasActiveOffer = await prisma.offers.findFirst({
      where: {
        jobId,
        driverId,
        status: { in: ['SENT', 'ACCEPTED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!claimableStatuses.has(job.status) && !hasActiveOffer) {
      console.error('❌ [CLAIM JOB] Step 6 FAILED: Job not claimable', {
        status: job.status,
        assignedDriverId: job.assignedDriverId,
        requestingDriverId: driverId
      });
      throw new Error('Job is not available to claim');
    }
    console.log('🎯 [CLAIM JOB] Step 6: Status validation passed', { status: job.status, hasActiveOffer: !!hasActiveOffer });

    if (job.status !== 'OFFERED') {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'OFFERED' },
      });
      console.log('🎯 [CLAIM JOB] Step 6.5: Job status immediately set to OFFERED to prevent race conditions');
    }

    const timestamp = new Date();
    console.log('🎯 [CLAIM JOB] Step 7: Cancelling other assignments');

    const cancelledAssignments = await prisma.assignments.updateMany({
      where: {
        jobId,
        driverId: { not: driverId },
        status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] },
      },
      data: {
        status: 'CANCELLED',
        rejectionReason: 'Driver claimed job',
        updatedAt: timestamp,
      },
    });
    console.log('🎯 [CLAIM JOB] Step 7 Complete: Cancelled assignments', { count: cancelledAssignments.count });

    console.log('🎯 [CLAIM JOB] Step 8: Expiring other offers');
    const expiredOffers = await prisma.offers.updateMany({
      where: {
        jobId,
        status: { in: ['SENT', 'ACCEPTED'] }, // Fixed: ASSIGNED is not a valid OfferStatus (valid: SENT, ACCEPTED, REJECTED, EXPIRED)
      },
      data: {
        status: 'EXPIRED',
        response: 'TIMEOUT',
        respondedAt: timestamp,
      },
    });
    console.log('🎯 [CLAIM JOB] Step 8 Complete: Expired offers', { count: expiredOffers.count });

    this.clearOfferExpiryTimer(jobId);
    console.log('🎯 [CLAIM JOB] Step 9: Cleared expiry timer');

    console.log('🎯 [CLAIM JOB] Step 10: Calling assignDriver');
    const assignmentResult = await this.assignDriver(jobId, driverId, 'DRIVER_CLAIM', io);
    console.log('🎯 [CLAIM JOB] Step 10 Complete: Assignment result', { assignmentResult });

    console.log('🎯 [CLAIM JOB] Step 11: Fetching updated job');
    const updatedJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
          // Fixed relation names
        companies: true,
        users_jobs_customerIdTousers: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
        offers: {
          where: { driverId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    console.log('🎯 [CLAIM JOB] Step 11 Complete: Updated job fetched', { 
      jobId: updatedJob?.id, 
      status: updatedJob?.status,
      assignedDriverId: updatedJob?.assignedDriverId
    });

    if (!updatedJob) {
      console.log('🎯 [CLAIM JOB] Step 12: Updated job not found, returning partial result');
      return {
        job: null,
        assignmentId: assignmentResult.id,
      };
    }

    const activeAssignment = updatedJob.assignments?.[0] ?? null;
    const activeOffer = updatedJob.offers?.[0] ?? null;
    console.log('🎯 [CLAIM JOB] Step 12: Active records', { 
      hasAssignment: !!activeAssignment,
      hasOffer: !!activeOffer,
      assignmentStatus: activeAssignment?.status,
      offerStatus: activeOffer?.status
    });

    console.log('🎯 [CLAIM JOB] Step 13: Building driver assignment payload');
    const jobData = this.buildDriverAssignmentPayload({
      job: {
        ...updatedJob,
        status: 'OFFERED',
        assignedDriverId: driverId,
      },
      assignment: activeAssignment,
      offer: activeOffer,
      driverId,
      expiresAt: activeOffer?.expiresAt ?? null,
      statusOverride: 'OFFERED',
    });
    console.log('🎯 [CLAIM JOB] Step 13 Complete: Job data built');

    const result = {
        job: jobData,
        assignmentId: assignmentResult?.id ?? activeAssignment?.id ?? null,
      };
    console.log('✅ [CLAIM JOB] SUCCESS: Returning result', { 
      hasJob: !!result.job, 
      assignmentId: result.assignmentId 
    });
    return result;
  }

  async unassignDriver(
    jobId,
    requestedBy,
    reason = 'Dispatcher unassigned job',
    io = null
  ) {
    const jobAuditService = require('./jobAuditService');

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
          // Fixed relation names
        companies: true,
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    if (['STARTED', 'IN_PROGRESS', 'ACCEPTED'].includes(job.status)) {
      throw new Error('Cannot unassign an active job');
    }

    if (!job.assignedDriverId) {
      return job;
    }

    this.clearOfferExpiryTimer(jobId);

    const previousDriverId = job.assignedDriverId;
    const previousStatus = job.status;
    const timestamp = new Date();

    // Cancel ALL active assignments (OFFERED, ASSIGNED, ACCEPTED)
    await prisma.assignments.updateMany({
      where: {
        jobId,
        driverId: job.assignedDriverId,
        status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] },
      },
      data: {
        status: 'CANCELLED',
        rejectionReason: reason,
        updatedAt: new Date(),
      },
    });

    await prisma.offers.updateMany({
      where: {
        jobId,
        driverId: previousDriverId,
        status: { in: ['SENT', 'ACCEPTED'] },
      },
      data: {
        status: this.isJobFlowV2Enabled() ? 'EXPIRED' : 'CANCELLED',
        respondedAt: new Date(),
        response: reason,
      },
    });

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        assignedDriverId: null,
        status: 'UNASSIGNED',
        updatedAt: new Date(),
      },
      include: {
          // Fixed relation names
        users_jobs_customerIdTousers: true,
        users_jobs_assignedDriverIdTousers: true,
        companies: true,
      },
    });

    // Log the unassignment action
    await jobAuditService.logUnassignment(
      jobId,
      previousDriverId,
      requestedBy,
      reason,
      previousStatus,
      {
        unassignedAt: new Date().toISOString(),
        offerExpired: reason?.toLowerCase().includes('expired'),
        requestedBy,
      }
    );

    console.log(`📝 [JobService] Job ${jobId} unassigned from driver ${previousDriverId} - ${previousStatus} → UNASSIGNED`);

    const driverNamespace =
      (io && io.of ? io.of('/driver') : getNamespace('driverNamespace')) || null;
    const dispatchNamespace =
      (io && io.of ? io.of('/dispatch') : getNamespace('dispatchNamespace')) ||
      null;

    const eventPayload = {
      jobId: job.jobId ?? job.id,
      internalJobId: job.id,
      driverId: previousDriverId,
      reason,
      timestamp: timestamp.toISOString(),
      message: `Job has been unassigned: ${reason}`,
    };

    if (driverNamespace && previousDriverId) {
      console.log(
        `🚨 JobService: Emitting job_unassigned to driver_${previousDriverId} for job ${job.jobId ?? job.id}`
      );
      driverNamespace.to(`driver_${previousDriverId}`).emit('job_unassigned', eventPayload);
      if (this.isJobFlowV2Enabled()) {
        driverNamespace.to(`driver_${previousDriverId}`).emit('jobUnassigned', eventPayload);
      }
      console.log(`✅ Job unassignment notification sent to driver ${previousDriverId}`);
    } else if (previousDriverId) {
      console.warn(
        '⚠️ Socket.IO driver namespace not available - driver will not receive unassignment notification'
      );
    }

    let jobDataSnapshot = null;
    if (this.isJobFlowV2Enabled()) {
      const jobForPayload = {
        ...job,
        status: 'UNASSIGNED',
        assignedDriverId: null,
        customer: updatedJob.customer ?? job.customer,
        company: job.company ?? updatedJob.company,
      };

      jobDataSnapshot = this.buildDriverAssignmentPayload({
        job: jobForPayload,
        assignment: null,
        offer: null,
        driverId: previousDriverId,
        expiresAt: null,
      });
    }

    const dispatchPayload = {
      jobId: eventPayload.jobId,
      internalJobId: job.id,
      status: 'UNASSIGNED',
      previousStatus,
      driverId: null,
      unassignedAt: eventPayload.timestamp,
      reason,
    };

    if (dispatchNamespace) {
      dispatchNamespace
        .to(`dispatch_${updatedJob.companyId}`)
        .emit('job:progress:updated', dispatchPayload);

      if (this.isJobFlowV2Enabled()) {
        dispatchNamespace
          .to(`dispatch_${updatedJob.companyId}`)
          .emit('job:data:updated', { job: jobDataSnapshot });
      }

      console.log(
        `✅ Job unassignment notification sent to dispatch portal for company ${updatedJob.companyId}`
      );
    } else {
      console.warn(
        '⚠️ Dispatch namespace not available - dispatch portal not notified of unassignment'
      );
    }

    return updatedJob;
  }

  async updateJobDetails(jobId, payload = {}) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
          // Fixed relation names
        rides: true,
      },
    });

    if (!job) {
      throw new Error('Job not found');
    }

    if ([
      'STARTED',
      'IN_PROGRESS',
      'ACCEPTED',
      'COMPLETED',
      'CANCELLED',
    ].includes(job.status)) {
      throw new Error('Cannot edit a job in its current status');
    }

    const updateData = {
      instructions: payload.instructions ?? job.instructions,
    };

    if (payload.pickup) {
      updateData.pickupAddress = payload.pickup.address;
      updateData.pickupLatitude = payload.pickup.latitude;
      updateData.pickupLongitude = payload.pickup.longitude;
    }

    if (payload.dropoff) {
      updateData.dropoffAddress = payload.dropoff.address;
      updateData.dropoffLatitude = payload.dropoff.latitude;
      updateData.dropoffLongitude = payload.dropoff.longitude;
    }

    if (payload.vehicleType) {
      updateData.vehicleType = payload.vehicleType;
    }

    if (payload.estimatedPrice !== undefined) {
      updateData.estimatedPrice = payload.estimatedPrice;
    }
    if (payload.estimatedDistance !== undefined) {
      updateData.estimatedDistance = payload.estimatedDistance;
    }
    if (payload.estimatedDuration !== undefined) {
      updateData.estimatedDuration = payload.estimatedDuration;
    }
    if (payload.requirements) {
      updateData.requirements = payload.requirements;
    }
    
    // Update scheduledAt field
    if (payload.scheduledAt !== undefined) {
      updateData.scheduledAt = payload.scheduledAt;
    }
    
    // Update status if provided (convert to uppercase for enum)
    if (payload.status) {
      updateData.status = payload.status.toString().toUpperCase();
    }
    
    // Update assignedDriverId if provided
    if (payload.assignedDriverId !== undefined) {
      updateData.assignedDriverId = payload.assignedDriverId;
    }
    
    // Update paymentMethod if provided (convert to uppercase for enum)
    if (payload.paymentMethod) {
      updateData.paymentMethod = payload.paymentMethod.toString().toUpperCase();
    }

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
          // Fixed relation names
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        users_jobs_assignedDriverIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    const jobTrip = job.rides;

    if (job.tripId && jobTrip) {
      await prisma.rides.update({
        where: { id: job.tripId },
        data: {
          pickup: payload.pickup
            ? {
              ...jobTrip.pickup,
              address: payload.pickup.address,
              latitude: payload.pickup.latitude,
              longitude: payload.pickup.longitude,
            }
            : jobTrip.pickup,
          destination: payload.dropoff
            ? {
              ...jobTrip.destination,
              address: payload.dropoff.address,
              latitude: payload.dropoff.latitude,
              longitude: payload.dropoff.longitude,
            }
            : jobTrip.destination,
          estimatedFare:
            payload.estimatedPrice ?? jobTrip.estimatedFare ?? undefined,
          estimatedDistance:
            payload.estimatedDistance ?? jobTrip.estimatedDistance ?? undefined,
          estimatedDuration:
            payload.estimatedDuration ?? jobTrip.estimatedDuration ?? undefined,
        },
      });
    }

    const normalizedJob = {
      ...updatedJob,
      customer: updatedJob.users_jobs_customerIdTousers ?? null,
      assignedDriver: updatedJob.users_jobs_assignedDriverIdTousers ?? null,
    };
    delete normalizedJob.users_jobs_customerIdTousers;
    delete normalizedJob.users_jobs_assignedDriverIdTousers;

    return normalizedJob;
  }

  // Update job status
  async updateJobStatus(jobId, status, driverId, locationData = null) {
    try {
      const userContactSelect = {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      };
      const normalizeJobRecord = (jobRecord) => {
        const job = {
          ...jobRecord,
          customer: jobRecord.users_jobs_customerIdTousers ?? null,
          assignedDriver: jobRecord.users_jobs_assignedDriverIdTousers ?? null,
          trip: jobRecord.rides ?? null,
        };
        delete job.users_jobs_customerIdTousers;
        delete job.users_jobs_assignedDriverIdTousers;
        delete job.rides;
        return job;
      };
      const normalizedStatus =
        typeof status === 'string' ? status.trim().toUpperCase() : null;
      const targetStatus = normalizedStatus || status;

      if (targetStatus === 'RECALL' || targetStatus === 'RECALLED') {
        const existingJob = await prisma.job.findUnique({
          where: { id: jobId },
          include: {
            users_jobs_customerIdTousers: {
              select: userContactSelect,
            },
            users_jobs_assignedDriverIdTousers: {
              select: userContactSelect,
            },
            rides: true,
          },
        });

        if (!existingJob) {
          throw new Error('Job not found');
        }

        const driverToRelease = existingJob.assignedDriverId || driverId || null;
        const updatedJobRecord = await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'UNASSIGNED',
            assignedDriverId: null,
            updatedAt: new Date(),
          },
          include: {
            users_jobs_customerIdTousers: {
              select: userContactSelect,
            },
            users_jobs_assignedDriverIdTousers: {
              select: userContactSelect,
            },
            rides: true,
          },
        });

        await prisma.assignments.updateMany({
          where: {
            jobId,
            ...(driverToRelease ? { driverId: driverToRelease } : {}),
          },
          data: {
            status: 'CANCELLED',
            rejectionReason: 'RECALLED',
            respondedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        if (driverToRelease) {
          await prisma.user.update({
            where: { id: driverToRelease },
            data: {
              preferences: {
                driverStatus: 'AVAILABLE',
                lastStatusChange: new Date().toISOString(),
              },
            },
          });
        }

        await updateDriverCurrentJobReference(prisma, driverToRelease, null);

        this.clearOfferExpiryTimer(jobId);
        return normalizeJobRecord(updatedJobRecord);
      }

      const jobRecord = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: targetStatus,
          updatedAt: new Date(),
        },
        include: {
          // Fixed relation names
          users_jobs_customerIdTousers: {
            select: userContactSelect,
          },
          users_jobs_assignedDriverIdTousers: {
            select: userContactSelect,
          },
          rides: true,
        }
      });

      const job = normalizeJobRecord(jobRecord);

      // Update location if provided
      if (locationData && driverId) {
        await prisma.locationUpdate.create({
          data: {
            driverId: driverId,
            jobId: jobId,
            tripId: job.tripId,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            heading: locationData.heading,
            speed: locationData.speed,
            accuracy: locationData.accuracy,
            timestamp: new Date(),
          }
        });
      }

      // Handle status-specific logic
      if (ACTIVE_DRIVER_JOB_STATUSES.has(targetStatus) && job.assignedDriverId) {
        await updateDriverCurrentJobReference(prisma, job.assignedDriverId, job.id);
      } else if (TERMINAL_DRIVER_JOB_STATUSES.has(targetStatus)) {
        await updateDriverCurrentJobReference(prisma, job.assignedDriverId || driverId, null);
      }

      switch (targetStatus) {
        case 'STARTED':
          // Driver started driving to pickup
          await this.handleJobStarted(job);
          break;
        case 'IN_PROGRESS':
          // Driver picked up passenger/package
          await this.handleJobInProgress(job);
          break;
        case 'COMPLETED':
          // Job completed
          await this.handleJobCompleted(job);
          break;
        case 'CANCELLED':
          // Job cancelled
          await this.handleJobCancelled(job);
          break;
      }

      return job;
    } catch (error) {
      throw new Error(`Failed to update job status: ${error.message}`);
    }
  }

  async handleJobStarted(job) {
    if (!job.customerId) return;

    // Send notification to customer
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        type: 'JOB_STARTED',
        title: 'Driver on the way',
        message: `Your driver is on the way to pick you up`,
        jobId: job.id,
        companyId: job.companyId,
        createdAt: new Date(),
      }
    });
  }

  async handleJobInProgress(job) {
    if (!job.customerId) return;

    // Send notification to customer
    await prisma.notification.create({
      data: {
        userId: job.customerId,
        type: 'JOB_ACCEPTED',
        title: 'Trip started',
        message: job.type === 'TAXI' ? 'Your trip has started' : 'Your delivery is on the way',
        jobId: job.id,
        companyId: job.companyId,
        createdAt: new Date(),
      }
    });
  }

  async handleJobCompleted(job) {
    // Create payment record
    if (job.customerId && job.estimatedPrice) {
      await prisma.payment.create({
        data: {
          jobId: job.id,
          tripId: job.tripId,
          customerId: job.customerId,
          driverId: job.assignedDriverId,
          companyId: job.companyId,
          amount: job.estimatedPrice,
          currency: 'USD',
          paymentMethod: job.paymentMethod || 'CARD',
          status: 'PENDING',
          createdAt: new Date(),
        }
      });
    }

    // Send completion notification
    if (job.customerId) {
      await prisma.notification.create({
        data: {
          userId: job.customerId,
          type: 'JOB_COMPLETED',
          title: 'Trip completed',
          message: 'Your trip has been completed. Please rate your experience.',
          jobId: job.id,
          companyId: job.companyId,
          createdAt: new Date(),
        }
      });
    }
  }

  async handleJobCancelled(job) {
    // Update all related offers
    await prisma.offers.updateMany({
      where: { jobId: job.id },
      data: { status: 'EXPIRED' }
    });

    // Update assignments
    await prisma.assignments.updateMany({
      where: { jobId: job.id },
      data: { status: 'CANCELLED' }
    });
  }

  // Get active jobs for a driver
  async getDriverActiveJobs(driverId) {
    try {
      const jobs = await prisma.job.findMany({
        where: {
          assignedDriverId: driverId,
          status: {
            in: ['ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
          }
        },
        include: {
          // Fixed relation names
          users_jobs_customerIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              profilePicture: true,
            }
          },
          rides: true,
          delivery_orders: true,
        },
        orderBy: { createdAt: 'desc' }
      });

      return jobs;
    } catch (error) {
      throw new Error(`Failed to get driver jobs: ${error.message}`);
    }
  }

  // Calculate route data (distance and duration)
  async calculateRouteData(pickupLat, pickupLng, dropoffLat, dropoffLng) {
    try {
      // Use the new routing service for ACCURATE road-based distance
      const routingService = require('./routingService');
      const routeData = await routingService.calculateRoute(
        pickupLat, 
        pickupLng, 
        dropoffLat, 
        dropoffLng
      );

      return {
        distance: routeData.distance, // Actual driving distance in km
        duration: routeData.duration, // Actual driving duration in minutes (with traffic)
        polyline: routeData.polyline, // Route polyline for map display
        distanceMeters: routeData.distanceMeters,
        durationSeconds: routeData.durationSeconds,
        isEstimate: routeData.isEstimate || false, // Flag if using fallback
      };
    } catch (error) {
      console.error('❌ Route calculation error:', error);
      return { 
        distance: 5.0, 
        duration: 15,
        isEstimate: true, // fallback values
      };
    }
  }

  // Calculate job price
  async calculatePrice(pickupLat, pickupLng, dropoffLat, dropoffLng, vehicleType, companyId) {
    try {
      const routeData = await this.calculateRouteData(pickupLat, pickupLng, dropoffLat, dropoffLng);

      // Get company tariff or use default
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { commissionRate: true }
      });

      // Basic pricing structure
      const baseFare = 3.50; // Base fare
      const perKmRate = 1.20; // Per kilometer
      const perMinuteRate = 0.30; // Per minute
      const minimumFare = 6.00; // Minimum fare

      const distanceFare = routeData.distance * perKmRate;
      const timeFare = routeData.duration * perMinuteRate;
      const totalFare = Math.max(baseFare + distanceFare + timeFare, minimumFare);

      // Vehicle type multiplier
      const vehicleMultiplier = {
        'SEDAN': 1.0,
        'SUV': 1.3,
        'PREMIUM': 1.5,
        'VAN': 1.4
      };

      const multiplier = vehicleMultiplier[vehicleType] || 1.0;
      return Math.round(totalFare * multiplier * 100) / 100;
    } catch (error) {
      console.error('Price calculation error:', error);
      return 10.00; // fallback price
    }
  }

  // Unassign a driver from a job
  async unassignDriver(jobId, dispatcherId, reason = 'Unassigned by dispatcher') {
    try {
      // First, check if the job exists
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          // Fixed relation names
          users_jobs_assignedDriverIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            }
          }
        }
      });

      if (!job) {
        throw new Error('Job not found');
      }

      // Check if job has any active offers or assignments
      const activeAssignments = await prisma.assignments.findMany({
        where: {
          jobId: jobId,
          status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] }
        }
      });

      if (!job.assignedDriverId && activeAssignments.length === 0) {
        throw new Error('Job has no active offers or assignments');
      }

      // Handle OFFERED state (no assignedDriverId yet, but has offers)
      if (!job.assignedDriverId && activeAssignments.length > 0) {
        // Cancel all active offers/assignments
        await prisma.assignments.updateMany({
          where: {
            jobId: jobId,
            status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] }
          },
          data: {
            status: 'CANCELLED',
            rejectionReason: reason,
            updatedAt: new Date(),
          }
        });

        // Update job status back to UNASSIGNED
        const updatedJob = await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'UNASSIGNED',
          },
          include: {
            users_jobs_customerIdTousers: true,
          }
        });

        console.log(`✅ Job ${jobId} offers cancelled by dispatcher ${dispatcherId}`);
        const normalizedJob = {
          ...updatedJob,
          customer: updatedJob.users_jobs_customerIdTousers ?? null,
        };
        delete normalizedJob.users_jobs_customerIdTousers;
        return normalizedJob;
      }

      // Handle ASSIGNED/ACCEPTED state (has assignedDriverId)
      const previousDriverId = job.assignedDriverId;

      // Update the job to remove driver assignment
      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: {
          assignedDriverId: null,
          status: 'UNASSIGNED',
        },
        include: {
          // Fixed relation names
          users_jobs_customerIdTousers: true,
        }
      });

      // Update the assignment record
      await prisma.assignments.updateMany({
        where: {
          jobId: jobId,
          driverId: previousDriverId,
          status: { in: ['OFFERED', 'ASSIGNED', 'ACCEPTED'] }
        },
        data: {
          status: 'CANCELLED',
          rejectionReason: reason,
          updatedAt: new Date(),
        }
      });

      console.log(`✅ Job ${jobId} unassigned from driver ${previousDriverId} by ${dispatcherId}`);

      await updateDriverCurrentJobReference(prisma, previousDriverId, null);

      const normalizedJob = {
        ...updatedJob,
        customer: updatedJob.users_jobs_customerIdTousers ?? null,
      };
      delete normalizedJob.users_jobs_customerIdTousers;
      return normalizedJob;

    } catch (error) {
      console.error('Error unassigning driver from job:', error);
      throw new Error(`Failed to unassign driver: ${error.message}`);
    }
  }

  // Get job history for a customer
  async getCustomerJobHistory(customerId, page = 1, limit = 20) {
    try {
      const jobs = await prisma.job.findMany({
        where: { customerId: customerId },
        include: {
          // Fixed relation names
          users_jobs_assignedDriverIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              profilePicture: true,
            }
          },
          rides: true,
          delivery_orders: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return jobs;
    } catch (error) {
      throw new Error(`Failed to get customer job history: ${error.message}`);
    }
  }
}

module.exports = new JobService();
