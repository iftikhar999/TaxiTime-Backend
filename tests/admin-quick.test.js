const request = require('supertest');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

// Create minimal test app for testing routes in isolation
const createTestApp = () => {
    const app = express();
    app.use(express.json());

    // Mount admin routes
    app.use('/api/admin/subscription-plans', require('../routes/admin-subscription-plans'));
    app.use('/api/admin/billing', require('../routes/admin-billing'));

    return app;
};

const prisma = new PrismaClient();

describe('Admin API Integration Tests - Quick', () => {
    let app;
    let adminToken;

    beforeAll(async () => {
        app = createTestApp();

        // Create test admin token
        adminToken = jwt.sign(
            { id: 'test-admin', role: 'super_admin', email: 'admin@test.com' },
            process.env.JWT_SECRET || 'your-secret-key'
        );
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Basic Authentication Tests', () => {
        test('should deny access without token to subscription plans', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans');

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Access denied. No token provided.');
        });

        test('should deny access without token to billing', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies');

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Access denied. No token provided.');
        });

        test('should deny access with invalid token', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Invalid token.');
        });

        test('should allow access with valid admin token', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('API Structure Tests', () => {
        test('subscription plans endpoint should return array', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('billing companies endpoint should return array', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('billing stats endpoint should return statistics object', async () => {
            const response = await request(app)
                .get('/api/admin/billing/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalRevenue');
            expect(response.body).toHaveProperty('activeSubscriptions');
            expect(response.body).toHaveProperty('pendingBills');
            expect(response.body).toHaveProperty('overduePayments');
        });
    });

    describe('Input Validation Tests', () => {
        test('should validate required fields when creating subscription plan', async () => {
            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Test Plan'
                    // Missing required fields
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Missing required fields');
        });

        test('should validate manual payment fields', async () => {
            const response = await request(app)
                .post('/api/admin/billing/companies/test-id/manual-payment')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    // Missing amount and method
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Amount and payment method are required');
        });
    });

    describe('Error Handling Tests', () => {
        test('should handle non-existent subscription plan', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans/99999/subscribers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Subscription plan not found');
        });

        test('should handle non-existent company for billing', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies/non-existent-id/details')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });
    });
});

// Simple data validation tests
describe('Data Processing Tests', () => {
    test('should process billing periods correctly', async () => {
        const periods = ['current_month', 'last_month', 'current_quarter', 'last_quarter', 'current_year'];

        for (const period of periods) {
            const response = await request(createTestApp())
                .get(`/api/admin/billing/companies?period=${period}`)
                .set('Authorization', jwt.sign(
                    { id: 'test', role: 'super_admin' },
                    process.env.JWT_SECRET || 'your-secret-key'
                ));

            expect(response.status).toBe(200);
        }
    });

    test('should handle billing reports with filters', async () => {
        const app = createTestApp();
        const token = jwt.sign(
            { id: 'test', role: 'super_admin' },
            process.env.JWT_SECRET || 'your-secret-key'
        );

        const response = await request(app)
            .get('/api/admin/billing/reports?period=current_month')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('period');
        expect(response.body).toHaveProperty('summary');
        expect(response.body).toHaveProperty('data');
    });
});

module.exports = {
    quickTests: true
};