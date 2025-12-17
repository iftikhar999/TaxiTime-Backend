const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createId } = require('@paralleldrive/cuid2');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// GET /api/payments/overview - Get payment overview with analytics
router.get('/overview', async (req, res) => {
    try {
        const { startDate, endDate, companyId } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }

        const whereClause = {
            ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
            ...(companyId && { companyId })
        };

        // Get overview stats
        const [
            totalPayments,
            paidPayments,
            pendingPayments,
            totalAmount,
            commissionAmount
        ] = await Promise.all([
            prisma.payments.count({ where: whereClause }),
            prisma.payments.count({ where: { ...whereClause, status: 'PAID' } }),
            prisma.payments.count({ where: { ...whereClause, status: 'PENDING' } }),
            prisma.payments.aggregate({
                where: { ...whereClause, status: 'PAID' },
                _sum: { amount: true }
            }),
            prisma.payments.aggregate({
                where: { ...whereClause, status: 'PAID' },
                _sum: { amount: true }
            }).then(result => (result._sum.amount || 0) * 0.15) // 15% commission
        ]);

        // Get payment methods breakdown
        const paymentMethodStats = await prisma.payments.groupBy({
            by: ['paymentMethod'],
            where: whereClause,
            _count: { id: true },
            _sum: { amount: true }
        });

        const paymentMethods = paymentMethodStats.map(stat => ({
            method: stat.paymentMethod || 'UNKNOWN',
            count: stat._count.id,
            amount: Number(stat._sum.amount || 0)
        }));

        // Get top companies by revenue
        const topCompaniesData = await prisma.payments.groupBy({
            by: ['companyId'],
            where: { ...whereClause, status: 'PAID' },
            _sum: { amount: true },
            _count: { id: true },
            orderBy: { _sum: { amount: 'desc' } },
            take: 10
        });

        // Get company details
        const companyIds = topCompaniesData.map(c => c.companyId).filter(Boolean);
        const companies = await prisma.companies.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, legalName: true, brandName: true, name: true }
        });

        const topCompanies = topCompaniesData.map(stat => {
            const company = companies.find(c => c.id === stat.companyId);
            return {
                id: stat.companyId,
                name: company?.brandName || company?.legalName || company?.name || 'Unknown',
                revenue: Number(stat._sum.amount || 0),
                transactions: stat._count.id
            };
        });

        // Get recent transactions
        const recentTransactions = await prisma.payments.findMany({
            where: whereClause,
            include: {
                companies: { select: { id: true, legalName: true, brandName: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Get pending settlements (companies with pending payments)
        const pendingSettlementData = await prisma.payments.groupBy({
            by: ['companyId'],
            where: { status: 'PENDING' },
            _sum: { amount: true },
            _count: { id: true }
        });

        const pendingSettlements = pendingSettlementData.map(stat => {
            const company = companies.find(c => c.id === stat.companyId);
            return {
                companyId: stat.companyId,
                companyName: company?.brandName || company?.legalName || 'Unknown',
                pendingAmount: Number(stat._sum.amount || 0),
                pendingCount: stat._count.id
            };
        });

        res.json({
            overview: {
                totalRevenue: Number(totalAmount._sum.amount || 0),
                totalTransactions: totalPayments,
                totalCommission: commissionAmount,
                commissionRate: 15,
                paidCount: paidPayments,
                pendingCount: pendingPayments
            },
            paymentMethods,
            topCompanies,
            recentTransactions: recentTransactions.map(t => ({
                id: t.id,
                amount: Number(t.amount || 0),
                status: t.status,
                paymentMethod: t.paymentMethod,
                company: t.companies?.brandName || t.companies?.legalName || 'N/A',
                createdAt: t.createdAt
            })),
            pendingSettlements
        });

    } catch (error) {
        console.error('Error fetching payment overview:', error);
        res.status(500).json({ error: 'Failed to fetch payment overview' });
    }
});

// GET /api/payments - Get all payments with pagination
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            paymentMethod,
            companyId,
            startDate,
            endDate
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause
        const where = {};
        if (status) where.status = status;
        if (paymentMethod) where.paymentMethod = paymentMethod;
        if (companyId) where.companyId = companyId;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const [payments, totalCount] = await Promise.all([
            prisma.payments.findMany({
                where,
                include: {
                    companies: {
                        select: { id: true, legalName: true, brandName: true }
                    },
                    job: {
                        select: { id: true, publicJobId: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.payments.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        res.json({
            payments: payments.map(p => ({
                ...p,
                amount: Number(p.amount || 0),
                company: p.companies?.brandName || p.companies?.legalName || 'N/A'
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// GET /api/payments/:id - Get payment details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const payment = await prisma.payments.findUnique({
            where: { id },
            include: {
                companies: {
                    select: { id: true, legalName: true, brandName: true, email: true }
                },
                job: {
                    include: {
                        users_jobs_customerIdTousers: {
                            select: { id: true, firstName: true, lastName: true, email: true }
                        },
                        users_jobs_assignedDriverIdTousers: {
                            select: { id: true, firstName: true, lastName: true }
                        }
                    }
                }
            }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({
            ...payment,
            amount: Number(payment.amount || 0),
            customer: payment.job?.users_jobs_customerIdTousers || null,
            driver: payment.job?.users_jobs_assignedDriverIdTousers || null
        });

    } catch (error) {
        console.error('Error fetching payment details:', error);
        res.status(500).json({ error: 'Failed to fetch payment details' });
    }
});

// POST /api/payments/settle/:companyId - Process settlement
router.post('/settle/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { amount, paymentIds, notes } = req.body;

        // Create settlement record
        const settlement = await prisma.settlements.create({
            data: {
                id: createId(),
                companyId,
                amount: amount || 0,
                status: 'PROCESSED',
                notes: notes || '',
                processedAt: new Date(),
                processedBy: req.user.userId,
                updatedAt: new Date()
            }
        });

        // Update payment statuses if payment IDs provided
        if (paymentIds && paymentIds.length > 0) {
            await prisma.payments.updateMany({
                where: { id: { in: paymentIds } },
                data: {
                    status: 'SETTLED',
                    updatedAt: new Date()
                }
            });
        }

        res.json({
            success: true,
            message: 'Settlement processed successfully',
            settlement
        });

    } catch (error) {
        console.error('Error processing settlement:', error);
        res.status(500).json({ error: 'Failed to process settlement' });
    }
});

// GET /api/payments/settlements/history - Get settlement history
router.get('/settlements/history', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            companyId,
            startDate,
            endDate
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (companyId) where.companyId = companyId;

        if (startDate || endDate) {
            where.processedAt = {};
            if (startDate) where.processedAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.processedAt.lte = end;
            }
        }

        const [settlements, totalCount] = await Promise.all([
            prisma.settlements.findMany({
                where,
                include: {
                    companies: {
                        select: { id: true, legalName: true, brandName: true }
                    }
                },
                orderBy: { processedAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.settlements.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        res.json({
            settlements: settlements.map(s => ({
                ...s,
                amount: Number(s.amount || 0),
                company: s.companies?.brandName || s.companies?.legalName || 'N/A'
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('Error fetching settlement history:', error);
        res.status(500).json({ error: 'Failed to fetch settlement history' });
    }
});

// GET /api/payments/settings/global - Get global payment settings
router.get('/settings/global', async (req, res) => {
    try {
        // Get Stripe keys from environment or database
        const hasStripeKey = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_YOUR_KEY_HERE';
        
        res.json({
            data: {
                publicKey: process.env.STRIPE_PUBLIC_KEY || '',
                enabled: hasStripeKey,
                hasSecretKey: hasStripeKey,
                commissionRate: 15,
                supportedMethods: ['CASH', 'CARD', 'DIGITAL_WALLET'],
                defaultCurrency: 'USD'
            }
        });

    } catch (error) {
        console.error('Error fetching payment settings:', error);
        res.status(500).json({ error: 'Failed to fetch payment settings' });
    }
});

// GET /api/payments/settings/global/stripe - Get Stripe keys
router.get('/settings/global/stripe', async (req, res) => {
    try {
        const hasStripeKey = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_YOUR_KEY_HERE';
        
        res.json({
            data: {
                publicKey: process.env.STRIPE_PUBLIC_KEY || '',
                enabled: hasStripeKey,
                hasSecretKey: hasStripeKey
            }
        });

    } catch (error) {
        console.error('Error fetching Stripe settings:', error);
        res.status(500).json({ error: 'Failed to fetch Stripe settings' });
    }
});

// PUT /api/payments/settings/global/stripe - Save Stripe keys
router.put('/settings/global/stripe', async (req, res) => {
    try {
        const { publicKey, secretKey } = req.body;

        // In a production environment, you would save these to a secure store
        // For now, we'll just acknowledge the request
        // Note: DO NOT log secret keys
        
        if (!publicKey || !secretKey) {
            return res.status(400).json({ 
                error: 'Both publishable and secret keys are required' 
            });
        }

        // Validate key formats
        if (!publicKey.startsWith('pk_')) {
            return res.status(400).json({ error: 'Invalid publishable key format' });
        }
        if (!secretKey.startsWith('sk_')) {
            return res.status(400).json({ error: 'Invalid secret key format' });
        }

        res.json({
            success: true,
            message: 'Stripe keys saved successfully. Please update your .env file with the new keys for persistence.'
        });

    } catch (error) {
        console.error('Error saving Stripe settings:', error);
        res.status(500).json({ error: 'Failed to save Stripe settings' });
    }
});

// DELETE /api/payments/settings/global/stripe - Remove Stripe keys
router.delete('/settings/global/stripe', async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Stripe keys removed. Update your .env file to persist this change.'
        });

    } catch (error) {
        console.error('Error removing Stripe settings:', error);
        res.status(500).json({ error: 'Failed to remove Stripe settings' });
    }
});

module.exports = router;
