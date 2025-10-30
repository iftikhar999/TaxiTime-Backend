const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get earnings summary
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { period = 'week' } = req.query;

        console.log(`📊 Fetching earnings summary for driver ${driverId}, period: ${period}`);

        // For now, return mock data since the full schema might not be implemented
        // TODO: Replace with actual database queries when ride/payment tables are ready
        const mockEarnings = {
            period,
            summary: {
                totalEarnings: 0,
                totalRides: 0,
                totalDistance: 0,
                totalDuration: 0,
                totalTips: 0,
                totalBonuses: 0,
                averageRating: 0,
                efficiency: {
                    earningsPerHour: 0,
                    earningsPerRide: 0,
                    earningsPerKm: 0
                }
            },
            breakdown: {
                cashRides: 0,
                cardRides: 0,
                commission: 0,
                taxes: 0
            },
            daily: [],
            message: "Earnings tracking will be available once ride management is fully implemented"
        };

        res.json({
            success: true,
            data: mockEarnings
        });

    } catch (error) {
        console.error('❌ Earnings summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to fetch earnings summary',
            error: error.message
        });
    }
});

// Get daily earnings breakdown
router.get('/daily', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { days = 30 } = req.query;

        const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        // Get daily earnings using raw SQL for better performance
        const dailyEarnings = await prisma.$queryRaw`
      SELECT 
        DATE(r.completedAt) as date,
        COUNT(r.id) as totalRides,
        COALESCE(SUM(p.driverEarnings), 0) as earnings,
        COALESCE(SUM(p.tips), 0) as tips,
        COALESCE(SUM(p.bonuses), 0) as bonuses,
        COALESCE(SUM(r.distance), 0) as totalDistance,
        COALESCE(AVG(p.driverEarnings), 0) as avgEarningsPerRide
      FROM "Ride" r
      LEFT JOIN "Payment" p ON r.id = p.rideId
      WHERE r.driverId = ${driverId}
        AND r.status = 'COMPLETED'
        AND r.completedAt >= ${daysAgo}
      GROUP BY DATE(r.completedAt)
      ORDER BY date DESC
    `;

        // Format the results
        const formattedData = dailyEarnings.map(day => ({
            date: day.date,
            totalRides: parseInt(day.totalRides),
            earnings: Math.round(parseFloat(day.earnings) * 100) / 100,
            tips: Math.round(parseFloat(day.tips) * 100) / 100,
            bonuses: Math.round(parseFloat(day.bonuses) * 100) / 100,
            totalDistance: Math.round(parseFloat(day.totalDistance) * 100) / 100,
            avgEarningsPerRide: Math.round(parseFloat(day.avgEarningsPerRide) * 100) / 100,
            totalEarnings: Math.round((parseFloat(day.earnings) + parseFloat(day.tips) + parseFloat(day.bonuses)) * 100) / 100
        }));

        res.json({
            success: true,
            data: formattedData,
            period: `Last ${days} days`
        });

    } catch (error) {
        console.error('Error fetching daily earnings:', error);
        res.status(500).json({
            error: 'Failed to fetch daily earnings',
            details: error.message
        });
    }
});

