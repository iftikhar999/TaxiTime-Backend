const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Middleware: Require authentication for all routes
router.use(authenticateToken);

// GET /api/drivers/companies/active - Get list of active companies for driver creation
router.get('/companies/active', authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'), async (req, res) => {
  try {
    const companies = await prisma.companies.findMany({
      where: {
        isActive: true,
        isVerified: true,
        status: 'ACTIVE'
      },
      select: {
        id: true,
        legalName: true,
        brandName: true,
        name: true,
        companyCode: true,
        email: true,
        phone: true,
        address: true,
        logo: true,
        website: true,
        kycStatus: true,
        subscriptionPlanId: true,
        fleetSizeTotal: true,
        fleetActiveVehicleCount: true,
        serviceModes: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        _count: {
          select: {
            users: { where: { role: 'DRIVER', isActive: true } },
            vehicles: { where: { isActive: true } }
          }
        }
      },
      orderBy: [
        { legalName: 'asc' },
        { brandName: 'asc' }
      ]
    });

    const transformedCompanies = companies.map(company => ({
      id: company.id,
      name: company.legalName || company.brandName || company.name,
      displayName: `${company.legalName || company.brandName || company.name} (${company.companyCode || 'N/A'})`,
      companyCode: company.companyCode,
      email: company.email,
      phone: company.phone,
      logo: company.logo,
      website: company.website,
      kycStatus: company.kycStatus,
      serviceModes: company.serviceModes || { taxi: true },
      fleet: {
        total: company.fleetSizeTotal,
        active: company.fleetActiveVehicleCount
      },
      drivers: {
        active: company._count.users
      },
      vehicles: {
        active: company._count.vehicles
      },
      owner: company.owner
    }));

    res.json({
      success: true,
      data: transformedCompanies,
      meta: {
        total: transformedCompanies.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching active companies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active companies',
      details: error.message
    });
  }
});

// POST /api/drivers - Create new driver for a company
router.post('/', authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      companyId,
      licenseNumber,
      licenseExpiryDate,
      address,
      emergencyContact,
      vehicleInfo,
      documents
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !password || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['firstName', 'lastName', 'email', 'phone', 'password', 'companyId']
      });
    }

    // Verify company exists and is active
    const company = await prisma.companies.findFirst({
      where: {
        id: companyId,
        isActive: true,
        isVerified: true,
        status: 'ACTIVE'
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found or not active'
      });
    }

    // Check if user with email or phone already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone: phone }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email or phone already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create driver user with transaction
    const driver = await prisma.$transaction(async (tx) => {
      // Create user
      const newDriver = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone,
          password: hashedPassword,
          role: 'DRIVER',
          companyId,
          isActive: true,
          isVerified: false, // Will need verification
          address: address || null,
          preferences: {
            notifications: {
              jobOffers: true,
              statusUpdates: true,
              earnings: true
            },
            workPreferences: {
              maxRadius: 10,
              acceptanceRate: 85,
              autoAccept: false
            }
          }
        },
        include: {
          company: {
            select: {
              id: true,
              legalName: true,
              brandName: true,
              name: true,
              companyCode: true
            }
          }
        }
      });

      // Create CompanyDriver profile for enhanced tracking
      const companyDriverProfile = await tx.companyDriver.create({
        data: {
          companyId,
          userId: newDriver.id,
          employmentType: 'FULL_TIME', // Default
          hireDate: new Date(),
          licenseNumber: licenseNumber || 'PENDING',
          licenseExpiry: licenseExpiryDate ? new Date(licenseExpiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default to 1 year from now
          panicContactName: emergencyContact?.name || null,
          panicContactPhone: emergencyContact?.phone || null,
          status: 'ACTIVE'
        }
      });

      // Create documents if provided
      if (documents && documents.length > 0) {
        await tx.document.createMany({
          data: documents.map(doc => ({
            userId: newDriver.id,
            type: doc.type,
            url: doc.url,
            status: 'PENDING',
            uploadedAt: new Date()
          }))
        });
      }

      return {
        ...newDriver,
        companyDriverProfile
      };
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        email: driver.email,
        phone: driver.phone,
        role: driver.role,
        isActive: driver.isActive,
        isVerified: driver.isVerified,
        companyId: driver.companyId,
        company: driver.company,
        hireDate: driver.companyDriverProfile.hireDate,
        employmentType: driver.companyDriverProfile.employmentType,
        createdAt: driver.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating driver:', error);

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'A user with this email or phone already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create driver',
      details: error.message
    });
  }
});

