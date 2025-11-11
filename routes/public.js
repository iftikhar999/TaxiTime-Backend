const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const pricingService = require('../services/pricingService');
const jobService = require('../services/jobService');

const prisma = new PrismaClient();
const router = express.Router();

const ensurePassenger = async ({ firstName, lastName, email, phone }) => {
    const identifier = email ? { email } : { phone };
    if (!identifier.email && !identifier.phone) {
        throw new Error('Customer email or phone is required');
    }

    let user = await prisma.user.findFirst({ where: identifier });
    if (user) {
        return user;
    }

    const password = crypto.randomBytes(12).toString('base64');
    const hashedPassword = await bcrypt.hash(password, 10);

    user = await prisma.user.create({
        data: {
            firstName: firstName || 'Guest',
            lastName: lastName || 'User',
            email: email || null,
            phone: phone || null,
            password: hashedPassword,
            role: 'PASSENGER',
            isActive: true,
            isVerified: false
        }
    });

    return user;
};

const resolveCompany = async (companyId) => {
    if (companyId) {
        const company = await prisma.companies.findUnique({ where: { id: companyId } });
        if (company) {
            return company;
        }
        throw new Error('Invalid companyId');
    }

    const firstCompany = await prisma.companies.findFirst({
        where: { status: { in: ['ACTIVE', 'PENDING'] } },
        orderBy: { createdAt: 'asc' }
    });

    if (!firstCompany) {
        throw new Error('No company available for booking');
    }

    return firstCompany;
};

// POST /api/public/dispatch/estimate
router.post('/dispatch/estimate', async (req, res) => {
    try {
        const {
            companyId,
            pickupLatitude,
            pickupLongitude,
            dropoffLatitude,
            dropoffLongitude,
            vehicleType = 'SEDAN',
            jobType = 'TAXI',
            scheduledTime
        } = req.body;

        const company = await resolveCompany(companyId);

        const estimate = await pricingService.calculatePrice({
            companyId: company.id,
            vehicleType,
            pickupLatitude: parseFloat(pickupLatitude),
            pickupLongitude: parseFloat(pickupLongitude),
            dropoffLatitude: parseFloat(dropoffLatitude),
            dropoffLongitude: parseFloat(dropoffLongitude),
            scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
            jobType
        });

        res.json({
            success: true,
            companyId: company.id,
            data: estimate
        });
    } catch (error) {
        console.error('Public estimate error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to calculate estimate'
        });
    }
});

// POST /api/public/dispatch/jobs
router.post('/dispatch/jobs', async (req, res) => {
    try {
        const {
            companyId,
            jobType = 'TAXI',
            pickupAddress,
            pickupLatitude,
            pickupLongitude,
            dropoffAddress,
            dropoffLatitude,
            dropoffLongitude,
            vehicleType = 'SEDAN',
            scheduledTime,
            paymentMethod = 'CARD',
            customer,
            specialRequests
        } = req.body;

        if (!pickupAddress || !dropoffAddress) {
            return res.status(400).json({ success: false, error: 'Pickup and drop-off addresses are required' });
        }

        const company = await resolveCompany(companyId);
        const passenger = await ensurePassenger(customer || {});

        const estimate = await pricingService.calculatePrice({
            companyId: company.id,
            vehicleType,
            pickupLatitude: parseFloat(pickupLatitude),
            pickupLongitude: parseFloat(pickupLongitude),
            dropoffLatitude: parseFloat(dropoffLatitude),
            dropoffLongitude: parseFloat(dropoffLongitude),
            scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
            jobType
        });

        const job = await jobService.createJob({
            type: jobType,
            customerId: passenger.id,
            companyId: company.id,
            pickupAddress,
            pickupLatitude: pickupLatitude ? parseFloat(pickupLatitude) : null,
            pickupLongitude: pickupLongitude ? parseFloat(pickupLongitude) : null,
            dropoffAddress,
            dropoffLatitude: dropoffLatitude ? parseFloat(dropoffLatitude) : null,
            dropoffLongitude: dropoffLongitude ? parseFloat(dropoffLongitude) : null,
            vehicleType,
            estimatedPrice: estimate.finalPrice,
            estimatedDistance: estimate.distance,
            estimatedDuration: estimate.estimatedTime,
            scheduledAt: scheduledTime ? new Date(scheduledTime) : null,
            paymentMethod,
            instructions: specialRequests || null
        });

        res.status(201).json({
            success: true,
            data: {
                job,
                estimate
            }
        });
    } catch (error) {
        console.error('Public job creation error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Failed to create job'
        });
    }
});

// GET /api/public/jobs/:jobIdentifier/status
router.get('/jobs/:jobIdentifier/status', async (req, res) => {
    try {
        const { jobIdentifier } = req.params;

        const job = await prisma.job.findFirst({
            where: {
                OR: [
                    { id: jobIdentifier },
                    { jobId: jobIdentifier }
                ]
            },
            include: {
                assignedDriver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true
                    }
                },
                trip: {
                    select: {
                        id: true,
                        pickup: true,
                        destination: true,
                        status: true
                    }
                }
            }
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            data: {
                jobId: job.jobId,
                status: job.status,
                driver: job.assignedDriver,
                trip: job.trip
            }
        });
    } catch (error) {
        console.error('Public job status error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch job status' });
    }
});

// POST /api/public/company-signup
router.post('/company-signup', async (req, res) => {
    try {
        const {
            companyName,
            legalName,
            email,
            phone,
            website,
            fleetSize,
            city,
            country,
            ownerFirstName,
            ownerLastName
        } = req.body;

        if (!email || !ownerFirstName || !ownerLastName || !companyName) {
            return res.status(400).json({
                success: false,
                error: 'Owner details, email, and company name are required'
            });
        }

        let owner = await prisma.user.findUnique({ where: { email } });
        if (owner && owner.role !== 'OWNER') {
            return res.status(400).json({
                success: false,
                error: 'Email already in use by another account'
            });
        }

        if (!owner) {
            const password = crypto.randomBytes(12).toString('base64');
            const hashedPassword = await bcrypt.hash(password, 10);
            owner = await prisma.user.create({
                data: {
                    firstName: ownerFirstName,
                    lastName: ownerLastName,
                    email,
                    phone: phone || null,
                    password: hashedPassword,
                    role: 'OWNER',
                    isActive: false,
                    isVerified: false
                }
            });
        }

        const existingCompany = await prisma.companies.findFirst({ where: { ownerId: owner.id } });
        if (existingCompany) {
            return res.status(400).json({
                success: false,
                error: 'An onboarding request already exists for this owner'
            });
        }

        const company = await prisma.companies.create({
            data: {
                ownerId: owner.id,
                brandName: companyName,
                legalName: legalName || companyName,
                email,
                phone: phone || owner.phone,
                website: website || null,
                status: 'PENDING',
                kycStatus: 'PENDING',
                hqCity: city || null,
                hqCountry: country || null,
                fleetSizeTotal: fleetSize ? parseInt(fleetSize, 10) : 0,
                primaryContactName: `${ownerFirstName} ${ownerLastName}`,
                primaryContactEmail: email,
                primaryContactPhone: phone || owner.phone,
                isActive: false,
                isVerified: false
            }
        });

        res.status(201).json({
            success: true,
            message: 'Company signup request received',
            data: {
                companyId: company.id
            }
        });
    } catch (error) {
        console.error('Company signup error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit signup request' });
    }
});

module.exports = router;
