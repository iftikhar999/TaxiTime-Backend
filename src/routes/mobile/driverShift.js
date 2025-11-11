const express = require('express');
const { randomUUID } = require('crypto');
const { authenticateToken } = require('../../../middleware/auth');
const prisma = require('../../../lib/prisma');
// Using console.log for logging (logger utility not available)

const router = express.Router();

const buildShiftPayload = async (shift, driverId) => {
    if (!shift) return null;

    let stats = {
        totalEarnings: 0,
        totalRides: 0,
        averagePerRide: 0
    };

    try {
        // ✅ FIX: Use job table instead of ride table for consistency
        if (shift.startTime) {
            const jobs = await prisma.job.findMany({
                where: {
                    assignedDriverId: driverId,
                    status: 'COMPLETED',
                    updatedAt: {
                        gte: shift.startTime,
                        lte: new Date()
                    }
                },
                include: {
                    payments: {
                        where: {
                            status: { in: ['COMPLETED', 'PAID'] },
                        },
                        select: {
                            amount: true,
                            driverEarnings: true,
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                    rides: {
                        select: {
                            actualFare: true,
                            payments: {
                                where: {
                                    status: { in: ['COMPLETED', 'PAID'] },
                                },
                                select: {
                                    amount: true,
                                    driverEarnings: true,
                                },
                                orderBy: { createdAt: 'desc' },
                                take: 1,
                            },
                        },
                    },
                }
            });

            const totalRides = jobs.length;
            const totalEarnings = jobs.reduce((sum, job) => {
                const jobPayment = job.payments?.[0];
                const ridePayment = job.rides?.payments?.[0];
                const passengerTotal =
                    Number(jobPayment?.amount ?? 0) ||
                    Number(ridePayment?.amount ?? 0) ||
                    Number(job.actualFare ?? 0) ||
                    Number(job.rides?.actualFare ?? 0) ||
                    Number(job.estimatedPrice ?? 0);
                return sum + passengerTotal;
            }, 0);

            stats = {
                totalEarnings,
                totalRides,
                averagePerRide: totalRides > 0 ? totalEarnings / totalRides : 0
            };

            console.log(`📊 Shift stats calculated: ${totalRides} rides, $${totalEarnings.toFixed(2)} earnings`);
        }
    } catch (error) {
        console.warn('Failed to compute shift stats:', error?.message || error);
    }

    return {
        id: shift.id,
        startTime: shift.startTime,
        status: shift.status,
        duration: Math.floor((new Date() - shift.startTime) / 1000 / 60),
        startLocation: shift.startLocation,
        stats
    };
};

/**
 * @route   POST /api/mobile/driver/shift/heartbeat
 * @desc    💓 Native heartbeat from Android service
 * @access  Private (Driver only)
 */
router.post('/heartbeat', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { driverId, shiftId, timestamp, source } = req.body;
        
        console.log(`💓 Heartbeat received from ${source || 'native'} - Driver: ${userId}`);
        
        // Verify shift is active
        const shift = await prisma.shift.findFirst({
            where: {
                id: shiftId,
                driverId: userId,
                status: { in: ['ACTIVE', 'OFFLINE'] },
            },
        });
        
        if (!shift) {
            console.warn(`⚠️ Invalid shift for heartbeat: ${shiftId}`);
            return res.status(404).json({ error: 'Shift not found or ended' });
        }
        
        // Update shift last heartbeat time
        await prisma.shift.update({
            where: { id: shiftId },
            data: {
                lastHeartbeat: new Date(timestamp || Date.now()),
                status: 'ACTIVE',
            },
        });
        
        // Broadcast to dispatch
        const io = req.app.get('io');
        if (io) {
            const dispatchNamespace = io.of('/dispatch');
            dispatchNamespace.emit('driver:heartbeat', {
                driverId: userId,
                shiftId,
                timestamp: timestamp || Date.now(),
                source: source || 'native',
                status: 'ACTIVE',
            });
            
            console.log(`📡 Heartbeat broadcast to dispatch - Driver ${userId} is ACTIVE`);
        }
        
        res.json({
            success: true,
            message: 'Heartbeat received',
            shiftActive: true,
        });
        
    } catch (error) {
        console.error('❌ Heartbeat error:', error);
        res.status(500).json({
            error: 'Failed to process heartbeat',
            details: error.message,
        });
    }
});

