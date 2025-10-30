const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();

const router = express.Router();

// Create new ride request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { pickup, destination, vehicleType = 'SEDAN', requirements } = req.body;

    const ride = await prisma.ride.create({
      data: {
        rideId: `RIDE_${Date.now()}`,
        passengerId: req.user.id,
        companyId: req.user.companyId,
        vehicleType,
        pickupLocation: pickup,
        dropoffLocation: destination,
        specialRequests: requirements,
        status: 'REQUESTED'
      }
    });

    // Trigger auto-dispatch if enabled for the company
    let dispatchResult = null;
    try {
      // Get auto-dispatch service from app locals (set in server.js)
      const autoDispatchService = req.app.locals.autoDispatchService || req.autoDispatchService;
      if (autoDispatchService) {
        dispatchResult = await autoDispatchService.dispatchRide(ride.id);
        console.log('Auto-dispatch result:', dispatchResult);
      }
    } catch (dispatchError) {
      console.error('Auto-dispatch error (continuing with manual dispatch):', dispatchError);
      // Continue even if auto-dispatch fails - ride can be manually assigned
    }

    res.status(201).json({
      success: true,
      message: dispatchResult?.success ? 'Ride requested and assigned to driver' : 'Ride requested successfully',
      data: ride,
      dispatch: dispatchResult
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user's rides
router.get('/my-rides', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const whereClause = {};

    if (req.user.role === 'CUSTOMER') {
      whereClause.passengerId = req.user.id;
    } else if (req.user.role === 'DRIVER') {
      whereClause.driverId = req.user.id;
    }

    if (status) {
      whereClause.status = status;
    }

    const rides = await prisma.ride.findMany({
      where: whereClause,
      include: {
        passenger: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        },
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await prisma.ride.count({ where: whereClause });

    res.json({
      success: true,
      data: rides,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      }
    });
  } catch (error) {
    console.error('Get rides error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;