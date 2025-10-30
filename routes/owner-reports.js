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
const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    return { startDate: start, endDate: end };
};

// GET /api/owner/reports/ride-performance - Get ride performance analytics
router.get('/ride-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        // Mock ride performance data - in real implementation, query database
        const mockRideData = {
            totalRides: 245,
            completedRides: 220,
            cancelledRides: 20,
            noShowRides: 5,
            avgDuration: 28.5, // minutes
            avgDistance: 12.3, // km
            avgRating: 4.6,
            completionRate: 89.8, // percentage
            peakHours: [
                { hour: '08:00', rides: 18 },
                { hour: '09:00', rides: 25 },
                { hour: '17:00', rides: 32 },
                { hour: '18:00', rides: 28 },
                { hour: '19:00', rides: 22 }
            ],
            dailyBreakdown: Array.from({ length: 30 }, (_, i) => ({
                date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
                totalRides: Math.floor(Math.random() * 15) + 5,
                completedRides: Math.floor(Math.random() * 12) + 8,
                cancelledRides: Math.floor(Math.random() * 3),
                avgDuration: Math.floor(Math.random() * 20) + 20,
                avgDistance: Math.floor(Math.random() * 10) + 8
            }))
        };

        res.json({ data: mockRideData });
    } catch (error) {
        console.error('Get ride performance error:', error);
        res.status(500).json({ error: 'Failed to fetch ride performance data' });
    }
});

// GET /api/owner/reports/earnings - Get earnings report
router.get('/earnings', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        // Mock earnings data
        const mockEarningsData = {
            totalEarnings: 12450.75,
            totalRides: 245,
            averageRideValue: 50.82,
            commission: 6225.38,
            driverPayouts: 6225.37,
            netRevenue: 5896.12,
            taxes: 1554.63,
            platformFees: 622.54,
            breakdown: {
                rideRevenue: 12450.75,
                subscriptionFees: 2000.00,
                additionalServices: 350.00,
                totalGross: 14800.75
            },
            monthlyTrend: Array.from({ length: 12 }, (_, i) => ({
                month: new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'short' }),
                earnings: Math.floor(Math.random() * 5000) + 8000,
                rides: Math.floor(Math.random() * 100) + 150,
                commission: Math.floor(Math.random() * 2500) + 4000
            })),
            topEarningDrivers: [
                { id: 'driver-1', name: 'John Smith', earnings: 1845.50, rides: 45, avgRide: 41.01 },
                { id: 'driver-2', name: 'Maria Garcia', earnings: 1623.75, rides: 38, avgRide: 42.73 },
                { id: 'driver-3', name: 'David Wilson', earnings: 1456.20, rides: 32, avgRide: 45.51 }
            ]
        };

        res.json({ data: mockEarningsData });
    } catch (error) {
        console.error('Get earnings report error:', error);
        res.status(500).json({ error: 'Failed to fetch earnings report' });
    }
});

// GET /api/owner/reports/cancellations - Get cancellation analysis
router.get('/cancellations', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        // Mock cancellation data
        const mockCancellationData = {
            totalCancellations: 25,
            driverCancellations: 8,
            passengerCancellations: 15,
            systemCancellations: 2,
            cancellationRate: 10.2, // percentage
            avgCancellationTime: 3.5, // minutes after booking
            reasons: [
                { reason: 'Driver not available', count: 5, percentage: 20 },
                { reason: 'Passenger no-show', count: 8, percentage: 32 },
                { reason: 'Wrong pickup location', count: 4, percentage: 16 },
                { reason: 'Traffic/Route issues', count: 3, percentage: 12 },
                { reason: 'Vehicle breakdown', count: 2, percentage: 8 },
                { reason: 'Other', count: 3, percentage: 12 }
            ],
            timePatterns: [
                { hour: '06:00', cancellations: 1 },
                { hour: '07:00', cancellations: 2 },
                { hour: '08:00', cancellations: 4 },
                { hour: '09:00', cancellations: 3 },
                { hour: '10:00', cancellations: 1 },
                { hour: '17:00', cancellations: 3 },
                { hour: '18:00', cancellations: 5 },
                { hour: '19:00', cancellations: 4 },
                { hour: '20:00', cancellations: 2 }
            ],
            dailyTrend: Array.from({ length: 30 }, (_, i) => ({
                date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
                totalRides: Math.floor(Math.random() * 15) + 5,
                cancellations: Math.floor(Math.random() * 3),
                driverCancellations: Math.floor(Math.random() * 2),
                passengerCancellations: Math.floor(Math.random() * 2)
            }))
        };

        res.json({ data: mockCancellationData });
    } catch (error) {
        console.error('Get cancellation report error:', error);
        res.status(500).json({ error: 'Failed to fetch cancellation report' });
    }
});

