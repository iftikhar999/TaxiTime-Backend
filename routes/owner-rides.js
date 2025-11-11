const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { companyMiddleware } = require('../middleware/company');

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'COMPANY_ADMIN', 'ADMIN', 'SUPER_ADMIN'));
router.use(companyMiddleware);

const parseJsonSafe = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('Failed to parse JSON', error);
            return fallback;
        }
    }
    return value;
};

const formatLocation = (location) => {
    const parsed = parseJsonSafe(location, {});
    if (!parsed) {
        return {
            label: 'Unknown location',
            address: null,
            lat: null,
            lng: null,
            raw: location
        };
    }

    return {
        label: parsed.label || parsed.name || parsed.address || parsed.formattedAddress || 'Unknown location',
        address: parsed.address || parsed.formattedAddress || null,
        placeId: parsed.placeId || parsed.place_id || null,
        lat: parsed.lat || parsed.latitude || parsed?.location?.lat || null,
        lng: parsed.lng || parsed.longitude || parsed?.location?.lng || null,
        raw: parsed
    };
};

const formatUser = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'N/A',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || null,
        phone: user.phone || user.phoneNumber || null,
        avatar: user.avatarUrl || null
    };
};

const formatVehicle = (vehicle) => {
    if (!vehicle) return null;
    return {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        licensePlate: vehicle.licensePlate,
        vehicleType: vehicle.vehicleType,
        displayName: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
    };
};

const formatTariff = (tariff) => {
    if (!tariff) return null;
    return {
        id: tariff.id,
        name: tariff.name,
        baseFare: Number(tariff.baseFare ?? 0),
        perKmRate: Number(tariff.perKmRate ?? 0),
        perMinuteRate: Number(tariff.perMinuteRate ?? 0),
        minimumFare: Number(tariff.minimumFare ?? 0)
    };
};

const formatRide = (ride) => {
    const fareBreakdown = parseJsonSafe(ride.fareBreakdown, {});
    const stops = parseJsonSafe(ride.stops, []);
    const passenger = ride.users_rides_passengerIdTousers || ride.passenger;
    const driver = ride.users_rides_driverIdTousers || ride.driver;
    const vehicle = ride.vehicles || ride.vehicle;
    const tariff = ride.tariffs || ride.Tariff;

    return {
        id: ride.id,
        rideId: ride.rideId,
        status: ride.status,
        rideType: ride.rideType,
        passenger: formatUser(passenger),
        driver: formatUser(driver),
        vehicle: formatVehicle(vehicle),
        tariff: formatTariff(tariff),
        pickup: formatLocation(ride.pickup),
        destination: formatLocation(ride.destination),
        stops: Array.isArray(stops) ? stops.map(formatLocation) : [],
        requestedAt: ride.requestedAt,
        acceptedAt: ride.acceptedAt,
        pickedUpAt: ride.pickedUpAt,
        completedAt: ride.completedAt,
        cancelledAt: ride.cancelledAt,
        cancelledBy: ride.cancelledBy,
        cancellationReason: ride.cancellationReason,
        paymentMethod: ride.paymentMethod,
        paymentStatus: ride.paymentStatus,
        estimatedFare: ride.estimatedFare,
        actualFare: ride.actualFare,
        discountAmount: ride.discountAmount,
        estimatedDistance: ride.estimatedDistance,
        actualDistance: ride.actualDistance,
        estimatedDuration: ride.estimatedDuration,
        actualDuration: ride.actualDuration,
        fareBreakdown,
        requirements: parseJsonSafe(ride.requirements, null),
        driverRating: parseJsonSafe(ride.driverRating, null),
        passengerRating: parseJsonSafe(ride.passengerRating, null)
    };
};

