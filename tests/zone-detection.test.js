/**
 * Zone Detection Integration Tests
 * Tests the zone detection API and algorithms
 */

const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const baseURL = 'http://localhost:3000';

describe('Zone Detection API', () => {
    let testZone;
    let testTariff;
    let testCompany;

    beforeAll(async () => {
        // Create test company
        testCompany = await prisma.company.findFirst();

        if (!testCompany) {
            console.log('⚠️  No company found in database. Please create a company first.');
            return;
        }

        // Create test tariff
        testTariff = await prisma.tariff.create({
            data: {
                companyId: testCompany.id,
                name: 'Test Zone Tariff',
                identifier: 'TEST_ZONE_TARIFF',
                baseFare: 5.0,
                perKm: 2.0,
                perMinute: 0.5,
                minimumFare: 8.0,
                bookingFee: 1.0,
                isActive: true,
            },
        });

        // Create test circular zone (Downtown)
        testZone = await prisma.zone.create({
            data: {
                companyId: testCompany.id,
                name: 'Test Downtown Zone',
                description: 'Test zone for integration testing',
                color: '#FF5733',
                type: 'CIRCLE',
                boundaries: {
                    center: { lat: 40.7128, lng: -74.0060 }, // New York City center
                    radius: 5, // 5km radius
                },
                isActive: true,
            },
        });

        // Link tariff to zone
        await prisma.zoneTariff.create({
            data: {
                zoneId: testZone.id,
                tariffId: testTariff.id,
                isDefault: true,
                priority: 1,
            },
        });

        console.log('✅ Test data created');
    });

    afterAll(async () => {
        // Clean up test data
        if (testZone) {
            await prisma.zoneTariff.deleteMany({ where: { zoneId: testZone.id } });
            await prisma.zone.delete({ where: { id: testZone.id } });
        }
        if (testTariff) {
            await prisma.tariff.delete({ where: { id: testTariff.id } });
        }
        await prisma.$disconnect();
        console.log('✅ Test data cleaned up');
    });

    describe('GET /api/dispatch/zones/detect', () => {
        test('should detect zone when coordinates are inside', async () => {
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 40.7128, // NYC center (inside test zone)
                    lng: -74.0060,
                });

            expect(response.status).toBe(200);
            expect(response.body.zone).toBeDefined();
            expect(response.body.zone.id).toBe(testZone.id);
            expect(response.body.zone.name).toBe('Test Downtown Zone');
            expect(response.body.tariffs).toBeInstanceOf(Array);
            expect(response.body.tariffs.length).toBeGreaterThan(0);
            expect(response.body.defaultTariff).toBeDefined();
        });

        test('should return null when coordinates are outside all zones', async () => {
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 0, // Middle of ocean
                    lng: 0,
                });

            expect(response.status).toBe(200);
            expect(response.body.zone).toBeNull();
            expect(response.body.tariffs).toEqual([]);
            expect(response.body.defaultTariff).toBeNull();
        });

        test('should return 400 for missing lat/lng parameters', async () => {
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({ lat: 40.7128 }); // Missing lng

            expect(response.status).toBe(400);
        });

        test('should return 400 for invalid coordinates', async () => {
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 'invalid',
                    lng: 'invalid',
                });

            expect(response.status).toBe(400);
        });
    });

    describe('GET /api/dispatch/zones/:zoneId/tariffs', () => {
        test('should return zone tariffs', async () => {
            const response = await request(baseURL)
                .get(`/api/dispatch/zones/${testZone.id}/tariffs`);

            expect(response.status).toBe(200);
            expect(response.body.tariffs).toBeInstanceOf(Array);
            expect(response.body.tariffs.length).toBeGreaterThan(0);

            const tariff = response.body.tariffs[0];
            expect(tariff.tariff).toBeDefined();
            expect(tariff.tariff.name).toBe('Test Zone Tariff');
            expect(tariff.isDefault).toBe(true);
        });

        test('should return 404 for non-existent zone', async () => {
            const response = await request(baseURL)
                .get('/api/dispatch/zones/non-existent-id/tariffs');

            expect(response.status).toBe(404);
        });
    });

    describe('Zone Detection Algorithms', () => {
        test('should detect circular zone correctly', async () => {
            // Point 2km from center (should be inside 5km radius)
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 40.7128 + 0.018, // ~2km north
                    lng: -74.0060,
                });

            expect(response.status).toBe(200);
            expect(response.body.zone).toBeDefined();
            expect(response.body.zone.id).toBe(testZone.id);
        });

        test('should NOT detect zone when outside radius', async () => {
            // Point 10km from center (outside 5km radius)
            const response = await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 40.7128 + 0.09, // ~10km north
                    lng: -74.0060,
                });

            expect(response.status).toBe(200);
            expect(response.body.zone).toBeNull();
        });
    });

    describe('Performance Tests', () => {
        test('zone detection should complete within 500ms', async () => {
            const startTime = Date.now();

            await request(baseURL)
                .get('/api/dispatch/zones/detect')
                .query({
                    lat: 40.7128,
                    lng: -74.0060,
                });

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(500);
            console.log(`✅ Zone detection completed in ${duration}ms`);
        });
    });
});

describe('Zone Management API', () => {
    describe('GET /api/zones', () => {
        test('should return list of zones', async () => {
            const response = await request(baseURL).get('/api/zones');

            expect(response.status).toBe(200);
            expect(response.body.zones).toBeInstanceOf(Array);
        });
    });
});

console.log('🧪 Zone Detection Tests Ready to Run');
console.log('Run with: cd /Applications/A_B_TAXI/backend && npm test');
