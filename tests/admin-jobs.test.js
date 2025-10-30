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
const adminJobsRoutes = require('../routes/admin-jobs');

// Use routes
app.use('/api/admin/jobs', adminJobsRoutes);

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

describe('Job Management - Comprehensive Tests', () => {
    let adminToken;
    let testCompany;
    let testOwner;
    let testDriver;
    let testCustomer;
    let testJob;

    beforeAll(async () => {
        adminToken = generateAdminToken();

        try {
            // Create test owner
            testOwner = await prisma.user.upsert({
                where: { id: 'test-job-owner-1' },
                update: {},
                create: {
                    id: 'test-job-owner-1',
                    firstName: 'Job',
                    lastName: 'Owner',
                    email: 'jobowner@test.com',
                    phone: '+1444' + Math.floor(Math.random() * 100000),
                    password: 'hashedpassword123',
                    role: 'OWNER'
                }
            });

            // Create test company
            testCompany = await prisma.company.upsert({
                where: { id: 'test-job-company-1' },
                update: {},
                create: {
                    id: 'test-job-company-1',
                    legalName: 'Test Job Management Company',
                    brandName: 'JobTestCorp',
                    companyCode: 'JTC001',
                    ownerId: testOwner.id,
                    status: 'ACTIVE'
                }
            });

            // Create test customer
            testCustomer = await prisma.user.upsert({
                where: { id: 'test-job-customer-1' },
                update: {},
                create: {
                    id: 'test-job-customer-1',
                    firstName: 'John',
                    lastName: 'Customer',
                    email: 'customer@jobtest.com',
                    phone: '+1555' + Math.floor(Math.random() * 100000),
                    password: 'hashedpassword123',
                    role: 'PASSENGER'
                }
            });

            // Create test driver
            testDriver = await prisma.user.upsert({
                where: { id: 'test-job-driver-1' },
                update: {},
                create: {
                    id: 'test-job-driver-1',
                    firstName: 'Mike',
                    lastName: 'Driver',
                    email: 'driver@jobtest.com',
                    phone: '+1666' + Math.floor(Math.random() * 100000),
                    password: 'hashedpassword123',
                    role: 'DRIVER',
                    companyId: testCompany.id
                }
            });

            console.log('✅ Job test setup completed');
        } catch (error) {
            console.error('❌ Job test setup error:', error);
        }
    });

    afterAll(async () => {
        try {
            // Cleanup test data
            await prisma.job.deleteMany({ where: { companyId: { startsWith: 'test-job-' } } });
            await prisma.user.deleteMany({ where: { id: { startsWith: 'test-job-' } } });
            await prisma.company.deleteMany({ where: { id: { startsWith: 'test-job-' } } });
        } catch (error) {
            console.error('Job cleanup error:', error);
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('🚗 Job Creation & Management', () => {
        test('should create a new taxi job', async () => {
            const newJob = {
                type: 'TAXI',
                companyId: testCompany.id,
                customerId: testCustomer.id,
                pickup: {
                    address: '123 Main St, Test City',
                    latitude: 40.7128,
                    longitude: -74.0060,
                    contactName: 'John Customer',
                    contactPhone: testCustomer.phone
                },
                destination: {
                    address: '456 Business Ave, Test City',
                    latitude: 40.7589,
                    longitude: -73.9851
                },
                scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
                estimatedDuration: 30, // minutes
                requirements: {
                    vehicleType: 'SEDAN',
                    specialRequests: ['air_conditioning', 'phone_charger']
                },
                instructions: 'Please call customer upon arrival',
                priority: 1
            };

            const response = await request(app)
                .post('/api/admin/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newJob);

            console.log('Create taxi job response:', response.status, response.body);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('job');
            expect(response.body.job.type).toBe('TAXI');
            expect(response.body.job.status).toBe('PENDING');
            expect(response.body.job.companyId).toBe(testCompany.id);

            testJob = response.body.job;
        });

        test('should create a delivery job', async () => {
            const deliveryJob = {
                type: 'FOOD_DELIVERY',
                companyId: testCompany.id,
                customerId: testCustomer.id,
                pickup: {
                    address: 'Pizza Palace, 789 Food St',
                    latitude: 40.7500,
                    longitude: -74.0000,
                    contactName: 'Pizza Staff',
                    contactPhone: '+15551234567'
                },
                destination: {
                    address: testCustomer.address || '123 Main St',
                    latitude: 40.7128,
                    longitude: -74.0060,
                    contactName: `${testCustomer.firstName} ${testCustomer.lastName}`,
                    contactPhone: testCustomer.phone
                },
                scheduledAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
                requirements: {
                    deliveryType: 'HOT_FOOD',
                    specialInstructions: 'Ring doorbell twice'
                },
                estimatedDuration: 25,
                priority: 2
            };

            const response = await request(app)
                .post('/api/admin/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(deliveryJob);

            expect(response.status).toBe(201);
            expect(response.body.job.type).toBe('FOOD_DELIVERY');
            expect(response.body.job.status).toBe('PENDING');
        });

        test('should validate required fields for job creation', async () => {
            const incompleteJob = {
                type: 'TAXI',
                companyId: testCompany.id
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/admin/jobs')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(incompleteJob);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('required');
        });
    });

    describe('📋 Job Listing & Search', () => {
        test('should list all jobs with pagination', async () => {
            const response = await request(app)
                .get('/api/admin/jobs?page=1&limit=20')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('jobs');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.jobs)).toBe(true);
        });

        test('should filter jobs by status', async () => {
            const response = await request(app)
                .get('/api/admin/jobs?status=PENDING')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.jobs.forEach(job => {
                expect(job.status).toBe('PENDING');
            });
        });

        test('should filter jobs by service type', async () => {
            const response = await request(app)
                .get('/api/admin/jobs?service=TAXI')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.jobs.forEach(job => {
                expect(job.type).toBe('TAXI');
            });
        });

        test('should filter jobs by company', async () => {
            const response = await request(app)
                .get(`/api/admin/jobs?company=${testCompany.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.jobs.forEach(job => {
                expect(job.companyId).toBe(testCompany.id);
            });
        });

        test('should filter jobs by date range', async () => {
            const startDate = new Date();
            const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

            const response = await request(app)
                .get('/api/admin/jobs')
                .query({
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.jobs)).toBe(true);
        });

        test('should search jobs by customer details', async () => {
            const response = await request(app)
                .get('/api/admin/jobs?search=John Customer')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.jobs)).toBe(true);
        });
    });

    describe('🔄 Job Assignment & Status Management', () => {
        test('should assign a driver to a job', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/assign`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    driverId: testDriver.id,
                    estimatedArrival: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
                });

            expect(response.status).toBe(200);
            expect(response.body.job.status).toBe('ASSIGNED');
            expect(response.body.job.driverId).toBe(testDriver.id);
        });

        test('should update job status to accepted', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'ACCEPTED',
                    notes: 'Driver accepted the job'
                });

            expect(response.status).toBe(200);
            expect(response.body.job.status).toBe('ACCEPTED');
        });

        test('should mark job as in progress', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'IN_PROGRESS',
                    startTime: new Date(),
                    notes: 'Driver has picked up customer'
                });

            expect(response.status).toBe(200);
            expect(response.body.job.status).toBe('IN_PROGRESS');
        });

        test('should complete a job', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/complete`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    completionTime: new Date(),
                    finalFare: 25.50,
                    actualDuration: 28,
                    actualDistance: 5.2,
                    notes: 'Job completed successfully'
                });

            expect(response.status).toBe(200);
            expect(response.body.job.status).toBe('COMPLETED');
            expect(response.body.job.finalFare).toBe(25.50);
        });

        test('should cancel a job', async () => {
            // Create a job to cancel
            const jobToCancel = await prisma.job.create({
                data: {
                    jobId: 'cancel-test-' + Date.now(),
                    type: 'TAXI',
                    status: 'PENDING',
                    companyId: testCompany.id,
                    customerId: testCustomer.id,
                    requirements: {},
                    instructions: 'Test cancellation'
                }
            });

            const response = await request(app)
                .patch(`/api/admin/jobs/${jobToCancel.id}/cancel`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    reason: 'Customer requested cancellation',
                    cancelledBy: 'ADMIN'
                });

            expect(response.status).toBe(200);
            expect(response.body.job.status).toBe('CANCELLED');
        });
    });

    describe('📊 Job Analytics & Statistics', () => {
        test('should get job statistics overview', async () => {
            const response = await request(app)
                .get('/api/admin/jobs/stats/overview')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalJobs');
            expect(response.body).toHaveProperty('jobsByStatus');
            expect(response.body).toHaveProperty('jobsByType');
            expect(response.body).toHaveProperty('completionRate');
        });

        test('should get job performance metrics', async () => {
            const response = await request(app)
                .get('/api/admin/jobs/stats/performance')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ period: 'last_30_days' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('averageCompletionTime');
            expect(response.body).toHaveProperty('averageWaitTime');
            expect(response.body).toHaveProperty('cancellationRate');
        });

        test('should get company job statistics', async () => {
            const response = await request(app)
                .get(`/api/admin/jobs/stats/company/${testCompany.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('companyId');
            expect(response.body).toHaveProperty('totalJobs');
            expect(response.body).toHaveProperty('revenue');
        });
    });

    describe('🔍 Job Details & History', () => {
        test('should get detailed job information', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .get(`/api/admin/jobs/${testJob.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testJob.id);
            expect(response.body).toHaveProperty('customer');
            expect(response.body).toHaveProperty('company');
            expect(response.body).toHaveProperty('timeline');
        });

        test('should get job history/timeline', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .get(`/api/admin/jobs/${testJob.id}/history`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.timeline)).toBe(true);
            expect(response.body.timeline.length).toBeGreaterThan(0);
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/jobs');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            const userToken = jwt.sign(
                { userId: 'user-id', role: 'PASSENGER' },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const response = await request(app)
                .get('/api/admin/jobs')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid job ID', async () => {
            const response = await request(app)
                .get('/api/admin/jobs/invalid-job-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toContain('Job not found');
        });

        test('should handle invalid driver assignment', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/assign`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ driverId: 'non-existent-driver-id' });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Driver not found');
        });

        test('should handle invalid status transitions', async () => {
            if (!testJob) {
                console.log('⚠️ Skipping test - no test job available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/jobs/${testJob.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'INVALID_STATUS' });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid status');
        });
    });
});