// GET /api/drivers - Get all drivers with pagination and filters
router.get('/', authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      companyId = '',
      status = '',
      isActive = '',
      isVerified = ''
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {
      role: 'DRIVER'
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (isActive !== '') {
      where.isActive = isActive === 'true';
    }

    if (isVerified !== '') {
      where.isVerified = isVerified === 'true';
    }

    // Get drivers with minimal related data to avoid legacy relation mismatches
    const [drivers, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          companyId: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.user.count({ where })
    ]);

    const transformedDrivers = drivers.map(driver => ({
      id: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      fullName: `${driver.firstName} ${driver.lastName}`,
      email: driver.email,
      phone: driver.phone,
      isActive: driver.isActive,
      isVerified: driver.isVerified,
      companyId: driver.companyId,
      createdAt: driver.createdAt,
    }));

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      success: true,
      data: transformedDrivers,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch drivers',
      details: error.message
    });
  }
});

// GET /api/drivers/:id - Get driver details by ID
router.get('/:id', authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'), async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await prisma.user.findFirst({
      where: {
        id,
        role: 'DRIVER'
      },
      include: {
        company: {
          select: {
            id: true,
            legalName: true,
            brandName: true,
            name: true,
            companyCode: true,
            email: true,
            phone: true
          }
        },
        companyDriverProfile: true,
        documents: true,
        shifts: {
          orderBy: { startTime: 'desc' },
          take: 10
        },
        driverRides: {
          where: { status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 10,
          include: {
            ride: {
              select: {
                id: true,
                pickupAddress: true,
                dropoffAddress: true,
                fare: true,
                rating: true,
                completedAt: true
              }
            }
          }
        }
      }
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Driver not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        fullName: `${driver.firstName} ${driver.lastName}`,
        email: driver.email,
        phone: driver.phone,
        avatar: driver.avatar,
        address: driver.address,
        preferences: driver.preferences,
        rating: driver.rating,
        isActive: driver.isActive,
        isVerified: driver.isVerified,
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
        company: driver.company,
        profile: driver.companyDriverProfile,
        documents: driver.documents,
        recentShifts: driver.shifts,
        recentRides: driver.driverRides
      }
    });

  } catch (error) {
    console.error('Error fetching driver details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch driver details',
      details: error.message
    });
  }
});

// PUT /api/drivers/:id/status - Update driver status (ONLINE, OFFLINE, BUSY, BREAK)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['ONLINE', 'OFFLINE', 'BUSY', 'BREAK'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Check if driver exists
    const driver = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true }
    });

    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        error: 'Driver not found'
      });
    }

    // For now, we'll just return success since driver status might be tracked
    // in shift records rather than a separate status field
    // If you have a status field in the User model, update it here

    res.json({
      success: true,
      data: {
        driverId: id,
        status: status
      },
      message: `Driver status updated to ${status}`
    });

  } catch (error) {
    console.error('Error updating driver status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update driver status',
      details: error.message
    });
  }
});

// POST /api/drivers/:id/shift/start - Start a driver shift
router.post('/:id/shift/start', async (req, res) => {
  console.log('🚀 [SHIFT START] Route hit! Driver ID:', req.params.id);
  console.log('🚀 [SHIFT START] Body:', req.body);

  try {
    const { id } = req.params;
    const { vehicleId } = req.body;

    // Verify driver exists
    const driver = await prisma.user.findUnique({
      where: { id },
      include: {
        companyDriverProfile: {
          include: {
            company: true
          }
        }
      }
    });

    if (!driver || driver.role !== 'DRIVER') {
      return res.status(404).json({
        success: false,
        error: 'Driver not found'
      });
    }

    const companyId = driver.companyDriverProfile?.companyId || driver.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Driver is not associated with a company'
      });
    }

    // Check if driver has an active shift
    const activeShift = await prisma.shift.findFirst({
      where: {
        driverId: id,
        endTime: null,
        status: { in: ['ONLINE', 'BUSY', 'BREAK'] }
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true
          }
        }
      }
    });

    if (activeShift) {
      let activeVehicle = null;
      try {
        activeVehicle = await prisma.vehicles.findFirst({
          where: {
            driverId: id,
            isActive: true
          },
          include: {
            company: true
          }
        });
      } catch (vehicleError) {
        console.error('Error fetching existing shift vehicle:', vehicleError);
      }

      return res.json({
        success: true,
        data: {
          shift: activeShift,
          vehicle: activeVehicle,
          alreadyActive: true
        },
        message: 'Driver already has an active shift'
      });
    }

    // Verify vehicle if provided and use transaction to prevent race conditions
    let vehicle = null;
    if (vehicleId) {
      vehicle = await prisma.vehicles.findUnique({
        where: { id: vehicleId },
        include: {
          company: true
        }
      });

      if (!vehicle) {
        return res.status(404).json({
          success: false,
          error: 'Vehicle not found'
        });
      }

      if (!vehicle.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Vehicle is not active'
        });
      }

      // Note: We don't check isAvailable here because the driver owns the vehicle
      // and should be able to start shifts with it even if it's marked as in use
    }

    // Use transaction to create shift and update vehicle atomically
    const result = await prisma.$transaction(async (tx) => {
      // Double-check for active shifts within transaction
      const existingShift = await tx.shift.findFirst({
        where: {
          driverId: id,
          endTime: null,
          status: { in: ['ONLINE', 'BUSY', 'BREAK'] }
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatar: true
            }
          }
        }
      });

      if (existingShift) {
        const existingVehicle = await tx.vehicle.findFirst({
          where: {
            driverId: id,
            isActive: true
          },
          include: {
            company: true
          }
        });

        return {
          shift: existingShift,
          vehicle: existingVehicle,
          alreadyActive: true
        };
      }

      // Create new shift
      const shift = await tx.shift.create({
        data: {
          driverId: id,
          companyId: companyId,
          startTime: new Date(),
          status: 'ONLINE',
          startLocation: req.body.startLocation || null
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatar: true
            }
          }
        }
      });

      // Mark vehicle as in use
      if (vehicleId && vehicle) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { isAvailable: false }
        });
      }
      return { shift, vehicle, alreadyActive: false };
    });

    if (result?.alreadyActive) {
      console.log('ℹ️ [SHIFT START] Existing active shift returned:', result.shift.id);
      return res.json({
        success: true,
        data: result,
        message: 'Driver already has an active shift'
      });
    }

    console.log('✅ [SHIFT START] Shift created successfully:', result.shift.id);

    res.json({
      success: true,
      data: result,
      message: 'Shift started successfully'
    });

  } catch (error) {
    console.error('Error starting shift:', error);

    if (error.message === 'Driver already has an active shift') {
      return res.status(409).json({
        success: false,
        error: 'Driver already has an active shift'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to start shift',
      details: error.message
    });
  }
});

