/**
 * Admin Company Payments Management
 * 
 * Handles:
 * - Company earnings tracking and settlement
 * - Pending payment monitoring
 * - Company blocking/unblocking based on payment status
 * - Payment clearance between admin and companies
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createId } = require('@paralleldrive/cuid2');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// Commission rate (can be made configurable)
const PLATFORM_COMMISSION_RATE = 0.15; // 15%

// ==================== COMPANY EARNINGS OVERVIEW ====================

/**
 * GET /api/admin/company-payments/overview
 * Get overall company earnings and payment status dashboard
 */
router.get('/overview', async (req, res) => {
    try {
        // Get all companies with their earnings data
        const companies = await prisma.companies.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                name: true,
                isActive: true,
                status: true,
                email: true,
                billingCurrency: true,
                subscription_plans: {
                    select: { name: true, price: true }
                }
            }
        });

        // Get completed jobs with earnings for each company
        const companyEarnings = await prisma.job.groupBy({
            by: ['companyId'],
            where: {
                status: 'COMPLETED',
                actualFare: { not: null }
            },
            _sum: {
                actualFare: true
            },
            _count: {
                id: true
            }
        });

        // Get cleared/settled amounts per company
        const settledAmounts = await prisma.settlements.groupBy({
            by: ['companyId'],
            where: {
                status: { in: ['PROCESSED', 'COMPLETED', 'PAID'] }
            },
            _sum: {
                amount: true
            }
        });

        // Calculate pending amounts for each company
        const companySummaries = companies.map(company => {
            const earnings = companyEarnings.find(e => e.companyId === company.id);
            const settled = settledAmounts.find(s => s.companyId === company.id);
            
            const totalEarnings = Number(earnings?._sum?.actualFare || 0);
            const platformCommission = totalEarnings * PLATFORM_COMMISSION_RATE;
            const companyShare = totalEarnings - platformCommission;
            const settledAmount = Number(settled?._sum?.amount || 0);
            const pendingAmount = companyShare - settledAmount;

            return {
                companyId: company.id,
                companyName: company.brandName || company.legalName || company.name || 'Unknown',
                email: company.email,
                isActive: company.isActive,
                status: company.status,
                currency: company.billingCurrency || 'USD',
                subscriptionPlan: company.subscription_plans?.name || 'None',
                totalJobs: earnings?._count?.id || 0,
                totalEarnings: totalEarnings,
                platformCommission: platformCommission,
                companyShare: companyShare,
                settledAmount: settledAmount,
                pendingAmount: pendingAmount > 0 ? pendingAmount : 0,
                paymentStatus: pendingAmount <= 0 ? 'CLEARED' : 
                              pendingAmount > companyShare * 0.5 ? 'OVERDUE' : 'PENDING'
            };
        });

        // Calculate totals
        const totals = companySummaries.reduce((acc, c) => ({
            totalEarnings: acc.totalEarnings + c.totalEarnings,
            totalCommission: acc.totalCommission + c.platformCommission,
            totalPending: acc.totalPending + c.pendingAmount,
            totalSettled: acc.totalSettled + c.settledAmount,
            companiesWithPending: acc.companiesWithPending + (c.pendingAmount > 0 ? 1 : 0),
            companiesOverdue: acc.companiesOverdue + (c.paymentStatus === 'OVERDUE' ? 1 : 0)
        }), {
            totalEarnings: 0,
            totalCommission: 0,
            totalPending: 0,
            totalSettled: 0,
            companiesWithPending: 0,
            companiesOverdue: 0
        });

        res.json({
            success: true,
            totals: {
                ...totals,
                totalCompanies: companies.length,
                commissionRate: PLATFORM_COMMISSION_RATE * 100
            },
            companies: companySummaries.sort((a, b) => b.pendingAmount - a.pendingAmount)
        });

    } catch (error) {
        console.error('Error fetching company payments overview:', error);
        res.status(500).json({ error: 'Failed to fetch company payments overview' });
    }
});

// ==================== COMPANY PENDING PAYMENTS ====================

/**
 * GET /api/admin/company-payments/pending
 * Get list of companies with pending payments
 */
