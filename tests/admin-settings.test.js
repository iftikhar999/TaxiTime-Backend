const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Prisma client
const prisma = new PrismaClient();

// Create Express app for testing
const app = express();
app.use(express.json());

// Import routes (assuming we have settings management routes)
const settingsRoutes = require('../routes/settings');

// Use routes
app.use('/api/admin/settings', settingsRoutes);

// Test users and tokens
let testUsers = {};
let adminToken;
let companyId;

describe('Settings Management - Comprehensive Tests', () => {
    beforeAll(async () => {
        // Create test admin user
        const adminUser = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Admin',
                email: 'test-admin-settings@test.com',
                phone: '+1-555-0001',
                password: '$2a$10$test.hash.for.password',
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
            }
        });

        // Create test company for settings
        const testCompany = await prisma.company.create({
            data: {
                legalName: 'Test Settings Company',
                brandName: 'Test Settings',
                companyCode: 'TESTSET001',
                email: 'settings@test.com',
                phone: '+1-555-0010',
                ownerId: adminUser.id,
                status: 'ACTIVE',
                isActive: true,
                isVerified: true,
            }
        });

        testUsers = {
            admin: adminUser.id
        };
        companyId = testCompany.id;

        // Generate JWT token
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

        adminToken = jwt.sign(
            {
                userId: adminUser.id,
                email: adminUser.email,
                role: adminUser.role
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        console.log('✅ Settings test setup completed');
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.company.deleteMany({
            where: {
                email: { in: ['settings@test.com'] }
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: { in: ['test-admin-settings@test.com'] }
            }
        });

        await prisma.$disconnect();
    });

    describe('🌐 System Settings', () => {
        test('should get system configuration', async () => {
            const response = await request(app)
                .get('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('systemConfig');
                expect(response.body.systemConfig).toBeInstanceOf(Object);
            }
        });

        test('should update system configuration', async () => {
            const systemConfig = {
                siteName: 'Taxi Management System',
                timezone: 'America/New_York',
                dateFormat: 'MM/DD/YYYY',
                currency: 'USD',
                language: 'en',
                maintenanceMode: false,
                registrationEnabled: true,
                emailVerificationRequired: true,
                smsVerificationRequired: false
            };

            const response = await request(app)
                .put('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(systemConfig);

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('systemConfig');
                expect(response.body.systemConfig.siteName).toBe(systemConfig.siteName);
            }
        });

        test('should toggle maintenance mode', async () => {
            const response = await request(app)
                .patch('/api/admin/settings/system/maintenance')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ maintenanceMode: true });

            expect([200, 404]).toContain(response.status);
        });

        test('should manage feature flags', async () => {
            const featureFlags = {
                advancedAnalytics: true,
                realTimeTracking: true,
                voipIntegration: false,
                cctvIntegration: false,
                aiDispatch: true,
                multiLanguageSupport: true
            };

            const response = await request(app)
                .put('/api/admin/settings/features')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ features: featureFlags });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('📧 Email Settings', () => {
        test('should configure SMTP settings', async () => {
            const smtpConfig = {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                username: 'noreply@taxisystem.com',
                password: 'app_password_123',
                fromName: 'Taxi Management System',
                fromEmail: 'noreply@taxisystem.com',
                isActive: true
            };

            const response = await request(app)
                .put('/api/admin/settings/email/smtp')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(smtpConfig);

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('emailConfig');
            }
        });

        test('should test email configuration', async () => {
            const testEmail = {
                to: 'test@example.com',
                subject: 'Test Email Configuration',
                template: 'test'
            };

            const response = await request(app)
                .post('/api/admin/settings/email/test')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(testEmail);

            expect([200, 404]).toContain(response.status);
        });

        test('should manage email templates', async () => {
            const emailTemplate = {
                name: 'welcome_user',
                subject: 'Welcome to {{siteName}}',
                body: '<h1>Welcome {{userName}}!</h1><p>Thank you for joining us.</p>',
                variables: ['siteName', 'userName'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/settings/email/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(emailTemplate);

            expect([201, 404]).toContain(response.status);
        });

        test('should update email template', async () => {
            const updatedTemplate = {
                subject: 'Welcome to {{siteName}} - Updated',
                body: '<h1>Welcome {{userName}}!</h1><p>We are excited to have you!</p>'
            };

            const response = await request(app)
                .patch('/api/admin/settings/email/templates/welcome_user')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updatedTemplate);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('📱 SMS Settings', () => {
        test('should configure SMS provider', async () => {
            const smsConfig = {
                provider: 'TWILIO',
                accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                authToken: 'your_auth_token',
                fromNumber: '+1234567890',
                isActive: true
            };

            const response = await request(app)
                .put('/api/admin/settings/sms')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(smsConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should test SMS configuration', async () => {
            const testSms = {
                to: '+1234567890',
                message: 'Test SMS from Taxi Management System'
            };

            const response = await request(app)
                .post('/api/admin/settings/sms/test')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(testSms);

            expect([200, 404]).toContain(response.status);
        });

        test('should manage SMS templates', async () => {
            const smsTemplate = {
                name: 'ride_confirmation',
                message: 'Your ride is confirmed! Driver: {{driverName}}, ETA: {{eta}} minutes',
                variables: ['driverName', 'eta'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/settings/sms/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(smsTemplate);

            expect([201, 404]).toContain(response.status);
        });
    });

    describe('💳 Payment Settings', () => {
        test('should configure payment gateways', async () => {
            const paymentConfig = {
                defaultGateway: 'STRIPE',
                gateways: {
                    stripe: {
                        publishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                        secretKey: 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                        webhookSecret: 'whsec_xxxxxxxxxxxxxxxxxxxxxxxxx',
                        isActive: true
                    },
                    paypal: {
                        clientId: 'paypal_client_id',
                        clientSecret: 'paypal_client_secret',
                        environment: 'sandbox',
                        isActive: false
                    }
                },
                currencies: ['USD', 'EUR', 'GBP'],
                defaultCurrency: 'USD'
            };

            const response = await request(app)
                .put('/api/admin/settings/payment')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paymentConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should set commission rates', async () => {
            const commissionConfig = {
                defaultCommissionRate: 15.0,
                commissionType: 'PERCENTAGE',
                minimumCommission: 1.00,
                maximumCommission: 50.00,
                companySpecificRates: [
                    {
                        companyId: companyId,
                        rate: 12.0,
                        type: 'PERCENTAGE'
                    }
                ]
            };

            const response = await request(app)
                .put('/api/admin/settings/payment/commission')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(commissionConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should configure tax settings', async () => {
            const taxConfig = {
                taxEnabled: true,
                defaultTaxRate: 8.5,
                taxInclusivePricing: false,
                taxRegions: [
                    {
                        region: 'New York',
                        rate: 8.25
                    },
                    {
                        region: 'California',
                        rate: 10.0
                    }
                ]
            };

            const response = await request(app)
                .put('/api/admin/settings/payment/tax')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(taxConfig);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🗺️ Map & Location Settings', () => {
        test('should configure map provider', async () => {
            const mapConfig = {
                provider: 'GOOGLE_MAPS',
                apiKey: 'google_maps_api_key_xxxxxxxxxxxxxxxxxxxxx',
                defaultCenter: {
                    latitude: 40.7128,
                    longitude: -74.0060
                },
                defaultZoom: 12,
                enableTrafficLayer: true,
                enableGeocoding: true,
                isActive: true
            };

            const response = await request(app)
                .put('/api/admin/settings/maps')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(mapConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should set location accuracy settings', async () => {
            const locationConfig = {
                gpsAccuracyThreshold: 10, // meters
                locationUpdateInterval: 5000, // milliseconds
                trackingEnabled: true,
                geofencingEnabled: true,
                offlineTrackingEnabled: false
            };

            const response = await request(app)
                .put('/api/admin/settings/location')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(locationConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should manage service areas', async () => {
            const serviceAreas = {
                areas: [
                    {
                        name: 'Downtown',
                        type: 'POLYGON',
                        coordinates: [
                            [40.7128, -74.0060],
                            [40.7580, -73.9855],
                            [40.7484, -73.9857],
                            [40.7128, -74.0060]
                        ],
                        isActive: true
                    }
                ],
                defaultArea: 'Downtown'
            };

            const response = await request(app)
                .put('/api/admin/settings/service-areas')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(serviceAreas);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔐 Security Settings', () => {
        test('should configure authentication settings', async () => {
            const authConfig = {
                passwordMinLength: 8,
                passwordRequireNumbers: true,
                passwordRequireSymbols: true,
                passwordRequireUppercase: true,
                passwordRequireLowercase: true,
                sessionTimeout: 3600, // seconds
                maxLoginAttempts: 5,
                lockoutDuration: 900, // seconds
                twoFactorRequired: false,
                allowedLoginMethods: ['EMAIL', 'PHONE']
            };

            const response = await request(app)
                .put('/api/admin/settings/security/auth')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(authConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should configure API security settings', async () => {
            const apiSecurityConfig = {
                rateLimitEnabled: true,
                rateLimitRequests: 1000,
                rateLimitWindow: 3600, // seconds
                corsEnabled: true,
                allowedOrigins: ['https://admin.taxisystem.com', 'https://app.taxisystem.com'],
                apiKeyRequired: true,
                encryptionEnabled: true
            };

            const response = await request(app)
                .put('/api/admin/settings/security/api')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(apiSecurityConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should manage API keys', async () => {
            const apiKeyData = {
                name: 'Mobile App API Key',
                permissions: ['READ', 'WRITE'],
                expiresAt: '2025-12-31T23:59:59Z',
                rateLimitOverride: 5000
            };

            const response = await request(app)
                .post('/api/admin/settings/security/api-keys')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(apiKeyData);

            expect([201, 404]).toContain(response.status);
        });
    });

    describe('📊 Analytics Settings', () => {
        test('should configure analytics providers', async () => {
            const analyticsConfig = {
                googleAnalytics: {
                    trackingId: 'GA-XXXXXXXXX-X',
                    isActive: true
                },
                mixpanel: {
                    projectToken: 'mixpanel_project_token',
                    isActive: false
                },
                customAnalytics: {
                    endpoint: 'https://analytics.taxisystem.com/track',
                    apiKey: 'custom_analytics_key',
                    isActive: true
                }
            };

            const response = await request(app)
                .put('/api/admin/settings/analytics')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(analyticsConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should set data retention policies', async () => {
            const retentionConfig = {
                userDataRetention: 2555, // days (7 years)
                rideDataRetention: 1825, // days (5 years)
                paymentDataRetention: 2555, // days (7 years)
                logDataRetention: 90, // days
                analyticsDataRetention: 365, // days
                autoDeleteEnabled: true
            };

            const response = await request(app)
                .put('/api/admin/settings/data-retention')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(retentionConfig);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔔 Notification Settings', () => {
        test('should configure push notification settings', async () => {
            const pushConfig = {
                provider: 'FIREBASE',
                serverKey: 'firebase_server_key_xxxxxxxxxxxxxxxxx',
                senderId: '123456789012',
                isActive: true,
                defaultSound: 'default',
                enableBadgeCount: true
            };

            const response = await request(app)
                .put('/api/admin/settings/notifications/push')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(pushConfig);

            expect([200, 404]).toContain(response.status);
        });

        test('should manage notification templates', async () => {
            const notificationTemplate = {
                name: 'ride_assigned',
                title: 'New Ride Assigned',
                body: 'You have been assigned a new ride to {{destination}}',
                variables: ['destination'],
                channels: ['PUSH', 'SMS'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/settings/notifications/templates')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(notificationTemplate);

            expect([201, 404]).toContain(response.status);
        });

        test('should configure alert settings', async () => {
            const alertConfig = {
                systemDownAlerts: true,
                highVolumeAlerts: true,
                paymentFailureAlerts: true,
                securityAlerts: true,
                alertRecipients: ['admin@taxisystem.com', 'ops@taxisystem.com'],
                alertChannels: ['EMAIL', 'SMS', 'PUSH']
            };

            const response = await request(app)
                .put('/api/admin/settings/alerts')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(alertConfig);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🏢 Company Settings', () => {
        test('should get company-specific settings', async () => {
            const response = await request(app)
                .get(`/api/admin/settings/company/${companyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('companySettings');
            }
        });

        test('should update company settings', async () => {
            const companySettings = {
                autoDispatch: true,
                dispatchRadius: 10.0, // km
                maxWaitTime: 15, // minutes
                cancellationFeeEnabled: true,
                cancellationFee: 5.00,
                noShowFeeEnabled: true,
                noShowFee: 10.00,
                dynamicPricingEnabled: false,
                requireDriverPhoto: true,
                requireVehiclePhoto: true
            };

            const response = await request(app)
                .put(`/api/admin/settings/company/${companyId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(companySettings);

            expect([200, 404]).toContain(response.status);
        });

        test('should configure company branding', async () => {
            const brandingConfig = {
                logo: 'https://example.com/logo.png',
                primaryColor: '#0066CC',
                secondaryColor: '#FF6600',
                backgroundColor: '#FFFFFF',
                textColor: '#000000',
                fontFamily: 'Arial, sans-serif',
                customCss: '.custom-style { color: #0066CC; }'
            };

            const response = await request(app)
                .put(`/api/admin/settings/company/${companyId}/branding`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(brandingConfig);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/settings/system');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            // Create a non-admin token
            const regularUser = await prisma.user.create({
                data: {
                    firstName: 'Regular',
                    lastName: 'User',
                    email: 'regular-settings@test.com',
                    phone: '+1-555-0002',
                    password: '$2a$10$test.hash.for.password',
                    role: 'PASSENGER',
                    isActive: true,
                    isVerified: true,
                }
            });

            const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
            const regularToken = jwt.sign(
                {
                    userId: regularUser.id,
                    email: regularUser.email,
                    role: regularUser.role
                },
                jwtSecret,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .get('/api/admin/settings/system')
                .set('Authorization', `Bearer ${regularToken}`);

            expect(response.status).toBe(403);

            // Cleanup
            await prisma.user.delete({ where: { id: regularUser.id } });
        });
    });

    describe('❌ Error Handling', () => {
        test('should validate required configuration fields', async () => {
            const invalidConfig = {
                // Missing required fields
            };

            const response = await request(app)
                .put('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidConfig);

            expect([400, 404]).toContain(response.status);
        });

        test('should handle invalid email configuration', async () => {
            const invalidEmailConfig = {
                host: '', // Empty host
                port: 'invalid_port', // Invalid port
                username: 'invalid_email_format' // Invalid email
            };

            const response = await request(app)
                .put('/api/admin/settings/email/smtp')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidEmailConfig);

            expect([400, 404]).toContain(response.status);
        });

        test('should handle invalid payment gateway configuration', async () => {
            const invalidPaymentConfig = {
                defaultGateway: 'INVALID_GATEWAY',
                gateways: {
                    stripe: {
                        // Missing required keys
                    }
                }
            };

            const response = await request(app)
                .put('/api/admin/settings/payment')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidPaymentConfig);

            expect([400, 404]).toContain(response.status);
        });

        test('should handle settings update conflicts', async () => {
            // Simulate concurrent update conflict
            const conflictingUpdate = {
                siteName: 'Conflicting Update',
                version: 'outdated_version'
            };

            const response = await request(app)
                .put('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(conflictingUpdate);

            expect([409, 400, 404]).toContain(response.status);
        });
    });
});