const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const app = require('../server');

const prisma = new PrismaClient();

describe('Admin Subscription Plans API Tests', () => {
    let adminToken;
    let testCompany;
    let testSubscriptionPlan;
    let nonAdminToken;

    beforeAll(async () => {
        // Create test admin token
        const adminPayload = {
            id: 'admin-test-id',
            email: 'admin@test.com',
            role: 'super_admin'
        };
        adminToken = jwt.sign(adminPayload, process.env.JWT_SECRET || 'your-secret-key');

        // Create test non-admin token
        const userPayload = {
            id: 'user-test-id',
            email: 'user@test.com',
            role: 'owner'
        };
        nonAdminToken = jwt.sign(userPayload, process.env.JWT_SECRET || 'your-secret-key');

        // Create test company first
        testCompany = await prisma.company.create({
            data: {
                name: 'Test Taxi Company',
                email: 'test@company.com',
                phone: '+1234567890',
                ownerId: 'owner-test-id',
                status: 'ACTIVE',
                isActive: true
            }
        });

        // Create owner user for the company
        await prisma.user.create({
            data: {
                id: 'owner-test-id',
                email: 'owner@company.com',
                password: 'hashedpassword',
                firstName: 'John',
                lastName: 'Owner',
                phone: '+1234567890',
                role: 'OWNER'
            }
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.subscriptionPlan.deleteMany({
            where: {
                name: {
                    contains: 'Test'
                }
            }
        });
        await prisma.company.deleteMany({
            where: {
                name: {
                    contains: 'Test'
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: 'test'
                }
            }
        });
        await prisma.$disconnect();
    });

    describe('Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans');

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

        test('should deny access for non-admin users', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${nonAdminToken}`);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Access denied. Admin privileges required.');
        });

        test('should allow access for admin users', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/admin/subscription-plans', () => {
        test('should get all subscription plans', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should include plan statistics', async () => {
            // First create a test plan
            const testPlan = await prisma.subscriptionPlan.create({
                data: {
                    name: 'Test Basic Plan',
                    description: 'Test plan for unit testing',
                    price: 99.99,
                    billingCycle: 'monthly',
                    vehicleLimit: 5,
                    driverLimit: 10,
                    rideCommission: 8.0,
                    features: ['Basic Dashboard', 'Vehicle Management'],
                    isActive: true,
                    trialDays: 14,
                    setupFee: 0
                }
            });

            const response = await request(app)
                .get('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            const plans = response.body;
            const testPlanResponse = plans.find(p => p.id === testPlan.id);

            expect(testPlanResponse).toBeDefined();
            expect(testPlanResponse).toHaveProperty('_count');
            expect(testPlanResponse._count).toHaveProperty('companies');
        });
    });

    describe('POST /api/admin/subscription-plans', () => {
        test('should create a new subscription plan', async () => {
            const planData = {
                name: 'Test Professional Plan',
                description: 'Professional plan for testing',
                price: 299.99,
                billingCycle: 'monthly',
                vehicleLimit: 25,
                driverLimit: 50,
                rideCommission: 6.0,
                features: ['Advanced Dashboard', 'Analytics', 'Priority Support'],
                isActive: true,
                trialDays: 30,
                setupFee: 150
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(planData);

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Subscription plan created successfully');
            expect(response.body.plan).toHaveProperty('id');
            expect(response.body.plan.name).toBe(planData.name);
            expect(response.body.plan.price).toBe(planData.price);

            testSubscriptionPlan = response.body.plan;
        });

        test('should validate required fields', async () => {
            const incompleteData = {
                name: 'Incomplete Plan'
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(incompleteData);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Missing required fields');
        });

        test('should prevent duplicate plan names', async () => {
            const planData = {
                name: 'Test Professional Plan', // Same name as previous test
                description: 'Duplicate plan',
                price: 199.99,
                billingCycle: 'monthly',
                vehicleLimit: 10,
                driverLimit: 20,
                rideCommission: 7.0,
                features: ['Basic Features'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(planData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Subscription plan with this name already exists');
        });

        test('should handle unlimited limits with -1', async () => {
            const unlimitedPlan = {
                name: 'Test Unlimited Plan',
                description: 'Unlimited plan for testing',
                price: 999.99,
                billingCycle: 'monthly',
                vehicleLimit: -1,
                driverLimit: -1,
                rideCommission: 3.0,
                features: ['Everything'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(unlimitedPlan);

            expect(response.status).toBe(201);
            expect(response.body.plan.vehicleLimit).toBe(-1);
            expect(response.body.plan.driverLimit).toBe(-1);
        });
    });

    describe('PUT /api/admin/subscription-plans/:id', () => {
        test('should update an existing subscription plan', async () => {
            const updateData = {
                price: 349.99,
                description: 'Updated professional plan',
                rideCommission: 5.5
            };

            const response = await request(app)
                .put(`/api/admin/subscription-plans/${testSubscriptionPlan.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Subscription plan updated successfully');
            expect(response.body.plan.price).toBe(updateData.price);
            expect(response.body.plan.description).toBe(updateData.description);
        });

        test('should return 404 for non-existent plan', async () => {
            const response = await request(app)
                .put('/api/admin/subscription-plans/99999')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ price: 100 });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Subscription plan not found');
        });

        test('should prevent name conflicts when updating', async () => {
            // Create another plan first
            const anotherPlan = await prisma.subscriptionPlan.create({
                data: {
                    name: 'Another Test Plan',
                    description: 'Another plan',
                    price: 199.99,
                    billingCycle: 'monthly',
                    vehicleLimit: 15,
                    driverLimit: 30,
                    rideCommission: 7.0,
                    features: ['Basic'],
                    isActive: true
                }
            });

            const response = await request(app)
                .put(`/api/admin/subscription-plans/${anotherPlan.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: testSubscriptionPlan.name }); // Try to use existing name

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Subscription plan with this name already exists');
        });
    });

    describe('PATCH /api/admin/subscription-plans/:id/status', () => {
        test('should activate/deactivate a subscription plan', async () => {
            const response = await request(app)
                .patch(`/api/admin/subscription-plans/${testSubscriptionPlan.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isActive: false });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Subscription plan deactivated successfully');
            expect(response.body.plan.isActive).toBe(false);
        });

        test('should require isActive field', async () => {
            const response = await request(app)
                .patch(`/api/admin/subscription-plans/${testSubscriptionPlan.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('isActive field is required');
        });
    });

    describe('GET /api/admin/subscription-plans/:id/subscribers', () => {
        test('should get plan subscribers', async () => {
            const response = await request(app)
                .get(`/api/admin/subscription-plans/${testSubscriptionPlan.id}/subscribers`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('plan');
            expect(response.body).toHaveProperty('subscribers');
            expect(Array.isArray(response.body.subscribers)).toBe(true);
        });

        test('should return 404 for non-existent plan', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans/99999/subscribers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Subscription plan not found');
        });
    });

    describe('DELETE /api/admin/subscription-plans/:id', () => {
        test('should prevent deletion of plan with active subscribers', async () => {
            // Assign the plan to test company
            await prisma.company.update({
                where: { id: testCompany.id },
                data: {
                    subscriptionPlanId: testSubscriptionPlan.id,
                    status: 'ACTIVE'
                }
            });

            const response = await request(app)
                .delete(`/api/admin/subscription-plans/${testSubscriptionPlan.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Cannot delete subscription plan with active subscribers');
        });

        test('should delete plan without active subscribers', async () => {
            // Remove the subscription from company
            await prisma.company.update({
                where: { id: testCompany.id },
                data: { subscriptionPlanId: null }
            });

            const response = await request(app)
                .delete(`/api/admin/subscription-plans/${testSubscriptionPlan.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Subscription plan deleted successfully');
        });

        test('should return 404 for non-existent plan', async () => {
            const response = await request(app)
                .delete('/api/admin/subscription-plans/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Subscription plan not found');
        });
    });

    describe('GET /api/admin/subscription-plans/stats/overview', () => {
        test('should get subscription statistics', async () => {
            const response = await request(app)
                .get('/api/admin/subscription-plans/stats/overview')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalPlans');
            expect(response.body).toHaveProperty('activePlans');
            expect(response.body).toHaveProperty('totalSubscriptions');
            expect(response.body).toHaveProperty('activeSubscriptions');
            expect(response.body).toHaveProperty('monthlyRevenue');
            expect(typeof response.body.monthlyRevenue).toBe('number');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle database connection errors gracefully', async () => {
            // This would require mocking Prisma client, but we can test with invalid data
            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: '', // Invalid empty name
                    description: 'Test',
                    price: 'invalid', // Invalid price type
                    billingCycle: 'monthly',
                    vehicleLimit: 5,
                    driverLimit: 10,
                    rideCommission: 8.0
                });

            expect(response.status).toBe(400);
        });

        test('should validate numeric fields', async () => {
            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Test Invalid Numbers',
                    description: 'Test plan',
                    price: -100, // Negative price
                    billingCycle: 'monthly',
                    vehicleLimit: 'invalid', // Non-numeric
                    driverLimit: 10,
                    rideCommission: 150 // Over 100%
                });

            expect(response.status).toBe(400);
        });

        test('should handle malformed JSON in features', async () => {
            const planData = {
                name: 'Test JSON Plan',
                description: 'Test plan with features',
                price: 99.99,
                billingCycle: 'monthly',
                vehicleLimit: 5,
                driverLimit: 10,
                rideCommission: 8.0,
                features: 'invalid-json', // Should be array
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/subscription-plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(planData);

            // The API should handle this gracefully
            expect(response.status).toBe(201); // Prisma JSON field should handle this
        });
    });
});

module.exports = {
    subscriptionPlansTests: true
};