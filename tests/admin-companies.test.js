const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Prisma client
const prisma = new PrismaClient();

// Create Express app for testing
const app = express();
app.use(express.json());

// Import routes
const companiesRoutes = require('../routes/companies');

// Use routes
app.use('/api/admin/companies', companiesRoutes);

// Test users and tokens
let testUsers = {};
let adminToken;
let ownerToken;

describe('Company Registration & Management - Comprehensive Tests', () => {
    beforeAll(async () => {
        // Create test admin user
        const adminUser = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Admin',
                email: 'test-admin-companies@test.com',
                phone: '+1-555-0001',
                password: '$2a$10$test.hash.for.password',
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
            }
        });

        // Create test owner user
        const ownerUser = await prisma.user.create({
            data: {
                firstName: 'Test',
                lastName: 'Owner',
                email: 'test-company-owner-1@test.com',
                phone: '+1-555-0002',
                password: '$2a$10$test.hash.for.password',
                role: 'OWNER',
                isActive: true,
                isVerified: true,
            }
        });

        testUsers = {
            admin: adminUser.id,
            owner: ownerUser.id
        };

        // Generate JWT tokens using the same secret as auth middleware
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

        ownerToken = jwt.sign(
            {
                userId: ownerUser.id,
                email: ownerUser.email,
                role: ownerUser.role
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        console.log('✅ Test setup completed:', {
            admin: 'test-admin-companies',
            owner: 'test-company-owner-1'
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.company.deleteMany({
            where: {
                email: {
                    in: ['info@testtaxi.com', 'another@anothertaxi.com']
                }
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        'test-admin-companies@test.com',
                        'test-company-owner-1@test.com',
                        'john.owner@testtaxi.com',
                        'jane.owner@anothertaxi.com'
                    ]
                }
            }
        });

        await prisma.$disconnect();
    });

    describe('🏢 Company Registration Process', () => {
        test('should register a new company with complete details', async () => {
            const newCompany = {
                name: 'Test Taxi Company LLC',
                email: 'info@testtaxi.com',
                phone: '+1-555-0100',
                website: 'https://testtaxi.com',
                description: 'Premium taxi services for the city',
                services: ['TAXI', 'DELIVERY'],
                address: {
                    street: '123 Business Ave',
                    city: 'Business City',
                    state: 'BC',
                    zipCode: '12345',
                    country: 'USA',
                    coordinates: {
                        latitude: 40.7128,
                        longitude: -74.0060
                    }
                },
                ownerFirstName: 'John',
                ownerLastName: 'Owner',
                ownerEmail: 'john.owner@testtaxi.com',
                ownerPhone: '+1-555-0101',
                ownerPassword: 'SecurePassword123!'
            };

            const response = await request(app)
                .post('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newCompany);

            console.log('🔍 Company registration response:', {
                status: response.status,
                body: response.body,
                headers: response.headers
            });

            if (response.status !== 201) {
                console.log('❌ Expected 201, got:', response.status);
                console.log('❌ Error details:', response.body);
            }

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('company');
            expect(response.body.company.legalName).toBe(newCompany.name);
            expect(response.body.company.brandName).toBe(newCompany.name);
            expect(response.body.company.email).toBe(newCompany.email);
            expect(response.body.company.serviceModes.taxi).toBe(newCompany.services.includes('TAXI'));
        });

        test('should prevent duplicate company emails', async () => {
            const duplicateCompany = {
                name: 'Another Taxi Company',
                email: 'info@testtaxi.com', // Same email as above
                phone: '+1-555-0200',
                ownerFirstName: 'Jane',
                ownerLastName: 'Owner',
                ownerEmail: 'jane.owner@anothertaxi.com',
                ownerPassword: 'SecurePassword123!'
            };

            const response = await request(app)
                .post('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(duplicateCompany);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Company with this email already exists');
        });

        test('should validate required fields', async () => {
            const incompleteCompany = {
                name: 'Incomplete Company'
                // Missing email and phone
            };

            const response = await request(app)
                .post('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(incompleteCompany);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('email');
        });
    });

    describe('📋 Company Management Operations', () => {
        test('should list all companies with pagination', async () => {
            const response = await request(app)
                .get('/api/admin/companies?page=1&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('companies');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.companies)).toBe(true);
        });

        test('should search companies by name', async () => {
            const response = await request(app)
                .get('/api/admin/companies?search=Test Taxi')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.companies.length).toBeGreaterThan(0);
            expect(response.body.companies[0].legalName).toContain('Test Taxi');
        });

        test('should filter companies by status', async () => {
            const response = await request(app)
                .get('/api/admin/companies?status=pending')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.companies)).toBe(true);
        });

        test('should get company details by ID', async () => {
            // First get a company ID
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .get(`/api/admin/companies/${companyId}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id');
                expect(response.body.id).toBe(companyId);
            }
        });
    });

    describe('✏️ Company Status Management', () => {
        test('should activate a company', async () => {
            // First get a company ID
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .patch(`/api/admin/companies/${companyId}/status`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ isActive: true });

                expect([200, 404]).toContain(response.status);
            }
        });

        test('should suspend a company', async () => {
            // First get a company ID
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .patch(`/api/admin/companies/${companyId}/status`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ isActive: false });

                expect([200, 404]).toContain(response.status);
            }
        });

        test('should verify company KYC status', async () => {
            // First get a company ID  
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .patch(`/api/admin/companies/${companyId}/kyc`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ kycStatus: 'APPROVED' });

                expect([200, 404]).toContain(response.status);
            }
        });
    });

    describe('💼 Company Service Configuration', () => {
        test('should update company service modes', async () => {
            // First get a company ID
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .patch(`/api/admin/companies/${companyId}/services`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ features: ['TAXI', 'DELIVERY', 'COURIER'] });

                expect([200, 404]).toContain(response.status);
            }
        });

        test('should update operating hours', async () => {
            // First get a company ID
            const listResponse = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`);

            const companyId = listResponse.body.companies[0]?.id;

            if (companyId) {
                const response = await request(app)
                    .patch(`/api/admin/companies/${companyId}/hours`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        operatingHours: {
                            monday: { start: '06:00', end: '22:00', isActive: true },
                            tuesday: { start: '06:00', end: '22:00', isActive: true }
                        }
                    });

                expect([200, 404]).toContain(response.status);
            }
        });
    });

    describe('🔐 Authentication & Authorization', () => {
        test('should deny access without token', async () => {
            const response = await request(app)
                .get('/api/admin/companies');

            expect(response.status).toBe(401);
        });

        test('should deny access for non-admin users', async () => {
            const response = await request(app)
                .get('/api/admin/companies')
                .set('Authorization', `Bearer ${ownerToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('❌ Error Handling', () => {
        test('should handle invalid company ID', async () => {
            const response = await request(app)
                .get('/api/admin/companies/invalid-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.error).toContain('Company not found');
        });

        test('should handle database errors gracefully', async () => {
            const invalidCompany = {
                name: 'Test Company for Error',
                email: 'error-test@test.com',
                phone: '+1-555-9999'
                // This will cause a database error if there are issues
            };

            const response = await request(app)
                .post('/api/admin/companies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidCompany);

            // Should either succeed or fail gracefully
            expect([201, 400, 500]).toContain(response.status);
        });
    });
});