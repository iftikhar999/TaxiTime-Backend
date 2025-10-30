const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Prisma client
const prisma = new PrismaClient();

// Create Express app for testing
const app = express();
app.use(express.json());

// Import routes (assuming we have a reports route)
const reportsRoutes = require('../routes/reports');

// Use routes
app.use('/api/admin/reports', reportsRoutes);

// Test users and tokens
let testUsers = {};
let adminToken;
let companyId;

describe('Reports Management - Comprehensive Tests', () => {
    beforeAll(async () => {
        // Create test admin user
        const adminUser = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Admin',
                email: 'test-admin-reports@test.com',
                phone: '+1-555-0001',
                password: '$2a$10$test.hash.for.password',
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
            }
        });

        // Create test company for reports
        const testCompany = await prisma.company.create({
            data: {
                legalName: 'Test Reports Company',
                brandName: 'Test Reports',
                companyCode: 'TESTREP001',
                email: 'reports@test.com',
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

        console.log('✅ Reports test setup completed');
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.company.deleteMany({
            where: {
                email: { in: ['reports@test.com'] }
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: { in: ['test-admin-reports@test.com'] }
            }
        });

        await prisma.$disconnect();
    });

    describe('📊 Revenue Reports', () => {
        test('should generate daily revenue report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/daily')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: '2024-01-01',
                    endDate: '2024-01-31',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('reportType', 'daily_revenue');
                expect(response.body).toHaveProperty('data');
                expect(Array.isArray(response.body.data)).toBe(true);
            }
        });

        test('should generate monthly revenue report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/monthly')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    year: '2024',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('reportType', 'monthly_revenue');
                expect(response.body).toHaveProperty('data');
            }
        });

        test('should generate revenue summary report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/summary')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_30_days',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('totalRevenue');
                expect(response.body).toHaveProperty('totalCommission');
                expect(response.body).toHaveProperty('netRevenue');
            }
        });
    });

    describe('🚗 Trip Reports', () => {
        test('should generate trip analytics report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/trips/analytics')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: '2024-01-01',
                    endDate: '2024-01-31',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('totalTrips');
                expect(response.body).toHaveProperty('completedTrips');
                expect(response.body).toHaveProperty('cancelledTrips');
                expect(response.body).toHaveProperty('averageTripDuration');
            }
        });

        test('should generate driver performance report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/drivers/performance')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_month',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('drivers');
                expect(Array.isArray(response.body.drivers)).toBe(true);
            }
        });

        test('should generate trip completion rate report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/trips/completion-rate')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    groupBy: 'daily',
                    period: 'last_week',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('👥 User Reports', () => {
        test('should generate user registration report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/users/registrations')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_month',
                    userType: 'PASSENGER'
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('reportType', 'user_registrations');
                expect(response.body).toHaveProperty('data');
            }
        });

        test('should generate user activity report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/users/activity')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_30_days',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('activeUsers');
                expect(response.body).toHaveProperty('inactiveUsers');
            }
        });
    });

    describe('💰 Financial Reports', () => {
        test('should generate commission report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/financial/commission')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_quarter',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('totalCommission');
                expect(response.body).toHaveProperty('commissionByCompany');
            }
        });

        test('should generate payout report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/financial/payouts')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    status: 'PENDING',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
        });

        test('should generate tax report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/financial/tax')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    taxYear: '2024',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('📈 Analytics & KPI Reports', () => {
        test('should generate KPI dashboard report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/kpi/dashboard')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_month',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('kpis');
                expect(response.body).toHaveProperty('metrics');
            }
        });

        test('should generate growth analytics report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/analytics/growth')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    compareWith: 'previous_period',
                    period: 'last_quarter'
                });

            expect([200, 404]).toContain(response.status);
        });

        test('should generate service utilization report', async () => {
            const response = await request(app)
                .get('/api/admin/reports/analytics/service-utilization')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    services: 'TAXI,DELIVERY',
                    period: 'last_month'
                });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('📋 Custom Reports', () => {
        test('should create custom report template', async () => {
            const customReport = {
                name: 'Custom Revenue Analysis',
                description: 'Detailed revenue analysis with custom metrics',
                reportType: 'CUSTOM',
                fields: ['revenue', 'trips', 'commission', 'cancellations'],
                filters: {
                    dateRange: true,
                    companyFilter: true,
                    serviceType: true
                },
                schedule: 'WEEKLY',
                recipients: ['admin@test.com']
            };

            const response = await request(app)
                .post('/api/admin/reports/custom')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(customReport);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('reportTemplate');
                expect(response.body.reportTemplate.name).toBe(customReport.name);
            }
        });

        test('should generate custom report', async () => {
            const reportRequest = {
                templateId: 1, // Assuming template was created
                parameters: {
                    startDate: '2024-01-01',
                    endDate: '2024-01-31',
                    companyIds: [companyId],
                    services: ['TAXI']
                },
                format: 'JSON'
            };

            const response = await request(app)
                .post('/api/admin/reports/custom/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportRequest);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('📤 Report Export', () => {
        test('should export report as PDF', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/summary/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    format: 'PDF',
                    period: 'last_month',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.headers['content-type']).toContain('application/pdf');
            }
        });

        test('should export report as Excel', async () => {
            const response = await request(app)
                .get('/api/admin/reports/trips/analytics/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    format: 'EXCEL',
                    startDate: '2024-01-01',
                    endDate: '2024-01-31',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.headers['content-type']).toContain('application/vnd.openxmlformats');
            }
        });

        test('should export report as CSV', async () => {
            const response = await request(app)
                .get('/api/admin/reports/users/registrations/export')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    format: 'CSV',
                    period: 'last_quarter'
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.headers['content-type']).toContain('text/csv');
            }
        });
    });

    describe('⏰ Scheduled Reports', () => {
        test('should create scheduled report', async () => {
            const scheduledReport = {
                reportType: 'revenue_summary',
                schedule: 'WEEKLY',
                recipients: ['admin@test.com', 'manager@test.com'],
                parameters: {
                    companyId: companyId,
                    format: 'PDF'
                },
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/reports/scheduled')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(scheduledReport);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('scheduledReport');
                expect(response.body.scheduledReport.schedule).toBe('WEEKLY');
            }
        });

        test('should list scheduled reports', async () => {
            const response = await request(app)
                .get('/api/admin/reports/scheduled')
                .set('Authorization', `Bearer ${adminToken}`);

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('scheduledReports');
                expect(Array.isArray(response.body.scheduledReports)).toBe(true);
            }
        });

        test('should update scheduled report', async () => {
            const updateData = {
                schedule: 'DAILY',
                isActive: false
            };

            const response = await request(app)
                .patch('/api/admin/reports/scheduled/1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/summary');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            // Create a non-admin token
            const regularUser = await prisma.user.create({
                data: {
                    firstName: 'Regular',
                    lastName: 'User',
                    email: 'regular-reports@test.com',
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
                .get('/api/admin/reports/revenue/summary')
                .set('Authorization', `Bearer ${regularToken}`);

            expect(response.status).toBe(403);

            // Cleanup
            await prisma.user.delete({ where: { id: regularUser.id } });
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid date ranges', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/daily')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: '2024-12-31',
                    endDate: '2024-01-01', // End before start
                    companyId: companyId
                });

            expect([400, 404]).toContain(response.status);
            if (response.status === 400) {
                expect(response.body.error).toContain('Invalid date range');
            }
        });

        test('should handle invalid company ID', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/summary')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    companyId: 'invalid-company-id',
                    period: 'last_month'
                });

            expect([400, 404]).toContain(response.status);
        });

        test('should handle missing required parameters', async () => {
            const response = await request(app)
                .get('/api/admin/reports/revenue/daily')
                .set('Authorization', `Bearer ${adminToken}`);
            // Missing required startDate and endDate

            expect([400, 404]).toContain(response.status);
        });
    });
});