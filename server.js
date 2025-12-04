const express = require('express');
const path = require('path');
const prisma = require('./lib/prisma');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// IMPORTANT: Initialize logger FIRST to override console methods globally
const logger = require('./utils/logger');

// Import services
const TrackingService = require('./services/trackingService');
const AutoDispatchService = require('./services/autoDispatchService');
const QueueManagementService = require('./services/queueManagementService');
const EarningsService = require('./services/earningsService');
const { initializeCronJobs, stopAllCronJobs } = require('./services/cronManager');

// ===== PERFORMANCE LOGGING & ANALYSIS =====
const { performanceLoggerMiddleware } = require('./middleware/performanceLogger');
const { createPrismaLoggingMiddleware } = require('./middleware/prismaLogger');

// Import enhanced status handlers
const enhancedDriverStatusHandlers = require('./socket-handlers/enhancedDriverStatusHandlers');

// Import status tracking service
const { logStatusChange, STATUS_SOURCES } = require('./services/driverStatusTrackingService');

const JOB_FLOW_V2_ENABLED = String(process.env.FEATURE_JOB_FLOW_V2 || '')
  .toLowerCase() === 'true';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URLS?.split(',') || ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "http://localhost:3004", "http://localhost:3005", "http://localhost:3006", "http://localhost:3007", "http://localhost:3008", "http://localhost:3009", "http://localhost:3010"],
    credentials: true
  }
});

// Initialize services
const trackingService = new TrackingService(io);
const autoDispatchService = new AutoDispatchService(io);
const queueManagementService = new QueueManagementService(io);
const earningsService = new EarningsService();

// Middleware
app.use(helmet());
app.use(compression());
// Configure CORS origins - Allow all origins for development/testing
// In production, set ALLOWED_ORIGINS environment variable to restrict
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || process.env.FRONTEND_URLS?.split(',') || null;
console.log('🔗 CORS Allowed Origins:', allowedOrigins || 'ALL (development mode)');

app.use(cors({
  origin: allowedOrigins ? allowedOrigins : true, // true = allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Rate limiting - Disabled for development
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== PERFORMANCE LOGGING MIDDLEWARE =====
app.use(performanceLoggerMiddleware);
console.log('📊 Performance logging enabled - API calls & DB queries will be tracked');

// Static assets (e.g. uploaded documents)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve vehicle icons
app.use('/shared/assets/vehicle-icons', express.static(path.join(__dirname, 'shared/assets/vehicle-icons')));

// Store Socket.IO instance in app for easy access
app.set('io', io);

// Add services to request object for easy access in routes
app.use((req, res, next) => {
  req.prisma = prisma;
  req.io = io;
  req.dispatchNamespace = dispatchNamespace;
  req.driverNamespace = driverNamespace;
  req.trackingService = trackingService;
  req.autoDispatchService = autoDispatchService;
  req.queueManagementService = queueManagementService;
  req.earningsService = earningsService;
  next();
});
// Also make services available via app.locals for route files
app.locals.autoDispatchService = autoDispatchService;
app.locals.queueManagementService = queueManagementService;

// Database connection
async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL database');
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error);
    process.exit(1);
  }
}

connectDatabase();

// Socket.io namespaces for different user types
const dispatchNamespace = io.of('/dispatch');
const customerNamespace = io.of('/customer');
const driverNamespace = io.of('/driver');

// Store namespaces globally for route access
global.dispatchNamespace = dispatchNamespace;
global.driverNamespace = driverNamespace;
global.customerNamespace = customerNamespace;

// Initialize earnings service with socket namespaces for real-time updates
earningsService.setSocketNamespaces(dispatchNamespace, driverNamespace);

// ===== DRIVER VIDEO STREAM MANAGEMENT =====
const videoSessions = new Map(); // jobId => session metadata

const getDispatchRoomName = (companyId) => (companyId ? `dispatch_${companyId}` : null);

const emitToDispatchListeners = (companyId, eventName, payload) => {
  const roomName = getDispatchRoomName(companyId);
  if (roomName) {
    dispatchNamespace.to(roomName).emit(eventName, payload);
  }
  dispatchNamespace.to('all_dispatchers').emit(eventName, payload);
};

const serializeVideoSession = (session) => ({
  jobId: session.jobId,
  driverId: session.driverId,
  companyId: session.companyId,
  startedAt: session.startedAt,
  offer: session.offer,
  viewerCount: session.viewers.size,
});

const updateVideoViewerCount = (session) => {
  const payload = {
    jobId: session.jobId,
    driverId: session.driverId,
    companyId: session.companyId,
    viewerCount: session.viewers.size,
  };
  emitToDispatchListeners(session.companyId, 'job:video:viewer-count', payload);
  driverNamespace.to(session.driverSocketId).emit('driver:video:viewer-count', payload);
};

const endVideoSession = (jobId, options = {}) => {
  const session = videoSessions.get(jobId);
  if (!session) {
    return null;
  }
  videoSessions.delete(jobId);

  const reason = options.reason || 'driver_stop';
  emitToDispatchListeners(session.companyId, 'job:video:stopped', {
    jobId: session.jobId,
    driverId: session.driverId,
    companyId: session.companyId,
    reason,
  });

  session.viewers.forEach((viewerMeta, viewerSocketId) => {
    dispatchNamespace.to(viewerSocketId).emit('job:video:stopped', {
      jobId: session.jobId,
      reason,
    });
  });

  if (options.notifyDriver !== false) {
    driverNamespace.to(session.driverSocketId).emit('driver:video:stop', {
      jobId: session.jobId,
      reason,
    });
  }

  session.viewers.clear();
  return session;
};

const removeViewerFromAllSessions = (socketId, reason = 'viewer_disconnected') => {
  videoSessions.forEach((session) => {
    if (session.viewers.delete(socketId)) {
      dispatchNamespace.to(socketId).emit('job:video:stopped', {
        jobId: session.jobId,
        reason,
      });
      updateVideoViewerCount(session);
    }
  });
};

const sendVideoOfferToDispatchers = (session, targetSocket = null) => {
  const payload = serializeVideoSession(session);
  if (targetSocket) {
    targetSocket.emit('job:video:offer', payload);
    return;
  }
  emitToDispatchListeners(session.companyId, 'job:video:offer', payload);
};

const forwardDriverCandidateToViewers = (session, candidatePayload) => {
  session.viewers.forEach((viewerMeta, viewerSocketId) => {
    dispatchNamespace.to(viewerSocketId).emit('job:video:driver-candidate', {
      jobId: session.jobId,
      driverId: session.driverId,
      companyId: session.companyId,
      candidate: candidatePayload,
    });
  });
};

