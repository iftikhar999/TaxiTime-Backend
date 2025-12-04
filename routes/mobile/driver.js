const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');
const { auth } = require('../../middleware/auth');

/**
 * @route PUT /api/mobile/driver/preferences
 * @desc Update driver preferences (vehicle, tariff selections)
 * @access Private (Driver only)
 */
router.put('/preferences', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { vehicleId, tariffId } = req.body;

    console.log(`📝 Updating driver preferences:`, {
      driverId,
      vehicleId,
      tariffId,
    });

    // Get current user to access preferences
    const user = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Merge new preferences with existing ones
    const currentPrefs = user.preferences && typeof user.preferences === 'object' 
      ? user.preferences 
      : {};
    
    const updatedPrefs = { ...currentPrefs };
    
    if (vehicleId !== undefined) {
      updatedPrefs.selectedVehicleId = vehicleId;
      updatedPrefs.vehicleId = vehicleId; // Also store in legacy field
      console.log(`✅ Updated selectedVehicleId: ${vehicleId}`);
    }
    
    if (tariffId !== undefined) {
      updatedPrefs.selectedTariffId = tariffId;
      updatedPrefs.tariffId = tariffId; // Also store in legacy field
      console.log(`✅ Updated selectedTariffId: ${tariffId}`);
    }

    // Update user preferences
    await prisma.user.update({
      where: { id: driverId },
      data: { preferences: updatedPrefs },
    });

    console.log(`✅ Driver preferences updated successfully`);

    res.json({
      success: true,
      preferences: {
        selectedVehicleId: updatedPrefs.selectedVehicleId,
        selectedTariffId: updatedPrefs.selectedTariffId,
      },
    });
  } catch (error) {
    console.error('Failed to update driver preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @route GET /api/mobile/driver/preferences
 * @desc Get driver preferences
 * @access Private (Driver only)
 */
router.get('/preferences', auth, async (req, res) => {
  try {
    const driverId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const prefs = user.preferences && typeof user.preferences === 'object' 
      ? user.preferences 
      : {};

    res.json({
      preferences: {
        selectedVehicleId: prefs.selectedVehicleId || prefs.vehicleId,
        selectedTariffId: prefs.selectedTariffId || prefs.tariffId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch driver preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚕 JOB QUEUE SYSTEM - For queuing next job during active trip
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @route GET /api/mobile/driver/jobs/nearby
 * @desc Get pending jobs in the same zone as driver (for job queue feature)
 * @access Private (Driver only)
 * @query latitude - Driver's current latitude (optional, for distance calc)
 * @query longitude - Driver's current longitude (optional, for distance calc)
 * @query zoneId - Zone ID to filter by (optional, uses driver's current zone if not provided)
 * @query limit - Max jobs to return (default: 10)
 * @query excludeJobId - Job ID to exclude (current job)
 */
router.get('/jobs/nearby', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { latitude, longitude, zoneId, limit = 10, excludeJobId } = req.query;
    
    const driverLat = latitude ? Number.parseFloat(latitude) : null;
    const driverLng = longitude ? Number.parseFloat(longitude) : null;
    const maxResults = Number.parseInt(limit, 10);
    
    // Get driver's company and current zone
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { 
        companyId: true, 
        zoneId: true,
        preferences: true,
      },
    });
    
    if (!driver?.companyId) {
      return res.status(400).json({ error: 'Driver not associated with a company' });
    }
    
    // Determine zone to filter by (priority: query param > driver's current zone > driver preferences)
    const prefs = driver.preferences || {};
    const filterZoneId = zoneId || driver.zoneId || prefs.currentZoneId || null;
    
    console.log(`🔍 [JobQueue] Fetching nearby jobs for driver ${driverId}:`, {
      zoneId: filterZoneId,
      lat: driverLat,
      lng: driverLng,
    });
    
    // Build where clause - filter by zone if available
    const whereClause = {
      companyId: driver.companyId,
      status: {
        in: ['PENDING', 'UNASSIGNED'],
      },
      // Exclude current job if specified
      ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
    };
    
    // Add zone filter if we have a zone ID
    if (filterZoneId) {
      whereClause.zoneId = filterZoneId;
    }
    
    // Find pending/unassigned jobs for the same company and zone
    const pendingJobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: maxResults,
    });
    
    // Map jobs and calculate distance if coordinates provided
    const nearbyJobs = pendingJobs.map(job => {
      let distanceToPickup = null;
      
      // Calculate distance only if driver coordinates and job pickup coordinates are available
      if (driverLat && driverLng && job.pickupLatitude && job.pickupLongitude) {
        const distance = calculateDistanceKm(
          driverLat,
          driverLng,
          job.pickupLatitude,
          job.pickupLongitude
        );
        distanceToPickup = Math.round(distance * 10) / 10;
      }
      
      const customer = job.users_jobs_customerIdTousers;
      
      return {
        id: job.id,
        jobId: job.jobId,
        publicJobId: job.jobId,
        status: job.status,
        pickupAddress: job.pickupAddress,
        pickupLatitude: job.pickupLatitude,
        pickupLongitude: job.pickupLongitude,
        dropoffAddress: job.dropoffAddress,
        dropoffLatitude: job.dropoffLatitude,
        dropoffLongitude: job.dropoffLongitude,
        estimatedFare: job.estimatedPrice,
        fare: job.actualFare || job.estimatedPrice,
        estimatedDistance: job.estimatedDistance,
        distanceToPickup,
        zoneId: job.zoneId,
        customer: customer ? {
          id: customer.id,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer',
          phone: customer.phone,
        } : null,
        vehicleType: job.vehicleType,
        createdAt: job.createdAt,
      };
    });
    
    // Sort by distance if available, otherwise by creation time
    if (driverLat && driverLng) {
      nearbyJobs.sort((a, b) => {
        if (a.distanceToPickup === null) return 1;
        if (b.distanceToPickup === null) return -1;
        return a.distanceToPickup - b.distanceToPickup;
      });
    }
    
    console.log(`✅ [JobQueue] Found ${nearbyJobs.length} jobs in zone ${filterZoneId || 'any'}`);
    
    res.json({
      jobs: nearbyJobs,
      total: nearbyJobs.length,
      zoneId: filterZoneId,
      driverLocation: driverLat && driverLng ? { latitude: driverLat, longitude: driverLng } : null,
    });
    
  } catch (error) {
    console.error('❌ [JobQueue] Failed to fetch nearby jobs:', error);
    res.status(500).json({ error: 'Failed to fetch nearby jobs' });
  }
});

/**
 * @route POST /api/mobile/driver/jobs/:jobId/queue
 * @desc Queue a job for the driver (reserve for after current trip)
 * @access Private (Driver only)
 * @body currentJobId - The driver's current active job ID
 */
router.post('/jobs/:jobId/queue', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { jobId } = req.params;
    const { currentJobId, queuedAt } = req.body;
    
    console.log(`➕ [JobQueue] Driver ${driverId} queuing job ${jobId}`);
    
    // Verify the job exists and is still available
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobId: true,
        status: true,
        companyId: true,
        assignedDriverId: true,
        pickupAddress: true,
        dropoffAddress: true,
        fare: true,
      },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'PENDING' && job.status !== 'UNASSIGNED') {
      return res.status(400).json({ 
        error: 'Job is no longer available',
        currentStatus: job.status,
      });
    }
    
    if (job.assignedDriverId && job.assignedDriverId !== driverId) {
      return res.status(400).json({ 
        error: 'Job is already assigned to another driver',
      });
    }
    
    // Check if driver already has a queued job
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true, firstName: true, lastName: true },
    });
    
    const prefs = driver?.preferences || {};
    if (prefs.queuedJobId && prefs.queuedJobId !== jobId) {
      return res.status(400).json({ 
        error: 'You already have a job queued. Clear it first.',
        existingQueuedJobId: prefs.queuedJobId,
      });
    }
    
    const timestamp = queuedAt || new Date().toISOString();
    
    // ✅ ASSIGN the job to this driver with status QUEUED
    // This prevents dispatcher from assigning it to someone else
    await prisma.job.update({
      where: { id: jobId },
      data: { 
        users_jobs_assignedDriverIdTousers: {
          connect: { id: driverId }
        },
        status: 'QUEUED', // New status for queued jobs
      },
    });
    
    // Save queued job to driver preferences
    const updatedPrefs = {
      ...prefs,
      queuedJobId: jobId,
      queuedAt: timestamp,
      queuedFromJobId: currentJobId,
    };
    
    await prisma.user.update({
      where: { id: driverId },
      data: { preferences: updatedPrefs },
    });
    
    console.log(`✅ [JobQueue] Job ${jobId} ASSIGNED and queued for driver ${driverId}`);
    
    // Emit socket event to update dispatch panel
    const io = req.app.get('io');
    if (io) {
      const dispatchNamespace = io.of('/dispatch');
      dispatchNamespace.to(`dispatch_${job.companyId}`).emit('job:status:update', {
        jobId: job.id,
        shortJobId: job.jobId,
        status: 'QUEUED',
        assignedDriverId: driverId,
        driverName: `${driver?.firstName || ''} ${driver?.lastName || ''}`.trim(),
        message: 'Job queued by driver',
        updatedAt: timestamp,
      });
    }
    
    res.json({
      success: true,
      message: 'Job queued and assigned successfully',
      queuedJobId: jobId,
      queuedAt: timestamp,
      status: 'QUEUED',
    });
    
  } catch (error) {
    console.error('❌ [JobQueue] Failed to queue job:', error);
    res.status(500).json({ error: 'Failed to queue job' });
  }
});

