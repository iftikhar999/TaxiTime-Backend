const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../../../middleware/auth');
const prisma = require('../../../lib/prisma');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/driver-documents/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${req.user.id}-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG and PDF files are allowed'));
        }
    }
});

// Get driver profile
router.get('/', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;

        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                avatar: true,
                address: true,
                rating: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                lastLoginAt: true,
                companyId: true,
                companies_users_companyIdTocompanies: {
                    select: {
                        id: true,
                        legalName: true,
                        brandName: true,
                        hqAddressLine1: true,
                        hqCity: true,
                        hqState: true,
                        primaryContactPhone: true,
                        supportPhone: true,
                    },
                },
            },
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // ✅ FIX: Map fields to match mobile app expectations
        const responseDriver = {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email,
            phone: driver.phone,
            profileImage: driver.avatar,
            address: driver.address,
            rating: driver.rating,
            isActive: driver.isActive,
            isVerified: driver.isVerified,
            createdAt: driver.createdAt,
            lastLoginAt: driver.lastLoginAt,
            companyId: driver.companyId || driver.companies_users_companyIdTocompanies?.id,
            company: driver.companies_users_companyIdTocompanies ? {
                id: driver.companies_users_companyIdTocompanies.id,
                name:
                    driver.companies_users_companyIdTocompanies.legalName ||
                    driver.companies_users_companyIdTocompanies.brandName,
                legalName: driver.companies_users_companyIdTocompanies.legalName,
                brandName: driver.companies_users_companyIdTocompanies.brandName,
                address: driver.companies_users_companyIdTocompanies.hqAddressLine1,
                city: driver.companies_users_companyIdTocompanies.hqCity,
                state: driver.companies_users_companyIdTocompanies.hqState,
                phone:
                    driver.companies_users_companyIdTocompanies.primaryContactPhone ||
                    driver.companies_users_companyIdTocompanies.supportPhone,
            } : null
        };

        console.log('✅ Driver profile fetched:', {
            driverId: responseDriver.id,
            hasCompanyId: !!responseDriver.companyId,
            companyId: responseDriver.companyId
        });

        res.json({
            success: true,
            data: responseDriver
        });

    } catch (error) {
        console.error('Error fetching driver profile:', error);
        res.status(500).json({
            error: 'Failed to fetch driver profile',
            details: error.message
        });
    }
});

// Update driver profile
router.put('/', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const {
            firstName,
            lastName,
            email,
            phone,
            address,
            rating,
        } = req.body || {};

        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email: email.toLowerCase(),
                    NOT: { id: driverId },
                },
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        if (phone) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    phone,
                    NOT: { id: driverId },
                },
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Phone number already in use' });
            }
        }

        const updateData = {};
        if (firstName !== undefined) updateData.firstName = String(firstName).trim();
        if (lastName !== undefined) updateData.lastName = String(lastName).trim();
        if (email !== undefined) updateData.email = String(email).trim().toLowerCase();
        if (phone !== undefined) updateData.phone = String(phone).trim();
        if (address !== undefined) updateData.address = address;
        if (rating !== undefined) updateData.rating = rating;
        updateData.updatedAt = new Date();

        const updatedDriver = await prisma.user.update({
            where: { id: driverId },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                address: true,
                rating: true,
                updatedAt: true,
            },
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedDriver,
        });
    } catch (error) {
        console.error('Error updating driver profile:', error);
        res.status(500).json({
            error: 'Failed to update driver profile',
            details: error.message,
        });
    }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                error: 'New password must be at least 6 characters long'
            });
        }

        // Get current password hash
        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: { password: true }
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, driver.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await prisma.user.update({
            where: { id: driverId },
            data: {
                password: hashedNewPassword,
                updatedAt: new Date()
            }
        });

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            error: 'Failed to change password',
            details: error.message
        });
    }
});

// Upload profile picture
router.post('/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        const driverId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const profilePicturePath = `/uploads/driver-documents/${req.file.filename}`;

        const updatedDriver = await prisma.user.update({
            where: { id: driverId },
            data: { avatar: profilePicturePath, updatedAt: new Date() },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
            },
        });

        res.json({
            success: true,
            message: 'Profile picture updated successfully',
            data: {
                profileImage: updatedDriver.avatar,
            },
        });

    } catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({
            error: 'Failed to upload profile picture',
            details: error.message
        });
    }
});

// Upload driver documents
router.post('/documents', authenticateToken, upload.array('documents', 5), async (req, res) => {
    try {
        const driverId = req.user.id;
        const { documentTypes } = req.body; // JSON string of document types array

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        let types = [];
        try {
            types = JSON.parse(documentTypes || '[]');
        } catch (e) {
            return res.status(400).json({ error: 'Invalid document types format' });
        }

        if (types.length !== req.files.length) {
            return res.status(400).json({
                error: 'Number of document types must match number of files'
            });
        }

        const DOCUMENT_TYPE_MAP = {
            LICENSE: 'DRIVER_LICENSE',
            DRIVER_LICENSE: 'DRIVER_LICENSE',
            REGISTRATION: 'VEHICLE_REGISTRATION',
            VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
            INSURANCE: 'INSURANCE',
            PERMIT: 'PERMIT',
            ID_CARD: 'ID_CARD',
            ID: 'ID_CARD',
            PHOTO: 'PHOTO',
            BACKGROUND_CHECK: 'PERMIT',
            MEDICAL_CERTIFICATE: 'ID_CARD',
        };
        const VALID_TYPES = new Set(Object.values(DOCUMENT_TYPE_MAP));

        // Create document records
        const documents = await Promise.all(
            req.files.map(async (file, index) => {
                const rawType = String(documentType || '').trim().toUpperCase();
                const normalizedType = DOCUMENT_TYPE_MAP[rawType] || rawType;

                if (!VALID_TYPES.has(normalizedType)) {
                    throw new Error(`Invalid document type: ${documentType}`);
                }

                return prisma.documents.create({
                    data: {
                        driverId,
                        type: normalizedType,
                        fileName: file.originalname,
                        fileUrl: `/uploads/driver-documents/${file.filename}`,
                        fileSize: file.size,
                        status: 'PENDING',
                    },
                });
            })
        );

        res.json({
            success: true,
            message: 'Documents uploaded successfully',
            data: documents.map(doc => ({
                id: doc.id,
                type: doc.type,
                fileName: doc.fileName,
                status: doc.status,
                uploadedAt: doc.createdAt
            }))
        });

    } catch (error) {
        console.error('Error uploading documents:', error);
        res.status(500).json({
            error: 'Failed to upload documents',
            details: error.message
        });
    }
});