const buildRideFilters = (companyId, query = {}) => {
    const {
        status,
        search,
        driverId,
        passengerId,
        vehicleId,
        fromDate,
        toDate,
        paymentStatus,
        rideType
    } = query;

    const where = {
        companyId
    };

    if (status) {
        const statusList = Array.isArray(status) ? status : status.split(',').map(s => s.trim()).filter(Boolean);
        if (statusList.length > 0) {
            where.status = { in: statusList };
        }
    }

    if (rideType) {
        const rideTypes = Array.isArray(rideType) ? rideType : rideType.split(',').map(r => r.trim()).filter(Boolean);
        if (rideTypes.length > 0) {
            where.rideType = { in: rideTypes };
        }
    }

    if (driverId) {
        where.driverId = driverId;
    }

    if (passengerId) {
        where.passengerId = passengerId;
    }

    if (vehicleId) {
        where.vehicleId = vehicleId;
    }

    if (paymentStatus) {
        const paymentList = Array.isArray(paymentStatus)
            ? paymentStatus
            : paymentStatus.split(',').map(p => p.trim()).filter(Boolean);
        if (paymentList.length > 0) {
            where.paymentStatus = { in: paymentList };
        }
    }

    if (fromDate || toDate) {
        where.requestedAt = {};
        if (fromDate) {
            const from = new Date(fromDate);
            if (!Number.isNaN(from.getTime())) {
                where.requestedAt.gte = from;
            }
        }
        if (toDate) {
            const to = new Date(toDate);
            if (!Number.isNaN(to.getTime())) {
                where.requestedAt.lte = to;
            }
        }
    }

    if (search) {
        const searchTerm = search.trim();
        if (searchTerm.length > 0) {
            where.OR = [
                { rideId: { contains: searchTerm, mode: 'insensitive' } },
                {
                    users_rides_passengerIdTousers: {
                        OR: [
                            { firstName: { contains: searchTerm, mode: 'insensitive' } },
                            { lastName: { contains: searchTerm, mode: 'insensitive' } },
                            { email: { contains: searchTerm, mode: 'insensitive' } },
                            { phone: { contains: searchTerm, mode: 'insensitive' } }
                        ]
                    }
                },
                {
                    users_rides_driverIdTousers: {
                        OR: [
                            { firstName: { contains: searchTerm, mode: 'insensitive' } },
                            { lastName: { contains: searchTerm, mode: 'insensitive' } },
                            { email: { contains: searchTerm, mode: 'insensitive' } },
                            { phone: { contains: searchTerm, mode: 'insensitive' } }
                        ]
                    }
                }
            ];
        }
    }

    return where;
};

router.get('/', async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
        const pageSize = Math.max(1, Math.min(parseInt(req.query.pageSize ?? req.query.limit ?? '20', 10), 100));
        const skip = (page - 1) * pageSize;
        const where = buildRideFilters(req.companyId, req.query);

        const [rides, total, statusGroup, aggregates] = await Promise.all([
            prisma.rides.findMany({
                where,
                include: {
                    users_rides_passengerIdTousers: true,
                    users_rides_driverIdTousers: true,
                    vehicles: true,
                    tariffs: true
                },
                orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
                skip,
                take: pageSize
            }),
            prisma.rides.count({ where }),
            prisma.rides.groupBy({
                by: ['status'],
                where,
                _count: { status: true }
            }),
            prisma.rides.aggregate({
                where,
                _sum: {
                    estimatedFare: true,
                    actualFare: true,
                    discountAmount: true
                }
            })
        ]);

        res.json({
            rides: rides.map(formatRide),
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            },
            summary: {
                statusCounts: statusGroup.reduce((acc, group) => {
                    acc[group.status] = group._count.status;
                    return acc;
                }, {}),
                fareTotals: {
                    estimated: aggregates._sum.estimatedFare || 0,
                    actual: aggregates._sum.actualFare || 0,
                    discounts: aggregates._sum.discountAmount || 0
                }
            }
        });
    } catch (error) {
        console.error('Owner ride list error:', error);
        res.status(500).json({ error: 'Failed to load rides' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const ride = await prisma.rides.findFirst({
            where: {
                id,
                companyId: req.companyId
            },
            include: {
                users_rides_passengerIdTousers: true,
                users_rides_driverIdTousers: true,
                vehicles: true,
                tariffs: true,
                payments: true,
                ride_offers: {
                    include: {
                        users: true
                    }
                }
            }
        });

        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }

        const formatted = formatRide(ride);

        formatted.payments = (ride.payments || []).map(payment => ({
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            method: payment.method,
            provider: payment.provider,
            transactionId: payment.transactionId,
            createdAt: payment.createdAt
        }));

        formatted.offers = (ride.ride_offers || []).map(offer => ({
            id: offer.id,
            status: offer.status,
            offeredAt: offer.offeredAt,
            respondedAt: offer.respondedAt,
            rejectionReason: offer.rejectionReason,
            driver: formatUser(offer.users)
        }));

        res.json({ ride: formatted });
    } catch (error) {
        console.error('Owner ride detail error:', error);
        res.status(500).json({ error: 'Failed to load ride details' });
    }
});

module.exports = router;
