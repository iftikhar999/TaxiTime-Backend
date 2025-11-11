const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { companyMiddleware, checkSubscriptionLimits } = require('../middleware/company');


const router = express.Router();

// Attach auth and company context
router.use(auth);
router.use(companyMiddleware);

const DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  isVerified: true,
  lastLoginAt: true,
  address: true,
};

const upcase = (value, fallback) => (value ? value.toString().toUpperCase() : fallback);

const mapDriver = (driver, extras = {}) => {
  const relatedUser = driver.user || driver.users;
  const fullName = [relatedUser?.firstName, relatedUser?.lastName].filter(Boolean).join(' ').trim();

  return {
    id: driver.id,
    userId: driver.userId,
    name: fullName || relatedUser?.email,
    firstName: relatedUser?.firstName,
    lastName: relatedUser?.lastName,
    email: relatedUser?.email,
    phone: relatedUser?.phone,
    role: relatedUser?.role, // Add role to returned data
    status: driver.status?.toLowerCase() || 'active',
    employmentType: driver.employmentType,
    hireDate: driver.hireDate,
    contractExpiry: driver.contractExpiry,
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    backgroundCheckStatus: driver.backgroundCheckStatus,
    backgroundCheckExpiry: driver.backgroundCheckExpiry,
    emergencyContact: driver.panicContactName,
    emergencyPhone: driver.panicContactPhone,
    isActive: relatedUser?.isActive,
    isVerified: relatedUser?.isVerified,
    lastLoginAt: relatedUser?.lastLoginAt,
    address: relatedUser?.address?.street || relatedUser?.address?.line1 || null,
    city: relatedUser?.address?.city || null,
    ...extras,
  };
};

// GET /api/owner/drivers
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      companyId: req.companyId,
      ...(status ? { status: upcase(status, undefined) } : {}),
    };

    if (search) {
      where.OR = [
        { licenseNumber: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          },
        },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.company_drivers.findMany({
        where,
        include: {
          users: { select: DRIVER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.company_drivers.count({ where }),
    ]);

    const enriched = await Promise.all(
      records.map(async (driver) => {
        const [ridesCompleted, totalEarnings, ratingAgg] = await Promise.all([
          prisma.rides.count({ where: { driverId: driver.userId } }),
          prisma.rides.aggregate({
            where: { driverId: driver.userId, status: 'COMPLETED' },
            _sum: { actualFare: true },
          }),
          prisma.ratings.aggregate({
            where: { rateeId: driver.userId },
            _avg: { rating: true },
          }),
        ]);

        return mapDriver(driver, {
          totalRides: ridesCompleted,
          totalEarnings: Number(totalEarnings._sum.actualFare || 0),
          rating: ratingAgg._avg.rating || null,
        });
      })
    );

    res.json({
      drivers: enriched,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit) || 1),
      },
    });
  } catch (error) {
    console.error('Owner drivers list error:', error);
    res.status(500).json({ message: 'Failed to fetch drivers' });
  }
});

// GET /api/owner/drivers/:id
router.get('/:id', async (req, res) => {
  try {
    const driver = await prisma.company_drivers.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        users: { select: DRIVER_SELECT },
      },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const [completedRides, cancelledRides, totalEarnings, averageRating, lastRide] = await Promise.all([
      prisma.rides.count({ where: { driverId: driver.userId, status: 'COMPLETED' } }),
      prisma.rides.count({ where: { driverId: driver.userId, status: 'CANCELLED' } }),
      prisma.rides.aggregate({
        where: { driverId: driver.userId, status: 'COMPLETED' },
        _sum: { actualFare: true },
      }),
      prisma.ratings.aggregate({ where: { rateeId: driver.userId }, _avg: { rating: true } }),
      prisma.rides.findFirst({
        where: { driverId: driver.userId },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, status: true, completedAt: true, createdAt: true, actualFare: true },
      }),
    ]);

    res.json(
      mapDriver(driver, {
        stats: {
          completedRides,
          cancelledRides,
          totalEarnings: Number(totalEarnings._sum.actualFare || 0),
          averageRating: averageRating._avg.rating || null,
          lastRide,
        },
      })
    );
  } catch (error) {
    console.error('Owner driver detail error:', error);
    res.status(500).json({ message: 'Failed to fetch driver details' });
  }
});