router.get('/pending', async (req, res) => {
    try {
        const { status, minAmount, sortBy = 'pendingAmount', sortOrder = 'desc' } = req.query;

        // Get companies with pending amounts
        const companies = await prisma.companies.findMany({
            where: { 
                deletedAt: null,
                ...(status && { status })
            },
            select: {
                id: true,
                legalName: true,
                brandName: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
                status: true,
                billingCurrency: true,
                createdAt: true
            }
        });

        // Calculate pending amounts
        const pendingCompanies = await Promise.all(companies.map(async (company) => {
            // Get total earnings from completed jobs
            const earnings = await prisma.job.aggregate({
                where: {
                    companyId: company.id,
                    status: 'COMPLETED',
                    actualFare: { not: null }
                },
                _sum: { actualFare: true },
                _count: { id: true }
            });

            // Get settled amounts
            const settled = await prisma.settlements.aggregate({
                where: {
                    companyId: company.id,
                    status: { in: ['PROCESSED', 'COMPLETED', 'PAID'] }
                },
                _sum: { amount: true }
            });

            // Get last settlement date
            const lastSettlement = await prisma.settlements.findFirst({
                where: { companyId: company.id },
                orderBy: { processedAt: 'desc' },
                select: { processedAt: true, amount: true }
            });

            const totalEarnings = Number(earnings._sum?.actualFare || 0);
            const platformCommission = totalEarnings * PLATFORM_COMMISSION_RATE;
            const companyShare = totalEarnings - platformCommission;
            const settledAmount = Number(settled._sum?.amount || 0);
            const pendingAmount = Math.max(0, companyShare - settledAmount);

            // Determine payment status
            let paymentStatus = 'CLEARED';
            let daysSinceLastPayment = null;

            if (lastSettlement?.processedAt) {
                daysSinceLastPayment = Math.floor((Date.now() - new Date(lastSettlement.processedAt).getTime()) / (1000 * 60 * 60 * 24));
            }

            if (pendingAmount > 0) {
                if (daysSinceLastPayment === null || daysSinceLastPayment > 30) {
                    paymentStatus = 'OVERDUE';
                } else if (daysSinceLastPayment > 14) {
                    paymentStatus = 'DUE_SOON';
                } else {
                    paymentStatus = 'PENDING';
                }
            }

            return {
                ...company,
                companyName: company.brandName || company.legalName || company.name,
                totalJobs: earnings._count?.id || 0,
                totalEarnings,
                platformCommission,
                companyShare,
                settledAmount,
                pendingAmount,
                paymentStatus,
                lastSettlementDate: lastSettlement?.processedAt || null,
                lastSettlementAmount: lastSettlement ? Number(lastSettlement.amount) : null,
                daysSinceLastPayment
            };
        }));

        // Filter by minimum amount if specified
        let filtered = pendingCompanies;
        if (minAmount) {
            filtered = filtered.filter(c => c.pendingAmount >= parseFloat(minAmount));
        }

        // Sort
        filtered.sort((a, b) => {
            const aVal = a[sortBy] || 0;
            const bVal = b[sortBy] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });

        res.json({
            success: true,
            companies: filtered,
            summary: {
                totalCompanies: filtered.length,
                totalPending: filtered.reduce((sum, c) => sum + c.pendingAmount, 0),
                overdueCount: filtered.filter(c => c.paymentStatus === 'OVERDUE').length,
                dueSoonCount: filtered.filter(c => c.paymentStatus === 'DUE_SOON').length
            }
        });

    } catch (error) {
        console.error('Error fetching pending payments:', error);
        res.status(500).json({ error: 'Failed to fetch pending payments' });
    }
});

// ==================== COMPANY PAYMENT DETAILS ====================

/**
 * GET /api/admin/company-payments/:companyId
 * Get detailed payment information for a specific company
 */
