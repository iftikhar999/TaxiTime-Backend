const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class TrackingService {
  constructor(io) {
    this.io = io; // Socket.io instance
    this.driverLocations = new Map(); // In-memory cache for recent locations
    this.trackingIntervals = new Map(); // Active tracking intervals
  }

  // Update driver location
  async updateDriverLocation(driverId, locationData) {
    try {
      const {
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
        timestamp,
        jobId,
        tripId
      } = locationData;

      // Validate location data
      if (!this.isValidLocation(latitude, longitude)) {
        throw new Error('Invalid location coordinates');
      }

      // Create location update record
      const locationUpdate = await prisma.locationUpdate.create({
        data: {
          driverId,
          jobId,
          tripId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          heading: heading ? parseFloat(heading) : null,
          speed: speed ? parseFloat(speed) : null,
          accuracy: accuracy ? parseFloat(accuracy) : null,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          createdAt: new Date(),
        }
      });

      // Update in-memory cache
      this.driverLocations.set(driverId, {
        ...locationUpdate,
        lastUpdated: new Date(),
      });

      // Broadcast location to relevant customers
      await this.broadcastLocationUpdate(driverId, locationUpdate);

      // Update driver status based on movement
      await this.updateDriverStatusBasedOnMovement(driverId, speed);

      // Check for geofence triggers
      await this.checkGeofences(driverId, latitude, longitude, jobId);

      // Update ETA for active jobs
      if (jobId) {
        await this.updateJobETA(jobId, latitude, longitude);
      }

      return locationUpdate;
    } catch (error) {
      throw new Error(`Failed to update driver location: ${error.message}`);
    }
  }

  // Broadcast location update to relevant parties
  async broadcastLocationUpdate(driverId, locationUpdate) {
    try {
      // Get driver's active jobs
      const activeJobs = await prisma.job.findMany({
        where: {
          assignedDriverId: driverId,
          status: {
            in: ['ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
          }
        },
        include: {
          customer: true,
          assignedDriver: true,
        }
      });

      const customerNamespace = this.io.of('/customer');
      const dispatchNamespace = this.io.of('/dispatch');

      // Broadcast to customers of active jobs
      activeJobs.forEach(job => {
        const customerRoom = `customer_${job.customerId}`;
        customerNamespace.to(customerRoom).emit('driverLocationUpdate', {
          jobId: job.id,
          driverId: driverId,
          location: {
            latitude: locationUpdate.latitude,
            longitude: locationUpdate.longitude,
            heading: locationUpdate.heading,
            speed: locationUpdate.speed,
            timestamp: locationUpdate.timestamp,
          }
        });

        customerNamespace.to(`job_${job.jobId || job.id}`).emit('driverLocationUpdate', {
          jobId: job.jobId || job.id,
          driverId: driverId,
          location: {
            latitude: locationUpdate.latitude,
            longitude: locationUpdate.longitude,
            heading: locationUpdate.heading,
            speed: locationUpdate.speed,
            timestamp: locationUpdate.timestamp,
          }
        });
      });

      // Broadcast to company dispatch
      const driver = await prisma.user.findUnique({
        where: { id: driverId },
        select: { companyId: true }
      });

      if (driver) {
        const dispatchRoom = `dispatch_${driver.companyId}`;
        dispatchNamespace.to(dispatchRoom).emit('driverLocationUpdate', {
          driverId: driverId,
          location: {
            latitude: locationUpdate.latitude,
            longitude: locationUpdate.longitude,
            heading: locationUpdate.heading,
            speed: locationUpdate.speed,
            timestamp: locationUpdate.timestamp,
          }
        });
      }
    } catch (error) {
      console.error('Error broadcasting location update:', error);
    }
  }

  // Update driver status based on movement patterns
  async updateDriverStatusBasedOnMovement(driverId, speed) {
    try {
      const speedThreshold = 5; // km/h
      const isMoving = speed && speed > speedThreshold;

      // Get current shift status
      const currentShift = await prisma.shift.findFirst({
        where: {
          driverId: driverId,
          status: {
            in: ['ONLINE', 'BUSY', 'BREAK']
          },
          endTime: null,
        },
        orderBy: { startTime: 'desc' }
      });

      if (currentShift) {
        let newStatus = currentShift.status;
        
        // Update status based on movement and current assignments
        const hasActiveJob = await prisma.job.count({
          where: {
            assignedDriverId: driverId,
            status: {
              in: ['ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
            }
          }
        });

        if (hasActiveJob > 0) {
          newStatus = 'BUSY';
        } else if (isMoving) {
          newStatus = 'ONLINE';
        }

        // Update shift status if changed
        if (newStatus !== currentShift.status) {
          await prisma.shift.update({
            where: { id: currentShift.id },
            data: {
              status: newStatus,
              updatedAt: new Date(),
            }
          });
        }
      }
    } catch (error) {
      console.error('Error updating driver status:', error);
    }
  }

  // Check for geofence triggers (pickup/dropoff zones)
  async checkGeofences(driverId, latitude, longitude, jobId) {
    try {
      if (!jobId) return;

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { trip: true }
      });

      if (!job) return;

      const proximityThreshold = 0.1; // 100 meters in km

      // Check if driver is near pickup location
      if (job.status === 'STARTED') {
        const distanceToPickup = this.calculateDistance(
          latitude, longitude,
          job.pickupLatitude, job.pickupLongitude
        );

        if (distanceToPickup <= proximityThreshold) {
          // Driver arrived at pickup
          await this.handleDriverArrivedAtPickup(jobId, driverId);
        }
      }

      // Check if driver is near dropoff location
      if (job.status === 'IN_PROGRESS') {
        const distanceToDropoff = this.calculateDistance(
          latitude, longitude,
          job.dropoffLatitude, job.dropoffLongitude
        );

        if (distanceToDropoff <= proximityThreshold) {
          // Driver arrived at dropoff
          await this.handleDriverArrivedAtDropoff(jobId, driverId);
        }
      }
    } catch (error) {
      console.error('Error checking geofences:', error);
    }
  }

  // Handle driver arrival at pickup location
  async handleDriverArrivedAtPickup(jobId, driverId) {
    try {
      // Send notification to customer
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { customer: true, assignedDriver: true }
      });

      if (job && job.customerId && job.assignedDriver) {
        await prisma.notification.create({
          data: {
            userId: job.customerId,
            type: 'SYSTEM_ALERT',
            title: 'Driver Arrived',
            message: `${job.assignedDriver.firstName} has arrived at your pickup location`,
            jobId: jobId,
            companyId: job.companyId,
            createdAt: new Date(),
          }
        });

        // Send real-time notification
        const customerRoom = `customer_${job.customerId}`;
        this.io.to(customerRoom).emit('driverArrived', {
          jobId: jobId,
          driverId: driverId,
          location: 'pickup',
          driver: {
            name: `${job.assignedDriver.firstName} ${job.assignedDriver.lastName}`,
            phone: job.assignedDriver.phone,
          }
        });
      }
    } catch (error) {
      console.error('Error handling driver arrival at pickup:', error);
    }
  }

  // Handle driver arrival at dropoff location
  async handleDriverArrivedAtDropoff(jobId, driverId) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { customer: true, assignedDriver: true }
      });

      if (job && job.customerId && job.assignedDriver) {
        // Send real-time notification
        const customerRoom = `customer_${job.customerId}`;
        this.io.to(customerRoom).emit('driverArrived', {
          jobId: jobId,
          driverId: driverId,
          location: 'dropoff',
          driver: {
            name: `${job.assignedDriver.firstName} ${job.assignedDriver.lastName}`,
            phone: job.assignedDriver.phone,
          }
        });
      }
    } catch (error) {
      console.error('Error handling driver arrival at dropoff:', error);
    }
  }

  // Update ETA for active job
  async updateJobETA(jobId, currentLat, currentLng) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId }
      });

      if (!job) return;

      let eta;
      const averageSpeed = 30; // km/h average city speed

      if (job.status === 'STARTED') {
        // ETA to pickup location
        const distanceToPickup = this.calculateDistance(
          currentLat, currentLng,
          job.pickupLatitude, job.pickupLongitude
        );
        eta = Math.round((distanceToPickup / averageSpeed) * 60); // minutes
      } else if (job.status === 'IN_PROGRESS') {
        // ETA to dropoff location
        const distanceToDropoff = this.calculateDistance(
          currentLat, currentLng,
          job.dropoffLatitude, job.dropoffLongitude
        );
        eta = Math.round((distanceToDropoff / averageSpeed) * 60); // minutes
      }

      if (eta !== undefined) {
        // Update job with new ETA
        await prisma.job.update({
          where: { id: jobId },
          data: {
            estimatedArrival: new Date(Date.now() + eta * 60 * 1000),
            updatedAt: new Date(),
          }
        });

        // Broadcast ETA update
        const customerRoom = `customer_${job.customerId}`;
        this.io.to(customerRoom).emit('etaUpdate', {
          jobId: jobId,
          eta: eta,
          estimatedArrival: new Date(Date.now() + eta * 60 * 1000),
        });
      }
    } catch (error) {
      console.error('Error updating job ETA:', error);
    }
  }

  // Get driver's current location
  async getDriverLocation(driverId) {
    try {
      // Check in-memory cache first
      const cachedLocation = this.driverLocations.get(driverId);
      if (cachedLocation && this.isLocationRecent(cachedLocation.lastUpdated)) {
        return cachedLocation;
      }

      // Get from database
      const locationUpdate = await prisma.locationUpdate.findFirst({
        where: { driverId: driverId },
        orderBy: { timestamp: 'desc' },
      });

      if (locationUpdate) {
        this.driverLocations.set(driverId, {
          ...locationUpdate,
          lastUpdated: new Date(),
        });
      }

      return locationUpdate;
    } catch (error) {
      throw new Error(`Failed to get driver location: ${error.message}`);
    }
  }

  // Get locations for multiple drivers
  async getMultipleDriverLocations(driverIds) {
    try {
      const locations = new Map();

      // Check cache first
      const uncachedDrivers = [];
      driverIds.forEach(driverId => {
        const cached = this.driverLocations.get(driverId);
        if (cached && this.isLocationRecent(cached.lastUpdated)) {
          locations.set(driverId, cached);
        } else {
          uncachedDrivers.push(driverId);
        }
      });

      // Get uncached locations from database
      if (uncachedDrivers.length > 0) {
        const dbLocations = await prisma.locationUpdate.findMany({
          where: {
            driverId: { in: uncachedDrivers }
          },
          orderBy: { timestamp: 'desc' },
          distinct: ['driverId'],
        });

        dbLocations.forEach(location => {
          locations.set(location.driverId, location);
          this.driverLocations.set(location.driverId, {
            ...location,
            lastUpdated: new Date(),
          });
        });
      }

      return locations;
    } catch (error) {
      throw new Error(`Failed to get multiple driver locations: ${error.message}`);
    }
  }

  // Start tracking a job
  async startJobTracking(jobId) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          customer: true,
          assignedDriver: true,
        }
      });

      if (!job || !job.assignedDriverId) {
        throw new Error('Job not found or not assigned');
      }

      // Create tracking session rooms
      const customerRoom = `customer_${job.customerId}`;
      const driverRoom = `driver_${job.assignedDriverId}`;
      const jobRoom = `job_${jobId}`;

      // Initialize tracking data
      const trackingData = {
        jobId: jobId,
        customerId: job.customerId,
        driverId: job.assignedDriverId,
        startTime: new Date(),
        customerRoom,
        driverRoom,
        jobRoom,
      };

      // Store tracking session
      this.trackingIntervals.set(jobId, trackingData);

      // Send initial tracking data
      this.io.to(customerRoom).emit('trackingStarted', {
        jobId: jobId,
        driver: {
          id: job.assignedDriver?.id,
          name: job.assignedDriver ? `${job.assignedDriver.firstName} ${job.assignedDriver.lastName}` : null,
          phone: job.assignedDriver?.phone,
          vehicle: job.assignedDriver?.vehicleNumber,
        },
        pickup: {
          latitude: job.pickupLatitude,
          longitude: job.pickupLongitude,
          address: job.pickupAddress,
        },
        dropoff: {
          latitude: job.dropoffLatitude,
          longitude: job.dropoffLongitude,
          address: job.dropoffAddress,
        }
      });

      return trackingData;
    } catch (error) {
      throw new Error(`Failed to start job tracking: ${error.message}`);
    }
  }

  // Stop tracking a job
  async stopJobTracking(jobId) {
    try {
      const trackingData = this.trackingIntervals.get(jobId);
      if (trackingData) {
        // Send tracking stopped event
        this.io.to(trackingData.customerRoom).emit('trackingStopped', {
          jobId: jobId,
          endTime: new Date(),
        });

        // Remove from active tracking
        this.trackingIntervals.delete(jobId);
      }
    } catch (error) {
      console.error('Error stopping job tracking:', error);
    }
  }

  // Get trip route/history
  async getTripRoute(tripId) {
    try {
      const route = await prisma.locationUpdate.findMany({
        where: { tripId: tripId },
        orderBy: { timestamp: 'asc' },
        select: {
          latitude: true,
          longitude: true,
          timestamp: true,
          speed: true,
          heading: true,
        }
      });

      return route;
    } catch (error) {
      throw new Error(`Failed to get trip route: ${error.message}`);
    }
  }

  // Utility functions
  isValidLocation(latitude, longitude) {
    return (
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    );
  }

  isLocationRecent(lastUpdated, maxAgeMinutes = 5) {
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    return (Date.now() - new Date(lastUpdated).getTime()) < maxAge;
  }

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

  // Clean up old location data (should be run periodically)
  async cleanupOldLocations() {
    try {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      await prisma.locationUpdate.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      console.log('Old location data cleaned up');
    } catch (error) {
      console.error('Error cleaning up old locations:', error);
    }
  }
}

module.exports = TrackingService;