// Get earnings by ride type or category
router.get('/breakdown', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { period = 'month' } = req.query;

        let dateFilter = {};
        const now = new Date();

        switch (period) {
            case 'week':
                dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
                break;
            case 'month':
                dateFilter = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
                break;
            case 'year':
                dateFilter = { gte: new Date(now.getFullYear(), 0, 1) };
                break;
        }

        // Get earnings breakdown by service type
        const rideBreakdown = await prisma.$queryRaw`
      SELECT 
        r.serviceType,
        COUNT(r.id) as rideCount,
        COALESCE(SUM(p.driverEarnings), 0) as totalEarnings,
        COALESCE(SUM(p.tips), 0) as totalTips,
        COALESCE(AVG(p.driverEarnings), 0) as avgEarnings,
        COALESCE(SUM(r.distance), 0) as totalDistance
      FROM "Ride" r
      LEFT JOIN "Payment" p ON r.id = p.rideId
      WHERE r.driverId = ${driverId}
        AND r.status = 'COMPLETED'
        AND r.completedAt >= ${dateFilter.gte}
      GROUP BY r.serviceType
      ORDER BY totalEarnings DESC
    `;

        // Get earnings breakdown by payment method
        const paymentBreakdown = await prisma.$queryRaw`
      SELECT 
        p.method as paymentMethod,
        COUNT(r.id) as rideCount,
        COALESCE(SUM(p.driverEarnings), 0) as totalEarnings,
        COALESCE(SUM(p.tips), 0) as totalTips
      FROM "Ride" r
      LEFT JOIN "Payment" p ON r.id = p.rideId
      WHERE r.driverId = ${driverId}
        AND r.status = 'COMPLETED'
        AND r.completedAt >= ${dateFilter.gte}
      GROUP BY p.method
      ORDER BY totalEarnings DESC
    `;

        // Get hourly breakdown
        const hourlyBreakdown = await prisma.$queryRaw`
      SELECT 
        EXTRACT(HOUR FROM r.completedAt) as hour,
        COUNT(r.id) as rideCount,
        COALESCE(SUM(p.driverEarnings), 0) as totalEarnings,
        COALESCE(AVG(p.driverEarnings), 0) as avgEarnings
      FROM "Ride" r
      LEFT JOIN "Payment" p ON r.id = p.rideId
      WHERE r.driverId = ${driverId}
        AND r.status = 'COMPLETED'
        AND r.completedAt >= ${dateFilter.gte}
      GROUP BY EXTRACT(HOUR FROM r.completedAt)
      ORDER BY hour
    `;

        res.json({
            success: true,
            data: {
                byServiceType: rideBreakdown.map(item => ({
                    serviceType: item.serviceType,
                    rideCount: parseInt(item.rideCount),
                    totalEarnings: Math.round(parseFloat(item.totalEarnings) * 100) / 100,
                    totalTips: Math.round(parseFloat(item.totalTips) * 100) / 100,
                    avgEarnings: Math.round(parseFloat(item.avgEarnings) * 100) / 100,
                    totalDistance: Math.round(parseFloat(item.totalDistance) * 100) / 100
                })),
                byPaymentMethod: paymentBreakdown.map(item => ({
                    paymentMethod: item.paymentMethod,
                    rideCount: parseInt(item.rideCount),
                    totalEarnings: Math.round(parseFloat(item.totalEarnings) * 100) / 100,
                    totalTips: Math.round(parseFloat(item.totalTips) * 100) / 100
                })),
                byHour: hourlyBreakdown.map(item => ({
                    hour: parseInt(item.hour),
                    rideCount: parseInt(item.rideCount),
                    totalEarnings: Math.round(parseFloat(item.totalEarnings) * 100) / 100,
                    avgEarnings: Math.round(parseFloat(item.avgEarnings) * 100) / 100
                }))
            },
            period
        });

    } catch (error) {
        console.error('Error fetching earnings breakdown:', error);
        res.status(500).json({
            error: 'Failed to fetch earnings breakdown',
            details: error.message
        });
    }
});

