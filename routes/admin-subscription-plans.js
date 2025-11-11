const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

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

// Get all subscription plans with pagination
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause
        const where = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (status === 'active') {
            where.isActive = true;
        } else if (status === 'inactive') {
            where.isActive = false;
        }

        const [plans, totalCount] = await Promise.all([
            prisma.subscription_plans.findMany({
                where,
                include: {
                    companies: {
                        include: {
                            _count: {
                                select: {
                                    vehicles: true,
                                    users_users_companyIdTocompanies: { where: { role: 'DRIVER' } },
                                    rides: true
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            companies: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                skip,
                take: parseInt(limit),
            }),
            prisma.subscription_plans.count({ where }),
        ]);

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        // Calculate additional stats for each plan
        const plansWithStats = plans.map(plan => ({
            ...plan,
            companies: plan.companies.map(company => ({
                ...company,
                vehicleCount: company._count.vehicles,
                driverCount: company._count.users_users_companyIdTocompanies,
                ridesCount: company._count.rides,
                totalPaid: 0 // This would be calculated from payment history
            }))
        }));

        res.json({
            plans: plansWithStats,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
            }
        });
    } catch (error) {
        console.error('Get subscription plans error:', error);
        res.status(500).json({ message: 'Failed to fetch subscription plans' });
    }
});

// Create new subscription plan
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            billingCycle,
            vehicleLimit,
            driverLimit,
            rideCommission,
            features,
            isActive,
            trialDays,
            setupFee
        } = req.body;

        // Validate required fields
        if (!name || !description || price === undefined || !billingCycle ||
            vehicleLimit === undefined || driverLimit === undefined ||
            rideCommission === undefined) {
            return res.status(400).json({
                message: 'Missing required fields: name, description, price, billingCycle, vehicleLimit, driverLimit, rideCommission'
            });
        }

        // Check if plan name already exists
        const existingPlan = await prisma.subscription_plans.findFirst({
            where: {
                name: {
                    equals: name,
                    mode: 'insensitive'
                }
            }
        });

        if (existingPlan) {
            return res.status(400).json({ message: 'Subscription plan with this name already exists' });
        }

        const plan = await prisma.subscription_plans.create({
            data: {
                name,
                description,
                price: parseFloat(price),
                billingCycle,
                vehicleLimit: parseInt(vehicleLimit),
                driverLimit: parseInt(driverLimit),
                rideCommission: parseFloat(rideCommission),
                features: features || [],
                isActive: isActive !== undefined ? isActive : true,
                trialDays: trialDays ? parseInt(trialDays) : 0,
                setupFee: setupFee ? parseFloat(setupFee) : 0
            }
        });

        res.status(201).json({
            message: 'Subscription plan created successfully',
            plan
        });
    } catch (error) {
        console.error('Create subscription plan error:', error);
        res.status(500).json({ message: 'Failed to create subscription plan' });
    }
});

// Update subscription plan
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            price,
            billingCycle,
            vehicleLimit,
            driverLimit,
            rideCommission,
            features,
            isActive,
            trialDays,
            setupFee
        } = req.body;

        // Check if plan exists
        const existingPlan = await prisma.subscription_plans.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existingPlan) {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }

        // Check if name is being changed and if it conflicts with another plan
        if (name && name !== existingPlan.name) {
            const nameConflict = await prisma.subscription_plans.findFirst({
                where: {
                    name: {
                        equals: name,
                        mode: 'insensitive'
                    },
                    id: {
                        not: parseInt(id)
                    }
                }
            });

            if (nameConflict) {
                return res.status(400).json({ message: 'Subscription plan with this name already exists' });
            }
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (billingCycle !== undefined) updateData.billingCycle = billingCycle;
        if (vehicleLimit !== undefined) updateData.vehicleLimit = parseInt(vehicleLimit);
        if (driverLimit !== undefined) updateData.driverLimit = parseInt(driverLimit);
        if (rideCommission !== undefined) updateData.rideCommission = parseFloat(rideCommission);
        if (features !== undefined) updateData.features = features;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (trialDays !== undefined) updateData.trialDays = parseInt(trialDays);
        if (setupFee !== undefined) updateData.setupFee = parseFloat(setupFee);

        const plan = await prisma.subscription_plans.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json({
            message: 'Subscription plan updated successfully',
            plan
        });
    } catch (error) {
        console.error('Update subscription plan error:', error);
        res.status(500).json({ message: 'Failed to update subscription plan' });
    }
});