router.get('/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate } = req.query;

        // Get company details
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                subscription_plans: true,
                users_companies_ownerIdTousers: {
                    select: { firstName: true, lastName: true, email: true, phone: true }
                }
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Build date filter
        const dateFilter = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }

        // Get jobs with earnings
        const jobs = await prisma.job.findMany({
            where: {
                companyId,
                status: 'COMPLETED',
                actualFare: { not: null },
                ...(Object.keys(dateFilter).length && { completedAt: dateFilter })
            },
            select: {
                id: true,
                publicJobId: true,
                actualFare: true,
                completedAt: true,
                serviceType: true
            },
            orderBy: { completedAt: 'desc' },
            take: 100
        });

        // Get settlement history
        const settlements = await prisma.settlements.findMany({
            where: { companyId },
            orderBy: { processedAt: 'desc' },
            include: {
                users: {
                    select: { firstName: true, lastName: true }
                }
            }
        });

        // Calculate totals
        const totalEarnings = jobs.reduce((sum, j) => sum + Number(j.actualFare || 0), 0);
        const platformCommission = totalEarnings * PLATFORM_COMMISSION_RATE;
        const companyShare = totalEarnings - platformCommission;
        const settledAmount = settlements
            .filter(s => ['PROCESSED', 'COMPLETED', 'PAID'].includes(s.status))
            .reduce((sum, s) => sum + Number(s.amount || 0), 0);
        const pendingAmount = Math.max(0, companyShare - settledAmount);

        res.json({
            success: true,
            company: {
                id: company.id,
                name: company.brandName || company.legalName || company.name,
                email: company.email,
                phone: company.phone,
                isActive: company.isActive,
                status: company.status,
                currency: company.billingCurrency || 'USD',
                owner: company.users_companies_ownerIdTousers,
                subscriptionPlan: company.subscription_plans?.name || 'None'
            },
            financials: {
                totalEarnings,
                platformCommission,
                commissionRate: PLATFORM_COMMISSION_RATE * 100,
                companyShare,
                settledAmount,
                pendingAmount,
                jobCount: jobs.length
            },
            recentJobs: jobs.slice(0, 20).map(j => ({
                id: j.id,
                jobId: j.publicJobId,
                fare: Number(j.actualFare),
                commission: Number(j.actualFare) * PLATFORM_COMMISSION_RATE,
                companyShare: Number(j.actualFare) * (1 - PLATFORM_COMMISSION_RATE),
                completedAt: j.completedAt,
                serviceType: j.serviceType
            })),
            settlements: settlements.map(s => ({
                id: s.id,
                amount: Number(s.amount),
                status: s.status,
                processedAt: s.processedAt,
                processedBy: s.users ? `${s.users.firstName} ${s.users.lastName}` : 'System',
                notes: s.notes
            }))
        });

    } catch (error) {
        console.error('Error fetching company payment details:', error);
        res.status(500).json({ error: 'Failed to fetch company payment details' });
    }
});

// ==================== CLEAR/SETTLE COMPANY PAYMENTS ====================

/**
 * POST /api/admin/company-payments/:companyId/clear
 * Clear/settle pending payments for a company
 */
router.post('/:companyId/clear', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { amount, notes, paymentMethod, transactionRef } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        // Verify company exists
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            select: { id: true, brandName: true, legalName: true, email: true }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Create settlement record
        const settlement = await prisma.settlements.create({
            data: {
                id: createId(),
                companyId,
                amount: parseFloat(amount),
                status: 'PROCESSED',
                processedBy: req.user.userId,
                processedAt: new Date(),
                notes: notes || `Payment cleared via ${paymentMethod || 'manual settlement'}`,
                metadata: {
                    paymentMethod: paymentMethod || 'BANK_TRANSFER',
                    transactionRef: transactionRef || null,
                    clearedBy: req.user.userId,
                    clearedAt: new Date().toISOString()
                },
                updatedAt: new Date()
            }
        });

        // Log the action
        console.log(`Payment cleared for company ${companyId}: $${amount} by admin ${req.user.userId}`);

        res.json({
            success: true,
            message: 'Payment cleared successfully',
            settlement: {
                id: settlement.id,
                amount: Number(settlement.amount),
                status: settlement.status,
                processedAt: settlement.processedAt,
                companyName: company.brandName || company.legalName
            }
        });

    } catch (error) {
        console.error('Error clearing company payment:', error);
        res.status(500).json({ error: 'Failed to clear payment' });
    }
});

// ==================== BLOCK/UNBLOCK COMPANY ====================

/**
 * POST /api/admin/company-payments/:companyId/block
 * Block a company due to payment issues
 */
router.post('/:companyId/block', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { reason, blockType = 'PAYMENT_OVERDUE' } = req.body;

        // Update company status
        const company = await prisma.companies.update({
            where: { id: companyId },
            data: {
                isActive: false,
                status: 'SUSPENDED',
                updatedAt: new Date(),
                // Store blocking info in a metadata field or separate table
            },
            select: {
                id: true,
                brandName: true,
                legalName: true,
                email: true,
                isActive: true,
                status: true
            }
        });

        // Optionally disable all company drivers
        await prisma.user.updateMany({
            where: {
                companyId,
                role: 'DRIVER'
            },
            data: {
                isActive: false,
                status: 'BLOCKED',
                updatedAt: new Date()
            }
        });

        console.log(`Company ${companyId} blocked due to ${blockType}: ${reason}`);

        res.json({
            success: true,
            message: 'Company has been blocked',
            company: {
                id: company.id,
                name: company.brandName || company.legalName,
                isActive: company.isActive,
                status: company.status,
                blockedReason: reason,
                blockedType: blockType
            }
        });

    } catch (error) {
        console.error('Error blocking company:', error);
        res.status(500).json({ error: 'Failed to block company' });
    }
});