/**
 * @route DELETE /api/mobile/driver/jobs/:jobId/queue
 * @desc Remove a job from driver's queue and unassign it
 * @access Private (Driver only)
 */
router.delete('/jobs/:jobId/queue', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { jobId } = req.params;
    
    console.log(`🗑️ [JobQueue] Driver ${driverId} clearing queued job ${jobId}`);
    
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });
    
    const prefs = driver?.preferences || {};
    
    if (prefs.queuedJobId !== jobId) {
      return res.status(400).json({ 
        error: 'This job is not in your queue',
        currentQueuedJobId: prefs.queuedJobId,
      });
    }
    
    // Get job info for socket emission
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, jobId: true, companyId: true, status: true },
    });
    
    // ✅ UNASSIGN the job and set back to PENDING
    if (job && job.status === 'QUEUED') {
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          users_jobs_assignedDriverIdTousers: {
            disconnect: true
          },
          status: 'PENDING',
        },
      });
      
      // Emit socket event to update dispatch panel
      const io = req.app.get('io');
      if (io && job.companyId) {
        const dispatchNamespace = io.of('/dispatch');
        dispatchNamespace.to(`dispatch_${job.companyId}`).emit('job:status:update', {
          jobId: job.id,
          shortJobId: job.jobId,
          status: 'PENDING',
          assignedDriverId: null,
          driverName: null,
          message: 'Job released from queue',
          updatedAt: new Date().toISOString(),
        });
      }
    }
    
    // Clear queued job from preferences
    const updatedPrefs = { ...prefs };
    delete updatedPrefs.queuedJobId;
    delete updatedPrefs.queuedAt;
    delete updatedPrefs.queuedFromJobId;
    
    await prisma.user.update({
      where: { id: driverId },
      data: { preferences: updatedPrefs },
    });
    
    console.log(`✅ [JobQueue] Queued job cleared and unassigned for driver ${driverId}`);
    
    res.json({
      success: true,
      message: 'Queued job cleared and released',
    });
    
  } catch (error) {
    console.error('❌ [JobQueue] Failed to clear queued job:', error);
    res.status(500).json({ error: 'Failed to clear queued job' });
  }
});

