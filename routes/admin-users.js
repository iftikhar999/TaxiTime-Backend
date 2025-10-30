const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Valid user roles from schema
const VALID_ROLES = ['PASSENGER', 'DRIVER', 'DISPATCHER', 'OWNER', 'SUPER_ADMIN'];

// Helper function to validate role
const validateRole = (role) => {
    if (!role) {
        throw new Error('Role is required');
    }
    const upperRole = role.toUpperCase();
    if (!VALID_ROLES.includes(upperRole)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    return upperRole;
};

// Helper function to derive user status
const getUserStatus = (user) => {
    if (user.deletedAt) return 'DELETED';
    if (!user.isActive) return 'INACTIVE';
    if (!user.isVerified) return 'UNVERIFIED';
    return 'ACTIVE';
};

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// GET /api/admin/users - List all users with pagination and search
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', role = '', status = '', company = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause
        const where = {};

        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (role) {
            where.role = role.toUpperCase();
        }

        if (status === 'active') {
            where.isActive = true;
            where.isVerified = true;
        } else if (status === 'pending') {
            where.isActive = true;
            where.isVerified = false;
        } else if (status === 'inactive') {
            where.isActive = false;
        }

        if (company) {
            where.companyId = company;
        }

        // Get users with related data
        const [users, totalCount] = await Promise.all([
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
                    deletedAt: true,
                    lastLoginAt: true,
                    createdAt: true,
                    updatedAt: true,
                    companyId: true,
                    company: {
                        select: {
                            id: true,
                            legalName: true,
                            brandName: true,
                            primaryContactEmail: true,
                        }
                    },
                    companyDriverProfile: {
                        select: {
                            id: true,
                            licenseNumber: true,
                            licenseExpiry: true,
                            employmentType: true,
                            status: true,
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.user.count({ where }),
        ]);

        // Add computed status to each user
        const usersWithStatus = users.map(user => ({
            ...user,
            status: getUserStatus(user)
        }));

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        res.json({
            users: usersWithStatus,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// GET /api/admin/users/:id - Get user details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                role: true,
                isActive: true,
                isVerified: true,
                deletedAt: true,
                createdAt: true,
                updatedAt: true,
                lastLoginAt: true,
                companyId: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    }
                },
                driverProfile: {
                    select: {
                        licenseNumber: true,
                        licenseExpiryDate: true,
                        rating: true,
                        totalRides: true,
                        totalEarnings: true,
                        isOnline: true,
                        location: true,
                    }
                },
                vehicle: {
                    select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                        licensePlate: true,
                        vehicleType: true,
                        isActive: true,
                    }
                },
                passengerProfile: {
                    select: {
                        rating: true,
                        totalRides: true,
                        preferredPaymentMethod: true,
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user statistics
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        let stats = {};

        if (user.role === 'DRIVER') {
            const [rideStats, earningsStats] = await Promise.all([
                prisma.ride.count({
                    where: {
                        driverId: id,
                        status: 'COMPLETED',
                        completedAt: { gte: thirtyDaysAgo },
                    }
                }),
                prisma.ride.aggregate({
                    where: {
                        driverId: id,
                        status: 'COMPLETED',
                        completedAt: { gte: thirtyDaysAgo },
                    },
                    _sum: { driverEarnings: true }
                })
            ]);

            stats = {
                ridesCount: rideStats,
                totalEarnings: parseFloat(earningsStats._sum.driverEarnings || 0),
                rating: user.driverProfile?.rating || 0,
            };
        } else if (user.role === 'PASSENGER') {
            const [rideStats, spendingStats] = await Promise.all([
                prisma.ride.count({
                    where: {
                        passengerId: id,
                        createdAt: { gte: thirtyDaysAgo },
                    }
                }),
                prisma.ride.aggregate({
                    where: {
                        passengerId: id,
                        status: 'COMPLETED',
                        completedAt: { gte: thirtyDaysAgo },
                    },
                    _sum: { actualFare: true }
                })
            ]);

            stats = {
                ridesCount: rideStats,
                totalSpent: parseFloat(spendingStats._sum.actualFare || 0),
                rating: user.passengerProfile?.rating || 0,
            };
        } else if (user.role === 'OWNER') {
            const [companyRides, companyRevenue] = await Promise.all([
                prisma.ride.count({
                    where: {
                        companyId: user.companyId,
                        createdAt: { gte: thirtyDaysAgo },
                    }
                }),
                prisma.ride.aggregate({
                    where: {
                        companyId: user.companyId,
                        status: 'COMPLETED',
                        completedAt: { gte: thirtyDaysAgo },
                    },
                    _sum: { actualFare: true }
                })
            ]);

            stats = {
                ridesCount: companyRides,
                totalRevenue: parseFloat(companyRevenue._sum.actualFare || 0),
            };
        }

        const userWithStats = {
            ...user,
            stats,
            status: getUserStatus(user)
        };

        res.json(userWithStats);
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// POST /api/admin/users - Create new user
router.post('/', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            role = 'PASSENGER',
            companyId,
            licenseNumber,
            licenseExpiryDate,
            // New comprehensive driver fields
            dateOfBirth,
            gender,
            address,
            isVerified,
            verificationStatus,
            documents,
            driverInfo,
            bankingDetails,
            preferences,
            isActive,
            lastActive,
            profileImage
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'First name, last name, email, and password are required'
            });
        }

        // Validate and normalize role
        let validatedRole;
        try {
            validatedRole = validateRole(role);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid role',
                details: error.message
            });
        }

        // Validate companyId if provided
        if (companyId && companyId.trim() !== '') {
            const company = await prisma.company.findUnique({
                where: { id: companyId }
            });

            if (!company) {
                return res.status(400).json({
                    error: 'Invalid company selected',
                    details: `Company with ID ${companyId} does not exist`
                });
            }

            if (!company.isActive) {
                return res.status(400).json({
                    error: 'Selected company is not active',
                    details: `Company ${company.name || company.legalName} is currently inactive`
                });
            }
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({
                error: 'Email already in use',
                details: `A user with email ${email} already exists`
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Prepare user data
        const cleanCompanyId = companyId && companyId.trim() !== '' ? companyId.trim() : null;

        const userData = {
            firstName,
            lastName,
            email,
            phone,
            password: hashedPassword,
            role: validatedRole,
            companyId: cleanCompanyId,
            isActive: isActive !== undefined ? isActive : true,
            isVerified: isVerified !== undefined ? isVerified : false,
        };

        // Add optional fields if provided
        if (profileImage) userData.avatar = profileImage;
        if (address) userData.address = address;
        if (preferences) userData.preferences = preferences;

        // Create user
        const user = await prisma.user.create({
            data: userData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                companyId: true,
                avatar: true,
                address: true,
                preferences: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });

        // If user is a driver and has a company, create CompanyDriver record
        if (validatedRole === 'DRIVER' && cleanCompanyId) {
            const driverLicenseNumber = driverInfo?.licenseNumber || licenseNumber;
            const driverLicenseExpiry = driverInfo?.licenseExpiry || licenseExpiryDate;

            if (driverLicenseNumber) {
                await prisma.companyDriver.create({
                    data: {
                        companyId: cleanCompanyId,
                        userId: user.id,
                        employmentType: 'FULL_TIME',
                        hireDate: new Date(),
                        licenseNumber: driverLicenseNumber,
                        licenseExpiry: driverLicenseExpiry ? new Date(driverLicenseExpiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        backgroundCheckStatus: driverInfo?.backgroundCheckStatus || 'PENDING',
                        panicContactName: driverInfo?.emergencyContact?.name || null,
                        panicContactPhone: driverInfo?.emergencyContact?.phone || null,
                        status: 'ACTIVE'
                    }
                });
            }
        }

        res.status(201).json({
            message: 'User created successfully',
            user: user
        });
    } catch (error) {
        console.error('Error creating user:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Failed to create user',
            details: error.message
        });
    }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            firstName,
            lastName,
            email,
            phone,
            role,
            companyId,
            password,
            isActive,
            isVerified,
        } = req.body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id }
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check email uniqueness if changed
        if (email && email !== existingUser.email) {
            const emailExists = await prisma.user.findUnique({
                where: { email }
            });
            if (emailExists) {
                return res.status(400).json({
                    error: 'Email already in use',
                    details: `Email ${email} is already registered to another user`
                });
            }
        }

        // Build update data
        const updateData = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (email) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;

        // Validate role if provided
        if (role) {
            try {
                updateData.role = validateRole(role);
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid role',
                    details: error.message
                });
            }
        }

        if (companyId !== undefined) updateData.companyId = companyId || null;

        if (typeof isActive === 'boolean') {
            updateData.isActive = isActive;

            // Ensure previously soft-deleted users can be reactivated from the edit form
            if (isActive) {
                updateData.deletedAt = null;
            }
        }

        if (typeof isVerified === 'boolean') {
            updateData.isVerified = isVerified;
        }

        // Hash new password if provided
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                companyId: true,
                deletedAt: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });

        const responseUser = {
            ...user,
            status: getUserStatus(user)
        };

        res.json({
            message: 'User updated successfully',
            user: responseUser
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// PATCH /api/admin/users/:id/toggle-status - Toggle user active status
router.patch('/:id/toggle-status', async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { isActive: !user.isActive },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
                isVerified: true,
            }
        });

        res.json({
            message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// PATCH /api/admin/users/:id/verify - Verify user
router.patch('/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;
        const { verified = true } = req.body;

        const user = await prisma.user.update({
            where: { id },
            data: { isVerified: verified },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
                isVerified: true,
            }
        });

        res.json({
            message: `User ${verified ? 'verified' : 'unverified'} successfully`,
            user
        });
    } catch (error) {
        console.error('Error verifying user:', error);
        res.status(500).json({ error: 'Failed to verify user' });
    }
});

