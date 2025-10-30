const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require authenticated user
router.use(authenticateToken);

/**
 * GET /api/customers/search
 * Search customers by name, phone, or email
 * Scoped to the user's company
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                data: [],
                total: 0
            });
        }

        // Get user's company
        const companyId = req.user.companyId;
        if (!companyId) {
            return res.status(403).json({
                success: false,
                message: 'User must be associated with a company'
            });
        }

        // Search customers
        const customers = await prisma.user.findMany({
            where: {
                companyId: companyId,
                role: 'CUSTOMER',
                OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } }
                ]
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                createdAt: true,
                _count: {
                    select: {
                        ridesAsPassenger: true
                    }
                }
            },
            take: parseInt(limit),
            orderBy: [
                { updatedAt: 'desc' }
            ]
        });

        // Format response
        const formattedCustomers = customers.map(customer => ({
            id: customer.id,
            customerId: customer.id,
            name: `${customer.firstName} ${customer.lastName}`.trim(),
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone,
            email: customer.email,
            rideHistory: customer._count.ridesAsPassenger
        }));

        res.json({
            success: true,
            data: formattedCustomers,
            total: formattedCustomers.length
        });

    } catch (error) {
        console.error('Customer search error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search customers',
            error: error.message
        });
    }
});

/**
 * GET /api/customers/:id
 * Get customer details by ID
 * Scoped to the user's company
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(403).json({
                success: false,
                message: 'User must be associated with a company'
            });
        }

        const customer = await prisma.user.findFirst({
            where: {
                id: id,
                companyId: companyId,
                role: 'CUSTOMER'
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                createdAt: true,
                _count: {
                    select: {
                        ridesAsPassenger: true
                    }
                }
            }
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: customer.id,
                customerId: customer.id,
                name: `${customer.firstName} ${customer.lastName}`.trim(),
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: customer.phone,
                email: customer.email,
                rideHistory: customer._count.ridesAsPassenger
            }
        });

    } catch (error) {
        console.error('Get customer details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get customer details',
            error: error.message
        });
    }
});

/**
 * POST /api/customers
 * Create a new customer
 * Scoped to the user's company
 */
router.post('/', async (req, res) => {
    try {
        const { firstName, lastName, phone, email } = req.body;
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(403).json({
                success: false,
                message: 'User must be associated with a company'
            });
        }

        if (!firstName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'First name and phone are required'
            });
        }

        // Check if customer already exists
        const existing = await prisma.user.findFirst({
            where: {
                phone: phone,
                companyId: companyId,
                role: 'CUSTOMER'
            }
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Customer with this phone number already exists'
            });
        }

        // Create customer
        const customer = await prisma.user.create({
            data: {
                firstName,
                lastName: lastName || '',
                phone,
                email: email || '',
                role: 'CUSTOMER',
                companyId: companyId,
                status: 'ACTIVE'
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                createdAt: true
            }
        });

        res.status(201).json({
            success: true,
            message: 'Customer created successfully',
            data: {
                id: customer.id,
                customerId: customer.id,
                name: `${customer.firstName} ${customer.lastName}`.trim(),
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: customer.phone,
                email: customer.email,
                rideHistory: 0
            }
        });

    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create customer',
            error: error.message
        });
    }
});

module.exports = router;