/**
 * @route GET /api/mobile/driver/jobs/queued
 * @desc Get the driver's currently queued job
 * @access Private (Driver only)
 */
router.get('/jobs/queued', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { preferences: true },
    });
    
    const prefs = driver?.preferences || {};
    
    if (!prefs.queuedJobId) {
      return res.json({ queuedJob: null });
    }
    
    // Fetch the queued job details
    const job = await prisma.job.findUnique({
      where: { id: prefs.queuedJobId },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        tariff: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    
    if (!job) {
      // Job no longer exists, clear from preferences
      const updatedPrefs = { ...prefs };
      delete updatedPrefs.queuedJobId;
      delete updatedPrefs.queuedAt;
      delete updatedPrefs.queuedFromJobId;
      
      await prisma.user.update({
        where: { id: driverId },
        data: { preferences: updatedPrefs },
      });
      
      return res.json({ queuedJob: null, message: 'Queued job no longer exists' });
    }
    
    // Check if job is still available
    if (job.status !== 'PENDING' && job.status !== 'UNASSIGNED') {
      // Job was taken, clear from preferences
      const updatedPrefs = { ...prefs };
      delete updatedPrefs.queuedJobId;
      delete updatedPrefs.queuedAt;
      delete updatedPrefs.queuedFromJobId;
      
      await prisma.user.update({
        where: { id: driverId },
        data: { preferences: updatedPrefs },
      });
      
      return res.json({ 
        queuedJob: null, 
        message: 'Queued job is no longer available',
        jobStatus: job.status,
      });
    }
    
    res.json({
      queuedJob: {
        id: job.id,
        jobId: job.jobId,
        publicJobId: job.jobId,
        status: job.status,
        pickupAddress: job.pickupAddress,
        pickupLatitude: job.pickupLatitude,
        pickupLongitude: job.pickupLongitude,
        dropoffAddress: job.dropoffAddress,
        dropoffLatitude: job.dropoffLatitude,
        dropoffLongitude: job.dropoffLongitude,
        estimatedFare: job.estimatedPrice,
        fare: job.fare,
        customer: job.customer ? {
          id: job.customer.id,
          name: `${job.customer.firstName || ''} ${job.customer.lastName || ''}`.trim() || 'Customer',
          phone: job.customer.phone,
        } : null,
        tariffName: job.tariff?.name,
        vehicleType: job.vehicleType,
        createdAt: job.createdAt,
        queuedAt: prefs.queuedAt,
      },
    });
    
  } catch (error) {
    console.error('❌ [JobQueue] Failed to fetch queued job:', error);
    res.status(500).json({ error: 'Failed to fetch queued job' });
  }
});

