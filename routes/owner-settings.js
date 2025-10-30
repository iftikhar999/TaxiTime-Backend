const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require OWNER or COMPANY_ADMIN role and scope to company
router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN'));

const scopeToCompany = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                ownedCompany: true,
                company: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role === 'OWNER' && user.ownedCompany) {
            req.companyId = user.ownedCompany.id;
        } else if (user.role === 'COMPANY_ADMIN' && user.companyId) {
            req.companyId = user.companyId;
        } else {
            return res.status(403).json({ error: 'User not associated with any company' });
        }

        next();
    } catch (error) {
        console.error('Company scoping error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(scopeToCompany);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/company-logos/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `logo-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// GET /api/owner/settings - Get company settings
router.get('/', async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.companyId },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                companyType: true,
                primaryContactName: true,
                primaryContactEmail: true,
                primaryContactPhone: true,
                supportEmail: true,
                supportPhone: true,
                billingEmail: true,
                hqAddressLine1: true,
                hqAddressLine2: true,
                hqCity: true,
                hqState: true,
                hqPostcode: true,
                hqCountry: true,
                timezone: true,
                primaryLanguage: true,
                billingCurrency: true,
                billingCycle: true,
                logoUrl: true,
                registrationNumber: true,
                taxId: true,
                status: true
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json({ data: company });
    } catch (error) {
        console.error('Get company settings error:', error);
        res.status(500).json({ error: 'Failed to fetch company settings' });
    }
});

// PUT /api/owner/settings - Update company settings
router.put('/', async (req, res) => {
    try {
        const {
            legalName,
            brandName,
            companyType,
            primaryContactName,
            primaryContactEmail,
            primaryContactPhone,
            supportEmail,
            supportPhone,
            billingEmail,
            hqAddressLine1,
            hqAddressLine2,
            hqCity,
            hqState,
            hqPostcode,
            hqCountry,
            timezone,
            primaryLanguage,
            billingCurrency,
            billingCycle,
            registrationNumber,
            taxId
        } = req.body;

        // Validate required fields
        if (!legalName || !primaryContactEmail || !primaryContactPhone) {
            return res.status(400).json({
                error: 'Legal name, primary contact email, and phone are required'
            });
        }

        const updatedCompany = await prisma.company.update({
            where: { id: req.companyId },
            data: {
                legalName,
                brandName,
                companyType,
                primaryContactName,
                primaryContactEmail,
                primaryContactPhone,
                supportEmail,
                supportPhone,
                billingEmail,
                hqAddressLine1,
                hqAddressLine2,
                hqCity,
                hqState,
                hqPostcode,
                hqCountry,
                timezone,
                primaryLanguage,
                billingCurrency,
                billingCycle,
                registrationNumber,
                taxId,
                updatedAt: new Date()
            },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                companyType: true,
                primaryContactName: true,
                primaryContactEmail: true,
                primaryContactPhone: true,
                supportEmail: true,
                supportPhone: true,
                billingEmail: true,
                hqAddressLine1: true,
                hqAddressLine2: true,
                hqCity: true,
                hqState: true,
                hqPostcode: true,
                hqCountry: true,
                timezone: true,
                primaryLanguage: true,
                billingCurrency: true,
                billingCycle: true,
                logoUrl: true,
                registrationNumber: true,
                taxId: true,
                status: true,
                updatedAt: true
            }
        });

        res.json({
            message: 'Company settings updated successfully',
            data: updatedCompany
        });
    } catch (error) {
        console.error('Update company settings error:', error);
        res.status(500).json({ error: 'Failed to update company settings' });
    }
});

// POST /api/owner/settings/logo - Upload company logo
router.post('/logo', upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No logo file provided' });
        }

        const logoUrl = `/uploads/company-logos/${req.file.filename}`;

        const updatedCompany = await prisma.company.update({
            where: { id: req.companyId },
            data: {
                logoUrl,
                updatedAt: new Date()
            },
            select: {
                id: true,
                logoUrl: true,
                updatedAt: true
            }
        });

        res.json({
            message: 'Company logo uploaded successfully',
            data: {
                logoUrl: updatedCompany.logoUrl,
                updatedAt: updatedCompany.updatedAt
            }
        });
    } catch (error) {
        console.error('Upload logo error:', error);
        res.status(500).json({ error: 'Failed to upload company logo' });
    }
});