// DELETE /api/admin/users/:id - Delete user (soft delete by deactivating)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user has active operations
        const activeRides = await prisma.ride.count({
            where: {
                OR: [
                    { passengerId: id },
                    { driverId: id }
                ],
                status: { in: ['REQUESTED', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_PROGRESS'] }
            }
        });

        if (activeRides > 0) {
            return res.status(400).json({
                error: 'Cannot delete user with active rides. Complete or cancel active rides first.'
            });
        }

        // Soft delete: set deletedAt timestamp and deactivate user
        await prisma.user.update({
            where: { id },
            data: {
                isActive: false,
                deletedAt: new Date()
            }
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            details: error.message
        });
    }
});

// POST /api/admin/users/:id/reactivate - Reactivate a deleted user
router.post('/:id/reactivate', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id }
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user is actually deleted
        if (!existingUser.deletedAt && existingUser.isActive) {
            return res.status(400).json({
                error: 'User is already active',
                details: 'This user is not deleted and does not need reactivation'
            });
        }

        // Reactivate user
        const user = await prisma.user.update({
            where: { id },
            data: {
                isActive: true,
                deletedAt: null
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
                isVerified: true,
                deletedAt: true,
            }
        });

        res.json({
            message: 'User reactivated successfully',
            user: {
                ...user,
                status: getUserStatus(user)
            }
        });
    } catch (error) {
        console.error('Error reactivating user:', error);
        res.status(500).json({
            error: 'Failed to reactivate user',
            details: error.message
        });
    }
});