// Get pending payments/payouts
router.get('/pending', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;

        // Get completed rides without payouts
        const pendingEarnings = await prisma.ride.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                payment: {
                    paidOut: false
                }
            },
            include: {
                payment: {
                    select: {
                        amount: true,
                        driverEarnings: true,
                        tips: true,
                        bonuses: true,
                        method: true,
                        paidOut: true,
                        paidOutAt: true
                    }
                }
            },
            orderBy: { completedAt: 'desc' }
        });

        const totalPending = pendingEarnings.reduce((total, ride) => {
            return total + (ride.payment?.driverEarnings || 0) + (ride.payment?.tips || 0) + (ride.payment?.bonuses || 0);
        }, 0);

        // Get payout history
        const payoutHistory = await prisma.driverPayout.findMany({
            where: { driverId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        res.json({
            success: true,
            data: {
                pendingEarnings: {
                    total: Math.round(totalPending * 100) / 100,
                    rides: pendingEarnings.map(ride => ({
                        rideId: ride.id,
                        completedAt: ride.completedAt,
                        earnings: ride.payment?.driverEarnings || 0,
                        tips: ride.payment?.tips || 0,
                        bonuses: ride.payment?.bonuses || 0,
                        total: (ride.payment?.driverEarnings || 0) + (ride.payment?.tips || 0) + (ride.payment?.bonuses || 0),
                        paymentMethod: ride.payment?.method
                    }))
                },
                payoutHistory: payoutHistory.map(payout => ({
                    id: payout.id,
                    amount: payout.amount,
                    method: payout.method,
                    status: payout.status,
                    createdAt: payout.createdAt,
                    processedAt: payout.processedAt
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching pending earnings:', error);
        res.status(500).json({
            error: 'Failed to fetch pending earnings',
            details: error.message
        });
    }
});

// Request payout
router.post('/payout/request', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { amount, method = 'BANK_TRANSFER', accountDetails } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        // Check if driver has sufficient pending earnings
        const pendingRides = await prisma.ride.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                payment: {
                    paidOut: false
                }
            },
            include: {
                payment: {
                    select: {
                        driverEarnings: true,
                        tips: true,
                        bonuses: true
                    }
                }
            }
        });

        const totalAvailable = pendingRides.reduce((total, ride) => {
            return total + (ride.payment?.driverEarnings || 0) + (ride.payment?.tips || 0) + (ride.payment?.bonuses || 0);
        }, 0);

        if (amount > totalAvailable) {
            return res.status(400).json({
                error: 'Requested amount exceeds available earnings',
                available: Math.round(totalAvailable * 100) / 100
            });
        }

        // Create payout request
        const payout = await prisma.driverPayout.create({
            data: {
                driverId,
                amount: parseFloat(amount),
                method,
                accountDetails: accountDetails || {},
                status: 'PENDING',
                requestedAt: new Date()
            }
        });

        // Mark payments as requested for payout (optional - for tracking)
        // This could be done later when payout is actually processed

        res.json({
            success: true,
            message: 'Payout request submitted successfully',
            payout: {
                id: payout.id,
                amount: payout.amount,
                method: payout.method,
                status: payout.status,
                requestedAt: payout.requestedAt
            }
        });

    } catch (error) {
        console.error('Error requesting payout:', error);
        res.status(500).json({
            error: 'Failed to request payout',
            details: error.message
        });
    }
});

// Get earnings analytics/insights
router.get('/analytics', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { period = 'month' } = req.query;

        let currentPeriodStart, previousPeriodStart, previousPeriodEnd;
        const now = new Date();

        switch (period) {
            case 'week':
                currentPeriodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                previousPeriodStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                previousPeriodEnd = currentPeriodStart;
                break;
            case 'month':
                currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                previousPeriodEnd = currentPeriodStart;
                break;
        }

        // Current period stats
        const currentStats = await prisma.ride.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                completedAt: { gte: currentPeriodStart }
            },
            include: {
                payment: {
                    select: {
                        driverEarnings: true,
                        tips: true
                    }
                }
            }
        });

        // Previous period stats for comparison
        const previousStats = await prisma.ride.findMany({
            where: {
                driverId,
                status: 'COMPLETED',
                completedAt: {
                    gte: previousPeriodStart,
                    lt: previousPeriodEnd
                }
            },
            include: {
                payment: {
                    select: {
                        driverEarnings: true,
                        tips: true
                    }
                }
            }
        });

        // Calculate metrics
        const calculateMetrics = (rides) => {
            const totalRides = rides.length;
            const totalEarnings = rides.reduce((sum, ride) =>
                sum + (ride.payment?.driverEarnings || 0), 0);
            const totalTips = rides.reduce((sum, ride) =>
                sum + (ride.payment?.tips || 0), 0);

            return {
                totalRides,
                totalEarnings: Math.round(totalEarnings * 100) / 100,
                totalTips: Math.round(totalTips * 100) / 100,
                avgEarningsPerRide: totalRides > 0 ?
                    Math.round((totalEarnings / totalRides) * 100) / 100 : 0
            };
        };

        const current = calculateMetrics(currentStats);
        const previous = calculateMetrics(previousStats);

        // Calculate percentage changes
        const calculateChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        const insights = {
            ridesChange: calculateChange(current.totalRides, previous.totalRides),
            earningsChange: calculateChange(current.totalEarnings, previous.totalEarnings),
            tipsChange: calculateChange(current.totalTips, previous.totalTips),
            avgEarningsChange: calculateChange(current.avgEarningsPerRide, previous.avgEarningsPerRide)
        };

        res.json({
            success: true,
            data: {
                current,
                previous,
                insights,
                period,
                recommendations: generateRecommendations(current, previous, insights)
            }
        });

    } catch (error) {
        console.error('Error fetching earnings analytics:', error);
        res.status(500).json({
            error: 'Failed to fetch earnings analytics',
            details: error.message
        });
    }
});

// Helper function to generate recommendations
function generateRecommendations(current, previous, insights) {
    const recommendations = [];

    if (insights.ridesChange < -10) {
        recommendations.push({
            type: 'increase_rides',
            message: 'Consider working during peak hours to increase ride volume',
            priority: 'high'
        });
    }

    if (insights.avgEarningsChange < -5) {
        recommendations.push({
            type: 'optimize_routes',
            message: 'Focus on longer distance rides to improve average earnings',
            priority: 'medium'
        });
    }

    if (current.totalTips < current.totalEarnings * 0.1) {
        recommendations.push({
            type: 'improve_service',
            message: 'Provide excellent service to increase tips and ratings',
            priority: 'medium'
        });
    }

    if (current.totalRides > previous.totalRides && insights.earningsChange < insights.ridesChange) {
        recommendations.push({
            type: 'target_premium',
            message: 'Consider targeting premium service areas for higher fares',
            priority: 'low'
        });
    }

    return recommendations;
}

module.exports = router;