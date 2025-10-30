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
const adminUsersRoutes = require('../routes/admin-users');

// Use routes
app.use('/api/admin/users', adminUsersRoutes);

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

describe('User Management - Comprehensive Tests', () => {
    let adminToken;
    let testUser;
    let testCompany;
    let testOwner;

    beforeAll(async () => {
        adminToken = generateAdminToken();

        try {
            // Create test owner for company association
            testOwner = await prisma.user.upsert({
                where: { id: 'test-user-owner-1' },
                update: {},
                create: {
                    id: 'test-user-owner-1',
                    firstName: 'Test',
                    lastName: 'Owner',
                    email: 'testowner@usertest.com',
                    phone: '+1666' + Math.floor(Math.random() * 100000),
                    password: 'hashedpassword123',
                    role: 'OWNER'
                }
            });

            // Create test company for user association
            testCompany = await prisma.company.upsert({
                where: { id: 'test-user-company-1' },
                update: {},
                create: {
                    id: 'test-user-company-1',
                    legalName: 'Test User Management Company',
                    brandName: 'UserTestCorp',
                    companyCode: 'UTC001',
                    ownerId: testOwner.id,
                    status: 'ACTIVE'
                }
            });

            console.log('✅ Test setup completed:', {
                owner: testOwner.id,
                company: testCompany.id
            });
        } catch (error) {
            console.error('❌ Test setup error:', error);
        }
    });

    afterAll(async () => {
        try {
            // Cleanup test data
            await prisma.user.deleteMany({ where: { id: { startsWith: 'test-user-' } } });
            await prisma.company.deleteMany({ where: { id: { startsWith: 'test-user-company-' } } });
        } catch (error) {
            console.error('Cleanup error:', error);
        } finally {
            await prisma.$disconnect();
        }
    });

    describe('👥 User Registration & Creation', () => {
        test('should create a new passenger user', async () => {
            const newUser = {
                firstName: 'John',
                lastName: 'Passenger',
                email: 'john.passenger@test.com',
                phone: '+1777' + Math.floor(Math.random() * 100000),
                role: 'PASSENGER',
                password: 'SecurePass123!',
                address: {
                    street: '123 Main St',
                    city: 'Test City',
                    state: 'TC',
                    zipCode: '12345'
                },
                preferences: {
                    notifications: true,
                    language: 'en'
                }
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUser);

            console.log('Create passenger response:', response.status, response.body);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe(newUser.email);
            expect(response.body.user.role).toBe('PASSENGER');
            expect(response.body.user).not.toHaveProperty('password'); // Password should be excluded

            testUser = response.body.user;
        });

        test('should create a new driver user with company assignment', async () => {
            const newDriver = {
                firstName: 'Mike',
                lastName: 'Driver',
                email: 'mike.driver@test.com',
                phone: '+1888' + Math.floor(Math.random() * 100000),
                role: 'DRIVER',
                password: 'DriverPass123!',
                companyId: testCompany.id,
                address: {
                    street: '456 Driver Ave',
                    city: 'Driver City',
                    state: 'DC',
                    zipCode: '54321'
                }
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newDriver);

            expect(response.status).toBe(201);
            expect(response.body.user.role).toBe('DRIVER');
            expect(response.body.user.companyId).toBe(testCompany.id);
        });

        test('should create a dispatcher user', async () => {
            const newDispatcher = {
                firstName: 'Sarah',
                lastName: 'Dispatcher',
                email: 'sarah.dispatcher@test.com',
                phone: '+1999' + Math.floor(Math.random() * 100000),
                role: 'DISPATCHER',
                password: 'DispatchPass123!',
                companyId: testCompany.id
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newDispatcher);

            expect(response.status).toBe(201);
            expect(response.body.user.role).toBe('DISPATCHER');
        });

        test('should prevent duplicate email addresses', async () => {
            const duplicateUser = {
                firstName: 'Jane',
                lastName: 'Duplicate',
                email: 'john.passenger@test.com', // Same as first test
                phone: '+1111222333',
                role: 'PASSENGER',
                password: 'AnotherPass123!'
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(duplicateUser);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Email already exists');
        });

        test('should validate required fields', async () => {
            const incompleteUser = {
                firstName: 'Incomplete',
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(incompleteUser);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('required');
        });
    });

    describe('📋 User Listing & Search', () => {
        test('should list all users with pagination', async () => {
            const response = await request(app)
                .get('/api/admin/users?page=1&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('users');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.users)).toBe(true);
        });

        test('should search users by name', async () => {
            const response = await request(app)
                .get('/api/admin/users?search=John')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.length).toBeGreaterThan(0);
            expect(response.body.users[0].firstName).toContain('John');
        });

        test('should filter users by role', async () => {
            const response = await request(app)
                .get('/api/admin/users?role=DRIVER')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.users.forEach(user => {
                expect(user.role).toBe('DRIVER');
            });
        });

        test('should filter users by status', async () => {
            const response = await request(app)
                .get('/api/admin/users?status=active')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.users)).toBe(true);
        });

        test('should filter users by company', async () => {
            const response = await request(app)
                .get(`/api/admin/users?company=${testCompany.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.users.forEach(user => {
                expect(user.companyId).toBe(testCompany.id);
            });
        });
    });

    describe('👤 User Profile Management', () => {
        test('should get user details by ID', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const response = await request(app)
                .get(`/api/admin/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testUser.id);
            expect(response.body.email).toBe(testUser.email);
            expect(response.body).not.toHaveProperty('password');
        });

        test('should update user profile information', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const updates = {
                firstName: 'John Updated',
                lastName: 'Passenger Updated',
                phone: '+1777888999',
                address: {
                    street: '789 Updated St',
                    city: 'Updated City',
                    state: 'UC',
                    zipCode: '67890'
                }
            };

            const response = await request(app)
                .put(`/api/admin/users/${testUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates);

            expect(response.status).toBe(200);
            expect(response.body.user.firstName).toBe('John Updated');
            expect(response.body.user.phone).toBe('+1777888999');
        });

        test('should update user status', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/users/${testUser.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    isActive: false,
                    reason: 'Temporary suspension for testing'
                });

            expect(response.status).toBe(200);
            expect(response.body.user.isActive).toBe(false);
        });

        test('should verify user account', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/users/${testUser.id}/verify`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ verified: true });

            expect(response.status).toBe(200);
            expect(response.body.user.isVerified).toBe(true);
        });
    });

    describe('🔑 User Authentication Management', () => {
        test('should reset user password', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/users/${testUser.id}/password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword: 'NewSecurePass123!',
                    forceReset: true
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Password updated successfully');
        });

        test('should assign role to user', async () => {
            if (!testUser) {
                console.log('⚠️ Skipping test - no test user available');
                return;
            }

            const response = await request(app)
                .patch(`/api/admin/users/${testUser.id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    role: 'DRIVER',
                    companyId: testCompany.id
                });

            expect(response.status).toBe(200);
            expect(response.body.user.role).toBe('DRIVER');
            expect(response.body.user.companyId).toBe(testCompany.id);
        });
    });

    describe('📊 User Statistics & Analytics', () => {
        test('should get user statistics overview', async () => {
            const response = await request(app)
                .get('/api/admin/users/stats/overview')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('totalUsers');
            expect(response.body).toHaveProperty('activeUsers');
            expect(response.body).toHaveProperty('usersByRole');
            expect(response.body).toHaveProperty('newUsersThisMonth');
        });

        test('should get user activity statistics', async () => {
            const response = await request(app)
                .get('/api/admin/users/stats/activity')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ period: 'last_30_days' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('period');
            expect(response.body).toHaveProperty('loginActivity');
            expect(response.body).toHaveProperty('registrationTrends');
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/users');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            const userToken = jwt.sign(
                { userId: 'user-id', role: 'PASSENGER' },
                process.env.JWT_SECRET || 'your-secret-key'
            );

            const response = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid user ID', async () => {
            const response = await request(app)
                .get('/api/admin/users/invalid-user-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toContain('User not found');
        });

        test('should handle invalid company assignment', async () => {
            const newUser = {
                firstName: 'Invalid',
                lastName: 'Company',
                email: 'invalid@company.com',
                phone: '+1000111222',
                role: 'DRIVER',
                password: 'Password123!',
                companyId: 'non-existent-company-id'
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUser);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Company not found');
        });

        test('should validate email format', async () => {
            const invalidEmailUser = {
                firstName: 'Invalid',
                lastName: 'Email',
                email: 'not-an-email',
                phone: '+1333444555',
                role: 'PASSENGER',
                password: 'Password123!'
            };

            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidEmailUser);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Invalid email format');
        });
    });
});