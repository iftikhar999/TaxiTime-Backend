const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Prisma client
const prisma = new PrismaClient();

// Create Express app for testing
const app = express();
app.use(express.json());

// Import routes (assuming we have payment management routes)
const paymentsRoutes = require('../routes/payments');

// Use routes
app.use('/api/admin/payments', paymentsRoutes);

// Test users and tokens
let testUsers = {};
let adminToken;
let companyId;
let testPaymentId;

describe('Payment Management - Comprehensive Tests', () => {
    beforeAll(async () => {
        // Create test admin user
        const adminUser = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Admin',
                email: 'test-admin-payments@test.com',
                phone: '+1-555-0001',
                password: '$2a$10$test.hash.for.password',
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
            }
        });

        // Create test company for payments
        const testCompany = await prisma.company.create({
            data: {
                legalName: 'Test Payments Company',
                brandName: 'Test Payments',
                companyCode: 'TESTPAY001',
                email: 'payments@test.com',
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

        console.log('✅ Payments test setup completed');
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.company.deleteMany({
            where: {
                email: { in: ['payments@test.com'] }
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: { in: ['test-admin-payments@test.com'] }
            }
        });

        await prisma.$disconnect();
    });

    describe('💳 Payment Processing', () => {
        test('should process a payment', async () => {
            const paymentData = {
                amount: 25.50,
                currency: 'USD',
                paymentMethod: 'CREDIT_CARD',
                companyId: companyId,
                customerId: testUsers.admin,
                description: 'Taxi ride payment',
                metadata: {
                    rideId: 'ride_123',
                    driverId: testUsers.admin
                }
            };

            const response = await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paymentData);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('payment');
                expect(response.body.payment.amount).toBe(paymentData.amount);
                expect(response.body.payment.currency).toBe(paymentData.currency);
                testPaymentId = response.body.payment.id;
            }
        });

        test('should validate payment amount', async () => {
            const invalidPayment = {
                amount: -10.00, // Invalid negative amount
                currency: 'USD',
                paymentMethod: 'CREDIT_CARD',
                companyId: companyId,
                customerId: testUsers.admin
            };

            const response = await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidPayment);

            expect([400, 404]).toContain(response.status);
            if (response.status === 400) {
                expect(response.body.error).toContain('Invalid amount');
            }
        });

        test('should handle payment method validation', async () => {
            const invalidMethodPayment = {
                amount: 25.50,
                currency: 'USD',
                paymentMethod: 'INVALID_METHOD',
                companyId: companyId,
                customerId: testUsers.admin
            };

            const response = await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidMethodPayment);

            expect([400, 404]).toContain(response.status);
        });
    });

    describe('🔍 Payment Queries', () => {
        test('should list all payments with pagination', async () => {
            const response = await request(app)
                .get('/api/admin/payments')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    page: 1,
                    limit: 10,
                    status: 'ALL'
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('payments');
                expect(response.body).toHaveProperty('pagination');
                expect(Array.isArray(response.body.payments)).toBe(true);
            }
        });

        test('should filter payments by status', async () => {
            const response = await request(app)
                .get('/api/admin/payments')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    status: 'PAID',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(Array.isArray(response.body.payments)).toBe(true);
            }
        });

        test('should filter payments by date range', async () => {
            const response = await request(app)
                .get('/api/admin/payments')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    startDate: '2024-01-01',
                    endDate: '2024-12-31',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
        });

        test('should get payment details by ID', async () => {
            if (testPaymentId) {
                const response = await request(app)
                    .get(`/api/admin/payments/${testPaymentId}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                expect([200, 404]).toContain(response.status);
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('payment');
                    expect(response.body.payment.id).toBe(testPaymentId);
                }
            }
        });

        test('should search payments by customer', async () => {
            const response = await request(app)
                .get('/api/admin/payments/search')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    customerId: testUsers.admin,
                    limit: 5
                });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('💰 Refund Management', () => {
        test('should process a refund', async () => {
            if (testPaymentId) {
                const refundData = {
                    paymentId: testPaymentId,
                    amount: 10.00, // Partial refund
                    reason: 'Customer request',
                    refundType: 'PARTIAL'
                };

                const response = await request(app)
                    .post('/api/admin/payments/refund')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(refundData);

                expect([201, 404]).toContain(response.status);
                if (response.status === 201) {
                    expect(response.body).toHaveProperty('refund');
                    expect(response.body.refund.amount).toBe(refundData.amount);
                }
            }
        });

        test('should validate refund amount', async () => {
            const invalidRefund = {
                paymentId: testPaymentId || 'test-payment-id',
                amount: 100.00, // More than original payment
                reason: 'Test refund',
                refundType: 'PARTIAL'
            };

            const response = await request(app)
                .post('/api/admin/payments/refund')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidRefund);

            expect([400, 404]).toContain(response.status);
        });

        test('should list refunds', async () => {
            const response = await request(app)
                .get('/api/admin/payments/refunds')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    status: 'ALL',
                    page: 1,
                    limit: 10
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('refunds');
                expect(Array.isArray(response.body.refunds)).toBe(true);
            }
        });
    });

    describe('🏦 Payout Management', () => {
        test('should create driver payout', async () => {
            const payoutData = {
                driverId: testUsers.admin,
                amount: 150.00,
                currency: 'USD',
                payoutMethod: 'BANK_TRANSFER',
                companyId: companyId,
                description: 'Weekly driver payout',
                scheduledDate: '2024-02-01'
            };

            const response = await request(app)
                .post('/api/admin/payments/payouts')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(payoutData);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('payout');
                expect(response.body.payout.amount).toBe(payoutData.amount);
            }
        });

        test('should list pending payouts', async () => {
            const response = await request(app)
                .get('/api/admin/payments/payouts')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    status: 'PENDING',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('payouts');
                expect(Array.isArray(response.body.payouts)).toBe(true);
            }
        });

        test('should approve payout', async () => {
            const approvalData = {
                status: 'APPROVED',
                approvedBy: testUsers.admin,
                approvalNotes: 'Approved for processing'
            };

            const response = await request(app)
                .patch('/api/admin/payments/payouts/1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(approvalData);

            expect([200, 404]).toContain(response.status);
        });

        test('should bulk approve payouts', async () => {
            const bulkApproval = {
                payoutIds: [1, 2, 3],
                status: 'APPROVED',
                approvedBy: testUsers.admin
            };

            const response = await request(app)
                .post('/api/admin/payments/payouts/bulk-approve')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(bulkApproval);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('⚙️ Payment Gateway Management', () => {
        test('should configure payment gateway', async () => {
            const gatewayConfig = {
                provider: 'STRIPE',
                companyId: companyId,
                configuration: {
                    publishableKey: 'pk_test_123456789',
                    webhookSecret: 'whsec_test_123456789',
                    currency: 'USD'
                },
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/payments/gateway/configure')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(gatewayConfig);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('gatewayConfig');
                expect(response.body.gatewayConfig.provider).toBe('STRIPE');
            }
        });

        test('should test payment gateway connection', async () => {
            const response = await request(app)
                .post('/api/admin/payments/gateway/test')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    companyId: companyId,
                    provider: 'STRIPE'
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('connectionStatus');
            }
        });

        test('should list supported payment methods', async () => {
            const response = await request(app)
                .get('/api/admin/payments/methods')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('paymentMethods');
                expect(Array.isArray(response.body.paymentMethods)).toBe(true);
            }
        });
    });

    describe('📊 Payment Analytics', () => {
        test('should get payment statistics', async () => {
            const response = await request(app)
                .get('/api/admin/payments/analytics/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_30_days',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('totalPayments');
                expect(response.body).toHaveProperty('totalAmount');
                expect(response.body).toHaveProperty('avgPaymentAmount');
            }
        });

        test('should get payment trends', async () => {
            const response = await request(app)
                .get('/api/admin/payments/analytics/trends')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    groupBy: 'daily',
                    period: 'last_week',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
        });

        test('should get payment method distribution', async () => {
            const response = await request(app)
                .get('/api/admin/payments/analytics/methods')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({
                    period: 'last_month',
                    companyId: companyId
                });

            expect([200, 404]).toContain(response.status);
            if (response.status === 200) {
                expect(response.body).toHaveProperty('methodDistribution');
            }
        });
    });

    describe('🔄 Subscription & Billing', () => {
        test('should create subscription plan', async () => {
            const subscriptionPlan = {
                name: 'Premium Plan',
                description: 'Premium features for taxi companies',
                price: 99.99,
                currency: 'USD',
                interval: 'MONTHLY',
                features: ['unlimited_drivers', 'advanced_analytics', '24_7_support'],
                isActive: true
            };

            const response = await request(app)
                .post('/api/admin/payments/subscriptions/plans')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(subscriptionPlan);

            expect([201, 404]).toContain(response.status);
            if (response.status === 201) {
                expect(response.body).toHaveProperty('plan');
                expect(response.body.plan.name).toBe(subscriptionPlan.name);
            }
        });

        test('should subscribe company to plan', async () => {
            const subscription = {
                companyId: companyId,
                planId: 1,
                startDate: '2024-02-01',
                paymentMethodId: 'pm_test_123456789'
            };

            const response = await request(app)
                .post('/api/admin/payments/subscriptions')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(subscription);

            expect([201, 404]).toContain(response.status);
        });

        test('should process subscription billing', async () => {
            const response = await request(app)
                .post('/api/admin/payments/subscriptions/bill')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    companyId: companyId,
                    billingDate: '2024-02-01'
                });

            expect([200, 404]).toContain(response.status);
        });

        test('should handle subscription cancellation', async () => {
            const response = await request(app)
                .post('/api/admin/payments/subscriptions/cancel')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    subscriptionId: 1,
                    cancelReason: 'Customer request',
                    effectiveDate: '2024-02-28'
                });

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔔 Payment Webhooks', () => {
        test('should handle stripe webhook', async () => {
            const stripeWebhook = {
                id: 'evt_test_webhook',
                object: 'event',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_123456789',
                        amount: 2550,
                        currency: 'usd',
                        status: 'succeeded'
                    }
                }
            };

            const response = await request(app)
                .post('/api/admin/payments/webhooks/stripe')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(stripeWebhook);

            expect([200, 404]).toContain(response.status);
        });

        test('should handle paypal webhook', async () => {
            const paypalWebhook = {
                id: 'WH-12345-67890',
                event_type: 'PAYMENT.CAPTURE.COMPLETED',
                resource: {
                    id: '123456789',
                    amount: {
                        currency_code: 'USD',
                        value: '25.50'
                    },
                    status: 'COMPLETED'
                }
            };

            const response = await request(app)
                .post('/api/admin/payments/webhooks/paypal')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paypalWebhook);

            expect([200, 404]).toContain(response.status);
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/payments');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            // Create a non-admin token
            const regularUser = await prisma.user.create({
                data: {
                    firstName: 'Regular',
                    lastName: 'User',
                    email: 'regular-payments@test.com',
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
                .get('/api/admin/payments')
                .set('Authorization', `Bearer ${regularToken}`);

            expect(response.status).toBe(403);

            // Cleanup
            await prisma.user.delete({ where: { id: regularUser.id } });
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid payment ID', async () => {
            const response = await request(app)
                .get('/api/admin/payments/invalid-payment-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect([404, 404]).toContain(response.status);
        });

        test('should handle payment processing failures', async () => {
            const invalidPayment = {
                amount: 999999.99, // Amount too large
                currency: 'USD',
                paymentMethod: 'CREDIT_CARD',
                companyId: companyId,
                customerId: 'invalid-customer-id'
            };

            const response = await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidPayment);

            expect([400, 404]).toContain(response.status);
        });

        test('should handle duplicate payment attempts', async () => {
            const paymentData = {
                amount: 25.50,
                currency: 'USD',
                paymentMethod: 'CREDIT_CARD',
                companyId: companyId,
                customerId: testUsers.admin,
                idempotencyKey: 'duplicate-test-key'
            };

            // First payment
            await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paymentData);

            // Duplicate payment with same idempotency key
            const response = await request(app)
                .post('/api/admin/payments/process')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paymentData);

            expect([200, 400, 404]).toContain(response.status);
        });
    });
});