/**
 * @route   POST /api/mobile/driver/shift/start
 * @desc    Start driver shift
 * @access  Private (Driver only)
 */
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { location, vehicleId, latitude, longitude } = req.body;

        // Handle location - support both location object and separate lat/lng
        let startLocation;
        if (location && location.latitude && location.longitude) {
            startLocation = location;
        } else if (latitude && longitude) {
            startLocation = { latitude, longitude };
        } else {
            return res.status(400).json({
                success: false,
                message: 'Location is required to start shift'
            });
        }

        // 🔥 CRITICAL CLEANUP: Auto-end any stale shifts (>24 hours old with no endTime)
        // This prevents orphaned ONLINE shifts from blocking new shift creation
        const staleShiftsThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const staleShifts = await prisma.shift.findMany({
            where: {
                driverId: userId,
                status: 'ONLINE',
                endTime: null,
                startTime: {
                    lt: staleShiftsThreshold
                }
            }
        });

        if (staleShifts.length > 0) {
            console.warn(`⚠️ Found ${staleShifts.length} stale shift(s) for driver ${userId} - auto-ending them`);
            for (const staleShift of staleShifts) {
                try {
                    await prisma.shift.update({
                        where: { id: staleShift.id },
                        data: {
                            endTime: new Date(),
                            status: 'OFFLINE',
                            endLocation: staleShift.startLocation // Use start location as fallback
                        }
                    });
                    console.log(`✅ Auto-ended stale shift: ${staleShift.id} (started: ${staleShift.startTime})`);
                } catch (error) {
                    console.error(`❌ Failed to auto-end stale shift ${staleShift.id}:`, error);
                }
            }
        }

        // Check if driver already has an active shift
        // ✅ CRITICAL FIX: Only consider shifts that are:
        //    1. Still ONLINE status
        //    2. Have no endTime (not ended)
        //    3. Started within last 24 hours (prevent stale shifts)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const existingShift = await prisma.shift.findFirst({
            where: {
                driverId: userId,
                status: 'ONLINE',
                endTime: null, // ✅ Must not be ended
                startTime: {
                    gte: twentyFourHoursAgo // ✅ Must be within last 24 hours
                }
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        if (existingShift) {
            console.log(`Driver ${userId} attempted to start shift but already active. Resuming existing shift.`);
            console.log(`   Existing shift ID: ${existingShift.id}, Started: ${existingShift.startTime}`);

            // Refresh current location snapshot
            if (prisma.locationUpdate?.create && startLocation?.latitude && startLocation?.longitude) {
                await prisma.locationUpdate.create({
                    data: {
                        driverId: userId,
                        latitude: startLocation.latitude,
                        longitude: startLocation.longitude,
                        accuracy: startLocation.accuracy || 0,
                        heading: startLocation.heading || 0,
                        speed: startLocation.speed || 0,
                        timestamp: new Date()
                    }
                });
            }

            const existingShiftWithVehicle = await prisma.shift.findUnique({
                where: { id: existingShift.id }
            });

            const resumedShift = await buildShiftPayload(existingShiftWithVehicle, userId);

            return res.json({
                success: true,
                message: 'Shift already active',
                data: {
                    alreadyActive: true,
                    shift: resumedShift,
                    driverStatus: 'AVAILABLE'
                }
            });
        }

        // Verify driver is active and has a company
        const driver = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                isActive: true,
                companyId: true,
                companies_users_companyIdTocompanies: {
                    select: {
                        id: true,
                        name: true,
                        brandName: true,
                        legalName: true,
                        status: true,
                        isActive: true
                    }
                }
            }
        });

        const driverCompany = driver?.companies_users_companyIdTocompanies ?? null;

        if (!driver || !driver.isActive || !driver.companyId || !driverCompany) {
            return res.status(400).json({
                success: false,
                message: 'Driver not authorized to start shift'
            });
        }

        // Verify vehicle if provided
        let vehicle = null;
        if (vehicleId) {
            vehicle = await prisma.vehicles.findFirst({
                where: {
                    id: vehicleId,
                    driverId: userId,
                    isActive: true
                }
            });

            if (!vehicle) {
                return res.status(400).json({
                    success: false,
                    message: 'Vehicle not found or not assigned to you'
                });
            }
        }

        // Create new shift
        const shiftId = randomUUID();
        const now = new Date();

        const shift = await prisma.shift.create({
            data: {
                id: shiftId,
                driverId: userId,
                companyId: driver.companyId,
                startTime: now,
                startLocation: startLocation,
                status: 'ONLINE',
                updatedAt: now
            }
        });

        // Create location update for driver
        try {
            await prisma.locationUpdate.create({
                data: {
                    driverId: userId,
                    latitude: startLocation.latitude,
                    longitude: startLocation.longitude,
                    accuracy: startLocation.accuracy || 0,
                    heading: startLocation.heading || 0,
                    speed: startLocation.speed || 0,
                    timestamp: new Date()
                }
            });
        } catch (locError) {
            console.warn('Failed to create location update:', locError.message);
        }

        // Update vehicle availability if provided
        if (vehicle) {
            try {
                await prisma.vehicles.update({
                    where: { id: vehicleId },
                    data: {
                        isAvailable: false  // Mark as in use
                    }
                });
            } catch (vehError) {
                console.warn('Failed to update vehicle:', vehError.message);
            }
        }

        console.log(`Driver shift started: ${userId} - Shift ID: ${shift.id}`);

        // Update queue management - driver is now AVAILABLE
        try {
            const queueService = req.queueManagementService;
            if (queueService && startLocation?.latitude && startLocation?.longitude) {
                await queueService.handleDriverStatusChange(userId, 'AVAILABLE');
                console.log(`✅ Queue management updated for driver ${userId} on shift start`);
            }
        } catch (queueError) {
            console.error('Queue management update failed on shift start:', queueError);
        }

        // Broadcast driver online event to dispatch portal
        const dispatchNamespace = req.dispatchNamespace || req.io?.of('/dispatch');
        if (dispatchNamespace) {
            const onlineEventData = {
                driverId: userId,
                companyId: driver.companyId,
                status: 'AVAILABLE',
                driverStatus: 'AVAILABLE',
                driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || undefined,
                timestamp: new Date().toISOString(),
                location: {
                    latitude: startLocation.latitude,
                    longitude: startLocation.longitude
                }
            };

            const rooms = [`dispatch_${driver.companyId}`, `company_${driver.companyId}`, 'super_admin'];

            // ✅ FIXED: Use standardized event name 'driver:online' (kebab-case)
            rooms.forEach((room) => {
                dispatchNamespace.to(room).emit('driver:online', onlineEventData);
            });

            // Also publish status update events so UI stays in sync without refresh
            const statusEvents = ['driver:status:update', 'driver:status:updated'];
            statusEvents.forEach((eventName) => {
                rooms.forEach((room) => {
                    dispatchNamespace.to(room).emit(eventName, onlineEventData);
                });
            });

            console.log(`📡 Driver online broadcasted: ${userId} (${driver.firstName || ''})`);
        }

        const shiftWithVehicle = await prisma.shift.findUnique({
            where: { id: shift.id }
        });

        const shiftPayload = await buildShiftPayload(shiftWithVehicle, userId);

        // Automatically refresh zones when shift starts
        let activeZones = [];
        try {
            const zones = await prisma.zone.findMany({
                where: {
                    companyId: driver.companyId,
                    isActive: true
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    boundaries: true,
                    surgeMultiplier: true,
                    isActive: true
                },
                orderBy: [
                    { type: 'asc' },
                    { name: 'asc' }
                ]
            });

            activeZones = zones.map(zone => ({
                id: zone.id,
                name: zone.name,
                type: zone.type,
                boundaries: zone.boundaries,
                surgeMultiplier: zone.surgeMultiplier ? Number.parseFloat(zone.surgeMultiplier.toString()) : 1,
                isActive: zone.isActive
            }));

            console.log(`🔄 Refreshed ${activeZones.length} active zones for driver ${userId} on shift start`);
        } catch (zoneError) {
            console.warn('Failed to load zones on shift start:', zoneError.message);
            // Don't fail shift start if zones can't be loaded
        }

        res.json({
            success: true,
            message: 'Shift started successfully',
            data: {
                shift: shiftPayload,
                driverStatus: 'AVAILABLE',
                activeZones: activeZones, // Include refreshed zones
                zonesRefreshedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Start shift error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error starting shift',
            error: process.env.NODE_ENV === 'development' ? error.toString() : undefined
        });
    }
});