/**
 * POST /api/admin/company-payments/:companyId/unblock
 * Unblock a company after payment resolution
 */
router.post('/:companyId/unblock', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { notes } = req.body;

        // Update company status
        const company = await prisma.companies.update({
            where: { id: companyId },
            data: {
                isActive: true,
                status: 'ACTIVE',
                updatedAt: new Date()
            },
            select: {
                id: true,
                brandName: true,
                legalName: true,
                email: true,
                isActive: true,
                status: true
            }
        });

        // Reactivate company drivers
        await prisma.user.updateMany({
            where: {
                companyId,
                role: 'DRIVER',
                status: 'BLOCKED'
            },
            data: {
                isActive: true,
                status: 'ACTIVE',
                updatedAt: new Date()
            }
        });

        console.log(`Company ${companyId} unblocked: ${notes}`);

        res.json({
            success: true,
            message: 'Company has been unblocked and reactivated',
            company: {
                id: company.id,
                name: company.brandName || company.legalName,
                isActive: company.isActive,
                status: company.status
            }
        });

    } catch (error) {
        console.error('Error unblocking company:', error);
        res.status(500).json({ error: 'Failed to unblock company' });
    }
});

// ==================== BULK OPERATIONS ====================

/**
 * POST /api/admin/company-payments/bulk-clear
 * Clear payments for multiple companies
 */
router.post('/bulk-clear', async (req, res) => {
    try {
        const { payments } = req.body; // Array of { companyId, amount, notes }

        if (!payments || !Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ error: 'Payments array is required' });
        }

        const results = [];

        for (const payment of payments) {
            try {
                const settlement = await prisma.settlements.create({
                    data: {
                        id: createId(),
                        companyId: payment.companyId,
                        amount: parseFloat(payment.amount),
                        status: 'PROCESSED',
                        processedBy: req.user.userId,
                        processedAt: new Date(),
                        notes: payment.notes || 'Bulk payment clearance',
                        updatedAt: new Date()
                    }
                });

                results.push({
                    companyId: payment.companyId,
                    success: true,
                    settlementId: settlement.id,
                    amount: Number(settlement.amount)
                });
            } catch (err) {
                results.push({
                    companyId: payment.companyId,
                    success: false,
                    error: err.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;

        res.json({
            success: true,
            message: `Processed ${successCount} of ${payments.length} payments`,
            results
        });

    } catch (error) {
        console.error('Error in bulk payment clearance:', error);
        res.status(500).json({ error: 'Failed to process bulk payments' });
    }
});

/**
 * POST /api/admin/company-payments/bulk-block
 * Block multiple companies for overdue payments
 */
router.post('/bulk-block', async (req, res) => {
    try {
        const { companyIds, reason = 'Payment overdue' } = req.body;

        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Company IDs array is required' });
        }

        // Block all specified companies
        const result = await prisma.companies.updateMany({
            where: { id: { in: companyIds } },
            data: {
                isActive: false,
                status: 'SUSPENDED',
                updatedAt: new Date()
            }
        });

        // Block their drivers
        await prisma.user.updateMany({
            where: {
                companyId: { in: companyIds },
                role: 'DRIVER'
            },
            data: {
                isActive: false,
                status: 'BLOCKED',
                updatedAt: new Date()
            }
        });

        res.json({
            success: true,
            message: `Blocked ${result.count} companies`,
            blockedCount: result.count,
            reason
        });

    } catch (error) {
        console.error('Error in bulk company blocking:', error);
        res.status(500).json({ error: 'Failed to block companies' });
    }
});

// ==================== SETTLEMENT HISTORY ====================

/**
 * GET /api/admin/company-payments/settlements/all
 * Get all settlement history across all companies
 */
router.get('/settlements/all', async (req, res) => {
    try {
        const { page = 1, limit = 20, startDate, endDate, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status) where.status = status;

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
                        select: { id: true, brandName: true, legalName: true, email: true }
                    },
                    users: {
                        select: { firstName: true, lastName: true }
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
            success: true,
            settlements: settlements.map(s => ({
                id: s.id,
                companyId: s.companyId,
                companyName: s.companies?.brandName || s.companies?.legalName || 'Unknown',
                companyEmail: s.companies?.email,
                amount: Number(s.amount),
                status: s.status,
                processedAt: s.processedAt,
                processedBy: s.users ? `${s.users.firstName} ${s.users.lastName}` : 'System',
                notes: s.notes
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount
            }
        });

    } catch (error) {
        console.error('Error fetching settlements:', error);
        res.status(500).json({ error: 'Failed to fetch settlements' });
    }
});

module.exports = router;
