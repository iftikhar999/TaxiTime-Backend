const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/mobile/driver/earnings/summary
router.get('/summary', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const { period = 'today' } = req.query;
    const earningsService = req.earningsService;

    console.log(`📊 Fetching earnings summary for driver ${driverId}, period: ${period}`);

    if (!driverId) {
        return res.status(401).json({ success: false, message: 'Driver authentication required' });
    }

    if (!earningsService) {
        return res.status(500).json({ success: false, message: 'Earnings service not available' });
    }

    try {
        const summary = await earningsService.getSummary(driverId, period);
        res.json({ success: true, data: summary });
    } catch (error) {
        console.error('❌ [EARNINGS] Failed to get summary:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get earnings summary' });
    }
});

// GET /api/mobile/driver/earnings/history
router.get('/history', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const { page = 1, limit = 20, startDate = null, endDate = null, paymentMethod = null, includeAdjustments = 'true' } = req.query;
    const earningsService = req.earningsService;

    if (!driverId) {
        return res.status(401).json({ success: false, message: 'Driver authentication required' });
    }

    if (!earningsService) {
        return res.status(500).json({ success: false, message: 'Earnings service not available' });
    }

    try {
        const result = await earningsService.getHistory(driverId, {
            page: Number.parseInt(page, 10),
            limit: Number.parseInt(limit, 10),
            startDate,
            endDate,
            paymentMethod,
            includeAdjustments: includeAdjustments === 'true',
        });
        res.json({ success: true, data: result.earnings, pagination: result.pagination });
    } catch (error) {
        console.error('❌ [EARNINGS] Failed to get history:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get earnings history' });
    }
});

// GET /api/mobile/driver/earnings/adjustments
router.get('/adjustments', authenticateToken, async (req, res) => {
    const driverId = req.user?.id;
    const { page = 1, limit = 20 } = req.query;
    const earningsService = req.earningsService;

    if (!driverId) {
        return res.status(401).json({ success: false, message: 'Driver authentication required' });
    }

    if (!earningsService) {
        return res.status(500).json({ success: false, message: 'Earnings service not available' });
    }

    try {
        const result = await earningsService.getAdjustments(driverId, {
            page: Number.parseInt(page, 10),
            limit: Number.parseInt(limit, 10),
        });
        res.json({ success: true, data: result.earnings, pagination: result.pagination });
    } catch (error) {
        console.error('❌ [EARNINGS] Failed to get adjustments:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get adjustments' });
    }
});

// GET /api/mobile/driver/earnings/fleet - owner/dispatcher only
router.get('/fleet', authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const { period = 'today' } = req.query;
    const earningsService = req.earningsService;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!earningsService) {
        return res.status(500).json({ success: false, message: 'Earnings service not available' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { companyId: true, role: true },
        });

        if (!user || !user.companyId) {
            return res.status(403).json({ success: false, message: 'No company associated with user' });
        }

        if (user.role !== 'OWNER' && user.role !== 'DISPATCHER') {
            return res.status(403).json({ success: false, message: 'Access denied. Owner or dispatcher role required.' });
        }

        const fleetEarnings = await earningsService.getFleetEarnings(user.companyId, period);
        res.json({ success: true, data: fleetEarnings });
    } catch (error) {
        console.error('❌ [EARNINGS] Failed to get fleet earnings:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get fleet earnings' });
    }
});

module.exports = router;