/**
 * @route   POST /api/mobile/driver/shift/end
 * @desc    End driver shift
 * @access  Private (Driver only)
 */
router.post('/end', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { location, endOdometer, fuelLevel, notes } = req.body;

        if (!location || !location.latitude || !location.longitude) {
            return res.status(400).json({
                success: false,
                message: 'Location is required to end shift'
            });
        }

        // Find active shift - also check recent shifts in case endTime was already set
        let activeShift = await prisma.shift.findFirst({
            where: {
                driverId: userId,
                endTime: null
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        // If no active shift found, check if there's a very recent shift (within last minute)
        // This handles race conditions where shift was already ended
        if (!activeShift) {
            const oneMinuteAgo = new Date(Date.now() - 60000);
            activeShift = await prisma.shift.findFirst({
                where: {
                    driverId: userId,
                    endTime: {
                        gte: oneMinuteAgo
                    }
                },
                orderBy: {
                    endTime: 'desc'
                }
            });

            if (activeShift) {
                console.log(`⚠️ Shift ${activeShift.id} was already ended at ${activeShift.endTime}`);
                return res.json({
                    success: true,
                    message: 'Shift was already ended',
                    data: {
                        shift: {
                            id: activeShift.id,
                            endTime: activeShift.endTime,
                            totalEarnings: activeShift.totalEarnings || 0,
                            totalTrips: activeShift.totalTrips || 0
                        }
                    }
                });
            }
        }

        if (!activeShift) {
            return res.status(400).json({
                success: false,
                message: 'No active shift found'
            });
        }

        // Calculate shift duration
        const shiftDuration = Math.floor((new Date() - activeShift.startTime) / 1000 / 60); // minutes

        // Get shift earnings
        const shiftEarnings = await prisma.rides.aggregate({
            where: {
                driverId: userId,
                status: 'COMPLETED',
                completedAt: {
                    gte: activeShift.startTime,
                    lte: new Date()
                }
            },
            _sum: {
                actualFare: true
            },
            _count: {
                id: true
            }
        });

        // Update shift
        const updatedShift = await prisma.shift.update({
            where: { id: activeShift.id },
            data: {
                endTime: new Date(),
                endLocation: location,
                status: 'OFFLINE',
                totalEarnings: shiftEarnings._sum.actualFare || 0,
                totalTrips: shiftEarnings._count.id || 0
            }
        });

        console.log(`Driver shift ended: ${userId} - Shift ID: ${activeShift.id} - Duration: ${shiftDuration}min`);

        const companyId = updatedShift.companyId;
        const eventTimestamp = new Date().toISOString();

        // Update queue/zone memberships so driver disappears from dispatch queues
        const queueService = req.queueManagementService;
        if (queueService?.handleDriverStatusChange) {
            queueService
                .handleDriverStatusChange(userId, 'OFFLINE')
                .catch((queueError) =>
                    console.warn(
                        'Failed to sync queue on shift end:',
                        queueError?.message || queueError
                    )
                );
        } else {
            console.warn('⚠️  Queue management service not available for shift end');
        }

        // ✅ CRITICAL FIX: Notify BOTH dispatch AND driver mobile app
        
        // 1️⃣ Notify driver's mobile app (so it can sync state)
        const driverNamespace = req.driverNamespace || req.io?.of('/driver');
        if (driverNamespace) {
            try {
                const shiftEndedPayload = {
                    shiftId: updatedShift.id,
                    endTime: updatedShift.endTime,
                    duration: shiftDuration,
                    totalEarnings: updatedShift.totalEarnings,
                    totalTrips: updatedShift.totalTrips,
                    timestamp: eventTimestamp,
                };
                
                // Send to specific driver's socket
                driverNamespace.to(`driver:${userId}`).emit('shift:ended', shiftEndedPayload);
                console.log(`📱 Shift ended notification sent to driver: ${userId}`);
            } catch (driverEmitError) {
                console.error('Failed to notify driver mobile app:', driverEmitError?.message || driverEmitError);
            }
        } else {
            console.error('❌ Driver namespace not available for shift end notification');
        }
        
        // 2️⃣ Broadcast driver offline notification to dispatch UI
        const dispatchNamespace = req.dispatchNamespace || req.io?.of('/dispatch');
        if (dispatchNamespace) {
            try {
                const driverOfflinePayload = {
                    driverId: userId,
                    companyId,
                    shiftId: updatedShift.id,
                    status: 'OFFLINE',
                    driverStatus: 'OFFLINE',
                    timestamp: eventTimestamp,
                };

                const rooms = ['super_admin'];
                if (companyId) {
                    rooms.push(`dispatch_${companyId}`, `company_${companyId}`);
                }

                rooms.forEach((room) => {
                    dispatchNamespace.to(room).emit('driverOffline', driverOfflinePayload);
                });

                const statusEvents = ['driver:status:update', 'driver:status:updated'];
                statusEvents.forEach((eventName) => {
                    rooms.forEach((room) => {
                        dispatchNamespace.to(room).emit(eventName, driverOfflinePayload);
                    });
                });

                console.log(`📡 Driver offline broadcasted to dispatch: ${userId} to company ${companyId}`);
            } catch (emitError) {
                console.error('Failed to broadcast driver offline event:', emitError?.message || emitError);
            }
        } else {
            console.error('❌ Dispatch namespace not available for shift end broadcast');
        }

        res.json({
            success: true,
            message: 'Shift ended successfully',
            data: {
                shift: {
                    id: updatedShift.id,
                    startTime: updatedShift.startTime,
                    endTime: updatedShift.endTime,
                    duration: shiftDuration,
                    totalEarnings: updatedShift.totalEarnings,
                    totalTrips: updatedShift.totalTrips,
                    status: updatedShift.status
                },
                driverStatus: 'OFFLINE'
            }
        });

    } catch (error) {
        console.error('End shift error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error ending shift'
        });
    }
});

