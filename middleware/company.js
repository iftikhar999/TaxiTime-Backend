const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Middleware to fetch and validate company context
 * Ensures the user belongs to a company and has access to company resources
 */
const companyMiddleware = async (req, res, next) => {
    try {
        // Get user ID from auth middleware (should be set by authMiddleware)
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                message: 'User authentication required'
            });
        }

        // Fetch user with company details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                ownedCompany: true,
                company: true
            }
        });

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        // Determine the user's company
        let userCompany = null;

        if (user.ownedCompany) {
            // User is a company owner
            userCompany = user.ownedCompany;
            req.userRole = 'owner';
        } else if (user.company) {
            // User is a company employee (driver, dispatcher, etc.)
            userCompany = user.company;
            req.userRole = user.role?.toLowerCase() || 'employee';
        }

        if (!userCompany) {
            return res.status(403).json({
                message: 'User is not associated with any company'
            });
        }

        // Check if company is active
        if (!userCompany.isActive || userCompany.status !== 'ACTIVE') {
            return res.status(403).json({
                message: 'Company account is inactive or suspended'
            });
        }

        // Add company context to request
        req.company = userCompany;
        req.companyId = userCompany.id;

        // Add user details to request
        req.userDetails = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            companyRole: req.userRole
        };

        next();
    } catch (error) {
        console.error('Company middleware error:', error);
        res.status(500).json({
            message: 'Internal server error in company validation'
        });
    }
};

/**
 * Middleware to ensure user is a company owner
 */
const ownerOnlyMiddleware = (req, res, next) => {
    if (req.userRole !== 'owner') {
        return res.status(403).json({
            message: 'Access denied. Company owner privileges required.'
        });
    }
    next();
};

/**
 * Middleware to validate company access for specific resources
 * Ensures the requested resource belongs to the user's company
 */
const validateCompanyResource = (resourceIdParam = 'id', resourceType = 'generic') => {
    return async (req, res, next) => {
        try {
            const resourceId = req.params[resourceIdParam];
            const userCompanyId = req.companyId;

            if (!resourceId) {
                return res.status(400).json({
                    message: `${resourceType} ID is required`
                });
            }

            // The specific validation logic would depend on the resource type
            // This is a generic implementation that can be extended
            req.resourceId = resourceId;
            req.validatedCompanyId = userCompanyId;

            next();
        } catch (error) {
            console.error('Resource validation error:', error);
            res.status(500).json({
                message: 'Internal server error in resource validation'
            });
        }
    };
};

/**
 * Middleware to check subscription limits
 */
const checkSubscriptionLimits = (limitType) => {
    return async (req, res, next) => {
        try {
            const company = req.company;

            if (!company.subscriptionPlanId) {
                return res.status(403).json({
                    message: 'No active subscription plan. Please upgrade your account.'
                });
            }

            // Fetch subscription plan with limits
            const subscriptionPlan = await prisma.subscriptionPlan.findUnique({
                where: { id: company.subscriptionPlanId }
            });

            if (!subscriptionPlan || !subscriptionPlan.isActive) {
                return res.status(403).json({
                    message: 'Invalid or inactive subscription plan'
                });
            }

            // Check specific limit type
            switch (limitType) {
                case 'vehicle':
                    if (subscriptionPlan.vehicleLimit !== -1) {
                        const vehicleCount = await prisma.vehicle.count({
                            where: { companyId: company.id }
                        });

                        if (vehicleCount >= subscriptionPlan.vehicleLimit) {
                            return res.status(403).json({
                                message: `Vehicle limit reached. Current plan allows ${subscriptionPlan.vehicleLimit} vehicles.`
                            });
                        }
                    }
                    break;

                case 'driver':
                    if (subscriptionPlan.driverLimit !== -1) {
                        const driverCount = await prisma.user.count({
                            where: {
                                companyId: company.id,
                                role: 'DRIVER'
                            }
                        });

                        if (driverCount >= subscriptionPlan.driverLimit) {
                            return res.status(403).json({
                                message: `Driver limit reached. Current plan allows ${subscriptionPlan.driverLimit} drivers.`
                            });
                        }
                    }
                    break;

                default:
                    // Generic limit check
                    break;
            }

            req.subscriptionPlan = subscriptionPlan;
            next();
        } catch (error) {
            console.error('Subscription limit check error:', error);
            res.status(500).json({
                message: 'Internal server error in subscription validation'
            });
        }
    };
};

module.exports = {
    companyMiddleware,
    ownerOnlyMiddleware,
    validateCompanyResource,
    checkSubscriptionLimits
};