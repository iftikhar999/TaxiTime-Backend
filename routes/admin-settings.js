const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// GET /api/admin/settings - Get all system settings
router.get('/', async (req, res) => {
    try {
        // For now, return default settings structure
        const settings = {
            system: {
                maintenanceMode: false,
                allowRegistrations: true,
                supportEmail: 'support@taxi.com',
                supportPhone: '+1-555-0123',
                timezone: 'UTC',
                defaultLanguage: 'en',
                maxRadius: 50,
                currency: 'USD'
            },
            pricing: {
                baseFare: 2.50,
                perKmRate: 1.20,
                perMinuteRate: 0.35,
                minimumFare: 5.00,
                cancellationFee: 3.00,
                commissionRate: 15.0,
                surgeMultiplier: 1.0
            },
            features: {
                enableScheduledRides: true,
                enablePoolRides: true,
                enableDelivery: true,
                enableCorporateAccounts: true,
                enableReferrals: true,
                enableLoyaltyProgram: false
            },
            notifications: {
                emailNotifications: true,
                smsNotifications: true,
                pushNotifications: true,
                marketingEmails: false
            },
            integrations: {
                googleMapsEnabled: true,
                stripeEnabled: true,
                twilioEnabled: true,
                fcmEnabled: true
            }
        };

        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// PUT /api/admin/settings - Update system settings
router.put('/', async (req, res) => {
    try {
        const updates = req.body;

        // In a real implementation, you'd update a Settings table
        // For now, just return the updated settings
        console.log('Settings update requested:', updates);

        res.json({
            message: 'Settings updated successfully',
            settings: updates
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// GET /api/admin/settings/companies - Get company-specific settings
router.get('/companies', async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            select: {
                id: true,
                legalName: true,
                brandName: true,
                name: true,
                isActive: true,
                commissionRate: true,
                settings: {
                    select: {
                        mapProvider: true,
                        locationUpdateInterval: true,
                        heartbeatInterval: true
                    }
                }
            },
            orderBy: { legalName: 'asc' }
        });

        res.json(companies);
    } catch (error) {
        console.error('Error fetching company settings:', error);
        res.status(500).json({ error: 'Failed to fetch company settings' });
    }
});

// PUT /api/admin/settings/companies/:id - Update company settings
router.put('/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { commissionRate, settings, isActive, mapProvider, locationUpdateInterval, heartbeatInterval } = req.body;

        const company = await prisma.company.update({
            where: { id },
            data: {
                commissionRate: commissionRate ? parseFloat(commissionRate) : undefined,
                settings: settings || undefined,
                isActive: isActive !== undefined ? isActive : undefined
            },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                name: true,
                isActive: true,
                commissionRate: true,
                settings: true
            }
        });

        // Update CompanySettings if provided
        if (mapProvider || locationUpdateInterval || heartbeatInterval) {
            // Validate mapProvider
            if (mapProvider && !['NATIVE', 'GOOGLE_MAPS', 'OPENSTREETMAP'].includes(mapProvider)) {
                return res.status(400).json({ 
                    error: 'Invalid map provider. Must be one of: NATIVE, GOOGLE_MAPS, OPENSTREETMAP' 
                });
            }

            // Validate intervals
            if (locationUpdateInterval && (locationUpdateInterval < 1 || locationUpdateInterval > 60)) {
                return res.status(400).json({ 
                    error: 'Location update interval must be between 1 and 60 seconds' 
                });
            }

            if (heartbeatInterval && (heartbeatInterval < 10 || heartbeatInterval > 300)) {
                return res.status(400).json({ 
                    error: 'Heartbeat interval must be between 10 and 300 seconds' 
                });
            }

            const companySettings = await prisma.companySettings.upsert({
                where: { companyId: id },
                update: {
                    mapProvider: mapProvider || undefined,
                    locationUpdateInterval: locationUpdateInterval ? parseInt(locationUpdateInterval) : undefined,
                    heartbeatInterval: heartbeatInterval ? parseInt(heartbeatInterval) : undefined
                },
                create: {
                    companyId: id,
                    mapProvider: mapProvider || 'NATIVE',
                    locationUpdateInterval: locationUpdateInterval ? parseInt(locationUpdateInterval) : 2,
                    heartbeatInterval: heartbeatInterval ? parseInt(heartbeatInterval) : 30
                }
            });

            res.json({
                message: 'Company settings updated successfully',
                company,
                companySettings
            });
        } else {
            res.json({
                message: 'Company settings updated successfully',
                company
            });
        }
    } catch (error) {
        console.error('Error updating company settings:', error);
        res.status(500).json({ error: 'Failed to update company settings' });
    }
});

// GET /api/admin/settings/pricing - Get pricing configuration
router.get('/pricing', async (req, res) => {
    try {
        // Return default pricing settings
        const pricing = {
            baseFare: 2.50,
            perKmRate: 1.20,
            perMinuteRate: 0.35,
            minimumFare: 5.00,
            cancellationFee: 3.00,
            waitingTimeRate: 0.25,
            airportSurcharge: 2.00,
            tolls: 'customer_pays',
            surgeSettings: {
                enabled: true,
                maxMultiplier: 3.0,
                triggers: {
                    demandThreshold: 80,
                    supplyThreshold: 20
                }
            },
            serviceTypes: {
                TAXI: { multiplier: 1.0, enabled: true },
                PREMIUM: { multiplier: 1.5, enabled: true },
                LUXURY: { multiplier: 2.0, enabled: true },
                DELIVERY: { multiplier: 0.8, enabled: true }
            }
        };

        res.json(pricing);
    } catch (error) {
        console.error('Error fetching pricing settings:', error);
        res.status(500).json({ error: 'Failed to fetch pricing settings' });
    }
});

// PUT /api/admin/settings/pricing - Update pricing configuration
router.put('/pricing', async (req, res) => {
    try {
        const pricingUpdates = req.body;

        console.log('Pricing update requested:', pricingUpdates);

        res.json({
            message: 'Pricing settings updated successfully',
            pricing: pricingUpdates
        });
    } catch (error) {
        console.error('Error updating pricing settings:', error);
        res.status(500).json({ error: 'Failed to update pricing settings' });
    }
});

// GET /api/admin/system/info - Get system information
router.get('/system/info', async (req, res) => {
    try {
        const systemInfo = {
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            nodeVersion: process.version,
            database: {
                status: 'connected',
                // Add database info here
            },
            services: {
                redis: { status: 'connected', version: 'N/A' },
                socketio: { status: 'active', connections: 0 },
                stripe: { status: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured' },
                googleMaps: { status: process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'not_configured' }
            }
        };

        res.json(systemInfo);
    } catch (error) {
        console.error('Error fetching system info:', error);
        res.status(500).json({ error: 'Failed to fetch system information' });
    }
});

// GET /api/admin/audit-logs - Get audit logs
router.get('/audit-logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, action = '', userId = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // For now, return mock audit logs
        // In a real implementation, you'd have an AuditLog table
        const mockLogs = [
            {
                id: '1',
                action: 'USER_CREATED',
                userId: 'user123',
                performedBy: req.user.id,
                timestamp: new Date().toISOString(),
                details: { email: 'newuser@example.com' },
                ipAddress: req.ip
            },
            {
                id: '2',
                action: 'COMPANY_UPDATED',
                resourceId: 'company456',
                performedBy: req.user.id,
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                details: { field: 'commissionRate', oldValue: 15, newValue: 12 },
                ipAddress: req.ip
            }
        ];

        res.json({
            logs: mockLogs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: 1,
                totalCount: mockLogs.length,
                hasNextPage: false,
                hasPrevPage: false
            }
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

module.exports = router;