// POST /api/drivers/:id/shift/end - End a driver shift
router.post('/:id/shift/end', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find active shift
    const shift = await prisma.shift.findFirst({
      where: {
        driverId: id,
        endTime: null,
        status: { in: ['ONLINE', 'BUSY', 'BREAK'] }
      }
    });

    if (!shift) {
      return res.status(404).json({
        success: false,
        error: 'No active shift found'
      });
    }

    // Calculate shift summary
    const startTime = new Date(shift.startTime);
    const endTime = new Date();
    const durationMinutes = Math.floor((endTime - startTime) / 1000 / 60);

    // Get rides for this shift (filter by time range)
    const rides = await prisma.rides.findMany({
      where: {
        driverId: id,
        createdAt: {
          gte: shift.startTime,
          lte: endTime
        }
      }
    });

    const totalRides = rides.length;
    const totalEarnings = rides.reduce((sum, ride) => sum + (ride.totalFare ? parseFloat(ride.totalFare) : 0), 0);

    // Update shift
    const updatedShift = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        endTime,
        status: 'OFFLINE',
        endLocation: req.body.endLocation || null,
        totalEarnings,
        totalTrips: totalRides
      }
    });

    // Release vehicle (if we're tracking it)
    // Note: Since Shift model doesn't have vehicleId, we'd need to track this differently

    res.json({
      success: true,
      data: {
        shift: updatedShift,
        shiftSummary: {
          durationMinutes,
          totalRides,
          totalEarnings,
          startTime: shift.startTime,
          endTime
        }
      },
      message: 'Shift ended successfully'
    });

  } catch (error) {
    console.error('Error ending shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end shift',
      details: error.message
    });
  }
});

// GET /api/drivers/:id/shift/status - Get current shift status
router.get('/:id/shift/status', async (req, res) => {
  try {
    const { id } = req.params;

    const shift = await prisma.shift.findFirst({
      where: {
        driverId: id,
        endTime: null,
        status: { in: ['ONLINE', 'BUSY', 'BREAK'] }
      },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!shift) {
      return res.json({
        success: true,
        data: {
          hasActiveShift: false,
          shift: null,
          vehicle: null
        }
      });
    }

    // Get driver's assigned vehicle
    let vehicle = null;
    try {
      const driverVehicle = await prisma.vehicles.findFirst({
        where: {
          driverId: id,
          isActive: true
        },
        include: {
          company: true
        }
      });
      vehicle = driverVehicle;
    } catch (vehicleError) {
      console.error('Error fetching vehicle:', vehicleError);
      // Don't fail the request if vehicle fetch fails
    }

    const startTime = new Date(shift.startTime);
    const now = new Date();
    const durationMinutes = Math.floor((now - startTime) / 1000 / 60);

    res.json({
      success: true,
      data: {
        hasActiveShift: true,
        shift: {
          ...shift,
          durationMinutes
        },
        vehicle
      }
    });

  } catch (error) {
    console.error('Error fetching shift status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shift status',
      details: error.message
    });
  }
});

// GET /api/drivers/:id/status-history - Get driver status change history
router.get('/:id/status-history', authorizeRoles('SUPER_ADMIN', 'OWNER', 'DISPATCHER'), async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, source } = req.query;

    const where = { driverId: id };
    if (source) {
      where.source = source;
    }

    const history = await prisma.driver_status_history.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    res.json({
      success: true,
      driverId: id,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error fetching driver status history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status history',
      details: error.message,
    });
  }
});

module.exports = router;