// Dispatch namespace - for company dispatchers and admins
dispatchNamespace.on('connection', (socket) => {
  console.log('✅ Dispatcher connected:', socket.id);

  socket.on('authenticate', (data) => {
    // Store user info in socket for later use
    socket.userId = data.userId;
    socket.companyId = data.companyId;

    if (data.companyId) {
      socket.join(`dispatch_${data.companyId}`);
      console.log(`✅ Dispatcher ${socket.id} joined dispatch_${data.companyId}`);
      console.log(`   Total rooms for this socket:`, Array.from(socket.rooms));
      videoSessions.forEach((session) => {
        if (session.companyId === data.companyId) {
          sendVideoOfferToDispatchers(session, socket);
        }
      });
    } else {
      // Dispatchers without companyId join the all_dispatchers room
      socket.join('all_dispatchers');
      console.log(`✅ Dispatcher ${socket.id} joined all_dispatchers room`);
      videoSessions.forEach((session) => {
        sendVideoOfferToDispatchers(session, socket);
      });
    }
  });

  socket.on('joinCompany', (companyId) => {
    socket.join(`company_${companyId}`);
    console.log(`✅ Dispatcher joined company room: company_${companyId}`);
    console.log(`   Total rooms for this socket:`, Array.from(socket.rooms));
  });

  // Super Admin - join super admin room (sees all companies)
  socket.on('join_super_admin_room', async (data) => {
    try {
      const { userId } = data;

      // Verify user has SUPER_ADMIN role
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      if (user && user.role === 'SUPER_ADMIN') {
        socket.role = 'SUPER_ADMIN';
        socket.join('super_admin');
        console.log('👑 Super Admin joined super_admin room:', socket.id);

        // Send initial platform statistics
        const platformStats = await getPlatformStatistics();
        socket.emit('platform:stats', platformStats);

        // Send all online drivers across all companies
        const allOnlineDrivers = await getAllOnlineDrivers();
        socket.emit('all:online:drivers', allOnlineDrivers);

        // Send all active jobs across all companies
        const allActiveJobs = await getAllActiveJobs();
        socket.emit('all:active:jobs', allActiveJobs);
      } else {
        socket.emit('error', { message: 'Unauthorized: Super Admin access required' });
      }
    } catch (error) {
      console.error('Error joining super admin room:', error);
      socket.emit('error', { message: 'Failed to join super admin room' });
    }
  });

  // Super Admin - request platform statistics
  socket.on('request:platform:stats', async () => {
    try {
      if (socket.role !== 'SUPER_ADMIN') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const platformStats = await getPlatformStatistics();
      socket.emit('platform:stats', platformStats);
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      socket.emit('error', { message: 'Failed to fetch platform statistics' });
    }
  });

  // Super Admin - request all online drivers
  socket.on('request:all:online:drivers', async () => {
    try {
      if (socket.role !== 'SUPER_ADMIN') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const allOnlineDrivers = await getAllOnlineDrivers();
      socket.emit('all:online:drivers', allOnlineDrivers);
    } catch (error) {
      console.error('Error fetching all online drivers:', error);
      socket.emit('error', { message: 'Failed to fetch online drivers' });
    }
  });

  // Super Admin - request all active jobs
  socket.on('request:all:active:jobs', async () => {
    try {
      if (socket.role !== 'SUPER_ADMIN') {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      const allActiveJobs = await getAllActiveJobs();
      socket.emit('all:active:jobs', allActiveJobs);
    } catch (error) {
      console.error('Error fetching all active jobs:', error);
      socket.emit('error', { message: 'Failed to fetch active jobs' });
    }
  });

  socket.on('assignJob', async (data) => {
    try {
      const { jobId, driverId } = data;
      const payload = {
        jobId,
        message: 'New job assigned by dispatch',
        dispatchedBy: socket.userId || null,
      };

      driverNamespace.to(`driver_${driverId}`).emit('job_assigned', payload);

      if (JOB_FLOW_V2_ENABLED) {
        driverNamespace.to(`driver_${driverId}`).emit('jobAssigned', payload);
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to assign job' });
    }
  });

  // Request driver status
  socket.on('request:driver:status', (data) => {
    console.log('📡 Requesting driver status:', data.driverId);

    // Forward request to specific driver
    driverNamespace.to(`driver_${data.driverId}`).emit('dispatcher:request:status', {
      requestId: data.requestId,
      dispatcherId: socket.userId
    });
  });

  // Request all online drivers
  socket.on('request:online:drivers', async () => {
    try {
      const onlineDrivers = await prisma.shift.findMany({
        where: {
          endTime: null,
          status: 'ONLINE',
          companyId: socket.companyId
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true
            }
          }
        }
      });

      socket.emit('online:drivers:list', onlineDrivers);
    } catch (error) {
      console.error('Error fetching online drivers:', error);
      socket.emit('error', { message: 'Failed to fetch online drivers' });
    }
  });

  const canViewVideoSession = (session) => {
    if (!session) {
      return false;
    }
    if (!session.companyId) {
      return true;
    }
    if (socket.companyId && socket.companyId === session.companyId) {
      return true;
    }
    return socket.role === 'SUPER_ADMIN';
  };

  socket.on('dispatch:video:answer', (payload = {}) => {
    try {
      const { jobId, answer } = payload;
      if (!jobId || !answer) {
        return;
      }
      const session = videoSessions.get(jobId);
      if (!session || !canViewVideoSession(session)) {
        socket.emit('job:video:error', {
          jobId,
          message: 'Video stream not available for this job',
        });
        return;
      }

      session.viewers.set(socket.id, {
        socketId: socket.id,
        userId: socket.userId,
        joinedAt: Date.now(),
      });

      driverNamespace.to(session.driverSocketId).emit('driver:video:answer', {
        jobId: session.jobId,
        driverId: session.driverId,
        answer,
        dispatcherId: socket.userId,
      });

      updateVideoViewerCount(session);
    } catch (error) {
      console.error('dispatch:video:answer error', error);
    }
  });

  socket.on('dispatch:video:ice', (payload = {}) => {
    try {
      const { jobId, candidate } = payload;
      if (!jobId || !candidate) {
        return;
      }
      const session = videoSessions.get(jobId);
      if (!session || !canViewVideoSession(session)) {
        return;
      }
      driverNamespace.to(session.driverSocketId).emit('driver:video:viewer-candidate', {
        jobId: session.jobId,
        driverId: session.driverId,
        candidate,
      });
    } catch (error) {
      console.error('dispatch:video:ice error', error);
    }
  });

  socket.on('dispatch:video:leave', (payload = {}) => {
    const { jobId } = payload;
    if (!jobId) {
      return;
    }
    const session = videoSessions.get(jobId);
    if (!session) {
      return;
    }
    if (session.viewers.delete(socket.id)) {
      updateVideoViewerCount(session);
    }
  });

  socket.on('disconnect', () => {
    console.log('Dispatcher disconnected:', socket.id);
    removeViewerFromAllSessions(socket.id);
  });
});