// GET /api/owner/reports/driver-performance - Get driver performance metrics
router.get('/driver-performance', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        // Mock driver performance data
        const mockDriverData = {
            totalDrivers: 15,
            activeDrivers: 12,
            avgRating: 4.6,
            avgRidesPerDriver: 16.3,
            avgEarningsPerDriver: 830.05,
            topPerformers: [
                {
                    id: 'driver-1',
                    name: 'John Smith',
                    rides: 45,
                    earnings: 1845.50,
                    rating: 4.8,
                    completionRate: 96.2,
                    avgResponseTime: 3.2,
                    vehicleType: 'SEDAN'
                },
                {
                    id: 'driver-2',
                    name: 'Maria Garcia',
                    rides: 38,
                    earnings: 1623.75,
                    rating: 4.7,
                    completionRate: 94.1,
                    avgResponseTime: 2.8,
                    vehicleType: 'SUV'
                },
                {
                    id: 'driver-3',
                    name: 'David Wilson',
                    rides: 32,
                    earnings: 1456.20,
                    rating: 4.9,
                    completionRate: 98.5,
                    avgResponseTime: 2.5,
                    vehicleType: 'HATCHBACK'
                }
            ],
            metrics: {
                avgCompletionRate: 93.8,
                avgResponseTime: 3.1,
                totalHoursOnline: 1840,
                totalDistance: 2845.6,
                fuelEfficiency: 12.8
            }
        };

        res.json({ data: mockDriverData });
    } catch (error) {
        console.error('Get driver performance error:', error);
        res.status(500).json({ error: 'Failed to fetch driver performance data' });
    }
});

// GET /api/owner/reports/fleet-utilization - Get fleet utilization report
router.get('/fleet-utilization', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { startDate: start, endDate: end } = getDateRange(startDate, endDate);

        // Mock fleet utilization data
        const mockFleetData = {
            totalVehicles: 18,
            activeVehicles: 15,
            utilizationRate: 83.3, // percentage
            avgTripsPerVehicle: 13.6,
            avgRevenuePerVehicle: 691.15,
            maintenanceCosts: 1850.00,
            fuelCosts: 3200.00,
            vehicleBreakdown: [
                { type: 'SEDAN', count: 8, utilization: 89.2, avgRevenue: 754.20 },
                { type: 'SUV', count: 5, utilization: 76.8, avgRevenue: 892.40 },
                { type: 'HATCHBACK', count: 3, utilization: 91.5, avgRevenue: 623.80 },
                { type: 'VAN', count: 2, utilization: 68.3, avgRevenue: 543.20 }
            ],
            dailyUtilization: Array.from({ length: 30 }, (_, i) => ({
                date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
                activeVehicles: Math.floor(Math.random() * 5) + 12,
                totalTrips: Math.floor(Math.random() * 50) + 100,
                revenue: Math.floor(Math.random() * 2000) + 8000,
                utilizationRate: Math.floor(Math.random() * 20) + 70
            }))
        };

        res.json({ data: mockFleetData });
    } catch (error) {
        console.error('Get fleet utilization error:', error);
        res.status(500).json({ error: 'Failed to fetch fleet utilization data' });
    }
});

// GET /api/owner/reports/financial-summary - Get comprehensive financial summary
router.get('/financial-summary', async (req, res) => {
    try {
        const { period = 'current_month' } = req.query;

        // Mock financial summary
        const mockFinancialSummary = {
            period,
            revenue: {
                gross: 14800.75,
                net: 5896.12,
                rides: 12450.75,
                subscriptions: 2000.00,
                additionalServices: 350.00
            },
            expenses: {
                driverPayouts: 6225.37,
                platformFees: 622.54,
                taxes: 1554.63,
                maintenance: 1850.00,
                fuel: 3200.00,
                insurance: 450.00,
                other: 275.50
            },
            profitability: {
                grossProfit: 8904.63,
                netProfit: 5896.12,
                profitMargin: 39.9,
                roiPercentage: 24.6
            },
            kpis: {
                revenuePerRide: 50.82,
                costPerRide: 35.67,
                profitPerRide: 15.15,
                rideVolume: 245,
                avgCustomerValue: 60.45
            },
            trends: {
                revenueGrowth: 12.5,
                rideGrowth: 8.3,
                profitGrowth: 15.2,
                customerGrowth: 6.8
            }
        };

        res.json({ data: mockFinancialSummary });
    } catch (error) {
        console.error('Get financial summary error:', error);
        res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
});

module.exports = router;