/**
 * @route   GET /api/mobile/driver/shift/current
 * @desc    Get current active shift
 * @access  Private (Driver only)
 */
router.get('/current', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User ID is required'
            });
        }

        console.log(`🔍 [Shift Current] Fetching active shift for driver: ${userId}`);

        // ✅ FIX: Include OFFLINE shifts (driver may have disconnected but shift is still active)
        const activeShift = await prisma.shift.findFirst({
            where: {
                driverId: userId,
                endTime: null,
                status: {
                    in: ['ONLINE', 'BUSY', 'BREAK', 'OFFLINE'] // ✅ ADDED: Include OFFLINE shifts
                }
            },
            orderBy: {
                startTime: 'desc'
            }
        }).catch(err => {
            console.error('❌ [Shift Current] Database query error:', err);
            throw new Error('Failed to query active shift from database');
        });

        if (!activeShift) {
            // 🔍 DIAGNOSTIC: Check if driver has ANY shift (regardless of status)
            const anyShift = await prisma.shift.findFirst({
                where: {
                    driverId: userId,
                    endTime: null,
                },
                orderBy: {
                    startTime: 'desc'
                }
            }).catch(err => {
                console.warn('⚠️ [Shift Current] Diagnostic query failed:', err);
                return null;
            });
            
            if (anyShift) {
                console.warn(`⚠️ [Shift Current] Shift status mismatch for driver ${userId}:`);
                console.warn(`   Shift ID: ${anyShift.id}`);
                console.warn(`   Current status: ${anyShift.status}`);
                console.warn(`   Expected status: ONLINE, BUSY, BREAK, or OFFLINE`);
                console.warn(`   ❌ This shift exists but won't sync to mobile app!`);
            } else {
                console.log(`✅ [Shift Current] No active shift found for driver ${userId}`);
            }
            
            return res.json({
                success: true,
                data: {
                    hasActiveShift: false,
                    shift: null
                }
            });
        }

        console.log(`✅ [Shift Current] Found active shift: ${activeShift.id}, status: ${activeShift.status}`);

        const shiftPayload = await buildShiftPayload(activeShift, userId).catch(err => {
            console.error('❌ [Shift Current] Error building shift payload:', err);
            throw new Error('Failed to build shift data');
        });

        if (!shiftPayload) {
            console.error('❌ [Shift Current] buildShiftPayload returned null');
            throw new Error('Invalid shift payload generated');
        }

        res.json({
            success: true,
            data: {
                hasActiveShift: true,
                shift: shiftPayload
            }
        });

    } catch (error) {
        console.error('❌ [Shift Current] Fatal error:', error);
        console.error('   User:', req.user?.userId);
        console.error('   Error details:', error.message);
        console.error('   Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Server error fetching current shift. Please try again.',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                type: error.constructor.name
            } : undefined
        });
    }
});