// GET /api/admin/users/analytics/overview - Get user analytics overview
router.get('/analytics/overview', async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        let startDate;
        switch (period) {
            case '7d':
                startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }

        const [userStats, roleStats, newUsers, activeUsers] = await Promise.all([
            // Total user counts
            prisma.user.groupBy({
                by: ['isActive', 'isVerified'],
                _count: true
            }),

            // Users by role
            prisma.user.groupBy({
                by: ['role'],
                _count: true
            }),

            // New users in period
            prisma.user.count({
                where: {
                    createdAt: { gte: startDate }
                }
            }),

            // Recently active users
            prisma.user.count({
                where: {
                    lastLoginAt: { gte: startDate }
                }
            })
        ]);

        // Format analytics data
        const analytics = {
            total: userStats.reduce((sum, stat) => sum + stat._count, 0),
            active: userStats.find(stat => stat.isActive && stat.isVerified)?._count || 0,
            pending: userStats.find(stat => stat.isActive && !stat.isVerified)?._count || 0,
            inactive: userStats.find(stat => !stat.isActive)?._count || 0,
            newUsers,
            recentlyActive: activeUsers,
            byRole: roleStats.reduce((acc, stat) => {
                acc[stat.role.toLowerCase()] = stat._count;
                return acc;
            }, {})
        };

        res.json(analytics);
    } catch (error) {
        console.error('Error fetching user analytics:', error);
        res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
});

module.exports = router;