const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../../../middleware/auth');
// Using console.log for logging (logger utility not available)

const router = express.Router();
const prisma = require('../../../lib/prisma');

/**
 * @route   POST /api/mobile/driver/auth/login
 * @desc    Driver mobile app login
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password, deviceInfo } = req.body;
        console.log('Driver login attempt:', email);
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find driver
        const driver = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase(),
                role: 'DRIVER'
            },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        legalName: true,
                        brandName: true,
                        status: true,
                        isActive: true,
                        isVerified: true
                    }
                }
            }
        });
        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if driver is active
        if (!driver.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact your company.'
            });
        }

        if (!driver.company || !driver.company.isActive || driver.company.status !== 'ACTIVE') {
            return res.status(401).json({
                success: false,
                message: 'Company is not active. Please contact support.'
            });
        }

        if (!driver.company.isVerified) {
            return res.status(401).json({
                success: false,
                message: 'Company is awaiting verification. Please contact support.'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, driver.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        console.log('Driver found:', driver ? driver.email : 'No driver');

        // Check if company is active
        // Generate JWT token
        const token = jwt.sign(
            {
                userId: driver.id,
                email: driver.email,
                role: driver.role,
                companyId: driver.companyId
            },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        // Update last login and device info in preferences
        const updateData = {
            lastLoginAt: new Date()
        };

        // If deviceInfo is provided, store it in preferences
        if (deviceInfo) {
            const existingPreferences = driver.preferences || {};
            updateData.preferences = {
                ...existingPreferences,
                deviceInfo: deviceInfo
            };
        }

        await prisma.user.update({
            where: { id: driver.id },
            data: updateData
        });

        // Log successful login
        console.log(`Driver login successful: ${driver.email} (${driver.id})`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                driver: {
                    id: driver.id,
                    firstName: driver.firstName,
                    lastName: driver.lastName,
                    email: driver.email,
                    phone: driver.phone,
                    profileImage: driver.profileImage,
                    rating: driver.rating,
                    isVerified: driver.isVerified,
                    companyId: driver.companyId,
                    company: driver.company,
                    currentJob: null,
                    jobStatus: null,
                    isAvailable: true
                }
            }
        });

    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

/**
 * @route   POST /api/mobile/driver/auth/register
 * @desc    Driver mobile app registration
 * @access  Public
 */