// DELETE /api/owner/settings/logo - Remove company logo
router.delete('/logo', async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.companyId },
            select: { logoUrl: true }
        });

        if (!company || !company.logoUrl) {
            return res.status(404).json({ error: 'No logo found to remove' });
        }

        // Remove logo file from filesystem
        const fs = require('fs').promises;
        const logoPath = path.join(__dirname, '..', company.logoUrl);

        try {
            await fs.unlink(logoPath);
        } catch (fileError) {
            console.warn('Could not remove logo file:', fileError.message);
        }

        // Update database
        await prisma.company.update({
            where: { id: req.companyId },
            data: {
                logoUrl: null,
                updatedAt: new Date()
            }
        });

        res.json({ message: 'Company logo removed successfully' });
    } catch (error) {
        console.error('Remove logo error:', error);
        res.status(500).json({ error: 'Failed to remove company logo' });
    }
});

// GET /api/owner/settings/operational - Get operational settings
router.get('/operational', async (req, res) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.companyId },
            select: {
                id: true,
                operatingHours: true,
                autoDispatchEnabled: true,
                maxConcurrentRides: true,
                priceCalculationMethod: true,
                driverCommissionRate: true,
                defaultCancellationTime: true,
                allowAdvanceBooking: true,
                maxAdvanceBookingDays: true,
                requirePhoneVerification: true,
                requireDocumentUpload: true,
                autoAssignNearestDriver: true,
                enableSurgepricing: true,
                maxSurgeMultiplier: true,
                enableRideSharing: true,
                enableScheduling: true,
                maintenanceMode: true
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json({ data: company });
    } catch (error) {
        console.error('Get operational settings error:', error);
        res.status(500).json({ error: 'Failed to fetch operational settings' });
    }
});

// PUT /api/owner/settings/operational - Update operational settings
router.put('/operational', async (req, res) => {
    try {
        const {
            operatingHours,
            autoDispatchEnabled,
            maxConcurrentRides,
            priceCalculationMethod,
            driverCommissionRate,
            defaultCancellationTime,
            allowAdvanceBooking,
            maxAdvanceBookingDays,
            requirePhoneVerification,
            requireDocumentUpload,
            autoAssignNearestDriver,
            enableSurgepricing,
            maxSurgeMultiplier,
            enableRideSharing,
            enableScheduling,
            maintenanceMode
        } = req.body;

        const updatedCompany = await prisma.company.update({
            where: { id: req.companyId },
            data: {
                operatingHours,
                autoDispatchEnabled,
                maxConcurrentRides,
                priceCalculationMethod,
                driverCommissionRate,
                defaultCancellationTime,
                allowAdvanceBooking,
                maxAdvanceBookingDays,
                requirePhoneVerification,
                requireDocumentUpload,
                autoAssignNearestDriver,
                enableSurgepricing,
                maxSurgeMultiplier,
                enableRideSharing,
                enableScheduling,
                maintenanceMode,
                updatedAt: new Date()
            }
        });

        res.json({
            message: 'Operational settings updated successfully',
            data: updatedCompany
        });
    } catch (error) {
        console.error('Update operational settings error:', error);
        res.status(500).json({ error: 'Failed to update operational settings' });
    }
});

// GET /api/owner/settings/notifications - Get notification preferences
router.get('/notifications', async (req, res) => {
    try {
        // Mock notification settings - in real implementation, query database
        const notificationSettings = {
            email: {
                newBookings: true,
                cancellations: true,
                paymentAlerts: true,
                driverUpdates: true,
                systemUpdates: false,
                marketingEmails: false
            },
            sms: {
                urgentAlerts: true,
                paymentFailures: true,
                systemDowntime: true,
                driverEmergencies: true
            },
            push: {
                newBookings: true,
                cancellations: true,
                driverLocationUpdates: false,
                passengerRatings: true
            },
            dashboard: {
                realTimeAlerts: true,
                dailySummary: true,
                weeklyReports: true,
                monthlyReports: true
            }
        };

        res.json({ data: notificationSettings });
    } catch (error) {
        console.error('Get notification settings error:', error);
        res.status(500).json({ error: 'Failed to fetch notification settings' });
    }
});

// PUT /api/owner/settings/notifications - Update notification preferences
router.put('/notifications', async (req, res) => {
    try {
        const { email, sms, push, dashboard } = req.body;

        // In real implementation, update notification preferences in database
        // For now, return success with the updated settings
        const updatedSettings = {
            email,
            sms,
            push,
            dashboard
        };

        res.json({
            message: 'Notification preferences updated successfully',
            data: updatedSettings
        });
    } catch (error) {
        console.error('Update notification settings error:', error);
        res.status(500).json({ error: 'Failed to update notification preferences' });
    }
});

module.exports = router;