// Update plan status
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (isActive === undefined) {
            return res.status(400).json({ message: 'isActive field is required' });
        }

        const plan = await prisma.subscription_plans.update({
            where: { id: parseInt(id) },
            data: { isActive }
        });

        res.json({
            message: `Subscription plan ${isActive ? 'activated' : 'deactivated'} successfully`,
            plan
        });
    } catch (error) {
        console.error('Update plan status error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }
        res.status(500).json({ message: 'Failed to update plan status' });
    }
});

// Delete subscription plan
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if plan has any active subscribers
        const planWithCompanies = await prisma.subscription_plans.findUnique({
            where: { id: parseInt(id) },
            include: {
                companies: {
                    where: {
                        status: 'active'
                    }
                }
            }
        });

        if (!planWithCompanies) {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }

        if (planWithCompanies.companies.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete subscription plan with active subscribers. Please move subscribers to another plan first.'
            });
        }

        await prisma.subscription_plans.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Subscription plan deleted successfully' });
    } catch (error) {
        console.error('Delete subscription plan error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }
        res.status(500).json({ message: 'Failed to delete subscription plan' });
    }
});

// Get plan subscribers
router.get('/:id/subscribers', async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await prisma.subscription_plans.findUnique({
            where: { id: parseInt(id) },
            include: {
                companies: {
                    include: {
                        _count: {
                            select: {
                                vehicles: true,
                                companyDrivers: true,
                                rides: true
                            }
                        }
                    }
                }
            }
        });

        if (!plan) {
            return res.status(404).json({ message: 'Subscription plan not found' });
        }

        const subscribers = plan.companies.map(company => ({
            ...company,
            vehicleCount: company._count.vehicles,
            driverCount: company._count.drivers,
            ridesCount: company._count.rides
        }));

        res.json({
            plan: {
                id: plan.id,
                name: plan.name,
                description: plan.description
            },
            subscribers
        });
    } catch (error) {
        console.error('Get plan subscribers error:', error);
        res.status(500).json({ message: 'Failed to fetch plan subscribers' });
    }
});

// Get subscription plan statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const totalPlans = await prisma.subscription_plans.count();
        const activePlans = await prisma.subscription_plans.count({
            where: { isActive: true }
        });

        const totalSubscriptions = await prisma.companies.count({
            where: {
                subscriptionPlanId: {
                    not: null
                }
            }
        });

        const activeSubscriptions = await prisma.companies.count({
            where: {
                subscriptionPlanId: {
                    not: null
                },
                status: 'active'
            }
        });

        // Calculate revenue (this would typically come from payment records)
        const plans = await prisma.subscription_plans.findMany({
            include: {
                companies: {
                    where: {
                        status: 'active'
                    }
                }
            }
        });

        let monthlyRevenue = 0;
        plans.forEach(plan => {
            plan.companies.forEach(company => {
                let planRevenue = plan.price;
                if (plan.billingCycle === 'quarterly') planRevenue = plan.price / 3;
                else if (plan.billingCycle === 'yearly') planRevenue = plan.price / 12;
                monthlyRevenue += planRevenue;
            });
        });

        res.json({
            totalPlans,
            activePlans,
            totalSubscriptions,
            activeSubscriptions,
            monthlyRevenue: Math.round(monthlyRevenue * 100) / 100
        });
    } catch (error) {
        console.error('Get subscription stats error:', error);
        res.status(500).json({ message: 'Failed to fetch subscription statistics' });
    }
});

module.exports = router;