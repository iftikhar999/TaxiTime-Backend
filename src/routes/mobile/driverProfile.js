const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
                firstName: true, // ✅ FIX: Use firstName instead of name
                lastName: true, // ✅ FIX: Add lastName
                email: true,
                phone: true, // ✅ FIX: Use phone instead of phoneNumber
                avatar: true, // ✅ FIX: Use avatar instead of profilePicture
                address: true,
                rating: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                lastLoginAt: true,
                companyId: true, // ✅ CRITICAL: Include companyId
                company: {
                    select: {
                        id: true,
                        legalName: true, // ✅ FIX: Use legalName instead of name
                        brandName: true, // ✅ FIX: Add brandName
                        hqAddressLine1: true, // ✅ FIX: Use correct address field
                        hqCity: true,
                        hqState: true,
                        primaryContactPhone: true, // ✅ FIX: Use correct phone field
                        supportPhone: true
                    }
                }
                // ⚠️ NOTE: User model doesn't have direct vehicle relation
                // Vehicles are managed through shifts or CompanyDriver relation
            }
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
            companyId: driver.companyId || driver.company?.id, // ✅ CRITICAL: Ensure companyId is present
            company: driver.company ? {
                id: driver.company.id,
                name: driver.company.legalName || driver.company.brandName, // ✅ FIX: Map legalName/brandName to name
                legalName: driver.company.legalName,
                brandName: driver.company.brandName,
                address: driver.company.hqAddressLine1, // ✅ FIX: Map hqAddressLine1 to address
                city: driver.company.hqCity,
                state: driver.company.hqState,
                phone: driver.company.primaryContactPhone || driver.company.supportPhone // ✅ FIX: Map phone fields
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
            name,
            email,
            phoneNumber,
            dateOfBirth,
            address,
            city,
            state,
            zipCode,
            country,
            emergencyContactName,
            emergencyContactPhone,
            bankAccountNumber,
            bankName,
            bankRoutingNumber
        } = req.body;

        // Validate email uniqueness if provided
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: driverId }
                }
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Validate phone number uniqueness if provided
        if (phoneNumber) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    phoneNumber,
                    id: { not: driverId }
                }
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Phone number already in use' });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (address) updateData.address = address;
        if (city) updateData.city = city;
        if (state) updateData.state = state;
        if (zipCode) updateData.zipCode = zipCode;
        if (country) updateData.country = country;
        if (emergencyContactName) updateData.emergencyContactName = emergencyContactName;
        if (emergencyContactPhone) updateData.emergencyContactPhone = emergencyContactPhone;
        if (bankAccountNumber) updateData.bankAccountNumber = bankAccountNumber;
        if (bankName) updateData.bankName = bankName;
        if (bankRoutingNumber) updateData.bankRoutingNumber = bankRoutingNumber;

        const updatedDriver = await prisma.user.update({
            where: { id: driverId },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                country: true,
                emergencyContactName: true,
                emergencyContactPhone: true,
                bankName: true,
                updatedAt: true
            }
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedDriver
        });

    } catch (error) {
        console.error('Error updating driver profile:', error);
        res.status(500).json({
            error: 'Failed to update driver profile',
            details: error.message
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

        // Update driver profile picture
        const updatedDriver = await prisma.user.update({
            where: { id: driverId },
            data: { profilePicture: profilePicturePath },
            select: {
                id: true,
                name: true,
                profilePicture: true
            }
        });

        res.json({
            success: true,
            message: 'Profile picture updated successfully',
            data: {
                profilePicture: updatedDriver.profilePicture
            }
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

        const validTypes = ['LICENSE', 'INSURANCE', 'REGISTRATION', 'BACKGROUND_CHECK', 'MEDICAL_CERTIFICATE'];

        // Create document records
        const documents = await Promise.all(
            req.files.map(async (file, index) => {
                const documentType = types[index];

                if (!validTypes.includes(documentType)) {
                    throw new Error(`Invalid document type: ${documentType}`);
                }

                return await prisma.driverDocument.create({
                    data: {
                        driverId,
                        type: documentType,
                        fileName: file.originalname,
                        filePath: `/uploads/driver-documents/${file.filename}`,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        status: 'PENDING_REVIEW',
                        uploadedAt: new Date()
                    }
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
                uploadedAt: doc.uploadedAt
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
        const rideStats = await prisma.ride.groupBy({
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
        const earningsData = await prisma.ride.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                ...(Object.keys(dateFilter).length > 0 && { completedAt: dateFilter })
            },
            include: {
                payment: {
                    select: {
                        driverEarnings: true,
                        tips: true
                    }
                }
            }
        });

        const totalEarnings = earningsData.reduce((sum, ride) =>
            sum + (ride.payment?.driverEarnings || 0) + (ride.payment?.tips || 0), 0);

        // Get ratings data
        const ratingsData = await prisma.ride.findMany({
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
            ratingsData.reduce((sum, ride) => sum + ride.passengerRating, 0) / ratingsData.length : 0;

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
            select: { password: true, status: true }
        });

        if (!driver) {
            return res.status(404).json({ error: 'Driver not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, driver.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Check for active rides
        const activeRides = await prisma.ride.findMany({
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
        await prisma.user.update({
            where: { id: driverId },
            data: {
                status: 'DELETED',
                deletedAt: new Date(),
                deleteReason: reason || 'User requested account deletion',
                email: `deleted_${Date.now()}_${driver.email}`, // Prevent email conflicts
                phoneNumber: `deleted_${Date.now()}_${driver.phoneNumber}` // Prevent phone conflicts
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