// Customer namespace - for passengers and customers
customerNamespace.on('connection', (socket) => {
  console.log('Customer connected:', socket.id);

  socket.on('authenticate', (data) => {
    socket.userId = data.userId;
    socket.companyId = data.companyId;
    socket.join(`customer_${data.userId}`);
  });

  socket.on('trackJob', (jobId) => {
    socket.join(`job_${jobId}`);
    console.log(`Customer tracking job: ${jobId}`);
  });

  socket.on('cancelJob', async (jobId) => {
    try {
      // Handle job cancellation
      socket.to(`job_${jobId}`).emit('jobCancelled', { jobId });
    } catch (error) {
      socket.emit('error', { message: 'Failed to cancel job' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Customer disconnected:', socket.id);
  });
});

// Driver namespace - for drivers
driverNamespace.on('connection', (socket) => {
  console.log('Driver connected:', socket.id);

  socket.on('authenticate', async (data) => {
    console.log(`🔐 Driver authenticating:`, { userId: data.userId, companyId: data.companyId, socketId: socket.id });
    
    socket.userId = data.userId;
    socket.companyId = data.companyId;
    socket.join(`driver_${data.userId}`);
    socket.join(`company:${data.companyId}`);

    console.log(`✅ Driver ${data.userId} joined rooms:`, {
      driverRoom: `driver_${data.userId}`,
      companyRoom: `company:${data.companyId}`,
      roomCount: socket.rooms.size,
      rooms: Array.from(socket.rooms)
    });

    // Initialize enhanced status handlers for this driver
    if (data.userId && data.companyId) {
      enhancedDriverStatusHandlers(io, socket, data.userId, data.companyId, queueManagementService);
      console.log(`✅ Enhanced status handlers initialized for driver ${data.userId}`);
      
      // ✨ NEW: Fetch driver data and broadcast to dispatch portal
      try {
        if (!prisma) {
          console.error('❌ Prisma client not available - cannot broadcast driver online status');
          return;
        }

        // ✅ FIX: User model doesn't have 'driver' relation - User IS the driver
        const user = await prisma.user.findUnique({
          where: { id: data.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            preferences: true,
            companies_users_companyIdTocompanies: {
              select: {
                id: true,
                legalName: true,
                brandName: true,
              },
            },
          },
        });

        if (!user) {
          console.warn(`⚠️ User not found in database: ${data.userId}`);
          return;
        }

        const company = user.companies_users_companyIdTocompanies;
        if (!company) {
          console.warn(`⚠️ Driver not linked to a company: ${data.userId}`);
          return;
        }

        // Get current shift
        console.log(`🔍 Searching for active shift: driverId=${data.userId}, endTime=null`);
        const currentShift = await prisma.shift.findFirst({
        where: {
            driverId: data.userId,
          endTime: null,
        },
          orderBy: {
            startTime: 'desc',
          },
        });
        
        console.log(`🔍 Shift query result:`, currentShift ? {
          id: currentShift.id,
          status: currentShift.status,
          startTime: currentShift.startTime,
          endTime: currentShift.endTime,
        } : 'NO SHIFT FOUND');

        if (user) {
          // ✅ FIX: No driver relation - get data from user and preferences
          const prefs = user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
          
          // ✅ CRITICAL FIX: Get driver's REAL-TIME location from location_updates table (NOT stale preferences)
          let lastLocation = {};
          try {
            const locationFromDb = await prisma.location_updates.findFirst({
              where: { driverId: user.id },
              orderBy: { timestamp: 'desc' },
              select: {
                latitude: true,
                longitude: true,
                heading: true,
                speed: true,
                altitude: true,
                accuracy: true,
                timestamp: true,
              },
            });
            
            if (locationFromDb) {
              lastLocation = {
                latitude: locationFromDb.latitude,
                longitude: locationFromDb.longitude,
                heading: locationFromDb.heading || 0,
                speed: locationFromDb.speed || 0,
                altitude: locationFromDb.altitude || 0,
                accuracy: locationFromDb.accuracy || 0,
                timestamp: locationFromDb.timestamp,
              };
              console.log(`📍 Driver ${user.id} location from DB: ${locationFromDb.latitude}, ${locationFromDb.longitude}`);
            } else {
              // Fallback to preferences if no location_updates exist (new drivers)
              lastLocation = prefs.lastLocation || prefs.currentLocation || {};
              console.warn(`⚠️ No location_updates found for driver ${user.id}, using preferences fallback`);
            }
          } catch (error) {
            console.error(`❌ Error fetching location for driver ${user.id}:`, error);
            lastLocation = prefs.lastLocation || prefs.currentLocation || {};
          }
          
          // ✅ IMPROVED: Build name from available fields with better fallback
          let driverName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          
          if (!driverName || driverName === '') {
            // Try to extract name from email
            if (user.email) {
              const emailName = user.email.split('@')[0].replace(/[._-]/g, ' ');
              driverName = emailName.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              console.log(`⚠️ Driver has no firstName/lastName, using email: ${driverName}`);
            } else {
              driverName = `Driver ${user.id.substring(0, 8)}`;
              console.log(`⚠️ Driver has no name or email, using ID: ${driverName}`);
            }
          }
          
          console.log(`👤 Driver authentication payload:`, {
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            computedName: driverName,
          });

          // ✅ DEBUG: Log complete preferences object
          console.log(`🔍 Driver preferences (raw):`, JSON.stringify(prefs, null, 2));

          // ✅ Fetch selected vehicle from preferences (mobile app syncs here)
          let selectedVehicle = null;
          const selectedVehicleId = prefs.selectedVehicleId || prefs.vehicleId;
          if (selectedVehicleId) {
            selectedVehicle = await prisma.vehicles.findUnique({
              where: { id: selectedVehicleId },
            });
            console.log(`🚗 Fetched vehicle: ${selectedVehicle?.plateNumber || 'NOT FOUND'} (ID: ${selectedVehicleId})`);
          } else {
            console.warn(`⚠️ No vehicle ID found in preferences - checking keys:`, Object.keys(prefs));
          }

          // ✅ Fetch selected tariff from preferences (mobile app syncs here)
          let selectedTariff = null;
          const selectedTariffId = prefs.selectedTariffId || prefs.tariffId;
          if (selectedTariffId) {
            selectedTariff = await prisma.tariffs.findUnique({
              where: { id: selectedTariffId },
            });
            console.log(`💰 Fetched tariff: ${selectedTariff?.name || 'NOT FOUND'} (ID: ${selectedTariffId})`);
          } else {
            console.warn(`⚠️ No tariff ID found in preferences`);
          }

          // ✅ NEW: Fetch active job for this driver
          let activeJob = null;
          const activeJobFromDb = await prisma.job.findFirst({
            where: {
              assignedDriverId: user.id,
              status: {
                // ✅ FIX: Removed 'PAUSED' and 'PENDING_PAYMENT' - not valid JobStatus enum values
                in: ['OFFERED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'ACTIVE', 'REACHED', 'IN_PROGRESS']
              },
            },
            include: {
              users_jobs_customerIdTousers: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
            orderBy: {
              updatedAt: 'desc',
            },
          });

          if (activeJobFromDb) {
            activeJob = {
              id: activeJobFromDb.id,
              jobId: activeJobFromDb.jobId,
              status: activeJobFromDb.status,
              pickupAddress: activeJobFromDb.pickupAddress,
              pickupLatitude: activeJobFromDb.pickupLatitude,
              pickupLongitude: activeJobFromDb.pickupLongitude,
              dropoffAddress: activeJobFromDb.dropoffAddress,
              dropoffLatitude: activeJobFromDb.dropoffLatitude,
              dropoffLongitude: activeJobFromDb.dropoffLongitude,
              estimatedPrice: activeJobFromDb.estimatedPrice,
              actualFare: activeJobFromDb.actualFare,
              createdAt: activeJobFromDb.createdAt,
              customer: activeJobFromDb.users_jobs_customerIdTousers ? {
                id: activeJobFromDb.users_jobs_customerIdTousers.id,
                name: `${activeJobFromDb.users_jobs_customerIdTousers.firstName || ''} ${activeJobFromDb.users_jobs_customerIdTousers.lastName || ''}`.trim() || activeJobFromDb.users_jobs_customerIdTousers.email,
                phone: activeJobFromDb.users_jobs_customerIdTousers.phone,
              } : null,
            };
            console.log(`✅ Found active job for driver: ${activeJobFromDb.id}, status: ${activeJobFromDb.status}`);
          }

          // ✅ NEW: Send complete driver state to mobile app
          socket.emit('driver:state:restored', {
            shift: currentShift ? {
              id: currentShift.id,
              status: currentShift.status,
              startTime: currentShift.startTime,
              vehicleId: currentShift.vehicleId,
              tariffId: currentShift.tariffId,
            } : null,
            vehicle: selectedVehicle ? {
              id: selectedVehicle.id,
              plateNumber: selectedVehicle.plateNumber,
              make: selectedVehicle.make,
              model: selectedVehicle.model,
              year: selectedVehicle.year,
              type: selectedVehicle.vehicleType || null,
              color: selectedVehicle.color,
            } : null,
            tariff: selectedTariff ? {
              id: selectedTariff.id,
              name: selectedTariff.name,
              baseFare: selectedTariff.baseFare,
              perKmRate: selectedTariff.perKmRate,
              perMinuteRate: selectedTariff.perMinuteRate,
              perMinRate: selectedTariff.perMinuteRate,
              waitingFee: selectedTariff.waitingFee,
              waitingRate: selectedTariff.waitingFee,
            } : null,
            job: activeJob,
          });

          console.log(`🔄 Driver state restored and sent to mobile app:`, {
            hasShift: !!currentShift,
            hasVehicle: !!selectedVehicle,
            hasTariff: !!selectedTariff,
            hasJob: !!activeJob,
          });
          
          // ✅ CRITICAL FIX: Determine driver status based on active job
          // If driver has active job, they MUST be BUSY (not AVAILABLE)
          let driverStatus = prefs.driverStatus || 'AVAILABLE';
          if (activeJob) {
            driverStatus = 'BUSY';
            console.log(`⚠️ Driver has active job (${activeJob.id}) - forcing status to BUSY`);
            
            // Update preferences JSON field to match reality
            const updatedPrefs = { ...prefs, driverStatus: 'BUSY' };
            await prisma.user.update({
              where: { id: user.id },
              data: { preferences: updatedPrefs },
            });
          }
          
          // Build driver payload for dispatch
          const driverPayload = {
            id: user.id,
            name: driverName,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            status: driverStatus,
            vehicle: selectedVehicle ? {
              id: selectedVehicle.id,
              plateNumber: selectedVehicle.plateNumber,
              make: selectedVehicle.make,
              model: selectedVehicle.model,
              type: selectedVehicle.vehicleTypeMaster?.name,
              typeName: selectedVehicle.vehicleTypeMaster?.name,
              icon: selectedVehicle.vehicleTypeMaster?.icon,
            } : null,
            zoneId: prefs.currentZoneId || null,
            currentJobId: activeJob?.id || null,
            position: lastLocation.latitude && lastLocation.longitude ? {
              latitude: lastLocation.latitude,
              longitude: lastLocation.longitude,
              heading: lastLocation.heading || 0,
            } : null,
            locationUpdatedAt: lastLocation.timestamp || prefs.lastLocationUpdateAt,
            rating: user.rating || null,
            isOnline: !!currentShift,
            appState: prefs.appState || 'ACTIVE',
            isMinimized: prefs.appState === 'BACKGROUND',
            isForeground: prefs.appState === 'ACTIVE',
            appStateUpdatedAt: prefs.appStateUpdatedAt,
          };

          // ✅ Broadcast driver online to dispatch portal
          const rooms = [`dispatch_${data.companyId}`, `company_${data.companyId}`, 'super_admin'];
          
          console.log(`📡 Broadcasting driver online to rooms:`, rooms);
          console.log(`📡 Dispatch namespace sockets count:`, dispatchNamespace.sockets.size);
          console.log(`📡 Driver payload:`, {
            id: driverPayload.id,
            name: driverPayload.name,
            status: driverPayload.status,
            hasVehicle: !!driverPayload.vehicle,
            hasPosition: !!driverPayload.position,
            currentJobId: driverPayload.currentJobId,
          });
          
          rooms.forEach((room) => {
            const roomSockets = dispatchNamespace.adapter.rooms.get(room);
            console.log(`📡 Room "${room}" has ${roomSockets?.size || 0} connected sockets`);
            
            dispatchNamespace.to(room).emit('driver:online', driverPayload);
            dispatchNamespace.to(room).emit('driver:status:update', {
              driverId: user.id,
              companyId: data.companyId,
              status: driverStatus,
              timestamp: new Date().toISOString(),
              ...driverPayload,
            });
          });
          
          console.log(`✅ Driver online status broadcasted to dispatch: ${user.id}`);
          console.log(`   Driver status: ${driverStatus}`);
          console.log(`   Has active shift: ${!!currentShift}`);
          console.log(`   Has selected vehicle: ${!!selectedVehicle}`);
          console.log(`   Has selected tariff: ${!!selectedTariff}`);
          console.log(`   Has active job: ${!!activeJob}`);
        }
    } catch (error) {
        console.error(`❌ Error broadcasting driver online status:`, error);
        console.error(`❌ Error details:`, {
          message: error.message,
          stack: error.stack,
          hasPrisma: !!prisma,
          hasDriver: !!(prisma && prisma.driver),
          userId: data.userId,
          companyId: data.companyId,
        });
          }
        }
      });

  // ❌ DEPRECATED: 'goOnline' event (Use driver:status:update instead)
  // This handler is commented out as part of the 2025-10-28 refactoring.
  // Modern clients should use 'driver:status:update' with status='AVAILABLE'
  // Or use the HTTP endpoint: POST /api/mobile/driver/shift/start
  // This handler may be removed completely in a future release.
  /*
  socket.on('goOnline', async (driverId) => {
    // ... legacy implementation removed for clarity ...
    // See git history if you need to restore this temporarily
  });
  */

  // ❌ DEPRECATED: 'goOffline' event (Use driver:status:update instead)
  // This handler is commented out as part of the 2025-10-28 refactoring.
  // Modern clients should use 'driver:status:update' with status='OFFLINE'
  // Or use the HTTP endpoint: POST /api/mobile/driver/shift/end
  // This handler may be removed completely in a future release.
  /*
  socket.on('goOffline', async (driverId) => {
    // ... legacy implementation removed for clarity ...
    // See git history if you need to restore this temporarily
  });
  */

  // ❌ DEPRECATED: 'locationUpdate' event (Use driver:location:update instead)
  // This handler is commented out as part of the 2025-10-28 refactoring.
  // Modern clients already use 'driver:location:update' (handled by enhancedDriverStatusHandlers.js)
  // This handler may be removed completely in a future release.
  /*
  socket.on('locationUpdate', async (data) => {
    // ... legacy implementation removed for clarity ...
    // See git history if you need to restore this temporarily
  });
  */

  socket.on('zoneStatus', async (payload = {}) => {
    try {
      if (!socket.userId) {
        return;
      }
      await queueManagementService.setDriverZoneFromClient(
        socket.userId,
        payload.zoneId ?? null
      );
    } catch (error) {
      console.error('Error processing driver zone status:', error);
    }
  });

  // ❌ DEPRECATED: 'acceptOffer' event (Use job:accept instead)
  // This handler is commented out as part of the 2025-10-28 refactoring.
  // Modern clients use 'job:accept' event (handled in server.js job:accept handler)
  // This handler may be removed completely in a future release.
  /*
  socket.on('acceptOffer', async (data) => {
    // ... legacy implementation removed for clarity ...
    // See git history if you need to restore this temporarily
  });
  */

  // ❌ DEPRECATED: 'rejectOffer' event (Use job:reject instead)
  // This handler is commented out as part of the 2025-10-28 refactoring.
  // Modern clients use 'job:reject' event (handled in server.js job:reject handler)
  // This handler may be removed completely in a future release.
  /*
  socket.on('rejectOffer', async (data) => {
    // ... legacy implementation removed for clarity ...
    // See git history if you need to restore this temporarily
  });
  */

  // ============================================
  // METER EVENTS - Real-time fare tracking
  // ============================================

  socket.on('meter:started', async (data) => {
    console.log('📊 Meter started:', data);

    try {
      // CRITICAL FIX: Automatically set driver to BUSY when meter starts
      if (socket.userId) {
        await prisma.user.update({
          where: { id: socket.userId },
          data: {
            status: 'BUSY',
            lastStatusUpdate: new Date()
          }
        });

        // Update queue membership - remove from available queue
        await queueManagementService.handleDriverStatusChange(socket.userId, 'BUSY');

        // Broadcast driver status change to dispatch
        const driverStatusPayload = {
          driverId: socket.userId,
          companyId: socket.companyId,
          status: 'BUSY',
          jobId: data.jobId,
          reason: 'meter_started',
          timestamp: new Date().toISOString()
        };

        dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
        dispatchNamespace.to(`company_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
        dispatchNamespace.to('super_admin').emit('driver:status:updated', driverStatusPayload);

        console.log(`✅ Driver ${socket.userId} automatically set to BUSY when meter started`);
      }
    } catch (error) {
      console.error('❌ Error updating driver status on meter start:', error);
    }

    const eventData = {
      ...data,
      driverId: socket.userId,
      companyId: socket.companyId,
      timestamp: new Date()
    };

    // Forward to dispatch
    dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('meter:started', eventData);

    // Forward to owner panel (same dispatch namespace, different room)
    dispatchNamespace.to(`company_${socket.companyId}`).emit('meter:started', eventData);

    // Forward to Super Admin - they see ALL platform events
    dispatchNamespace.to('super_admin').emit('meter:started', eventData);

    console.log(`Meter started for job ${data.jobId} by driver ${socket.userId}`);
  });

  socket.on('meter:update', (data) => {
    // Real-time meter updates (throttled to reduce load)
    // Only forward significant updates or every 10 seconds
    const eventData = {
      ...data,
      driverId: socket.userId,
      companyId: socket.companyId
    };

    dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('meter:update', eventData);

    dispatchNamespace.to(`company_${socket.companyId}`).emit('meter:update', eventData);

    // Forward to Super Admin - they see ALL platform events
    dispatchNamespace.to('super_admin').emit('meter:update', eventData);
  });

  socket.on('meter:stopped', async (data) => {
    console.log('🛑 Meter stopped:', data);

    try {
      // Save final meter data to database (if tripMeter table exists)
      // TODO: Uncomment when tripMeter model is added to Prisma schema
      /*
      await prisma.tripMeter.create({
        data: {
          jobId: data.jobId,
          driverId: socket.userId,
          totalFare: data.totalFare,
          distanceTraveled: data.distanceTraveled,
          elapsedTime: data.elapsedTime,
          waitingTime: data.waitingTime,
          baseFare: data.baseFare,
          distanceFare: data.distanceFare,
          timeFare: data.timeFare,
          waitingFare: data.waitingFare,
          surcharge: data.surcharge,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime)
        }
      });
      */

      const eventData = {
        ...data,
        driverId: socket.userId,
        companyId: socket.companyId,
        timestamp: new Date()
      };

      // Forward to all interested parties
      dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('meter:stopped', eventData);

      dispatchNamespace.to(`company_${socket.companyId}`).emit('meter:stopped', eventData);

      // Forward to Super Admin - they see ALL platform events
      dispatchNamespace.to('super_admin').emit('meter:stopped', eventData);

      // Notify customer with final fare
      if (data.jobId) {
        customerNamespace.to(`job_${data.jobId}`).emit('meter:stopped', {
          jobId: data.jobId,
          totalFare: data.totalFare,
          fareBreakdown: {
            base: data.baseFare,
            distance: data.distanceFare,
            time: data.timeFare,
            waiting: data.waitingFare,
            surcharge: data.surcharge
          }
        });
      }

      console.log(`Meter stopped for job ${data.jobId}: $${data.totalFare}`);
      socket.emit('meter:stopped:confirmed', { success: true });

    } catch (error) {
      console.error('Error saving meter data:', error);
      socket.emit('error', { message: 'Failed to save meter data' });
    }
  });

  // ============================================
  // PAYMENT EVENTS - Payment collection tracking
  // ============================================

  socket.on('payment:collected', async (data) => {
    console.log('💰 Payment collected:', data);

    try {
      const driverId = socket.userId;

      // 1. Find and update the payment record status to PAID
      const payment = await prisma.payments.findFirst({
        where: { 
          jobId: data.jobId,
          driverId: driverId
        },
        orderBy: { createdAt: 'desc' }
      });

      if (payment) {
        await prisma.payments.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paymentMethod: data.paymentMethod,
            amount: data.amount
          }
        });
        console.log(`✅ Payment ${payment.id} marked as PAID`);
      } else {
        console.warn(`⚠️ No payment record found for job ${data.jobId} and driver ${driverId}`);
      }

      // 2. Update job with payment info (keep existing behavior)
      const updatedJob = await prisma.job.update({
        where: { id: data.jobId },
        data: {
          paymentMethod: data.paymentMethod,
          finalAmount: data.amount,
          completedAt: new Date(),
          meterData: data.meterData ? JSON.stringify(data.meterData) : null
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferences: true
            }
          }
        }
      });

      // 3. Set driver to AVAILABLE now that payment is collected
      const currentPrefs = typeof updatedJob.driver?.preferences === 'object' 
        ? updatedJob.driver.preferences 
        : {};
      
      const dispatchPrefs = currentPrefs.dispatch && typeof currentPrefs.dispatch === 'object' 
        ? { ...currentPrefs.dispatch } 
        : {};
      dispatchPrefs.status = 'AVAILABLE';
      
      const updatedPrefs = {
        ...currentPrefs,
        driverStatus: 'AVAILABLE',
        lastStatusChange: new Date().toISOString(),
        dispatch: dispatchPrefs,
      };

      await prisma.user.update({
        where: { id: driverId },
        data: { preferences: updatedPrefs },
      });

      // 📝 Track status change - Job completed & payment collected
      await logStatusChange({
        driverId: driverId,
        previousStatus: 'ON_JOB',
        newStatus: 'AVAILABLE',
        source: STATUS_SOURCES.JOB_COMPLETE,
        triggeredBy: driverId,
        jobId: data.jobId,
        reason: 'Job completed and payment collected',
        metadata: {
          paymentAmount: data.amount,
          companyId: socket.companyId,
        },
      });

      console.log(`✅ Driver ${driverId} set to AVAILABLE after payment collected`);

      // 4. Broadcast driver status update to dispatch
      const driverStatusPayload = {
        driverId: driverId,
        status: 'AVAILABLE',
        timestamp: new Date().toISOString(),
        companyId: socket.companyId,
        currentJobId: null
      };

      dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
      dispatchNamespace.to(`company_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
      dispatchNamespace.to('super_admin').emit('driver:status:updated', driverStatusPayload);

      // 5. Broadcast payment collected event (keep existing behavior)
      const eventData = {
        ...data,
        driverId: driverId,
        companyId: socket.companyId,
        driverName: `${updatedJob.driver.firstName} ${updatedJob.driver.lastName}`,
        timestamp: new Date(),
        paymentStatus: 'PAID'
      };

      dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('payment:collected', eventData);
      dispatchNamespace.to(`company_${socket.companyId}`).emit('payment:collected', eventData);
      dispatchNamespace.to('super_admin').emit('payment:collected', eventData);

      // Notify customer payment verified
      customerNamespace.to(`job_${data.jobId}`).emit('payment:verified', {
        jobId: data.jobId,
        status: 'completed',
        amount: data.amount
      });

      console.log(`Payment collected for job ${data.jobId}: $${data.amount}`);
      socket.emit('payment:confirmed', { success: true, jobId: data.jobId });

    } catch (error) {
      console.error('Error processing payment:', error);
      socket.emit('payment:error', { message: 'Failed to process payment' });
    }
  });

  // ============================================
  // JOB ACCEPT/REJECT EVENTS - Manual assignment flow
  // ============================================

  socket.on('job:accept', async (data) => {
    console.log('✅ Driver accepting job:', data);

    try {
      const { jobId, driverId, acceptedAt } = data;
      const effectiveDriverId = driverId || socket.userId;

      if (!jobId || !effectiveDriverId) {
        socket.emit('job:accept:error', {
          success: false,
          message: 'Missing jobId or driverId',
        });
      return;
    }

      // Update job status to ASSIGNED
      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'ASSIGNED',
          updatedAt: new Date(),
        },
      });

      // Update assignment status
      await prisma.assignments.updateMany({
        where: {
          jobId,
          driverId: effectiveDriverId,
          status: 'OFFERED',
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: acceptedAt ? new Date(acceptedAt) : new Date(),
          updatedAt: new Date(),
        },
      });

      // Update offer status
      await prisma.offers.updateMany({
        where: {
          jobId,
          driverId: effectiveDriverId,
          status: 'SENT',
        },
        data: {
          status: 'ACCEPTED',
          response: 'ACCEPTED',
          respondedAt: acceptedAt ? new Date(acceptedAt) : new Date(),
        },
      });

      // Clear expiry timer
      if (jobService && typeof jobService.clearOfferExpiryTimer === 'function') {
        jobService.clearOfferExpiryTimer(jobId);
      }

      console.log(`✅ Job ${jobId} accepted by driver ${effectiveDriverId} - Status: ASSIGNED`);

      // Notify dispatcher
      const dispatchPayload = {
        jobId,
        internalJobId: updatedJob.id,
        driverId: effectiveDriverId,
        status: 'ASSIGNED',
        acceptedAt: acceptedAt || new Date().toISOString(),
        companyId: updatedJob.companyId,
      };

      dispatchNamespace
        .to(`dispatch_${updatedJob.companyId}`)
        .emit('job:accepted', dispatchPayload);

      dispatchNamespace
        .to(`company_${updatedJob.companyId}`)
        .emit('job:accepted', dispatchPayload);

      // Notify super admin
      dispatchNamespace
        .to('super_admin')
        .emit('job:accepted', dispatchPayload);

      // Confirm to driver
      socket.emit('job:accept:confirmed', {
        success: true,
        jobId,
        status: 'ASSIGNED',
      });

      console.log(`📢 Job acceptance notifications sent to dispatcher for company ${updatedJob.companyId}`);
    } catch (error) {
      console.error('❌ Error accepting job:', error);
      socket.emit('job:accept:error', {
        success: false,
        message: error.message || 'Failed to accept job',
      });
    }
  });

  socket.on('job:reject', async (data) => {
    console.log('🚫 Driver rejecting job:', data);

    try {
      const { jobId, driverId, reason, rejectedAt } = data;
      const effectiveDriverId = driverId || socket.userId;

      if (!jobId || !effectiveDriverId) {
        socket.emit('job:reject:error', {
          success: false,
          message: 'Missing jobId or driverId',
        });
        return;
      }

      // Update assignment status
      await prisma.assignments.updateMany({
        where: {
          jobId,
          driverId: effectiveDriverId,
          status: 'OFFERED',
        },
        data: {
          status: 'REJECTED',
          rejectedAt: rejectedAt ? new Date(rejectedAt) : new Date(),
          rejectionReason: reason || 'Driver rejected',
          updatedAt: new Date(),
        },
      });

      // Update offer status
      await prisma.offers.updateMany({
        where: {
          jobId,
          driverId: effectiveDriverId,
          status: 'SENT',
        },
        data: {
          status: 'REJECTED',
          response: 'REJECTED',
          respondedAt: rejectedAt ? new Date(rejectedAt) : new Date(),
        },
      });

      // Unassign driver - job goes back to UNASSIGNED
      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'UNASSIGNED',
          assignedDriverId: null,
          updatedAt: new Date(),
        },
      });

      // Clear expiry timer
      if (jobService && typeof jobService.clearOfferExpiryTimer === 'function') {
        jobService.clearOfferExpiryTimer(jobId);
      }

      console.log(`🚫 Job ${jobId} rejected by driver ${effectiveDriverId} - Status: UNASSIGNED`);

      // Notify dispatcher
      const dispatchPayload = {
        jobId,
        internalJobId: updatedJob.id,
        driverId: effectiveDriverId,
        status: 'UNASSIGNED',
        reason: reason || 'Driver rejected',
        rejectedAt: rejectedAt || new Date().toISOString(),
        companyId: updatedJob.companyId,
      };

      dispatchNamespace
        .to(`dispatch_${updatedJob.companyId}`)
        .emit('job:rejected', dispatchPayload);

      dispatchNamespace
        .to(`company_${updatedJob.companyId}`)
        .emit('job:rejected', dispatchPayload);

      // Notify super admin
      dispatchNamespace
        .to('super_admin')
        .emit('job:rejected', dispatchPayload);

      // Confirm to driver
      socket.emit('job:reject:confirmed', {
        success: true,
        jobId,
        status: 'UNASSIGNED',
      });

      console.log(`📢 Job rejection notifications sent to dispatcher for company ${updatedJob.companyId}`);
    } catch (error) {
      console.error('❌ Error rejecting job:', error);
      socket.emit('job:reject:error', {
        success: false,
        message: error.message || 'Failed to reject job',
      });
    }
  });

  // ============================================
  // JOB RECALL & NO_SHOW - Return job to UNASSIGNED
  // ============================================

  socket.on('job:progress:update', async (data) => {
    try {
      const { jobId, status, driverId, timestamp, location, reason, finalAmount, paymentMethod, completedAt } = data;
      const effectiveDriverId = driverId || socket.userId;

      if (!jobId || !status) {
        console.warn('⚠️ job:progress:update: Missing jobId or status', data);
        return;
      }

      console.log(`📊 Job progress update: ${jobId} → ${status}`, {
        finalAmount,
        paymentMethod,
        location: location ? { lat: location.latitude, lng: location.longitude } : 'none'
      });

      // ✅ NEW: Handle COMPLETED status - update drop-off location and final amount
      if (status === 'COMPLETED') {
        console.log(`🏁 Job ${jobId} COMPLETED - updating drop-off and final amount`);

        const updateData = {
          status: 'COMPLETED',
          updatedAt: new Date(),
        };

        // ✅ Add completedAt if provided
        if (completedAt) {
          updateData.completedAt = new Date(completedAt);
        }

        // ✅ Update drop-off location if provided
        if (location && location.latitude && location.longitude) {
          updateData.dropoffLatitude = location.latitude;
          updateData.dropoffLongitude = location.longitude;
          console.log(`📍 Updating drop-off location: ${location.latitude}, ${location.longitude}`);
        }

        // ✅ Update final amount if provided
        if (finalAmount !== undefined && finalAmount !== null) {
          updateData.actualFare = finalAmount;
          updateData.finalAmount = finalAmount;
          console.log(`💰 Updating final amount: $${finalAmount}`);
        }

        const updatedJob = await prisma.job.update({
          where: { id: jobId },
          data: updateData,
          select: {
            id: true,
            companyId: true,
            tripId: true,
          },
        });

        // ✅ NEW: Update corresponding Ride record if it exists
        if (updatedJob.tripId) {
          const rideUpdateData = {
            status: 'COMPLETED',
            completedAt: completedAt ? new Date(completedAt) : new Date(),
            updatedAt: new Date(),
          };

          // Update drop-off location in Ride destination
          if (location && location.latitude && location.longitude) {
            const existingRide = await prisma.rides.findUnique({
              where: { id: updatedJob.tripId },
              select: { destination: true }
            });

            // Parse existing destination JSON
            const destination = typeof existingRide?.destination === 'object' 
              ? existingRide.destination 
              : {};

            // Update with actual drop-off coordinates
            rideUpdateData.destination = {
              ...destination,
              latitude: location.latitude,
              longitude: location.longitude,
            };
          }

          // Update actualFare in Ride
          if (finalAmount !== undefined && finalAmount !== null) {
            rideUpdateData.actualFare = finalAmount;
          }

          await prisma.rides.update({
            where: { id: updatedJob.tripId },
            data: rideUpdateData,
          });

          console.log(`✅ Updated Ride ${updatedJob.tripId} with COMPLETED status`);
        }

        // ⚠️ CRITICAL: Driver stays BUSY until payment is collected
        // The payment:collected event will set driver to AVAILABLE
        // This prevents driver from appearing available while payment screen is showing
        const driverToUpdate = await prisma.user.findUnique({
          where: { id: effectiveDriverId },
          select: { preferences: true },
        });

        const currentPrefs = typeof driverToUpdate?.preferences === 'object' ? driverToUpdate.preferences : {};
        
        // Clear currentJobId but keep driver BUSY
        const dispatchPrefs = currentPrefs.dispatch && typeof currentPrefs.dispatch === 'object' 
          ? { ...currentPrefs.dispatch } 
          : {};
        dispatchPrefs.currentJobId = null; // Clear the completed job ID
        // dispatchPrefs.status remains unchanged (stays BUSY)
        
        const updatedPrefs = {
          ...currentPrefs,
          // driverStatus remains unchanged (stays BUSY until payment collected)
          dispatch: dispatchPrefs,
        };

        await prisma.user.update({
          where: { id: effectiveDriverId },
          data: {
            preferences: updatedPrefs,
          },
        });

        console.log(`✅ Job ${jobId} COMPLETED - driver ${effectiveDriverId} stays BUSY until payment collected (currentJobId cleared)`);


        // Notify dispatcher
        const dispatchPayload = {
          jobId,
          internalJobId: updatedJob.id,
          driverId: effectiveDriverId,
          status: 'COMPLETED',
          finalAmount,
          paymentMethod,
          dropOffLocation: location ? {
            latitude: location.latitude,
            longitude: location.longitude
          } : null,
          timestamp: timestamp || new Date().toISOString(),
          companyId: updatedJob.companyId,
        };

        const rooms = [
          `dispatch_${updatedJob.companyId}`,
          `company_${updatedJob.companyId}`,
          'super_admin',
        ];

        const jobPlain = JSON.parse(JSON.stringify(updatedJob));
        const jobUpdatePayload = {
          job: {
            ...jobPlain,
            fullRawData: jobPlain,
          },
        };

        const driverStatusPayload = {
          driverId: effectiveDriverId,
          status: 'AVAILABLE',
          timestamp: new Date().toISOString(),
        };

        rooms.forEach((room) => {
          dispatchNamespace.to(room).emit('job:completed', dispatchPayload);
          dispatchNamespace.to(room).emit('job:progress:updated', dispatchPayload);
          dispatchNamespace.to(room).emit('job:updated', jobUpdatePayload);
          dispatchNamespace.to(room).emit('job:data:updated', jobUpdatePayload);
          dispatchNamespace.to(room).emit('driver:status:updated', driverStatusPayload);
        });

        socket.emit('job:progress:success', {
          success: true,
          jobId,
          status: 'COMPLETED',
        });

        return; // ✅ Exit early after handling COMPLETED
      }

      // Handle NO_SHOW and RECALLED - return job to UNASSIGNED pool
      if (status === 'NO_SHOW' || status === 'RECALLED' || status === 'NOSHOW') {
        console.log(`🔄 ${status}: Returning job ${jobId} to UNASSIGNED pool`);

        // Normalize status name
        const normalizedStatus =
          status === 'NO_SHOW' || status === 'NOSHOW' ? 'NOSHOW' : 'RECALLED';
        const finalJobStatus = normalizedStatus === 'RECALLED' ? 'UNASSIGNED' : normalizedStatus;

        const updatedJob = await prisma.job.update({
          where: { id: jobId },
          data: {
            status: finalJobStatus, // ✅ 'UNASSIGNED' for recalled, NOSHOW otherwise
            assignedDriverId: null,
            updatedAt: new Date(),
          },
        });

        // Update assignment status
        // Note: assignments table has rejectedAt but not respondedAt
        await prisma.assignments.updateMany({
          where: {
            jobId,
            driverId: effectiveDriverId,
          },
          data: {
            status: status === 'NO_SHOW' || status === 'NOSHOW' ? 'NOSHOW' : 'RECALLED',
            rejectedAt: timestamp ? new Date(timestamp) : new Date(),
            updatedAt: new Date(),
          },
        });

        // ✅ FIXED: Fetch driver preferences, merge, clear currentJobId
        const driverForNoShow = await prisma.user.findUnique({
          where: { id: effectiveDriverId },
          select: { preferences: true },
        });

        const currentPrefsForNoShow = typeof driverForNoShow?.preferences === 'object' ? driverForNoShow.preferences : {};
        
        // ✅ FIXED: Also clear currentJobId from dispatch preferences
        const dispatchPrefsForNoShow = currentPrefsForNoShow.dispatch && typeof currentPrefsForNoShow.dispatch === 'object' 
          ? { ...currentPrefsForNoShow.dispatch } 
          : {};
        dispatchPrefsForNoShow.currentJobId = null; // Clear the job ID
        dispatchPrefsForNoShow.status = 'AVAILABLE'; // Update dispatch status
        
        const updatedPrefsForNoShow = {
          ...currentPrefsForNoShow,
          driverStatus: 'AVAILABLE',
          lastStatusChange: new Date().toISOString(),
          dispatch: dispatchPrefsForNoShow,
        };

        await prisma.user.update({
          where: { id: effectiveDriverId },
          data: { preferences: updatedPrefsForNoShow },
        });

        // 📝 Track status change - No-show/Recall
        await logStatusChange({
          driverId: effectiveDriverId,
          previousStatus: 'ON_JOB',
          newStatus: 'AVAILABLE',
          source: normalizedStatus === 'NOSHOW' ? STATUS_SOURCES.NO_SHOW : STATUS_SOURCES.JOB_RECALLED,
          triggeredBy: effectiveDriverId,
          jobId: jobId,
          reason: reason || `Job ${normalizedStatus} by driver`,
          metadata: {
            companyId: updatedJob.companyId,
            progressStatus: normalizedStatus,
          },
        });

        console.log(`✅ Job ${jobId} ${status} - returned to UNASSIGNED by driver ${effectiveDriverId} (preferences merged, currentJobId cleared)`);

        const dispatchPayload = {
          jobId,
          internalJobId: updatedJob.id,
          driverId: effectiveDriverId,
          status: finalJobStatus, // ✅ 'UNASSIGNED' for recall, 'NOSHOW' otherwise
          progressStatus: normalizedStatus,
          reason: reason || status,
          timestamp: timestamp || new Date().toISOString(),
          companyId: updatedJob.companyId,
        };

        const eventName = normalizedStatus === 'NOSHOW' ? 'job:noshow' : 'job:recalled';
        const rooms = [
          `dispatch_${updatedJob.companyId}`,
          `company_${updatedJob.companyId}`,
          'super_admin',
        ];

        const jobPlain = JSON.parse(JSON.stringify(updatedJob));
        const jobUpdatePayload = {
          job: {
            ...jobPlain,
            progressStatus: normalizedStatus,
            fullRawData: jobPlain,
          },
        };

        const driverStatusPayload = {
          driverId: effectiveDriverId,
          status: 'AVAILABLE',
          timestamp: new Date().toISOString(),
        };

        rooms.forEach((room) => {
          dispatchNamespace.to(room).emit(eventName, dispatchPayload);
          dispatchNamespace.to(room).emit('job:progress:updated', dispatchPayload);
          dispatchNamespace.to(room).emit('job:updated', jobUpdatePayload);
          dispatchNamespace.to(room).emit('job:data:updated', jobUpdatePayload);
          dispatchNamespace.to(room).emit('driver:status:updated', driverStatusPayload);
        });

        console.log(`✅ Driver ${effectiveDriverId} status updated to AVAILABLE`);

        socket.emit('job:progress:success', {
          success: true,
          jobId,
          status: finalJobStatus,
          progressStatus: normalizedStatus,
        });
      } else {
        // For other status updates, just broadcast (handled by existing job flow)
        dispatchNamespace
          .to(`dispatch_${socket.companyId}`)
          .emit('job:progress', data);
      }
    } catch (error) {
      console.error('❌ Error handling job progress update:', error);
      socket.emit('job:progress:error', {
        success: false,
        message: error.message || 'Failed to update job progress',
      });
    }
  });

  // ============================================
  // ❌ REMOVED: DUPLICATE HANDLER (Refactoring 2025-10-28)
  // ============================================
  // This 'driver:status:update' handler was a duplicate.
  // The authoritative handler is in: socket-handlers/enhancedDriverStatusHandlers.js
  // That handler provides better error handling, queue management, and status normalization.
  // If you need to modify driver status handling, edit enhancedDriverStatusHandlers.js instead.

  // ============================================
  // JOB COMPLETION - Enhanced with meter data
  // ============================================

  socket.on('job:completed', async (data) => {
    console.log('🎉 Job completed:', data);

    try {
      const completedJob = await prisma.job.update({
        where: { id: data.jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          finalAmount: data.totalAmount,
          meterData: data.meterData ? JSON.stringify(data.meterData) : null
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          passenger: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      // CRITICAL FIX: Automatically set driver to AVAILABLE after job completion
      if (socket.userId) {
        await prisma.user.update({
          where: { id: socket.userId },
          data: {
            status: 'AVAILABLE',
            lastStatusUpdate: new Date()
          }
        });

        // Update queue membership - add back to available queue
        await queueManagementService.handleDriverStatusChange(socket.userId, 'AVAILABLE');

        // Broadcast driver status change to dispatch
        const driverStatusPayload = {
          driverId: socket.userId,
          companyId: socket.companyId,
          status: 'AVAILABLE',
          reason: 'job_completed',
          timestamp: new Date().toISOString()
        };

        dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
        dispatchNamespace.to(`company_${socket.companyId}`).emit('driver:status:updated', driverStatusPayload);
        dispatchNamespace.to('super_admin').emit('driver:status:updated', driverStatusPayload);

        console.log(`✅ Driver ${socket.userId} automatically set to AVAILABLE after job completion`);
      }

      const eventData = {
        ...completedJob,
        companyId: socket.companyId
      };

      // Notify all parties
      dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('job_completed', eventData);

      dispatchNamespace.to(`company_${socket.companyId}`).emit('job_completed', eventData);

      // Forward to Super Admin - they see ALL platform events
      dispatchNamespace.to('super_admin').emit('job:completed', eventData);

      customerNamespace.to(`job_${data.jobId}`).emit('job_completed', {
        jobId: data.jobId,
        totalAmount: data.totalAmount,
        driver: completedJob.driver,
        meterData: data.meterData
      });

      socket.emit('job:completed:confirmed', { success: true });

    } catch (error) {
      console.error('Error completing job:', error);
      socket.emit('error', { message: 'Failed to complete job' });
    }
  });

  // ✨ NEW: Handle driver app state changes (foreground/background/inactive)
  socket.on('driver:app:state', async (data) => {
    try {
      const { driverId, appState, timestamp } = data;
      
      console.log(`📱 Driver app state change:`, {
        driverId,
        appState,
        socketId: socket.id,
        timestamp: new Date(timestamp).toISOString(),
      });

      // Validate app state
      const validStates = ['ACTIVE', 'BACKGROUND', 'INACTIVE'];
      if (!validStates.includes(appState)) {
        console.warn(`⚠️ Invalid app state received: ${appState}`);
        return;
      }

      // Store app state in driver's preferences for persistence
      const currentUser = await prisma.user.findUnique({
        where: { id: driverId },
        select: { preferences: true, companyId: true }
      });

      if (currentUser) {
        await prisma.user.update({
          where: { id: driverId },
          data: {
            preferences: {
              ...(currentUser?.preferences || {}),
              dispatch: {
                ...((currentUser?.preferences && currentUser.preferences.dispatch) || {}),
                appState: appState,
                appStateUpdatedAt: new Date().toISOString(),
              }
            }
          }
        });

        // Broadcast app state change to dispatch portal
        const appStatePayload = {
          driverId,
          companyId: currentUser.companyId || socket.companyId,
          appState,
          timestamp: new Date(timestamp).toISOString(),
          isMinimized: appState === 'BACKGROUND' || appState === 'INACTIVE',
          isForeground: appState === 'ACTIVE',
        };

        const rooms = [
          `dispatch_${currentUser.companyId || socket.companyId}`,
          `company_${currentUser.companyId || socket.companyId}`,
          'super_admin'
        ];

        rooms.forEach((room) => {
          dispatchNamespace.to(room).emit('driver:app:state:update', appStatePayload);
        });

        console.log(`📡 App state broadcasted to dispatch:`, {
          driverId,
          appState,
          rooms: rooms.join(', '),
        });

        // Log background transitions for monitoring
        if (appState === 'BACKGROUND') {
          console.log(`⚠️ Driver ${driverId} app moved to BACKGROUND - dispatcher notified`);
        } else if (appState === 'ACTIVE') {
          console.log(`✅ Driver ${driverId} app returned to FOREGROUND - dispatcher notified`);
        }
      } else {
        console.error(`❌ Driver not found: ${driverId}`);
      }

    } catch (error) {
      console.error('Error handling driver app state change:', error);
    }
  });

  socket.on('driver:video:offer', (payload = {}) => {
    try {
      const { jobId, offer, startedAt } = payload;
      if (!jobId || !offer || !socket.userId) {
        return;
      }

      if (videoSessions.has(jobId)) {
        endVideoSession(jobId, { notifyDriver: false, reason: 'driver_restart' });
      }

      const session = {
        jobId,
        driverId: socket.userId,
        companyId: socket.companyId,
        driverSocketId: socket.id,
        offer,
        startedAt: startedAt || new Date().toISOString(),
        viewers: new Map(),
      };

      videoSessions.set(jobId, session);
      sendVideoOfferToDispatchers(session);
      updateVideoViewerCount(session);
    } catch (error) {
      console.error('driver:video:offer error', error);
    }
  });

  socket.on('driver:video:ice', (payload = {}) => {
    try {
      const { jobId, candidate } = payload;
      if (!jobId || !candidate) {
        return;
      }
      const session = videoSessions.get(jobId);
      if (!session || session.driverSocketId !== socket.id) {
        return;
      }
      forwardDriverCandidateToViewers(session, candidate);
    } catch (error) {
      console.error('driver:video:ice error', error);
    }
  });

  socket.on('driver:video:stop', (payload = {}) => {
    const { jobId } = payload;
    if (!jobId) {
      return;
    }
    const session = videoSessions.get(jobId);
    if (!session || session.driverSocketId !== socket.id) {
      return;
    }
    endVideoSession(jobId, { notifyDriver: false, reason: payload.reason || 'driver_stop' });
  });

  socket.on('disconnect', async (reason) => {
    console.log(`🔴 Driver disconnected:`, {
      socketId: socket.id,
      userId: socket.userId,
      companyId: socket.companyId,
      reason: reason,
      timestamp: new Date().toISOString()
    });

    videoSessions.forEach((session) => {
      if (session.driverSocketId === socket.id) {
        endVideoSession(session.jobId, {
          notifyDriver: false,
          reason: 'driver_disconnected',
        });
      }
    });

    // Critical: Handle driver disconnect cleanup to prevent stale state
    if (socket.userId && socket.companyId) {
      try {
        console.log(`🔄 Processing disconnect cleanup for driver ${socket.userId}`);

        // 1. Mark driver as offline in database
        const currentUser = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { preferences: true }
        });

        await prisma.user.update({
          where: {
            id: socket.userId,
            role: 'DRIVER'
          },
          data: {
            preferences: {
              ...(currentUser?.preferences || {}),
              dispatch: {
                ...((currentUser?.preferences && currentUser.preferences.dispatch) || {}),
                status: 'OFFLINE',
                lastStatusUpdate: new Date().toISOString(),
                lastLocation: null // Clear location on disconnect
              }
            }
          }
        });

        // 2. Mark shift as offline (but DON'T end it - driver may reconnect)
        // ✅ FIX: Don't end shift on disconnect - only mark as offline
        // Driver app will persist shift and reconnect, we shouldn't end their shift
        await prisma.shift.updateMany({
          where: {
            driverId: socket.userId,
            endTime: null,
          },
          data: {
            status: 'OFFLINE', // Mark offline but keep shift active
            // ❌ REMOVED: endTime: new Date() - DON'T end the shift!
          }
        });
        
        console.log(`🔄 Driver ${socket.userId} shift marked offline (not ended)`);
        
        // ✅ Note: Shift will be ended when driver explicitly clicks "End Shift" button
        // or after a configurable timeout (e.g., 30 minutes of disconnect)

        // 3. Remove from all zone queues
        await queueManagementService.handleDriverStatusChange(socket.userId, 'OFFLINE');

        const eventData = {
          driverId: socket.userId,
          companyId: socket.companyId,
          timestamp: new Date(),
          reason: 'disconnect'
        };

        // 4. Broadcast driver offline to dispatch
        // ✅ FIXED: Use standardized 'driver:offline' (kebab-case) everywhere
        dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('driver:offline', eventData);
        dispatchNamespace.to(`company_${socket.companyId}`).emit('driver:offline', eventData);

        // 5. Forward to Super Admin
        dispatchNamespace.to('super_admin').emit('driver:offline', eventData);

        // 6. Broadcast enhanced driver status update
        const statusPayload = {
          driverId: socket.userId,
          companyId: socket.companyId,
          status: 'OFFLINE',
          reason: 'disconnect',
          location: null,
          timestamp: new Date().toISOString()
        };

        // Broadcast to dispatch and owner panels
        dispatchNamespace.to(`dispatch_${socket.companyId}`).emit('driver:status:updated', statusPayload);
        dispatchNamespace.to(`company_${socket.companyId}`).emit('driver:status:updated', statusPayload);

        console.log(`✅ Driver ${socket.userId} disconnect cleanup completed`);
        console.log(`📡 Broadcasted events:`, {
          'driver:offline': `dispatch_${socket.companyId}, company_${socket.companyId}, super_admin`,
          'driver:status:updated': `dispatch_${socket.companyId}, company_${socket.companyId}`,
          driverId: socket.userId,
          status: 'OFFLINE'
        });

      } catch (error) {
        console.error(`❌ Error in driver disconnect cleanup for ${socket.userId}:`, error);
      }
    }
  });
});

// Main namespace for legacy support
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Legacy handlers for backward compatibility
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  socket.on('ride-request', (data) => {
    io.to('drivers').emit('new-ride-request', data);
  });

  socket.on('ride-accepted', (data) => {
    io.to(`passenger-${data.passengerId}`).emit('ride-accepted', data);
  });

  socket.on('location-update', (data) => {
    socket.to(data.room).emit('location-update', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ==============================================
// SUPER ADMIN HELPER FUNCTIONS
// ==============================================

/**
 * Get platform-wide statistics across all companies
 */
async function getPlatformStatistics() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalCompanies,
      totalDrivers,
      totalActiveJobs,
      totalOnlineDrivers,
      completedToday,
      platformEarnings
    ] = await Promise.all([
      // Total companies
      prisma.companies.count({
        where: { status: 'ACTIVE' }
      }),

      // Total drivers across all companies
      prisma.user.count({
        where: {
          role: 'DRIVER',
          deletedAt: null
        }
      }),

      // Total active jobs across all companies
      prisma.job.count({
        where: {
          status: {
            in: ['ASSIGNED', 'IN_PROGRESS', 'ARRIVED']
          }
        }
      }),

      // Total online drivers across all companies
      prisma.shift.count({
        where: {
          endTime: null,
          status: {
            in: ['ONLINE', 'BUSY']
          }
        }
      }),

      // Completed jobs today across all companies
      prisma.job.count({
        where: {
          status: 'COMPLETED',
          updatedAt: {
            gte: startOfToday
          }
        }
      }),

      // Platform earnings today (all companies combined)
      prisma.job.aggregate({
        where: {
          status: 'COMPLETED',
          updatedAt: {
            gte: startOfToday
          }
        },
        _sum: {
          actualFare: true
        }
      })
    ]);

    return {
      totalCompanies,
      totalDrivers,
      totalActiveJobs,
      totalOnlineDrivers,
      totalCompletedToday: completedToday,
      platformEarningsToday: platformEarnings._sum.actualFare ? Number(platformEarnings._sum.actualFare) : 0,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting platform statistics:', error);
    return {
      totalCompanies: 0,
      totalDrivers: 0,
      totalActiveJobs: 0,
      totalOnlineDrivers: 0,
      totalCompletedToday: 0,
      platformEarningsToday: 0,
      error: 'Failed to fetch statistics'
    };
  }
}

/**
 * Get all online drivers across all companies
 */
async function getAllOnlineDrivers() {
  try {
    const onlineDrivers = await prisma.shift.findMany({
      where: {
        endTime: null,
        status: {
          in: ['ONLINE', 'BUSY']
        }
      },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            companyId: true,
            location_updates: {
              orderBy: [
                { timestamp: 'desc' },
                { createdAt: 'desc' }
              ],
              take: 1,
              select: {
                latitude: true,
                longitude: true,
                timestamp: true
              }
            },
            companies_users_companyIdTocompanies: {
              select: {
                id: true,
                legalName: true,
                brandName: true,
              }
            }
          }
        }
      },
      orderBy: {
        startTime: 'desc'
      }
    });

    return onlineDrivers.map(shift => {
      const lastLocation = shift.users.location_updates?.[0] || null;
      return {
        id: shift.users.id,
        firstName: shift.users.firstName,
        lastName: shift.users.lastName,
        phone: shift.users.phone,
        status: shift.status,
        companyId: shift.users.companyId,
        companyName:
          shift.users.companies_users_companyIdTocompanies?.brandName ||
          shift.users.companies_users_companyIdTocompanies?.legalName ||
          'Unknown',
        shiftStartTime: shift.startTime,
        location: lastLocation
          ? {
            latitude: lastLocation.latitude,
            longitude: lastLocation.longitude,
            timestamp: lastLocation.timestamp
              ? lastLocation.timestamp.toISOString()
              : null
          }
          : null
      };
    });
  } catch (error) {
    console.error('Error getting all online drivers:', error);
    return [];
  }
}

