const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const invoiceService = require('../services/invoiceService');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to verify admin token
const verifyAdminToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        if (decoded.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
        }
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// Apply admin verification to all routes
router.use(verifyAdminToken);

// Helper function to get date range based on period
const getDateRange = (period) => {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
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
        case 'last_quarter':
            const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
            const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
            const quarter = lastQuarter < 0 ? 3 : lastQuarter;
            startDate = new Date(year, quarter * 3, 1);
            endDate = new Date(year, (quarter + 1) * 3, 0);
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

// Helper function to calculate billing status
const calculateBillingStatus = (company, period) => {
    const now = new Date();
    const { endDate } = getDateRange(period);

    // Mock logic - in real implementation, check payment records
    if (company.lastPaymentDate && new Date(company.lastPaymentDate) >= endDate) {
        return 'paid';
    } else if (now > endDate) {
        return 'overdue';
    } else {
        return 'pending';
    }
};

// Helper function to calculate vehicle-based billing
const calculateBill = (company, period) => {
    if (!company.subscriptionPlan) return { totalAmount: 0, vehicleCost: 0, commissionAmount: 0 };

    const vehicleCount = company.vehicles?.length || 0;
    const plan = company.subscriptionPlan;

    // Base plan cost
    let baseCost = plan.price;

    // Adjust for billing cycle
    if (period.includes('quarter')) {
        baseCost *= 3;
    } else if (period.includes('year')) {
        baseCost *= 12;
    }

    // Vehicle-based cost (assuming per-vehicle pricing)
    const vehicleCost = vehicleCount * baseCost;

    // Commission calculation (mock - based on ride revenue)
    const commissionAmount = (company.totalRevenue || 0) * (plan.rideCommission / 100);

    // Setup fee (one-time, only for new companies)
    const setupFee = company.createdAt &&
        new Date(company.createdAt) >= getDateRange(period).startDate ?
        plan.setupFee : 0;

    const totalAmount = vehicleCost + commissionAmount + setupFee;

    return {
        baseCost,
        vehicleCost,
        commissionAmount,
        setupFee,
        totalAmount
    };
};

// Get company billing data
router.get('/companies', async (req, res) => {
    try {
        const { period = 'current_month' } = req.query;

        const companies = await prisma.company.findMany({
            where: {
                name: {
                    not: null
                }
            },
            include: {
                subscriptionPlan: true,
                vehicles: {
                    select: {
                        id: true,
                        licensePlate: true,
                        isActive: true
                    }
                },
                companyDrivers: {
                    select: {
                        id: true,
                        userId: true,
                        status: true
                    }
                },
                _count: {
                    select: {
                        vehicles: true,
                        companyDrivers: true,
                        rides: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        const companiesWithBilling = companies.map(company => {
            const billingStatus = calculateBillingStatus(company, period);
            const billing = calculateBill(company, period);

            return {
                ...company,
                name: company.name || 'Unknown Company',
                email: company.email || 'No Email',
                vehicleCount: company._count?.vehicles || 0,
                driverCount: company._count?.companyDrivers || 0,
                ridesCount: company._count?.rides || 0,
                billingStatus,
                ...billing,
                lastPaymentDate: company.lastPaymentDate || null,
                totalRevenue: 0 // This would come from ride/payment aggregation
            };
        });

        res.json(companiesWithBilling);
    } catch (error) {
        console.error('Get company billing error:', error);
        res.status(500).json({ message: 'Failed to fetch company billing data' });
    }
});

// Get billing statistics
router.get('/stats', async (req, res) => {
    try {
        const { period = 'current_month' } = req.query;

        const companies = await prisma.company.findMany({
            include: {
                subscriptionPlan: true,
                _count: {
                    select: {
                        vehicles: true
                    }
                }
            }
        });

        let totalRevenue = 0;
        let activeSubscriptions = 0;
        let pendingBills = 0;
        let overduePayments = 0;

        companies.forEach(company => {
            if (company.subscriptionPlan && company.status === 'active') {
                activeSubscriptions++;

                const billing = calculateBill(company, period);
                totalRevenue += billing.totalAmount;

                const billingStatus = calculateBillingStatus(company, period);
                if (billingStatus === 'pending') pendingBills++;
                if (billingStatus === 'overdue') overduePayments++;
            }
        });

        res.json({
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            activeSubscriptions,
            pendingBills,
            overduePayments
        });
    } catch (error) {
        console.error('Get billing stats error:', error);
        res.status(500).json({ message: 'Failed to fetch billing statistics' });
    }
});

// Get detailed bill for a company
router.get('/companies/:id/details', async (req, res) => {
    try {
        const { id } = req.params;
        const { period = 'current_month' } = req.query;

        const company = await prisma.company.findUnique({
            where: { id: id },
            include: {
                subscriptionPlan: true,
                vehicles: true,
                companyDrivers: true,
                _count: {
                    select: {
                        vehicles: true,
                        companyDrivers: true,
                        rides: true
                    }
                }
            }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        const billing = calculateBill(company, period);

        // Mock payment history - in real implementation, fetch from payment records
        const paymentHistory = [
            {
                date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                amount: billing.totalAmount,
                method: 'Credit Card',
                status: 'paid'
            },
            {
                date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
                amount: billing.totalAmount,
                method: 'Bank Transfer',
                status: 'paid'
            }
        ];

        const billDetails = {
            vehicleCount: company._count.vehicles,
            driverCount: company._count.companyDrivers,
            ridesCount: company._count.rides,
            totalRevenue: 0, // This would be calculated from actual ride data
            ...billing,
            paymentHistory
        };

        res.json(billDetails);
    } catch (error) {
        console.error('Get bill details error:', error);
        res.status(500).json({ message: 'Failed to fetch bill details' });
    }
});

// Generate invoice for a company
router.post('/companies/:id/invoice', async (req, res) => {
    try {
        const { id } = req.params;
        const { period = 'current_month' } = req.body;

        const company = await prisma.company.findUnique({
            where: { id: id },
            include: {
                subscriptionPlan: true
            }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // Calculate billing details
        const billing = calculateBill(company, period);
        const invoiceNumber = `INV-${company.id}-${Date.now()}`;

        // Generate real PDF invoice using invoice service
        const invoiceData = {
            invoiceNumber,
            companyId: company.id,
            companyName: company.legalName || company.name,
            companyEmail: company.email,
            companyPhone: company.phone,
            companyAddress: company.address,
            period,
            items: [
                {
                    description: 'Platform Commission',
                    quantity: billing.tripsCount,
                    unitPrice: billing.commissionPerTrip,
                    total: billing.commission
                },
                {
                    description: 'Monthly Subscription Fee',
                    quantity: 1,
                    unitPrice: billing.subscriptionFee,
                    total: billing.subscriptionFee
                }
            ],
            subtotal: billing.subtotal,
            tax: billing.tax,
            total: billing.total,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            notes: `Invoice for period: ${period}. Commission rate: ${(billing.commissionRate * 100).toFixed(1)}%`
        };

        // Process invoice generation (creates PDF and database record)
        const invoice = await invoiceService.processInvoice(invoiceData, {
            sendEmail: true,
            emailSubject: `Invoice ${invoiceNumber} - ${company.legalName || company.name}`
        });

        res.json({
            message: 'Invoice generated and sent successfully',
            invoice: {
                ...invoice,
                downloadUrl: `/api/admin/billing/invoices/${invoice.id}/download`
            }
        });
    } catch (error) {
        console.error('Generate invoice error:', error);
        res.status(500).json({ message: 'Failed to generate invoice' });
    }
});

// Send payment reminder
router.post('/companies/:id/reminder', async (req, res) => {
    try {
        const { id } = req.params;

        const company = await prisma.company.findUnique({
            where: { id: id }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // In a real implementation, you would:
        // 1. Send email reminder using a service like SendGrid or Nodemailer
        // 2. Log the reminder in database
        // 3. Update reminder count/date

        // Mock reminder sending
        console.log(`Sending payment reminder to ${company.email}`);

        res.json({
            message: 'Payment reminder sent successfully',
            sentTo: company.email,
            sentAt: new Date()
        });
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ message: 'Failed to send payment reminder' });
    }
});

// Suspend company
router.patch('/companies/:id/suspend', async (req, res) => {
    try {
        const { id } = req.params;

        const company = await prisma.company.update({
            where: { id: id },
            data: {
                status: 'suspended',
                suspendedAt: new Date(),
                suspendedBy: req.admin.id
            }
        });

        // In a real implementation, you would also:
        // 1. Disable company's API access
        // 2. Suspend all active rides
        // 3. Send suspension notification
        // 4. Log the suspension action

        res.json({
            message: 'Company suspended successfully',
            company: {
                id: company.id,
                name: company.name,
                status: company.status,
                suspendedAt: company.suspendedAt
            }
        });
    } catch (error) {
        console.error('Suspend company error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.status(500).json({ message: 'Failed to suspend company' });
    }
});

// Reactivate company
router.patch('/companies/:id/reactivate', async (req, res) => {
    try {
        const { id } = req.params;

        const company = await prisma.company.update({
            where: { id: id },
            data: {
                status: 'active',
                reactivatedAt: new Date(),
                reactivatedBy: req.admin.id,
                suspendedAt: null,
                suspendedBy: null
            }
        });

        res.json({
            message: 'Company reactivated successfully',
            company: {
                id: company.id,
                name: company.name,
                status: company.status,
                reactivatedAt: company.reactivatedAt
            }
        });
    } catch (error) {
        console.error('Reactivate company error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.status(500).json({ message: 'Failed to reactivate company' });
    }
});

// Update company subscription
router.put('/companies/:id/subscription', async (req, res) => {
    try {
        const { id } = req.params;
        const { subscriptionPlanId, effectiveDate } = req.body;

        if (!subscriptionPlanId) {
            return res.status(400).json({ message: 'subscriptionPlanId is required' });
        }

        // Verify the subscription plan exists
        const plan = await prisma.subscriptionPlan.findUnique({
            where: { id: parseInt(subscriptionPlanId) },
            select: { id: true, name: true, isActive: true }
        });

        if (!plan) {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }

        if (!plan.isActive) {
            return res.status(400).json({ message: 'Cannot assign inactive subscription plan' });
        }

        const company = await prisma.company.update({
            where: { id: id },
            data: {
                subscriptionPlanId: parseInt(subscriptionPlanId),
                subscriptionUpdatedAt: new Date(),
                subscriptionUpdatedBy: req.admin.id
            },
            include: {
                subscriptionPlan: true
            }
        });

        res.json({
            message: 'Company subscription updated successfully',
            company: {
                id: company.id,
                name: company.name,
                subscriptionPlan: company.subscriptionPlan,
                subscriptionUpdatedAt: company.subscriptionUpdatedAt
            }
        });
    } catch (error) {
        console.error('Update company subscription error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Company not found' });
        }
        res.status(500).json({ message: 'Failed to update company subscription' });
    }
});

// Get payment history for a company
router.get('/companies/:id/payments', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10 } = req.query;

        // In a real implementation, fetch from actual payment records table
        // For now, return mock data
        const mockPayments = [
            {
                id: 1,
                amount: 299.99,
                date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                method: 'Credit Card',
                status: 'paid',
                invoiceNumber: 'INV-001',
                transactionId: 'txn_1234567890'
            },
            {
                id: 2,
                amount: 299.99,
                date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
                method: 'Bank Transfer',
                status: 'paid',
                invoiceNumber: 'INV-002',
                transactionId: 'txn_0987654321'
            }
        ];

        res.json(mockPayments.slice(0, parseInt(limit)));
    } catch (error) {
        console.error('Get payment history error:', error);
        res.status(500).json({ message: 'Failed to fetch payment history' });
    }
});

// Process manual payment
router.post('/companies/:id/manual-payment', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, method, notes, paymentDate } = req.body;

        if (!amount || !method) {
            return res.status(400).json({ message: 'Amount and payment method are required' });
        }

        const company = await prisma.company.findUnique({
            where: { id: id },
            select: { id: true, name: true, email: true }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // In a real implementation, you would:
        // 1. Create payment record in database
        // 2. Update company's payment status
        // 3. Generate receipt
        // 4. Send confirmation email

        const payment = {
            id: Date.now(),
            companyId: id,
            amount: parseFloat(amount),
            method,
            notes: notes || '',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            processedBy: req.admin.id,
            status: 'paid',
            type: 'manual'
        };

        res.json({
            message: 'Manual payment processed successfully',
            payment
        });
    } catch (error) {
        console.error('Process manual payment error:', error);
        res.status(500).json({ message: 'Failed to process manual payment' });
    }
});

// Get billing reports
router.get('/reports', async (req, res) => {
    try {
        const {
            period = 'current_month',
            planId,
            companyId,
            status
        } = req.query;

        const { startDate, endDate } = getDateRange(period);

        // Build where clause based on filters
        const whereClause = {};
        if (planId) whereClause.subscriptionPlanId = parseInt(planId);
        if (companyId) whereClause.id = parseInt(companyId);
        if (status) whereClause.status = status;

        const companies = await prisma.company.findMany({
            where: whereClause,
            include: {
                subscriptionPlan: true,
                _count: {
                    select: {
                        vehicles: true,
                        companyDrivers: true,
                        rides: true
                    }
                }
            }
        });

        const reportData = companies.map(company => {
            const billing = calculateBill(company, period);
            const billingStatus = calculateBillingStatus(company, period);

            return {
                companyId: company.id,
                companyName: company.name,
                planName: company.subscriptionPlan?.name || 'No Plan',
                vehicleCount: company._count.vehicles,
                driverCount: company._count.companyDrivers,
                ridesCount: company._count.rides,
                billingStatus,
                ...billing,
                period: `${startDate.toDateString()} - ${endDate.toDateString()}`
            };
        });

        // Calculate summary
        const summary = {
            totalCompanies: reportData.length,
            totalRevenue: reportData.reduce((sum, item) => sum + item.totalAmount, 0),
            totalVehicles: reportData.reduce((sum, item) => sum + item.vehicleCount, 0),
            totalDrivers: reportData.reduce((sum, item) => sum + item.driverCount, 0),
            paidBills: reportData.filter(item => item.billingStatus === 'paid').length,
            pendingBills: reportData.filter(item => item.billingStatus === 'pending').length,
            overdueBills: reportData.filter(item => item.billingStatus === 'overdue').length
        };

        res.json({
            period,
            dateRange: { startDate, endDate },
            summary,
            data: reportData
        });
    } catch (error) {
        console.error('Get billing reports error:', error);
        res.status(500).json({ message: 'Failed to generate billing reports' });
    }
});

// Download invoice PDF
router.get('/invoices/:invoiceId/download', async (req, res) => {
    try {
        const { invoiceId } = req.params;

        // Get invoice from database
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                company: {
                    select: {
                        legalName: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Check if PDF file exists
        const fs = require('fs');
        if (!fs.existsSync(invoice.filePath)) {
            return res.status(404).json({ message: 'Invoice PDF not found' });
        }

        // Set appropriate headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);

        // Stream the PDF file
        const fileStream = fs.createReadStream(invoice.filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Error downloading invoice:', error);
        res.status(500).json({ message: 'Failed to download invoice' });
    }
});

module.exports = router;