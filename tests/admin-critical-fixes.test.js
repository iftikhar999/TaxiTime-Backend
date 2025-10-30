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
const adminSubscriptionPlansRoutes = require('../routes/admin-subscription-plans');
const adminBillingRoutes = require('../routes/admin-billing');

// Use routes
app.use('/api/admin/subscription-plans', adminSubscriptionPlansRoutes);
app.use('/api/admin/billing', adminBillingRoutes);

// Generate test admin token
function generateAdminToken() {
    return jwt.sign(
        {
            userId: 'test-admin-id',
            role: 'super_admin',
            email: 'admin@test.com'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
    );
}

describe('Admin Subscription System - Critical Fixes Test', () => {
    let adminToken;

    beforeAll(async () => {
        adminToken = generateAdminToken();

        try {
            // Create test owner user first (foreign key dependency)
            await prisma.user.upsert({
                where: { id: 'test-owner-1' },
                update: {},
                create: {
                    id: 'test-owner-1',
                    firstName: 'Test',
                    lastName: 'Owner',
                    email: 'owner@test.com',
                    phone: '+1234567' + Math.floor(Math.random() * 1000),
                    password: 'hashedpassword',
                    role: 'OWNER'
                }
            });

            // Create a test subscription plan
            await prisma.subscriptionPlan.upsert({
                where: { name: 'Test Basic Plan Setup' },
                update: {},
                create: {
                    name: 'Test Basic Plan Setup',
                    description: 'Basic test plan for setup',
                    price: 99.99,
                    billingCycle: 'monthly',
                    vehicleLimit: 10,
                    driverLimit: 15,
                    rideCommission: 5.0,
                    features: ['basic_dispatch', 'driver_tracking'],
                    isActive: true
                }
            });

            // Get the created subscription plan to use its ID
            const testPlan = await prisma.subscriptionPlan.findFirst({
                where: { name: 'Test Basic Plan Setup' }
            });

            // Create a test company
            await prisma.company.upsert({
                where: { id: 'test-company-1' },
                update: {},
                create: {
                    id: 'test-company-1',
                    legalName: 'Test Taxi Company',
                    subscriptionPlanId: testPlan.id,
                    ownerId: 'test-owner-1',
                    status: 'ACTIVE'
                }
            });

        } catch (error) {
            console.error('Test setup error:', error);
        }
    }); afterAll(async () => {
        // Cleanup test data
        try {
            await prisma.company.deleteMany({ where: { id: { startsWith: 'test-' } } });
            await prisma.user.deleteMany({ where: { id: { startsWith: 'test-' } } });
            await prisma.subscriptionPlan.deleteMany({ where: { name: { contains: 'Test' } } });
        } catch (error) {
            console.error('Cleanup error:', error);
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('Basic API Functionality', () => {
        test('should fetch subscription plans successfully', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            console.log('Subscription plans response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should fetch billing companies successfully', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            console.log('Billing companies response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should fetch billing statistics successfully', async () => {
            const response = await request(app)
                .get('/api/admin/billing/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            console.log('Billing stats response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalRevenue');
        });

        test('should create subscription plan successfully', async () => {
            const newPlan = {
                name: 'Test Premium Plan',
                description: 'Premium test plan',
                price: 199.99,
                billingCycle: 'monthly',
                vehicleLimit: 50,
                driverLimit: 75,
                rideCommission: 8.0,
                features: ['advanced_dispatch', 'analytics', 'api_access'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newPlan);

            console.log('Create plan response:', response.status, response.body);
            expect(response.status).toBe(201);
            expect(response.body.plan).toHaveProperty('id');
            expect(response.body.plan.name).toBe(newPlan.name);
        });

        test('should generate company invoice successfully', async () => {
            const response = await request(app)
                .post('/api/admin/billing/companies/test-company-1/invoice')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    vehicleCount: 5,
                    driverCount: 8,
                    period: 'current_month'
                });

            console.log('Generate invoice response:', response.status, response.body);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('invoice');
        });
    });

    describe('Error Handling', () => {
        test('should handle unauthorized access', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans');

            expect(response.status).toBe(401);
        });

        test('should handle invalid subscription plan ID', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        test('should handle invalid company ID for billing', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies/invalid-company-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });
});