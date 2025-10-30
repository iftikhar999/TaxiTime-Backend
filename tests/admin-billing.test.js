const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const app = require('../server');

const prisma = new PrismaClient();

describe('Admin Billing API Tests', () => {
    let adminToken;
    let testCompany;
    let testSubscriptionPlan;
    let testBillingRecord;
    let testInvoice;

    beforeAll(async () => {
        // Create test admin token
        const adminPayload = {
            id: 'admin-billing-test',
            email: 'admin@billing.test',
            role: 'super_admin'
        };
        adminToken = jwt.sign(adminPayload, process.env.JWT_SECRET || 'your-secret-key');

        // Create test subscription plan
        testSubscriptionPlan = await prisma.subscriptionPlan.create({
            data: {
                name: 'Test Billing Plan',
                description: 'Plan for billing tests',
                price: 199.99,
                billingCycle: 'monthly',
                vehicleLimit: 20,
                driverLimit: 40,
                rideCommission: 6.5,
                features: ['Dashboard', 'Analytics'],
                isActive: true,
                trialDays: 15,
                setupFee: 100
            }
        });

        // Create test company with subscription
        testCompany = await prisma.company.create({
            data: {
                name: 'Test Billing Company',
                email: 'billing@company.test',
                phone: '+1234567890',
                ownerId: 'billing-owner-test',
                status: 'ACTIVE',
                isActive: true,
                subscriptionPlanId: testSubscriptionPlan.id,
                subscriptionStartDate: new Date(),
                lastPaymentDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
            }
        });

        // Create owner user
        await prisma.user.create({
            data: {
                id: 'billing-owner-test',
                email: 'owner@billing.test',
                password: 'hashedpassword',
                firstName: 'Billing',
                lastName: 'Owner',
                phone: '+1234567890',
                role: 'OWNER'
            }
        });

        // Create test vehicles for billing calculation
        await prisma.vehicle.createMany({
            data: [
                {
                    licensePlate: 'TEST-001',
                    companyId: testCompany.id,
                    model: 'Toyota Camry',
                    year: 2020,
                    status: 'ACTIVE'
                },
                {
                    licensePlate: 'TEST-002',
                    companyId: testCompany.id,
                    model: 'Honda Accord',
                    year: 2019,
                    status: 'ACTIVE'
                },
                {
                    licensePlate: 'TEST-003',
                    companyId: testCompany.id,
                    model: 'Nissan Altima',
                    year: 2021,
                    status: 'MAINTENANCE'
                }
            ]
        });

        // Create test drivers
        await prisma.user.createMany({
            data: [
                {
                    id: 'driver-1-test',
                    email: 'driver1@billing.test',
                    password: 'hashedpassword',
                    firstName: 'Driver',
                    lastName: 'One',
                    phone: '+1234567891',
                    role: 'DRIVER',
                    companyId: testCompany.id
                },
                {
                    id: 'driver-2-test',
                    email: 'driver2@billing.test',
                    password: 'hashedpassword',
                    firstName: 'Driver',
                    lastName: 'Two',
                    phone: '+1234567892',
                    role: 'DRIVER',
                    companyId: testCompany.id
                }
            ]
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.vehicle.deleteMany({
            where: { companyId: testCompany.id }
        });
        await prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { contains: 'billing.test' } },
                    { id: { contains: 'billing' } },
                    { id: { contains: 'driver' } }
                ]
            }
        });
        await prisma.company.deleteMany({
            where: { email: { contains: 'billing.test' } }
        });
        await prisma.subscriptionPlan.deleteMany({
            where: { name: { contains: 'Test Billing' } }
        });
        await prisma.$disconnect();
    });

    describe('Authentication & Authorization', () => {
        test('should deny access without admin token', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies');

            expect(response.status).toBe(401);
            expect(response.body.message).toBe('Access denied. No token provided.');
        });

        test('should deny access for non-admin users', async () => {
            const userToken = jwt.sign(
                { id: 'user-test', role: 'owner' },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Access denied. Admin privileges required.');
        });
    });

    describe('GET /api/admin/billing/companies', () => {
        test('should get company billing data', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);

            const billingCompany = response.body.find(c => c.id === testCompany.id);
            expect(billingCompany).toBeDefined();
            expect(billingCompany).toHaveProperty('vehicleCount');
            expect(billingCompany).toHaveProperty('driverCount');
            expect(billingCompany).toHaveProperty('billingStatus');
            expect(billingCompany).toHaveProperty('totalAmount');
        });

        test('should support period filtering', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies?period=last_month')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should calculate billing correctly', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const billingCompany = response.body.find(c => c.id === testCompany.id);

            // Should have vehicle count (3 vehicles created)
            expect(billingCompany.vehicleCount).toBe(3);
            expect(billingCompany.driverCount).toBe(2);

            // Should calculate billing amounts
            expect(typeof billingCompany.totalAmount).toBe('number');
            expect(billingCompany.totalAmount).toBeGreaterThan(0);
        });
    });

    describe('GET /api/admin/billing/stats', () => {
        test('should get billing statistics', async () => {
            const response = await request(app)
                .get('/api/admin/billing/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalRevenue');
            expect(response.body).toHaveProperty('activeSubscriptions');
            expect(response.body).toHaveProperty('pendingBills');
            expect(response.body).toHaveProperty('overduePayments');

            expect(typeof response.body.totalRevenue).toBe('number');
            expect(typeof response.body.activeSubscriptions).toBe('number');
        });

        test('should support period filtering for stats', async () => {
            const response = await request(app)
                .get('/api/admin/billing/stats?period=current_quarter')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalRevenue');
        });
    });

    describe('GET /api/admin/billing/companies/:id/details', () => {
        test('should get detailed bill for company', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/details`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('vehicleCount');
            expect(response.body).toHaveProperty('driverCount');
            expect(response.body).toHaveProperty('ridesCount');
            expect(response.body).toHaveProperty('totalAmount');
            expect(response.body).toHaveProperty('vehicleCost');
            expect(response.body).toHaveProperty('commissionAmount');
            expect(response.body).toHaveProperty('paymentHistory');

            expect(Array.isArray(response.body.paymentHistory)).toBe(true);
        });

        test('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies/non-existent-id/details')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });

        test('should support different billing periods', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/details?period=current_quarter`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalAmount');
        });
    });

    describe('POST /api/admin/billing/companies/:id/invoice', () => {
        test('should generate invoice for company', async () => {
            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/invoice`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ period: 'current_month' });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Invoice generated successfully');
            expect(response.body.invoice).toHaveProperty('invoiceNumber');
            expect(response.body.invoice).toHaveProperty('companyId', testCompany.id);
            expect(response.body.invoice).toHaveProperty('totalAmount');
            expect(response.body.invoice).toHaveProperty('dueDate');
        });

        test('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .post('/api/admin/billing/companies/non-existent-id/invoice')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ period: 'current_month' });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });
    });

    describe('POST /api/admin/billing/companies/:id/reminder', () => {
        test('should send payment reminder', async () => {
            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/reminder`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Payment reminder sent successfully');
            expect(response.body.sentTo).toBe(testCompany.email);
            expect(response.body).toHaveProperty('sentAt');
        });

        test('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .post('/api/admin/billing/companies/non-existent-id/reminder')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });
    });

    describe('PATCH /api/admin/billing/companies/:id/suspend', () => {
        test('should suspend company', async () => {
            const response = await request(app)
                .patch(`/api/admin/billing/companies/${testCompany.id}/suspend`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Company suspended successfully');
            expect(response.body.company.status).toBe('suspended');
            expect(response.body.company).toHaveProperty('suspendedAt');
        });

        test('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .patch('/api/admin/billing/companies/non-existent-id/suspend')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });
    });

    describe('PATCH /api/admin/billing/companies/:id/reactivate', () => {
        test('should reactivate suspended company', async () => {
            const response = await request(app)
                .patch(`/api/admin/billing/companies/${testCompany.id}/reactivate`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Company reactivated successfully');
            expect(response.body.company.status).toBe('active');
            expect(response.body.company).toHaveProperty('reactivatedAt');
        });
    });

    describe('PUT /api/admin/billing/companies/:id/subscription', () => {
        test('should update company subscription', async () => {
            // Create another plan to switch to
            const newPlan = await prisma.subscriptionPlan.create({
                data: {
                    name: 'Test New Billing Plan',
                    description: 'New plan for testing',
                    price: 299.99,
                    billingCycle: 'monthly',
                    vehicleLimit: 50,
                    driverLimit: 100,
                    rideCommission: 5.0,
                    features: ['Premium Dashboard'],
                    isActive: true
                }
            });

            const response = await request(app)
                .put(`/api/admin/billing/companies/${testCompany.id}/subscription`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ subscriptionPlanId: newPlan.id });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Company subscription updated successfully');
            expect(response.body.company.subscriptionPlan.id).toBe(newPlan.id);
            expect(response.body.company).toHaveProperty('subscriptionUpdatedAt');
        });

        test('should validate subscription plan exists', async () => {
            const response = await request(app)
                .put(`/api/admin/billing/companies/${testCompany.id}/subscription`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ subscriptionPlanId: 99999 });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Subscription plan not found');
        });

        test('should prevent assigning inactive plans', async () => {
            // Create inactive plan
            const inactivePlan = await prisma.subscriptionPlan.create({
                data: {
                    name: 'Test Inactive Plan',
                    description: 'Inactive plan',
                    price: 99.99,
                    billingCycle: 'monthly',
                    vehicleLimit: 10,
                    driverLimit: 20,
                    rideCommission: 8.0,
                    features: ['Basic'],
                    isActive: false
                }
            });

            const response = await request(app)
                .put(`/api/admin/billing/companies/${testCompany.id}/subscription`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ subscriptionPlanId: inactivePlan.id });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Cannot assign inactive subscription plan');
        });

        test('should require subscriptionPlanId', async () => {
            const response = await request(app)
                .put(`/api/admin/billing/companies/${testCompany.id}/subscription`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('subscriptionPlanId is required');
        });
    });

    describe('GET /api/admin/billing/companies/:id/payments', () => {
        test('should get payment history', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/payments`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);

            if (response.body.length > 0) {
                const payment = response.body[0];
                expect(payment).toHaveProperty('amount');
                expect(payment).toHaveProperty('method');
                expect(payment).toHaveProperty('status');
                expect(payment).toHaveProperty('date');
            }
        });

        test('should support limit parameter', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/payments?limit=5`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeLessThanOrEqual(5);
        });
    });

    describe('POST /api/admin/billing/companies/:id/manual-payment', () => {
        test('should process manual payment', async () => {
            const paymentData = {
                amount: 299.99,
                method: 'bank_transfer',
                notes: 'Manual payment processing test',
                paymentDate: new Date().toISOString()
            };

            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/manual-payment`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(paymentData);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Manual payment processed successfully');
            expect(response.body.payment).toHaveProperty('amount', paymentData.amount);
            expect(response.body.payment).toHaveProperty('method', paymentData.method);
            expect(response.body.payment).toHaveProperty('status', 'paid');
            expect(response.body.payment).toHaveProperty('type', 'manual');
        });

        test('should validate required fields', async () => {
            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/manual-payment`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ notes: 'Missing amount and method' });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Amount and payment method are required');
        });

        test('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .post('/api/admin/billing/companies/non-existent-id/manual-payment')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 100, method: 'cash' });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Company not found');
        });
    });

    describe('GET /api/admin/billing/reports', () => {
        test('should generate billing reports', async () => {
            const response = await request(app)
                .get('/api/admin/billing/reports')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('period');
            expect(response.body).toHaveProperty('dateRange');
            expect(response.body).toHaveProperty('summary');
            expect(response.body).toHaveProperty('data');

            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.summary).toHaveProperty('totalCompanies');
            expect(response.body.summary).toHaveProperty('totalRevenue');
        });

        test('should support filtering by plan', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/reports?planId=${testSubscriptionPlan.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.every(item =>
                item.planName === testSubscriptionPlan.name
            )).toBe(true);
        });

        test('should support filtering by company', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/reports?companyId=${testCompany.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeLessThanOrEqual(1);
            if (response.body.data.length > 0) {
                expect(response.body.data[0].companyId).toBe(testCompany.id);
            }
        });

        test('should support different periods', async () => {
            const periods = ['current_month', 'last_month', 'current_quarter', 'current_year'];

            for (const period of periods) {
                const response = await request(app)
                    .get(`/api/admin/billing/reports?period=${period}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                expect(response.status).toBe(200);
                expect(response.body.period).toBe(period);
            }
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle invalid period parameters', async () => {
            const response = await request(app)
                .get('/api/admin/billing/companies?period=invalid_period')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200); // Should default to current_month
        });

        test('should handle negative payment amounts', async () => {
            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/manual-payment`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: -100, method: 'cash' });

            expect(response.status).toBe(200); // API should handle this, business logic might allow refunds
        });

        test('should handle very large numbers', async () => {
            const response = await request(app)
                .post(`/api/admin/billing/companies/${testCompany.id}/manual-payment`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ amount: 999999999.99, method: 'bank_transfer' });

            expect(response.status).toBe(200);
        });

        test('should handle concurrent requests', async () => {
            const promises = Array(5).fill().map(() =>
                request(app)
                    .get('/api/admin/billing/stats')
                    .set('Authorization', `Bearer ${adminToken}`)
            );

            const responses = await Promise.all(promises);
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });
        });
    });

    describe('Business Logic Validation', () => {
        test('should calculate vehicle-based billing correctly', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/details`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Should have correct vehicle count
            expect(response.body.vehicleCount).toBe(3);

            // Vehicle cost should be based on plan price * vehicle count
            const expectedBaseCost = testSubscriptionPlan.price;
            expect(response.body.vehicleCost).toBeGreaterThan(0);

            // Total should include all components
            const expectedTotal =
                response.body.basePlanCost +
                response.body.vehicleCost +
                response.body.commissionAmount +
                response.body.setupFee;

            expect(Math.abs(response.body.totalAmount - expectedTotal)).toBeLessThan(0.01);
        });

        test('should enforce subscription limits', async () => {
            // This would be tested in the owner panel or vehicle creation APIs
            // Here we verify the billing system recognizes the limits
            const response = await request(app)
                .get('/api/admin/billing/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const billingCompany = response.body.find(c => c.id === testCompany.id);
            expect(billingCompany.vehicleCount).toBeLessThanOrEqual(testSubscriptionPlan.vehicleLimit);
        });

        test('should calculate commission correctly', async () => {
            const response = await request(app)
                .get(`/api/admin/billing/companies/${testCompany.id}/details`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Commission should be percentage of total revenue
            const expectedCommission = (response.body.totalRevenue || 0) * (testSubscriptionPlan.rideCommission / 100);
            expect(Math.abs(response.body.commissionAmount - expectedCommission)).toBeLessThan(0.01);
        });
    });
});

module.exports = {
    billingTests: true
};