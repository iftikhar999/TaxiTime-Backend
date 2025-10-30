const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client
const prisma = new PrismaClient();

// Create Express app for testing
const app = express();
app.use(express.json());

// Import routes
const masterDataRoutes = require('../routes/master-data');
const adminSettingsRoutes = require('../routes/admin-settings');

// Use routes
app.use('/api/master-data', masterDataRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);

// Generate test admin token
function generateAdminToken() {
    return jwt.sign(
        {
            userId: 'test-admin-id',
            role: 'SUPER_ADMIN',
            email: 'admin@test.com'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
    );
}

describe('Master Data Management - Comprehensive Tests', () => {
    let adminToken;
    let testMasterData = {};

    beforeAll(async () => {
        adminToken = generateAdminToken();

        try {
            // Create test master data entries for testing
            console.log('✅ Master data test setup started');
        } catch (error) {
            console.error('❌ Master data test setup error:', error);
        }
    });

    afterAll(async () => {
        try {
            // Cleanup test data - be careful with master data
            console.log('✅ Master data cleanup completed');
        } catch (error) {
            console.error('Cleanup error:', error);
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('🌍 Geographic Master Data', () => {
        test('should get list of countries', async () => {
            const response = await request(app)
                .get('/api/master-data/countries')
                .set('Authorization', `Bearer ${adminToken}`);

            console.log('Countries response:', response.status, response.body);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body).toHaveProperty('total');
            expect(response.body).toHaveProperty('pagination');
        });

        test('should search countries by name', async () => {
            const response = await request(app)
                .get('/api/master-data/countries?search=United')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
            if (response.body.data.length > 0) {
                expect(response.body.data[0].name).toContain('United');
            }
        });

        test('should create a new country entry', async () => {
            const newCountry = {
                name: 'Test Country',
                code: 'TC',
                iso3: 'TCO',
                dialCode: '+999',
                currency: 'TCC',
                flag: '🏳️',
                isActive: true
            };

            const response = await request(app)
                .post('/api/master-data/countries')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newCountry);

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe(newCountry.name);
            expect(response.body.data.code).toBe(newCountry.code);

            testMasterData.country = response.body.data;
        });

        test('should update country information', async () => {
            if (!testMasterData.country) {
                console.log('⚠️ Skipping test - no test country available');
                return;
            }

            const updates = {
                name: 'Updated Test Country',
                dialCode: '+998'
            };

            const response = await request(app)
                .put(`/api/master-data/countries/${testMasterData.country.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe(updates.name);
        });
    });

    describe('💰 Currency Master Data', () => {
        test('should get list of currencies', async () => {
            const response = await request(app)
                .get('/api/master-data/currencies')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should create a new currency', async () => {
            const newCurrency = {
                name: 'Test Coin',
                code: 'TST',
                symbol: '₸',
                rate: 1.00,
                isActive: true
            };

            const response = await request(app)
                .post('/api/master-data/currencies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newCurrency);

            expect(response.status).toBe(201);
            expect(response.body.data.code).toBe(newCurrency.code);

            testMasterData.currency = response.body.data;
        });

        test('should update currency exchange rates', async () => {
            if (!testMasterData.currency) {
                console.log('⚠️ Skipping test - no test currency available');
                return;
            }

            const response = await request(app)
                .patch(`/api/master-data/currencies/${testMasterData.currency.id}/rate`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ rate: 1.25 });

            expect(response.status).toBe(200);
            expect(response.body.data.rate).toBe(1.25);
        });
    });

    describe('🚗 Vehicle Master Data', () => {
        test('should get vehicle types', async () => {
            const response = await request(app)
                .get('/api/master-data/vehicleTypes')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should create a new vehicle type', async () => {
            const newVehicleType = {
                name: 'Test Vehicle',
                category: 'SPECIALTY',
                capacity: 6,
                description: 'Test specialty vehicle',
                baseRate: 2.50,
                features: ['test_feature_1', 'test_feature_2'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/master-data/vehicleTypes')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newVehicleType);

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe(newVehicleType.name);

            testMasterData.vehicleType = response.body.data;
        });

        test('should get vehicle makes', async () => {
            const response = await request(app)
                .get('/api/master-data/vehicleMakes')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should create a new vehicle make', async () => {
            const newMake = {
                name: 'Test Motors',
                country: 'Test Country',
                logo: 'https://example.com/test-logo.png',
                isActive: true
            };

            const response = await request(app)
                .post('/api/master-data/vehicleMakes')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newMake);

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe(newMake.name);

            testMasterData.vehicleMake = response.body.data;
        });
    });

    describe('🏢 Service Area Master Data', () => {
        test('should get service zones', async () => {
            const response = await request(app)
                .get('/api/master-data/zones')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should create a new service zone', async () => {
            const newZone = {
                name: 'Test Zone',
                type: 'CITY',
                boundaries: {
                    type: 'Polygon',
                    coordinates: [[[
                        [-74.0059, 40.7128],
                        [-74.0059, 40.7589],
                        [-73.9352, 40.7589],
                        [-73.9352, 40.7128],
                        [-74.0059, 40.7128]
                    ]]]
                },
                centerPoint: {
                    latitude: 40.7358,
                    longitude: -73.9706
                },
                isActive: true,
                priority: 1
            };

            const response = await request(app)
                .post('/api/master-data/zones')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newZone);

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe(newZone.name);

            testMasterData.zone = response.body.data;
        });
    });

    describe('💳 Payment Method Master Data', () => {
        test('should get payment methods', async () => {
            const response = await request(app)
                .get('/api/master-data/paymentMethods')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should create a new payment method', async () => {
            const newPaymentMethod = {
                name: 'Test Pay',
                type: 'DIGITAL_WALLET',
                provider: 'TestPay Inc',
                processingFee: 2.5,
                isActive: true,
                supportedCurrencies: ['USD', 'EUR', 'GBP'],
                configuration: {
                    apiKey: 'test_api_key',
                    sandbox: true
                }
            };

            const response = await request(app)
                .post('/api/master-data/paymentMethods')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newPaymentMethod);

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe(newPaymentMethod.name);

            testMasterData.paymentMethod = response.body.data;
        });
    });

    describe('⚙️ System Configuration Master Data', () => {
        test('should get system settings', async () => {
            const response = await request(app)
                .get('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('settings');
        });

        test('should update system settings', async () => {
            const settings = {
                defaultCurrency: 'USD',
                defaultLanguage: 'en',
                maxRideDistance: 100,
                defaultCommissionRate: 15.0,
                enableNotifications: true,
                maintenanceMode: false
            };

            const response = await request(app)
                .put('/api/admin/settings/system')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ settings });

            expect(response.status).toBe(200);
            expect(response.body.settings.defaultCurrency).toBe('USD');
        });

        test('should get feature flags', async () => {
            const response = await request(app)
                .get('/api/admin/settings/features')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('features');
        });

        test('should update feature flags', async () => {
            const features = {
                enableFoodDelivery: true,
                enableCourierService: false,
                enableScheduledRides: true,
                enableRideSharing: false,
                enableLoyaltyProgram: true
            };

            const response = await request(app)
                .put('/api/admin/settings/features')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ features });

            expect(response.status).toBe(200);
            expect(response.body.features.enableFoodDelivery).toBe(true);
        });
    });

    describe('📊 Master Data Analytics', () => {
        test('should get master data usage statistics', async () => {
            const response = await request(app)
                .get('/api/master-data/stats/usage')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('vehicleTypeUsage');
            expect(response.body).toHaveProperty('paymentMethodUsage');
            expect(response.body).toHaveProperty('zoneActivity');
        });

        test('should validate master data integrity', async () => {
            const response = await request(app)
                .get('/api/master-data/validate/integrity')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('validationResults');
            expect(response.body).toHaveProperty('issues');
        });
    });

    describe('🔄 Master Data Synchronization', () => {
        test('should sync master data from external sources', async () => {
            const response = await request(app)
                .post('/api/master-data/sync/external')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    sources: ['countries', 'currencies'],
                    force: false
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('syncResults');
        });

        test('should backup master data', async () => {
            const response = await request(app)
                .post('/api/master-data/backup')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('backupId');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('should export master data', async () => {
            const response = await request(app)
                .get('/api/master-data/export')
                .query({
                    format: 'json',
                    types: 'countries,currencies,vehicleTypes'
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('export');
            expect(response.body.export).toHaveProperty('countries');
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token for protected routes', async () => {
            const response = await request(app)
                .post('/api/master-data/countries');

            expect(response.status).toBe(401);
        });

        test('should allow read access for authenticated users', async () => {
            const userToken = jwt.sign(
                { userId: 'user-id', role: 'DISPATCHER' },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const response = await request(app)
                .get('/api/master-data/countries')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
        });

        test('should deny write access for non-admin users', async () => {
            const userToken = jwt.sign(
                { userId: 'user-id', role: 'DISPATCHER' },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const response = await request(app)
                .post('/api/master-data/countries')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ name: 'Unauthorized Country' });

            expect(response.status).toBe(403);
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid master data type', async () => {
            const response = await request(app)
                .get('/api/master-data/invalidType')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid master data type');
        });

        test('should handle duplicate entries', async () => {
            if (!testMasterData.country) {
                console.log('⚠️ Skipping test - no test country available');
                return;
            }

            const duplicateCountry = {
                name: 'Test Country',
                code: 'TC' // Same as existing
            };

            const response = await request(app)
                .post('/api/master-data/countries')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(duplicateCountry);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('already exists');
        });

        test('should validate required fields', async () => {
            const incompleteData = {
                name: 'Incomplete'
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/master-data/countries')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(incompleteData);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('required');
        });
    });

    describe('🧹 Cleanup Test Data', () => {
        test('should cleanup test master data entries', async () => {
            // Clean up test entries created during testing
            const cleanupPromises = [];

            if (testMasterData.country) {
                cleanupPromises.push(
                    request(app)
                        .delete(`/api/master-data/countries/${testMasterData.country.id}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                );
            }

            if (testMasterData.currency) {
                cleanupPromises.push(
                    request(app)
                        .delete(`/api/master-data/currencies/${testMasterData.currency.id}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                );
            }

            if (testMasterData.vehicleType) {
                cleanupPromises.push(
                    request(app)
                        .delete(`/api/master-data/vehicleTypes/${testMasterData.vehicleType.id}`)
                        .set('Authorization', `Bearer ${adminToken}`)
                );
            }

            if (cleanupPromises.length > 0) {
                const results = await Promise.all(cleanupPromises);
                results.forEach(result => {
                    expect([200, 204]).toContain(result.status);
                });
            }

            console.log('✅ Test master data cleanup completed');
        });
    });
});