/**
 * @route   GET /api/mobile/driver/shift/history
 * @desc    Get driver shift history
 * @access  Private (Driver only)
 */
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 20, startDate, endDate } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClause = {
            driverId: userId,
            status: 'OFFLINE',
            endTime: { not: null }
        };

        if (startDate && endDate) {
            whereClause.startTime = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const [shifts, totalCount] = await Promise.all([
            prisma.shift.findMany({
                where: whereClause,
                orderBy: {
                    startTime: 'desc'
                },
                skip: offset,
                take: parseInt(limit)
            }),
            prisma.shift.count({ where: whereClause })
        ]);

        const formattedShifts = shifts.map(shift => {
            const duration = shift.endTime
                ? Math.floor((new Date(shift.endTime) - new Date(shift.startTime)) / 1000 / 60)
                : 0;
            return {
                id: shift.id,
                startTime: shift.startTime,
                endTime: shift.endTime,
                duration: duration,
                totalEarnings: shift.totalEarnings,
                totalTrips: shift.totalTrips,
                averagePerRide: shift.totalTrips > 0 ? Number(shift.totalEarnings) / shift.totalTrips : 0
            };
        });

        res.json({
            success: true,
            data: {
                shifts: formattedShifts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    pages: Math.ceil(totalCount / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Get shift history error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching shift history'
        });
    }
});

