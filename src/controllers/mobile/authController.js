const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../../lib/prisma');

/**
 * @route   POST /api/mobile/driver/auth/login
 * @desc    Driver mobile app login
 * @access  Public
 */
const login = async (req, res) => {
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

        // Check password
        const isMatch = await bcrypt.compare(password, driver.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if driver is active
        if (driver.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: `Your account is currently ${driver.status}. Please contact support.`
            });
        }

        // Check if company is active
        if (!driver.company || !driver.company.isActive || driver.company.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Your assigned company is not active. Please contact support.'
            });
        }

        // Generate JWT
        const payload = {
            id: driver.id,
            role: driver.role,
            companyId: driver.companyId,
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        const refreshToken = jwt.sign(
            { id: driver.id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
        );

        // Update last login and device info
        try {
            await prisma.user.update({
                where: { id: driver.id },
                data: {
                    lastLogin: new Date(),
                    deviceInfo: deviceInfo || {},
                },
            });
        } catch (updateError) {
            console.error('Error updating last login:', updateError);
            // Non-critical error, proceed with login
        }

        // Prepare driver data to return
        const driverData = {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email,
            phone: driver.phone,
            role: driver.role,
            status: driver.status,
            profilePicture: driver.profilePicture,
            companyId: driver.companyId,
            company: driver.company,
        };

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                refreshToken,
                driver: driverData,
            },
        });

    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

/**
 * @route   POST /api/mobile/driver/auth/register
 * @desc    Driver mobile app registration
 * @access  Public
 */
const register = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            companyId,
            companyCode,
            licenseNumber,
            vehicleModel,
            vehiclePlate,
        } = req.body;

        console.log('Driver registration attempt:', email);

        // --- Basic Validation ---
        if (!firstName || !lastName || !email || !phone || !password || !companyId || !companyCode || !licenseNumber) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields for registration.'
            });
        }

        // --- Check for Existing User ---
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
                message: 'An account with this email or phone number already exists.'
            });
        }

        // --- Validate Company ---
        const company = await prisma.company.findUnique({
            where: { id: companyId }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'The selected taxi company does not exist.'
            });
        }

        if (company.companyCode !== companyCode) {
            return res.status(400).json({
                success: false,
                message: 'Invalid company registration code.'
            });
        }

        if (company.status !== 'ACTIVE' || !company.isActive) {
            return res.status(403).json({
                success: false,
                message: 'The selected company is not currently active or accepting new drivers.'
            });
        }

        // --- Hash Password ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // --- Create New Driver ---
        const newDriver = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email: email.toLowerCase(),
                phone,
                password: hashedPassword,
                role: 'DRIVER',
                status: 'PENDING', // Drivers start as PENDING until approved by an admin
                company: {
                    connect: { id: companyId }
                },
                driverProfile: {
                    create: {
                        licenseNumber,
                        status: 'PENDING_APPROVAL',
                    }
                },
            }
        });

        // --- Create Initial Vehicle (if provided) ---
        if (vehicleModel && vehiclePlate) {
            await prisma.vehicle.create({
                data: {
                    model: vehicleModel,
                    licensePlate: vehiclePlate.toUpperCase(),
                    status: 'PENDING_APPROVAL',
                    company: {
                        connect: { id: companyId }
                    },
                    drivers: {
                        connect: { id: newDriver.id }
                    }
                }
            });
        }

        console.log('Driver registered successfully:', newDriver.id);

        res.status(201).json({
            success: true,
            message: 'Registration successful. Your account is pending approval.',
            data: {
                driverId: newDriver.id,
            }
        });

    } catch (error) {
        console.error('Driver registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

module.exports = {
    login,
    register,
};