/**
 * Get all active jobs across all companies
 */
async function getAllActiveJobs() {
  try {
    const activeJobs = await prisma.job.findMany({
      where: {
        status: {
          in: ['ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
        }
      },
      include: {
        users_jobs_assignedDriverIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyId: true
          }
        },
        users_jobs_customerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        companies: {
          select: {
            id: true,
            name: true,
            legalName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return activeJobs.map(job => ({
      id: job.id,
      status: job.status,
      pickupLocation: job.pickupLocation,
      dropoffLocation: job.dropoffLocation,
      estimatedFare: job.estimatedFare,
      companyId: job.companyId,
      companyName: job.companies?.name || job.companies?.legalName || 'Unknown',
      driverId: job.assignedDriverId,
      driverName: job.users_jobs_assignedDriverIdTousers
        ? `${job.users_jobs_assignedDriverIdTousers.firstName} ${job.users_jobs_assignedDriverIdTousers.lastName}`
        : null,
      customerId: job.customerId,
      customerName: job.users_jobs_customerIdTousers
        ? `${job.users_jobs_customerIdTousers.firstName} ${job.users_jobs_customerIdTousers.lastName}`
        : null,
      createdAt: job.createdAt
    }));
  } catch (error) {
    console.error('Error getting all active jobs:', error);
    return [];
  }
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/rides', require('./routes/rides'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/dispatch', require('./routes/dispatch'));
app.use('/api/dispatch/payments', require('./routes/dispatch-payments'));
// *** NEW: Dispatch Zone Detection & Fare Calculation ***
app.use('/api/dispatch/zones', require('./routes/dispatch-zones'));
// *** Zone Management for Driver App - TEMPORARILY DISABLED ***
// app.use('/api', require('./routes/zones'));
// *** END NEW ***
app.use('/api/food-delivery', require('./routes/foodDelivery'));
app.use('/api/courier', require('./routes/courier'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/public', require('./routes/public'));
app.use('/api/dispatch-test', require('./routes/dispatch-test'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/configuration', require('./routes/configuration'));
app.use('/api/cron', require('./routes/cron')); // Cron job management

// ✅ Mobile Driver API Routes (NEW)
app.use('/api/mobile/driver', require('./routes/mobile/driver'));

// Owner Panel Routes
app.use('/api/owner', require('./routes/owner'));
app.use('/api/owner/vehicles', require('./routes/owner-vehicles'));

// Mobile API routes - MUST come before admin routes to prevent conflicts
app.use('/api/mobile', require('./src/routes/mobile'));
// Driver earnings API - MUST come before other mobile routes for priority
app.use('/api/mobile/driver/earnings', require('./src/routes/mobile/driverEarnings'));
// Company data endpoints (accessible by drivers) - MUST be before admin companies route
app.use('/api/companies', require('./src/routes/mobile/driverCompanyData'));
app.use('/api/owner/drivers', require('./routes/owner-drivers'));
app.use('/api/owner/company/documents', require('./routes/owner-documents'));
app.use('/api/owner/zones', require('./routes/owner-zones'));
app.use('/api/owner/zones-simplified', require('./routes/owner-zones-simplified'));
app.use('/api/owner/rides', require('./routes/owner-rides'));
app.use('/api/owner/tariffs', require('./routes/owner-tariffs'));
app.use('/api/owner/tariffs-simplified', require('./routes/owner-tariffs-simplified'));
// *** NEW: Tariff-Zone Refactored Routes ***
app.use('/api/owner/tariffs-v2', require('./routes/owner-tariffs-v2'));
app.use('/api/owner/map-settings', require('./routes/owner-map-settings'));
app.use('/api/owner/payments', require('./routes/owner-payments'));
// *** END NEW Routes ***
app.use('/api/owner/billing', require('./routes/owner-billing'));
app.use('/api/owner/reports', require('./routes/owner-reports'));
app.use('/api/owner/settings', require('./routes/owner-settings'));

// Admin Panel Routes - these come AFTER mobile/driver routes
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/users', require('./routes/admin-users'));
// Note: Admin companies routes should use /api/admin/companies in frontend
// Keeping this for backward compatibility but driver routes take precedence
app.use('/api/admin/companies', require('./routes/companies'));
app.use('/api/admin/jobs', require('./routes/admin-jobs'));
app.use('/api/admin/settings', require('./routes/admin-settings'));
app.use('/api/admin', require('./routes/admin-settings')); // Mount /system/info and /audit-logs at /api/admin
app.use('/api/admin/master-data', require('./routes/master-data'));
app.use('/api/admin/subscription-plans', require('./routes/admin-subscription-plans'));
app.use('/api/admin/billing', require('./routes/admin-billing'));
app.use('/api/reports', require('./routes/reports'));

// ===== PERFORMANCE CONFIGURATION & ANALYSIS (Super Admin) =====
app.use('/api/admin/performance', require('./routes/admin/performanceConfig'));
console.log('🎛️  Performance configuration API enabled at /api/admin/performance');

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
// const HOST = process.env.HOST || '127.0.0.1'; // Localhost only
const HOST = process.env.HOST || '0.0.0.0'; // Accept connections from network devices
module.exports = app;
module.exports.server = server;

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    
    // Initialize cron jobs after server starts
    // ⚠️ DISABLED: Cron jobs can cause state desync issues
    // console.log('⏰ Initializing cron jobs...');
    // initializeCronJobs(io);
    // console.log('✓ Cron jobs initialized successfully');
    console.log('⚠️  Cron jobs DISABLED for local development');
  });
}

// Graceful shutdown - handle all termination signals
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      console.log('✅ HTTP server closed');
    });
    
    // Stop cron jobs
    stopAllCronJobs();
    console.log('✅ Cron jobs stopped');
    
    // Disconnect all Socket.IO clients
    io.close(() => {
      console.log('✅ Socket.IO closed');
    });
    
    // Close Prisma connections
    await prisma.$disconnect();
    console.log('✅ Database connections closed');
    
    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('beforeExit', async () => {
  console.log('Process beforeExit event');
  await gracefulShutdown('beforeExit');
});

process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM');
});

process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT');
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection in production, just log it
  if (process.env.NODE_ENV !== 'production') {
    gracefulShutdown('unhandledRejection');
  }
});