/**
 * @route   PUT /api/mobile/driver/shift/status
 * @desc    Update driver availability status during shift
 * @access  Private (Driver only)
 */
router.put('/status', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { status } = req.body;

        const normalizedStatus = typeof status === 'string' ? status.toUpperCase() : '';
        const validStatuses = ['AVAILABLE', 'BUSY', 'AWAY'];

        if (!validStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be AVAILABLE, BUSY, or AWAY'
            });
        }

        // ✅ FIX: Check if driver has active shift (including OFFLINE status)
        // When the socket disconnects, the shift is marked as OFFLINE but NOT ended
        // This allows the driver to reconnect and resume their shift
        const activeShift = await prisma.shift.findFirst({
            where: {
                driverId: userId,
                endTime: null,
                status: {
                    in: ['ONLINE', 'BUSY', 'BREAK', 'OFFLINE'] // ✅ ADDED: Include OFFLINE shifts
                }
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        if (!activeShift) {
            return res.status(400).json({
                success: false,
                message: 'No active shift found'
            });
        }

        const shiftStatusMap = {
            AVAILABLE: 'ONLINE',
            BUSY: 'BUSY',
            AWAY: 'BREAK'
        };

        // Update the shift status in database
        await prisma.shift.update({
            where: { id: activeShift.id },
            data: {
                status: shiftStatusMap[normalizedStatus],
                updatedAt: new Date()
            }
        });

        // Update driver preferences for dispatch sync
        const driver = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                preferences: true,
                companyId: true,
                firstName: true,
                lastName: true
            }
        });

        if (!driver?.companyId) {
            return res.status(400).json({
                success: false,
                message: 'Driver company not found for status update'
            });
        }

        const safePreferences = driver.preferences && typeof driver.preferences === 'object'
            ? JSON.parse(JSON.stringify(driver.preferences))
            : {};

        await prisma.user.update({
            where: { id: userId },
            data: {
                preferences: {
                    ...safePreferences,
                    dispatch: {
                        ...safePreferences?.dispatch,
                        status: normalizedStatus,
                        lastStatusUpdate: new Date().toISOString()
                    }
                }
            }
        });

        console.log(`Driver status updated: ${userId} - Status: ${normalizedStatus}`);

        // Update queue membership based on new status
        try {
            const queueService = req.queueManagementService; // Use service from middleware
            if (queueService) {
                await queueService.handleDriverStatusChange(userId, normalizedStatus);
                console.log(`✅ Queue management updated for driver ${userId} -> ${normalizedStatus}`);
            } else {
                console.warn(`⚠️  Queue management service not available`);
            }
        } catch (queueError) {
            console.error('Queue management update failed:', queueError);
        }

        // Emit socket event to notify dispatch panel and other connected clients
        const dispatchNamespace = req.dispatchNamespace || req.io?.of('/dispatch');
        if (dispatchNamespace) {
            const eventData = {
                driverId: userId,
                companyId: driver.companyId,
                status: normalizedStatus,
                driverStatus: normalizedStatus,
                driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || undefined,
                timestamp: new Date().toISOString()
            };

            const rooms = [`dispatch_${driver.companyId}`, `company_${driver.companyId}`, 'super_admin'];
            const events = ['driver:status:update', 'driver:status:updated'];

            rooms.forEach((room) => {
                events.forEach((eventName) => {
                    dispatchNamespace.to(room).emit(eventName, eventData);
                });
            });

            // Also broadcast to owner panel
            const io = req.io;
            if (io) {
                io.of('owner').to(`company_${driver.companyId}`).emit('driver:status:updated', eventData);
            }

            console.log(
                `📡 Driver status broadcasted via socket: ${userId} (${driver.firstName || ''}) -> ${normalizedStatus}`
            );
            console.log(`   Rooms: ${rooms.join(', ')}`);
        } else {
            console.error(`❌ Socket namespaces not available - cannot broadcast status update for driver ${userId}`);
        }

        res.json({
            success: true,
            message: 'Status updated successfully',
            data: {
                status: status,
                updatedAt: new Date()
            }
        });

    } catch (error) {
        console.error('Update driver status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating status'
        });
    }
});

module.exports = router;