/**
 * @route POST /api/mobile/driver/jobs/:jobId/claim
 * @desc Claim/accept a job (used when starting queued job)
 * @access Private (Driver only)
 */
router.post('/jobs/:jobId/claim', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    const { jobId } = req.params;
    const { autoStart } = req.body;
    
    console.log(`🚀 [JobQueue] Driver ${driverId} claiming job ${jobId} (autoStart: ${autoStart})`);
    
    // Get driver info
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { 
        id: true, 
        firstName: true, 
        lastName: true, 
        companyId: true,
        preferences: true,
      },
    });
    
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    // Verify the job exists and is available
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.companyId !== driver.companyId) {
      return res.status(403).json({ error: 'Job belongs to a different company' });
    }
    
    if (job.status !== 'PENDING' && job.status !== 'UNASSIGNED') {
      return res.status(400).json({ 
        error: 'Job is no longer available for claiming',
        currentStatus: job.status,
      });
    }
    
    if (job.assignedDriverId && job.assignedDriverId !== driverId) {
      return res.status(400).json({ 
        error: 'Job is already assigned to another driver',
      });
    }
    
    // Update job status and assign driver
    const newStatus = autoStart ? 'ON_THE_WAY' : 'ASSIGNED';
    
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: newStatus,
        users_jobs_assignedDriverIdTousers: {
          connect: { id: driverId }
        },
        ...(autoStart ? { startedAt: new Date() } : {}),
      },
      include: {
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
    
    // Create or update assignment record (upsert to handle if already exists)
    const { v4: uuidv4 } = require('uuid');
    await prisma.assignments.upsert({
      where: {
        jobId_driverId: {
          jobId: jobId,
          driverId: driverId,
        },
      },
      update: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        id: uuidv4(),
        jobId: jobId,
        driverId: driverId,
        assignedBy: driverId, // Self-assigned by driver
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    }).catch(err => {
      console.warn('Failed to upsert assignment record:', err.message);
    });
    
    // Clear queued job from driver preferences if this was the queued job
    const prefs = driver.preferences || {};
    if (prefs.queuedJobId === jobId) {
      const updatedPrefs = { ...prefs };
      delete updatedPrefs.queuedJobId;
      delete updatedPrefs.queuedAt;
      delete updatedPrefs.queuedFromJobId;
      
      await prisma.user.update({
        where: { id: driverId },
        data: { preferences: updatedPrefs },
      });
    }
    
    // Emit socket event to notify dispatch using global namespace
    const dispatchNamespace = global.dispatchNamespace;
    if (dispatchNamespace) {
      dispatchNamespace.to(`company_${driver.companyId}`).emit('job:progress:updated', {
        jobId: jobId,
        internalJobId: jobId,
        status: newStatus,
        progressStatus: newStatus,
        driverId: driverId,
        driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
        timestamp: new Date().toISOString(),
      });
    }
    
    console.log(`✅ [JobQueue] Job ${jobId} claimed by driver ${driverId}, status: ${newStatus}`);
    
    res.json({
      success: true,
      job: {
        id: updatedJob.id,
        jobId: updatedJob.jobId,
        publicJobId: updatedJob.jobId,
        status: updatedJob.status,
        pickupAddress: updatedJob.pickupAddress,
        pickupLatitude: updatedJob.pickupLatitude,
        pickupLongitude: updatedJob.pickupLongitude,
        dropoffAddress: updatedJob.dropoffAddress,
        dropoffLatitude: updatedJob.dropoffLatitude,
        dropoffLongitude: updatedJob.dropoffLongitude,
        estimatedFare: updatedJob.estimatedPrice,
        fare: updatedJob.fare,
        customer: updatedJob.customer ? {
          id: updatedJob.customer.id,
          name: `${updatedJob.customer.firstName || ''} ${updatedJob.customer.lastName || ''}`.trim() || 'Customer',
          phone: updatedJob.customer.phone,
        } : null,
        tariff: updatedJob.tariff,
        tariffName: updatedJob.tariff?.name,
        vehicleType: updatedJob.vehicleType,
        createdAt: updatedJob.createdAt,
      },
    });
    
  } catch (error) {
    console.error('❌ [JobQueue] Failed to claim job:', error);
    res.status(500).json({ error: 'Failed to claim job' });
  }
});

module.exports = router;
