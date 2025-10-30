const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../../../middleware/auth');
// Using console.log for logging (logger utility not available)

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route   GET /api/mobile/driver/companies
 * @desc    Get list of active companies for driver registration
 * @access  Public
 */
router.get('/companies', async (req, res) => {
    try {
        const { search, city, state } = req.query;

        let whereClause = {
            isActive: true,
            status: 'ACTIVE'
        };

        // Add search filters
        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { legalName: { contains: search, mode: 'insensitive' } },
                { brandName: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (city) {
            whereClause.hqCity = { contains: city, mode: 'insensitive' };
        }

        if (state) {
            whereClause.hqState = { contains: state, mode: 'insensitive' };
        }

        const companies = await prisma.company.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                legalName: true,
                brandName: true,
                companyCode: true,
                companyType: true,
                hqCity: true,
                hqState: true,
                hqCountry: true,
                primaryContactEmail: true,
                primaryContactPhone: true,
                serviceModes: true,
                operatingHoursJson: true,
                fleetSizeTotal: true,
                companyDrivers: {
                    where: { status: 'ACTIVE' },
                    select: { id: true }
                }
            },
            orderBy: [
                { name: 'asc' }
            ],
            take: 50 // Limit results
        });

        const formattedCompanies = companies.map(company => ({
            id: company.id,
            name: company.name,
            legalName: company.legalName,
            brandName: company.brandName,
            companyCode: company.companyCode,
            type: company.companyType,
            location: {
                city: company.hqCity,
                state: company.hqState,
                country: company.hqCountry
            },
            contact: {
                email: company.primaryContactEmail,
                phone: company.primaryContactPhone
            },
            services: company.serviceModes,
            operatingHours: company.operatingHoursJson,
            fleetSize: company.fleetSizeTotal,
            activeDrivers: company.companyDrivers.length
        }));

        res.json({
            success: true,
            data: {
                companies: formattedCompanies,
                total: formattedCompanies.length
            }
        });

    } catch (error) {
        console.error('Get companies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching companies'
        });
    }
});

/**
 * @route   GET /api/mobile/driver/companies/:companyCode
 * @desc    Get detailed company information by company code
 * @access  Public
 */
router.get('/companies/:companyCode', async (req, res) => {
    try {
        const { companyCode } = req.params;

        const company = await prisma.company.findUnique({
            where: { companyCode },
            select: {
                id: true,
                name: true,
                legalName: true,
                brandName: true,
                companyCode: true,
                companyType: true,
                businessModel: true,
                hqAddressLine1: true,
                hqCity: true,
                hqState: true,
                hqPostcode: true,
                hqCountry: true,
                primaryContactName: true,
                primaryContactEmail: true,
                primaryContactPhone: true,
                supportEmail: true,
                supportPhone: true,
                serviceModes: true,
                operatingHoursJson: true,
                requiresVehicleInspection: true,
                vehicleAgeLimitYears: true,
                commissionRate: true,
                driverPayoutFrequency: true,
                kpiTargetsJson: true,
                fleetSizeTotal: true,
                isActive: true,
                companyDrivers: {
                    where: { status: 'ACTIVE' },
                    select: { id: true }
                },
                vehicles: {
                    where: { isActive: true },
                    select: { id: true }
                }
            }
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        if (!company.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Company is not currently accepting drivers'
            });
        }

        res.json({
            success: true,
            data: {
                company: {
                    id: company.id,
                    name: company.name,
                    legalName: company.legalName,
                    brandName: company.brandName,
                    companyCode: company.companyCode,
                    type: company.companyType,
                    businessModel: company.businessModel,
                    address: {
                        street: company.hqAddressLine1,
                        city: company.hqCity,
                        state: company.hqState,
                        postcode: company.hqPostcode,
                        country: company.hqCountry
                    },
                    contact: {
                        primaryName: company.primaryContactName,
                        primaryEmail: company.primaryContactEmail,
                        primaryPhone: company.primaryContactPhone,
                        supportEmail: company.supportEmail,
                        supportPhone: company.supportPhone
                    },
                    services: company.serviceModes,
                    operatingHours: company.operatingHoursJson,
                    requirements: {
                        vehicleInspection: company.requiresVehicleInspection,
                        maxVehicleAge: company.vehicleAgeLimitYears
                    },
                    compensation: {
                        commissionRate: company.commissionRate,
                        payoutFrequency: company.driverPayoutFrequency
                    },
                    targets: company.kpiTargetsJson,
                    fleet: {
                        totalSize: company.fleetSizeTotal,
                        activeDrivers: company.companyDrivers.length,
                        activeVehicles: company.vehicles.length
                    }
                }
            }
        });

    } catch (error) {
        console.error('Get company details error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching company details'
        });
    }
});

/**
 * @route   GET /api/mobile/driver/companies/search/nearby
 * @desc    Find companies near a location
 * @access  Public
 */
router.get('/companies/search/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius = 50 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        const radiusKm = parseFloat(radius);

        // Use raw SQL for geospatial query
        const nearbyCompanies = await prisma.$queryRaw`
      SELECT 
        id,
        name,
        "legalName",
        "brandName",
        "companyCode",
        "companyType",
        "hqCity",
        "hqState",
        "hqCountry",
        "primaryContactEmail",
        "primaryContactPhone",
        "hqLatitude",
        "hqLongitude",
        "serviceModes",
        "fleetSizeTotal",
        (
          6371 * acos(
            cos(radians(${lat})) * 
            cos(radians("hqLatitude")) * 
            cos(radians("hqLongitude") - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians("hqLatitude"))
          )
        ) as distance
      FROM "Company"
      WHERE 
        "isActive" = true
        AND status = 'ACTIVE'
        AND "hqLatitude" IS NOT NULL
        AND "hqLongitude" IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${lat})) * 
            cos(radians("hqLatitude")) * 
            cos(radians("hqLongitude") - radians(${lng})) + 
            sin(radians(${lat})) * 
            sin(radians("hqLatitude"))
          )
        ) <= ${radiusKm}
      ORDER BY distance
      LIMIT 20
    `;

        const formattedCompanies = nearbyCompanies.map(company => ({
            id: company.id,
            name: company.name,
            legalName: company.legalName,
            brandName: company.brandName,
            companyCode: company.companyCode,
            type: company.companyType,
            location: {
                city: company.hqCity,
                state: company.hqState,
                country: company.hqCountry,
                coordinates: {
                    latitude: company.hqLatitude,
                    longitude: company.hqLongitude
                }
            },
            contact: {
                email: company.primaryContactEmail,
                phone: company.primaryContactPhone
            },
            services: company.serviceModes,
            fleetSize: company.fleetSizeTotal,
            distance: Math.round(company.distance * 100) / 100 // Round to 2 decimal places
        }));

        res.json({
            success: true,
            data: {
                companies: formattedCompanies,
                searchLocation: { latitude: lat, longitude: lng },
                radiusKm: radiusKm,
                total: formattedCompanies.length
            }
        });

    } catch (error) {
        console.error('Search nearby companies error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error searching nearby companies'
        });
    }
});

module.exports = router;