router.post('/register', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            companyCode,
            licenseNumber,
            licenseExpiry,
            deviceInfo
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !password || !companyCode) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Find company by code
        const company = await prisma.company.findUnique({
            where: { companyCode },
            select: {
                id: true,
                name: true,
                brandName: true,
                legalName: true,
                companyCode: true,
                status: true,
                isActive: true,
                isVerified: true,
                primaryContactEmail: true,
                primaryContactPhone: true
            }
        });

        if (!company) {
            return res.status(400).json({
                success: false,
                message: 'Invalid company code'
            });
        }

        if (!company.isActive || company.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Company is not accepting new drivers'
            });
        }

        if (!company.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Company verification is pending. Please contact support.'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const fallbackLicenseExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        // Create driver and link to company within a transaction
        const driver = await prisma.$transaction(async (tx) => {
            const createdDriver = await tx.user.create({
                data: {
                    firstName,
                    lastName,
                    email: email.toLowerCase(),
                    phone,
                    password: hashedPassword,
                    role: 'DRIVER',
                    companyId: company.id,
                    isActive: true,
                    isVerified: true,
                    preferences: {
                        language: 'en',
                        currency: 'USD',
                        deviceInfo: deviceInfo || null,
                        notifications: {
                            push: true,
                            email: true,
                            sms: false
                        }
                    }
                }
            });

            await tx.companyDriver.create({
                data: {
                    companyId: company.id,
                    userId: createdDriver.id,
                    employmentType: 'FULL_TIME',
                    hireDate: new Date(),
                    licenseNumber: licenseNumber || 'NOT_PROVIDED',
                    licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : fallbackLicenseExpiry,
                    status: 'ACTIVE'
                }
            });

            return createdDriver;
        });

        // Log registration
        console.log(`Driver registration: ${driver.email} for company ${company.name}`);

        res.status(201).json({
            success: true,
            message: 'Registration successful. You can now sign in.',
            data: {
                driverId: driver.id,
                status: 'active',
                company: {
                    name: company.name,
                    contactEmail: company.primaryContactEmail,
                    contactPhone: company.primaryContactPhone
                },
                driver: {
                    id: driver.id,
                    firstName: driver.firstName,
                    lastName: driver.lastName,
                    email: driver.email,
                    phone: driver.phone,
                    companyId: driver.companyId,
                    isActive: driver.isActive,
                    isVerified: driver.isVerified
                }
            }
        });

    } catch (error) {
        console.error('Driver registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

/**
 * @route   POST /api/mobile/driver/auth/refresh
 * @desc    Refresh authentication token
 * @access  Private
 */
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;

        // Get current driver info
        const driver = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        isActive: true
                    }
                },
                // Include current job assignment
                assignedJobs: {
                    where: {
                        status: {
                            in: ['ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS']
                        }
                    },
                    take: 1,
                    orderBy: {
                        createdAt: 'desc'
                    },
                    include: {
                        pickup: {
                            select: {
                                address: true,
                                latitude: true,
                                longitude: true,
                                contactName: true,
                                contactPhone: true
                            }
                        },
                        dropoff: {
                            select: {
                                address: true,
                                latitude: true,
                                longitude: true,
                                contactName: true,
                                contactPhone: true
                            }
                        },
                        customer: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                phone: true
                            }
                        }
                    }
                }
            }
        });

        if (!driver || !driver.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Driver account not found or inactive'
            });
        }

        // Generate new token
        const token = jwt.sign(
            {
                userId: driver.id,
                email: driver.email,
                role: driver.role,
                companyId: driver.companyId
            },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        // Get current job if any
        const currentJob = driver?.assignedJobs && driver?.assignedJobs.length > 0 ? driver?.assignedJobs[0] : null;

        res.json({
            success: true,
            data: {
                token,
                driver: {
                    id: driver.id,
                    firstName: driver.firstName,
                    lastName: driver.lastName,
                    email: driver.email,
                    phone: driver.phone,
                    profileImage: driver.profileImage,
                    rating: driver.rating,
                    isVerified: driver.isVerified,
                    companyId: driver.companyId,
                    company: driver.company,
                    currentJob: currentJob,
                    jobStatus: currentJob ? currentJob?.status : null,
                    isAvailable: !currentJob
                }
            }
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during token refresh'
        });
    }
});

/**
 * @route   POST /api/mobile/driver/auth/logout
 * @desc    Driver logout (device cleanup)
 * @access  Private
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;

        // Update last activity and clear device token if provided
        await prisma.user.update({
            where: { id: userId },
            data: {
                lastActivityAt: new Date(),
                // Could clear FCM token here if provided
            }
        });

        console.log(`Driver logout: ${userId}`);

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Driver logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
});

/**
 * @route   PUT /api/mobile/driver/auth/device-token
 * @desc    Update device FCM token for push notifications
 * @access  Private
 */
router.put('/device-token', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { fcmToken, platform } = req.body;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM token is required'
            });
        }

        // Get current user to merge preferences
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { preferences: true }
        });

        const existingPreferences = currentUser?.preferences || {};

        // Update device token in preferences
        await prisma.user.update({
            where: { id: userId },
            data: {
                preferences: {
                    ...existingPreferences,
                    deviceTokens: {
                        fcm: fcmToken,
                        platform: platform || 'unknown',
                        updatedAt: new Date()
                    }
                }
            }
        });

        res.json({
            success: true,
            message: 'Device token updated successfully'
        });

    } catch (error) {
        console.error('Update device token error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating device token'
        });
    }
});

module.exports = router;