// POST /api/owner/drivers
router.post('/', checkSubscriptionLimits('driver'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      licenseNumber,
      licenseExpiry,
      employmentType = 'FULL_TIME',
      hireDate,
      contractExpiry,
      status = 'ACTIVE',
      backgroundCheckStatus = 'PENDING',
      backgroundCheckExpiry,
      emergencyContact,
      emergencyPhone,
      address,
      city,
      role = 'DRIVER', // Add role parameter with default value
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !licenseNumber || !licenseExpiry) {
      return res.status(400).json({ message: 'First name, last name, email, phone, license number and expiry are required.' });
    }

    // Validate role
    if (role && !['DRIVER', 'DISPATCHER'].includes(role.toUpperCase())) {
      return res.status(400).json({ message: 'Role must be either DRIVER or DISPATCHER.' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'A user with the provided email or phone already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password || 'Welcome@123', 10);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: role.toUpperCase(), // Use the provided role
        companyId: req.companyId,
        isActive: status.toLowerCase() !== 'suspended',
        address: address || city ? { street: address || null, city: city || null } : null,
      },
      select: DRIVER_SELECT,
    });

    const companyDriver = await prisma.company_drivers.create({
      data: {
        companyId: req.companyId,
        userId: user.id,
        employmentType: upcase(employmentType, 'FULL_TIME'),
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        contractExpiry: contractExpiry ? new Date(contractExpiry) : null,
        licenseNumber,
        licenseExpiry: new Date(licenseExpiry),
        status: upcase(status, 'ACTIVE'),
        backgroundCheckStatus: upcase(backgroundCheckStatus, 'PENDING'),
        backgroundCheckExpiry: backgroundCheckExpiry ? new Date(backgroundCheckExpiry) : null,
        panicContactName: emergencyContact || null,
        panicContactPhone: emergencyPhone || null,
      },
      include: {
        users: { select: DRIVER_SELECT },
      },
    });

    res.status(201).json(mapDriver(companyDriver));
  } catch (error) {
    console.error('Owner create driver error:', error);
    res.status(500).json({ message: 'Failed to create driver' });
  }
});

// PUT /api/owner/drivers/:id
router.put('/:id', async (req, res) => {
  try {
    const driver = await prisma.company_drivers.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { users: { select: DRIVER_SELECT } },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      licenseNumber,
      licenseExpiry,
      employmentType,
      hireDate,
      contractExpiry,
      status,
      backgroundCheckStatus,
      backgroundCheckExpiry,
      emergencyContact,
      emergencyPhone,
      address,
      city,
      isActive,
      role, // Add role parameter
    } = req.body;

    // Validate role if provided
    if (role && !['DRIVER', 'DISPATCHER'].includes(role.toUpperCase())) {
      return res.status(400).json({ message: 'Role must be either DRIVER or DISPATCHER.' });
    }

    // Hash password if provided
    const driverUser = driver.user || driver.users;

    const updateData = {
      firstName,
      lastName,
      email,
      phone,
      isActive: typeof isActive === 'boolean' ? isActive : driverUser?.isActive,
      address: address || city ? { street: address || null, city: city || null } : driverUser?.address,
    };

    // Update role if provided
    if (role) {
      updateData.role = role.toUpperCase();
    }

    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: driver.userId },
        data: updateData,
      }),
      prisma.company_drivers.update({
        where: { id: driver.id },
        data: {
          employmentType: employmentType ? upcase(employmentType, 'FULL_TIME') : driver.employmentType,
          hireDate: hireDate ? new Date(hireDate) : driver.hireDate,
          contractExpiry: contractExpiry ? new Date(contractExpiry) : driver.contractExpiry,
          licenseNumber: licenseNumber || driver.licenseNumber,
          licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : driver.licenseExpiry,
          status: status ? upcase(status, driver.status) : driver.status,
          backgroundCheckStatus: backgroundCheckStatus ? upcase(backgroundCheckStatus, driver.backgroundCheckStatus) : driver.backgroundCheckStatus,
          backgroundCheckExpiry: backgroundCheckExpiry ? new Date(backgroundCheckExpiry) : driver.backgroundCheckExpiry,
          panicContactName: emergencyContact ?? driver.panicContactName,
          panicContactPhone: emergencyPhone ?? driver.panicContactPhone,
        },
      }),
    ]);

    const updated = await prisma.company_drivers.findUnique({
      where: { id: driver.id },
      include: { users: { select: DRIVER_SELECT } },
    });

    res.json(mapDriver(updated));
  } catch (error) {
    console.error('Owner update driver error:', error);
    res.status(500).json({ message: 'Failed to update driver' });
  }
});

