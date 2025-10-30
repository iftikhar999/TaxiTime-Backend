const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware: Require OWNER or COMPANY_ADMIN role and scope to company
router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN'));

const scopeToCompany = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                ownedCompany: true,
                company: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role === 'OWNER' && user.ownedCompany) {
            req.companyId = user.ownedCompany.id;
        } else if (user.role === 'COMPANY_ADMIN' && user.companyId) {
            req.companyId = user.companyId;
        } else {
            return res.status(403).json({ error: 'User not associated with any company' });
        }

        next();
    } catch (error) {
        console.error('Company scoping error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(scopeToCompany);

// Helper function to get date range based on period
const getDateRange = (period) => {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case 'current':
        case 'current_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'last_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        case 'current_quarter':
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
            break;
        case 'current_year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return { startDate, endDate };
};

// GET /api/owner/billing/invoices - Get company invoices
router.get('/invoices', async (req, res) => {
    try {
        const { period = 'current' } = req.query;
        const { startDate, endDate } = getDateRange(period);

        // Mock invoice data - in real implementation, fetch from database
        const mockInvoices = [
            {
                id: 'INV-001',
                invoiceNumber: 'TXI-2025-001',
                amount: 2500.00,
                currency: 'USD',
                status: 'PAID',
                dueDate: new Date('2025-01-15'),
                paidDate: new Date('2025-01-10'),
                description: 'Monthly subscription fee',
                items: [
                    { description: 'Basic Plan Subscription', quantity: 1, unitPrice: 2000.00, total: 2000.00 },
                    { description: 'Additional Vehicle License', quantity: 5, unitPrice: 100.00, total: 500.00 }
                ],
                createdAt: new Date('2025-01-01')
            },
            {
                id: 'INV-002',
                invoiceNumber: 'TXI-2025-002',
                amount: 2500.00,
                currency: 'USD',
                status: 'PENDING',
                dueDate: new Date('2025-02-15'),
                description: 'Monthly subscription fee',
                items: [
                    { description: 'Basic Plan Subscription', quantity: 1, unitPrice: 2000.00, total: 2000.00 },
                    { description: 'Additional Vehicle License', quantity: 5, unitPrice: 100.00, total: 500.00 }
                ],
                createdAt: new Date('2025-02-01')
            }
        ];

        res.json({ data: mockInvoices });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// GET /api/owner/billing/payouts - Get driver payouts
router.get('/payouts', async (req, res) => {
    try {
        const { period = 'current' } = req.query;
        const { startDate, endDate } = getDateRange(period);

        // Mock payout data - in real implementation, fetch from database
        const mockPayouts = [
            {
                id: 'PAY-001',
                driverId: 'driver-1',
                driverName: 'John Smith',
                amount: 1250.00,
                currency: 'USD',
                status: 'COMPLETED',
                paymentMethod: 'BANK_TRANSFER',
                processedDate: new Date('2025-01-15'),
                rides: 45,
                totalRideValue: 2500.00,
                commission: 1250.00,
                createdAt: new Date('2025-01-10')
            },
            {
                id: 'PAY-002',
                driverId: 'driver-2',
                driverName: 'Maria Garcia',
                amount: 980.00,
                currency: 'USD',
                status: 'PENDING',
                paymentMethod: 'BANK_TRANSFER',
                rides: 32,
                totalRideValue: 1960.00,
                commission: 980.00,
                createdAt: new Date('2025-02-01')
            },
            {
                id: 'PAY-003',
                driverId: 'driver-3',
                driverName: 'David Wilson',
                amount: 1100.00,
                currency: 'USD',
                status: 'COMPLETED',
                paymentMethod: 'DIGITAL_WALLET',
                processedDate: new Date('2025-01-20'),
                rides: 38,
                totalRideValue: 2200.00,
                commission: 1100.00,
                createdAt: new Date('2025-01-15')
            }
        ];

        res.json({ data: mockPayouts });
    } catch (error) {
        console.error('Get payouts error:', error);
        res.status(500).json({ error: 'Failed to fetch payouts' });
    }
});

// GET /api/owner/billing/stats - Get billing statistics
router.get('/stats', async (req, res) => {
    try {
        const { period = 'current' } = req.query;

        // Mock statistics - in real implementation, calculate from database
        const mockStats = {
            totalEarnings: 12500.00,
            pendingPayouts: 3,
            completedPayouts: 15,
            totalInvoices: 6,
            currentBalance: 8750.00,
            nextPayoutDate: new Date('2025-02-15'),
            subscriptionStatus: 'ACTIVE',
            monthlyRevenue: 4200.00,
            rideCommission: 2100.00
        };

        res.json(mockStats);
    } catch (error) {
        console.error('Get billing stats error:', error);
        res.status(500).json({ error: 'Failed to fetch billing statistics' });
    }
});

// GET /api/owner/billing/reports - Get financial reports
router.get('/reports', async (req, res) => {
    try {
        const { period = 'current', type = 'summary' } = req.query;
        const { startDate, endDate } = getDateRange(period);

        // Mock report data
        const mockReportData = {
            period: period,
            startDate,
            endDate,
            summary: {
                totalRides: 245,
                totalRevenue: 12500.00,
                averageRideValue: 51.02,
                commission: 6250.00,
                driverPayouts: 6250.00,
                platformFees: 750.00,
                netIncome: 5500.00
            },
            breakdown: {
                daily: Array.from({ length: 30 }, (_, i) => ({
                    date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
                    rides: Math.floor(Math.random() * 20) + 5,
                    revenue: Math.floor(Math.random() * 1000) + 200,
                    commission: Math.floor(Math.random() * 500) + 100
                }))
            },
            topDrivers: [
                { id: 'driver-1', name: 'John Smith', rides: 45, revenue: 2250.00, commission: 1125.00 },
                { id: 'driver-2', name: 'Maria Garcia', rides: 38, revenue: 1900.00, commission: 950.00 },
                { id: 'driver-3', name: 'David Wilson', rides: 32, revenue: 1600.00, commission: 800.00 }
            ]
        };

        res.json(mockReportData);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// POST /api/owner/billing/request-payout - Request driver payout
router.post('/request-payout', async (req, res) => {
    try {
        const { driverId, amount, paymentMethod = 'BANK_TRANSFER' } = req.body;

        if (!driverId || !amount) {
            return res.status(400).json({ error: 'Driver ID and amount are required' });
        }

        // Mock payout request creation
        const mockPayout = {
            id: `PAY-${Date.now()}`,
            driverId,
            amount: parseFloat(amount),
            currency: 'USD',
            status: 'PENDING',
            paymentMethod,
            requestedDate: new Date(),
            estimatedProcessingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
            companyId: req.companyId
        };

        res.status(201).json({
            message: 'Payout request created successfully',
            data: mockPayout
        });
    } catch (error) {
        console.error('Request payout error:', error);
        res.status(500).json({ error: 'Failed to create payout request' });
    }
});

// GET /api/owner/billing/subscription - Get current subscription details
router.get('/subscription', async (req, res) => {
    try {
        // Fetch company subscription details
        const company = await prisma.company.findUnique({
            where: { id: req.companyId },
            include: {
                subscriptionPlan: true
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const mockSubscription = {
            planName: company.subscriptionPlan?.name || 'Basic Plan',
            planType: company.subscriptionPlan?.billingCycle || 'monthly',
            price: company.subscriptionPlan?.price || 2000.00,
            currency: 'USD',
            status: 'ACTIVE',
            currentPeriodStart: new Date('2025-01-01'),
            currentPeriodEnd: new Date('2025-01-31'),
            nextBillingDate: new Date('2025-02-01'),
            vehicleLimit: company.subscriptionPlan?.vehicleLimit || 10,
            driverLimit: company.subscriptionPlan?.driverLimit || 20,
            rideCommission: company.subscriptionPlan?.rideCommission || 5.0,
            features: company.subscriptionPlan?.features || [
                'Fleet Management',
                'Driver Management',
                'Real-time Tracking',
                'Basic Analytics',
                'Customer Support'
            ]
        };

        res.json(mockSubscription);
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription details' });
    }
});

module.exports = router;