// Get driver statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { period = 'month' } = req.query;

        let dateFilter = {};
        const now = new Date();

        switch (period) {
            case 'week':
                dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
                break;
            case 'month':
                dateFilter = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
                break;
            case 'year':
                dateFilter = { gte: new Date(now.getFullYear(), 0, 1) };
                break;
            case 'all':
                dateFilter = {};
                break;
        }

        // Get ride statistics
        const rideStats = await prisma.rides.groupBy({
            by: ['status'],
            where: {
                driverId,
                ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
            },
            _count: {
                id: true
            }
        });

        // Get earnings data
        const earningsData = await prisma.rides.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                ...(Object.keys(dateFilter).length > 0 && { completedAt: dateFilter })
            },
            include: {
                payments: {
                    select: {
                        driverEarnings: true,
                        tips: true
                    },
                    where: {
                        status: { in: ['COMPLETED', 'PAID'] },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                }
            }
        });

        const totalEarnings = earningsData.reduce((sum, ride) =>
            sum + (ride.payments?.[0]?.driverEarnings || 0) + (ride.payments?.[0]?.tips || 0), 0);

        // Get ratings data
        const ratingsData = await prisma.rides.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                passengerRating: { not: null },
                ...(Object.keys(dateFilter).length > 0 && { completedAt: dateFilter })
            },
            select: {
                passengerRating: true
            }
        });

        const averageRating = ratingsData.length > 0 ?
            ratingsData.reduce((sum, ride) => {
                const ratingValue = typeof ride.passengerRating === 'number'
                    ? ride.passengerRating
                    : Number(ride.passengerRating?.score ?? ride.passengerRating?.value ?? 0);
                return sum + (Number.isFinite(ratingValue) ? ratingValue : 0);
            }, 0) / ratingsData.length : 0;

        const stats = {
            period,
            rides: {
                total: rideStats.reduce((sum, stat) => sum + stat._count.id, 0),
                completed: rideStats.find(stat => stat.status === 'COMPLETED')?._count.id || 0,
                cancelled: rideStats.find(stat => stat.status === 'CANCELLED')?._count.id || 0,
                inProgress: rideStats.find(stat => stat.status === 'IN_PROGRESS')?._count.id || 0
            },
            earnings: {
                total: Math.round(totalEarnings * 100) / 100,
                rides: earningsData.length,
                average: earningsData.length > 0 ?
                    Math.round((totalEarnings / earningsData.length) * 100) / 100 : 0
            },
            rating: {
                average: Math.round(averageRating * 100) / 100,
                totalRatings: ratingsData.length
            },
            performance: {
                acceptanceRate: 85, // This would need more complex calculation
                cancellationRate: rideStats.length > 0 ?
                    Math.round((rideStats.find(stat => stat.status === 'CANCELLED')?._count.id || 0) /
                        rideStats.reduce((sum, stat) => sum + stat._count.id, 0) * 100) : 0
            }
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error fetching driver statistics:', error);
        res.status(500).json({
            error: 'Failed to fetch driver statistics',
            details: error.message
        });
    }
});

// Delete driver account (soft delete)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { reason, password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required to delete account' });
        }

        // Verify password
        const driver = await prisma.user.findUnique({
            where: { id: driverId },
            select: { password: true, email: true, phone: true, isActive: true, preferences: true }
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, driver.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Check for active rides
        const activeRides = await prisma.rides.findMany({
            where: {
                driverId,
                status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] }
            }
        });

        if (activeRides.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete account with active rides. Please complete or cancel active rides first.'
            });
        }

        // Soft delete the account
        const existingPreferences =
            driver.preferences && typeof driver.preferences === 'object'
                ? driver.preferences
                : {};

        await prisma.user.update({
            where: { id: driverId },
            data: {
                isActive: false,
                deletedAt: new Date(),
                email: driver.email ? `deleted_${Date.now()}_${driver.email}` : null,
                phone: driver.phone ? `deleted_${Date.now()}_${driver.phone}` : null,
                preferences: {
                    ...existingPreferences,
                    accountDeletion: {
                        reason: reason || 'User requested account deletion',
                        deletedAt: new Date().toISOString(),
                    },
                },
            }
        });

        res.json({
            success: true,
            message: 'Account deleted successfully. We\'re sorry to see you go!'
        });

    } catch (error) {
        console.error('Error deleting driver account:', error);
        res.status(500).json({
            error: 'Failed to delete account',
            details: error.message
        });
    }
});

module.exports = router;
