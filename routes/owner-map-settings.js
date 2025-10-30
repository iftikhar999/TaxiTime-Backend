/**
 * Company Map Settings Routes
 * 
 * Manages company-level map settings including:
 * - Map provider (Google Maps / OpenStreetMap)
 * - API keys (encrypted)
 * - Place API provider
 * - Default preferences
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { encrypt, decrypt } = require('../lib/crypto');

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'ADMIN', 'COMPANY_ADMIN'));

// ═══════════════════════════════════════════════════════════
// GET /api/owner/map-settings - Get company map settings
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        const { companyId } = req.user;

        // Get or create settings
        let settings = await prisma.companySettings.findUnique({
            where: { companyId }
        });

        if (!settings) {
            // Create default settings
            settings = await prisma.companySettings.create({
                data: {
                    companyId,
                    mapProvider: 'OPENSTREETMAP',
                    placeApiProvider: 'OPENSTREETMAP',
                    defaultLanguage: 'en',
                    defaultCurrency: 'USD',
                    timezone: 'UTC'
                }
            });
        }

        // Don't send encrypted API key, just indicate if it exists
        res.json({
            success: true,
            data: {
                id: settings.id,
                companyId: settings.companyId,
                mapProvider: settings.mapProvider,
                hasGoogleMapsApiKey: !!settings.googleMapsApiKey,
                placeApiProvider: settings.placeApiProvider,
                defaultLanguage: settings.defaultLanguage,
                defaultCurrency: settings.defaultCurrency,
                timezone: settings.timezone,
                updatedAt: settings.updatedAt
            }
        });

    } catch (error) {
        console.error('Get map settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company map settings',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/map-settings - Update company map settings
// ═══════════════════════════════════════════════════════════
router.put('/', async (req, res) => {
    try {
        const { companyId } = req.user;
        const {
            mapProvider,
            googleMapsApiKey,
            placeApiProvider,
            defaultLanguage,
            defaultCurrency,
            timezone
        } = req.body;

        // Validate map provider
        if (mapProvider && !['GOOGLE_MAPS', 'OPENSTREETMAP'].includes(mapProvider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid map provider. Must be GOOGLE_MAPS or OPENSTREETMAP'
            });
        }

        // Validate place API provider
        if (placeApiProvider && !['GOOGLE_MAPS', 'OPENSTREETMAP'].includes(placeApiProvider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid place API provider. Must be GOOGLE_MAPS or OPENSTREETMAP'
            });
        }

        // Build update data
        const updateData = {};

        if (mapProvider) updateData.mapProvider = mapProvider;
        if (placeApiProvider) updateData.placeApiProvider = placeApiProvider;
        if (defaultLanguage) updateData.defaultLanguage = defaultLanguage;
        if (defaultCurrency) updateData.defaultCurrency = defaultCurrency;
        if (timezone) updateData.timezone = timezone;

        // Encrypt API key if provided
        if (googleMapsApiKey) {
            updateData.googleMapsApiKey = encrypt(googleMapsApiKey);
        }

        // Update or create settings
        const settings = await prisma.companySettings.upsert({
            where: { companyId },
            update: updateData,
            create: {
                companyId,
                mapProvider: mapProvider || 'OPENSTREETMAP',
                placeApiProvider: placeApiProvider || 'OPENSTREETMAP',
                defaultLanguage: defaultLanguage || 'en',
                defaultCurrency: defaultCurrency || 'USD',
                timezone: timezone || 'UTC',
                ...(googleMapsApiKey && { googleMapsApiKey: encrypt(googleMapsApiKey) })
            }
        });

        res.json({
            success: true,
            message: 'Map settings updated successfully',
            data: {
                id: settings.id,
                companyId: settings.companyId,
                mapProvider: settings.mapProvider,
                hasGoogleMapsApiKey: !!settings.googleMapsApiKey,
                placeApiProvider: settings.placeApiProvider,
                defaultLanguage: settings.defaultLanguage,
                defaultCurrency: settings.defaultCurrency,
                timezone: settings.timezone,
                updatedAt: settings.updatedAt
            }
        });

    } catch (error) {
        console.error('Update map settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update company map settings',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/owner/map-settings/provider - Quick toggle map provider
// ═══════════════════════════════════════════════════════════
router.put('/provider', async (req, res) => {
    try {
        const { companyId } = req.user;
        const { provider } = req.body;

        if (!provider || !['GOOGLE_MAPS', 'OPENSTREETMAP'].includes(provider)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid provider. Must be GOOGLE_MAPS or OPENSTREETMAP'
            });
        }

        // If switching to Google Maps, ensure API key exists
        if (provider === 'GOOGLE_MAPS') {
            const settings = await prisma.companySettings.findUnique({
                where: { companyId }
            });

            if (!settings?.googleMapsApiKey) {
                return res.status(400).json({
                    success: false,
                    message: 'Google Maps API key is required. Please set it first.'
                });
            }
        }

        const updated = await prisma.companySettings.upsert({
            where: { companyId },
            update: { mapProvider: provider },
            create: {
                companyId,
                mapProvider: provider,
                placeApiProvider: 'OPENSTREETMAP',
                defaultLanguage: 'en',
                defaultCurrency: 'USD',
                timezone: 'UTC'
            }
        });

        res.json({
            success: true,
            message: `Map provider switched to ${provider}`,
            data: {
                mapProvider: updated.mapProvider
            }
        });

    } catch (error) {
        console.error('Update map provider error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update map provider',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/owner/map-settings/test-api-key - Test Google Maps API key
// ═══════════════════════════════════════════════════════════
router.post('/test-api-key', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                message: 'API key is required'
            });
        }

        // Test Google Maps Geocoding API
        const testResponse = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=${apiKey}`
        );

        const testData = await testResponse.json();

        if (testData.status === 'OK') {
            res.json({
                success: true,
                message: 'API key is valid',
                data: {
                    valid: true,
                    provider: 'Google Maps'
                }
            });
        } else if (testData.status === 'REQUEST_DENIED') {
            res.status(400).json({
                success: false,
                message: 'API key is invalid or denied',
                data: {
                    valid: false,
                    error: testData.error_message || 'REQUEST_DENIED'
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'API key test failed',
                data: {
                    valid: false,
                    status: testData.status
                }
            });
        }

    } catch (error) {
        console.error('Test API key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test API key',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET /api/owner/map-settings/api-key - Get decrypted API key (use carefully)
// ═══════════════════════════════════════════════════════════
router.get('/api-key', async (req, res) => {
    try {
        const { companyId } = req.user;

        const settings = await prisma.companySettings.findUnique({
            where: { companyId }
        });

        if (!settings?.googleMapsApiKey) {
            return res.status(404).json({
                success: false,
                message: 'No API key found'
            });
        }

        // Decrypt and return
        const decryptedKey = decrypt(settings.googleMapsApiKey);

        res.json({
            success: true,
            data: {
                apiKey: decryptedKey,
                provider: settings.mapProvider
            }
        });

    } catch (error) {
        console.error('Get API key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve API key',
            error: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/owner/map-settings/api-key - Remove API key
// ═══════════════════════════════════════════════════════════
router.delete('/api-key', async (req, res) => {
    try {
        const { companyId } = req.user;

        // Check if using Google Maps
        const settings = await prisma.companySettings.findUnique({
            where: { companyId }
        });

        if (settings?.mapProvider === 'GOOGLE_MAPS') {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove API key while using Google Maps. Switch to OpenStreetMap first.'
            });
        }

        // Remove API key
        await prisma.companySettings.update({
            where: { companyId },
            data: { googleMapsApiKey: null }
        });

        res.json({
            success: true,
            message: 'API key removed successfully'
        });

    } catch (error) {
        console.error('Delete API key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove API key',
            error: error.message
        });
    }
});

module.exports = router;