// PATCH /api/owner/drivers/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const driver = await prisma.company_drivers.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { users: { select: DRIVER_SELECT } },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const nextStatus = upcase(status, driver.status);
    const isActive = !['SUSPENDED', 'INACTIVE', 'TERMINATED'].includes(nextStatus);

    await prisma.$transaction([
      prisma.company_drivers.update({
        where: { id: driver.id },
        data: { status: nextStatus },
      }),
      prisma.user.update({
        where: { id: driver.userId },
        data: { isActive },
      }),
    ]);

    const updated = await prisma.company_drivers.findUnique({
      where: { id: driver.id },
      include: { users: { select: DRIVER_SELECT } },
    });

    res.json(mapDriver(updated));
  } catch (error) {
    console.error('Owner update driver status error:', error);
    res.status(500).json({ message: 'Failed to update driver status' });
  }
});

// DELETE /api/owner/drivers/:id
router.delete('/:id', async (req, res) => {
  try {
    const driver = await prisma.company_drivers.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { users: { select: DRIVER_SELECT } },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    await prisma.$transaction([
      prisma.company_drivers.update({
        where: { id: driver.id },
        data: { status: 'TERMINATED' },
      }),
      prisma.user.update({
        where: { id: driver.userId },
        data: { isActive: false },
      }),
    ]);

    res.json({ message: 'Driver deactivated successfully' });
  } catch (error) {
    console.error('Owner delete driver error:', error);
    res.status(500).json({ message: 'Failed to delete driver' });
  }
});

// GET /api/owner/drivers/:id/stats
router.get('/:id/stats', async (req, res) => {
  try {
    const driver = await prisma.company_drivers.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
    });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [completedTrips, earningsAgg, ratingAgg, averageDuration] = await Promise.all([
      prisma.rides.count({
        where: {
          driverId: driver.userId,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
      }),
      prisma.rides.aggregate({
        where: {
          driverId: driver.userId,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
        _sum: { actualFare: true },
      }),
      prisma.ratings.aggregate({
        where: {
          rateeId: driver.userId,
          createdAt: { gte: since },
        },
        _avg: { rating: true },
      }),
      prisma.rides.aggregate({
        where: {
          driverId: driver.userId,
          status: 'COMPLETED',
        },
        _avg: { actualDuration: true },
      }),
    ]);

    res.json({
      completedTrips,
      totalEarnings: Number(earningsAgg._sum.actualFare || 0),
      averageRating: ratingAgg._avg.rating || null,
      averageDuration: averageDuration._avg.actualDuration || null,
      period,
    });
  } catch (error) {
    console.error('Owner driver stats error:', error);
    res.status(500).json({ message: 'Failed to fetch driver stats' });
  }
});

module.exports = router;
