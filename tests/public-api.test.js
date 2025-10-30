const request = require('supertest');
const app = require('../server');

describe('Public Dispatch API', () => {
    let testCompany;
    let ownerUser;
    let createdJob;

    beforeAll(async () => {
        const uniqueSuffix = Date.now();
        ownerUser = await global.prisma.user.create({
            data: {
                firstName: 'Public',
                lastName: 'Owner',
                email: `public-owner-${uniqueSuffix}@example.com`,
                phone: `+1555${Math.floor(Math.random() * 100000)}`,
                password: 'hashed-password',
                role: 'OWNER',
                isActive: true
            }
        });

        testCompany = await global.prisma.company.create({
            data: {
                ownerId: ownerUser.id,
                brandName: 'Public Test Taxi',
                legalName: 'Public Test Taxi LLC',
                email: `company-${uniqueSuffix}@example.com`,
                phone: '+15550000000',
                status: 'ACTIVE',
                kycStatus: 'APPROVED',
                isActive: true,
                isVerified: true
            }
        });

        await global.prisma.companyTariff.create({
            data: {
                companyId: testCompany.id,
                serviceMode: 'TAXI',
                vehicleType: 'SEDAN',
                baseFare: 5.0,
                perKmRate: 1.5,
                perMinuteRate: 0.4,
                minimumFare: 5.0,
                waitingFeePerMinute: 0.2,
                cancellationFee: 2.5,
                airportFee: 4.0,
                nightSurchargeMultiplier: 1.2,
                taxRate: 0.05,
                currency: 'USD'
            }
        });
    });

    afterAll(async () => {
        await global.prisma.job.deleteMany({ where: { companyId: testCompany.id } });
        await global.prisma.ride.deleteMany({ where: { companyId: testCompany.id } });
        await global.prisma.companyTariff.deleteMany({ where: { companyId: testCompany.id } });
        await global.prisma.company.delete({ where: { id: testCompany.id } });
        await global.prisma.user.delete({ where: { id: ownerUser.id } });
        await global.prisma.user.deleteMany({ where: { email: { contains: 'alice-' } } }).catch(() => {});
    });

    test('should calculate a public price estimate', async () => {
        const response = await request(app)
            .post('/api/public/dispatch/estimate')
            .send({
                companyId: testCompany.id,
                pickupLatitude: 40.7128,
                pickupLongitude: -74.0060,
                dropoffLatitude: 40.7589,
                dropoffLongitude: -73.9855,
                vehicleType: 'SEDAN',
                jobType: 'TAXI'
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('finalPrice');
        expect(response.body.data.finalPrice).toBeGreaterThan(0);
        expect(response.body.companyId).toBe(testCompany.id);
    });

    test('should create a public booking and return job data', async () => {
        const response = await request(app)
            .post('/api/public/dispatch/jobs')
            .send({
                companyId: testCompany.id,
                jobType: 'TAXI',
                pickupAddress: '350 5th Ave, New York, NY',
                pickupLatitude: 40.7484,
                pickupLongitude: -73.9857,
                dropoffAddress: '11 Wall St, New York, NY',
                dropoffLatitude: 40.7060,
                dropoffLongitude: -74.0086,
                vehicleType: 'SEDAN',
                scheduledTime: null,
                paymentMethod: 'CARD',
                customer: {
                    firstName: 'Alice',
                    lastName: 'Rider',
                    email: `alice-${Date.now()}@example.com`,
                    phone: `+1555${Math.floor(Math.random() * 1000000)}`
                }
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.job).toHaveProperty('id');
        expect(response.body.data.job.companyId).toBe(testCompany.id);
        expect(response.body.data.estimate.finalPrice).toBeGreaterThan(0);

        createdJob = response.body.data.job;
    });

    test('should fetch public job status', async () => {
        const response = await request(app)
            .get(`/api/public/jobs/${createdJob.jobId}/status`)
            .send();

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.jobId).toBe(createdJob.jobId);
        expect(response.body.data.status).toBeDefined();
    });
});
