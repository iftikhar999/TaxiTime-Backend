const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createId } = require('@paralleldrive/cuid2');

const router = express.Router();
const prisma = new PrismaClient();

const ALLOWED_KYC_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];

const ALLOWED_COMPANY_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATED',
];

// Helper function to derive company status
const getCompanyStatus = (company) => {
  if (company.deletedAt) return 'DELETED';
  if (!company.isActive) return 'INACTIVE';
  if (company.status === 'TERMINATED') return 'TERMINATED';
  if (company.status === 'SUSPENDED') return 'SUSPENDED';
  if (company.status === 'PENDING') return 'PENDING';
  return 'ACTIVE';
};

// Middleware: Require SUPER_ADMIN role for all routes
router.use(authenticateToken);
router.use(authorizeRoles('SUPER_ADMIN'));

// GET /api/admin/companies - List all companies with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', service = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {};

    if (search) {
      where.OR = [
        { legalName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { companyCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        // Legacy compatibility
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status === 'active') {
      where.isActive = true;
      where.isVerified = true;
    } else if (status === 'pending') {
      where.isActive = true;
      where.isVerified = false;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    // Filter by service using serviceModes JSON field
    if (service) {
      const serviceKey = service.toLowerCase();
      if (serviceKey === 'taxi' || serviceKey === 'delivery' || serviceKey === 'courier') {
        where.serviceModes = {
          path: [serviceKey],
          equals: true
        };
      }
    }

    // Get companies with owner info
    const [companies, totalCount] = await Promise.all([
      prisma.companies.findMany({
        where,
        include: {
          users_companies_ownerIdTousers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            }
          },
          _count: {
            select: {
              users_users_companyIdTocompanies: { where: { role: 'DRIVER', isActive: true } },
              vehicles: { where: { isActive: true } },
              rides: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.companies.count({ where }),
    ]);

    // Transform companies for frontend compatibility
    const transformedCompanies = companies.map(company => ({
      ...company,
      // Map owner relation for cleaner response
      owner: company.users_companies_ownerIdTousers || null,
      // Legacy compatibility fields
      name: company.legalName || company.brandName || company.name,
      services: company.features || company.services || ['TAXI'],

      // Enhanced display information
      displayInfo: {
        companyCode: company.companyCode || '',
        kycStatus: company.kycStatus || 'PENDING',
        subscriptionPlan: company.subscriptionPlan || 'BASIC',
        operatingStatus: company.isActive ? 'ACTIVE' : 'INACTIVE',
        verificationStatus: company.isVerified ? 'VERIFIED' : 'PENDING',
        serviceCount: (company.features || company.services || []).length,
        primaryServices: (company.features || company.services || ['TAXI']).slice(0, 3)
      },

      // Fleet statistics 
      fleetStats: {
        current: company.fleetSize?.current || 0,
        maximum: company.fleetSize?.maximum || 10,
        utilization: company.fleetSize?.current ?
          Math.round((company.fleetSize.current / company.fleetSize.maximum) * 100) : 0
      }
    }));

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      companies: transformedCompanies,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
      }
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/admin/companies/dropdown - Simple list for dropdowns
router.get('/dropdown', async (req, res) => {
  try {
    const companies = await prisma.companies.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        legalName: true,
        brandName: true,
      },
      orderBy: [
        { brandName: 'asc' },
        { legalName: 'asc' },
        { name: 'asc' }
      ]
    });

    // Format for dropdown display
    const formattedCompanies = companies.map(company => ({
      id: company.id,
      name: company.brandName || company.legalName || company.name || 'Unnamed Company'
    }));

    res.json(formattedCompanies);
  } catch (error) {
    console.error('Error fetching companies dropdown:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/admin/companies/:id - Get company details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.companies.findUnique({
      where: { id },
      include: {
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            isVerified: true,
          }
        },
        users_users_companyIdTocompanies: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            licensePlate: true,
            vehicleType: true,
            isActive: true,
            driverId: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            users_users_companyIdTocompanies: true,
            vehicles: true,
            rides: true,
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Transform for frontend
    const response = {
      ...company,
      owner: company.users_companies_ownerIdTousers || null,
      users: company.users_users_companyIdTocompanies || [],
      _count: {
        users: company._count.users_users_companyIdTocompanies,
        vehicles: company._count.vehicles,
        rides: company._count.rides
      }
    };

    // Get recent activity/stats
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentStats, recentPayments] = await Promise.all([
      prisma.rides.aggregate({
        where: {
          companyId: id,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
        _sum: { actualFare: true },
      }),
      prisma.payments.aggregate({
        where: {
          companyId: id,
          status: 'PAID',
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const companyWithStats = {
      ...response,
      stats: {
        last30Days: {
          rides: recentStats._count || 0,
          revenue: parseFloat(recentPayments._sum.amount || 0),
          payments: recentPayments._count || 0,
        }
      }
    };

    res.json(companyWithStats);
  } catch (error) {
    console.error('Error fetching company details:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

// POST /api/admin/companies - Create new company
router.post('/', async (req, res) => {
  try {
    const {
      // Modern fields
      legalName,
      brandName,
      companyCode,
      companyType = 'TAXI_OPERATOR',
      businessModel = 'B2C',
      primaryContactName,
      primaryContactEmail,
      primaryContactPhone,
      primaryContactRole = 'CEO',
      supportEmail,
      supportPhone,
      hqAddressLine1,
      hqAddressLine2,
      hqCity,
      hqState,
      hqPostcode,
      hqCountry = 'US',
      serviceModes,
      subscriptionPlanId,
      timezone = 'UTC',
      primaryLanguage = 'en',
      billingCurrency = 'USD',
      status = 'ACTIVE',
      // Legacy fields for compatibility
      name,
      email,
      phone,
      website,
      description,
      services = [],
      address,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
    } = req.body;

    // Support both modern and legacy field names
    const companyLegalName = legalName || name;
    const companyBrandName = brandName || name;
    const companyEmail = primaryContactEmail || email;
    const companyPhone = primaryContactPhone || phone;

    // Parse numeric fields
    const parsedSubscriptionPlanId = subscriptionPlanId ? parseInt(subscriptionPlanId) : null;

    // Validate required fields
    if (!companyLegalName || !companyEmail) {
      return res.status(400).json({ error: 'Legal name and email are required' });
    }

    // Check if company email already exists
    const existingCompany = await prisma.companies.findFirst({
      where: {
        OR: [
          { primaryContactEmail: companyEmail },
          { email: companyEmail }
        ]
      }
    });

    if (existingCompany) {
      return res.status(400).json({ error: 'Company with this email already exists' });
    }

    // Generate company code if not provided
    const finalCompanyCode = companyCode || companyLegalName.replace(/[^A-Z0-9]/gi, '').toUpperCase().substring(0, 10) + Date.now().toString().slice(-3);

    // Create owner user if provided, otherwise create company without owner requirement
    let ownerId = null;
    if (ownerEmail && ownerFirstName && ownerLastName) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(ownerPassword || 'defaultPassword123', 10);

      const owner = await prisma.user.create({
        data: {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          email: ownerEmail,
          phone: ownerPhone || companyPhone || '+0000000000',
          password: hashedPassword,
          role: 'OWNER',
          isActive: true,
          isVerified: false,
        }
      });
      ownerId = owner.id;
    } else {
      // Create a default owner for the company
      const bcrypt = require('bcryptjs');
      const timestamp = Date.now();
      const defaultOwnerEmail = `owner.${finalCompanyCode.toLowerCase()}@${companyLegalName.toLowerCase().replace(/\s+/g, '')}.com`;
      const defaultPhone = `+${timestamp.toString().slice(-10)}`; // Generate unique phone from timestamp
      const hashedPassword = await bcrypt.hash('ChangeMe123!', 10);

      console.log('Creating default owner with email:', defaultOwnerEmail);
      console.log('Using phone:', defaultPhone);

      const owner = await prisma.user.create({
        data: {
          firstName: primaryContactName || 'Owner',
          lastName: companyLegalName || 'User',
          email: defaultOwnerEmail,
          phone: defaultPhone,
          password: hashedPassword,
          role: 'OWNER',
          isActive: true,
          isVerified: false,
        }
      });
      console.log('Owner created with ID:', owner.id);
      ownerId = owner.id;
    }

    console.log('Creating company with ownerId:', ownerId);

    // Create company
    const newCompany = await prisma.companies.create({
      data: {
        // Core Identity
        legalName: companyLegalName,
        brandName: companyBrandName || companyLegalName,
        companyCode: finalCompanyCode,
        tenantId: `tenant_${Date.now()}`,
        companyType,
        businessModel,

        // Contact Information
        primaryContactName,
        primaryContactEmail: companyEmail,
        primaryContactPhone: companyPhone,
        primaryContactRole,
        supportEmail: supportEmail || companyEmail,
        supportPhone: supportPhone || companyPhone,

        // HQ Address
        hqAddressLine1,
        hqAddressLine2,
        hqCity,
        hqState,
        hqPostcode,
        hqCountry,

        // Legacy fields
        name: companyLegalName,
        email: companyEmail,
        phone: companyPhone,
        website,
        description,
        address: address || {
          street: hqAddressLine1 || '',
          city: hqCity || '',
          state: hqState || '',
          zipCode: hqPostcode || '',
          country: hqCountry || 'US',
          coordinates: { latitude: 0, longitude: 0 }
        },

        // Regulatory & Compliance
        registrationNumber: '',
        taxId: '',
        kycStatus: 'PENDING',
        status,

        // Operational
        serviceModes: serviceModes || {
          taxi: services.includes('TAXI') || true,
          delivery: services.includes('DELIVERY') || false,
          courier: services.includes('COURIER') || false
        },
        timezone,
        primaryLanguage,

        // Financial
        billingCurrency,
        subscriptionPlanId: parsedSubscriptionPlanId,

        // Operational Settings
        operatingHoursJson: {
          monday: { start: '09:00', end: '17:00', isActive: true },
          tuesday: { start: '09:00', end: '17:00', isActive: true },
          wednesday: { start: '09:00', end: '17:00', isActive: true },
          thursday: { start: '09:00', end: '17:00', isActive: true },
          friday: { start: '09:00', end: '17:00', isActive: true },
          saturday: { start: '10:00', end: '16:00', isActive: true },
          sunday: { start: '10:00', end: '16:00', isActive: false }
        },
        dispatchMode: 'AUTO',

        // Financial Configuration
        billingCycle: 'MONTHLY',
        commissionModel: 'PERCENTAGE',
        commissionRate: 15.0,
        driverPayoutFrequency: 'WEEKLY',

        // Platform Settings
        isActive: true,
        isVerified: false,
        status: 'ACTIVE',

        // Legacy fields for compatibility
        name,
        description,
        ownerId
      },
      include: {
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          }
        }
      }
    });

    // Transform for frontend
    const response = {
      ...newCompany,
      owner: newCompany.users_companies_ownerIdTousers || null
    };

    res.status(201).json({
      message: 'Company created successfully',
      company: response
    });
  } catch (error) {
    console.error('Error creating company:', error);
    console.error('Error details:', error.message);
    console.error('Error meta:', error.meta);
    res.status(500).json({
      error: 'Failed to create company',
      details: error.message
    });
  }
});

// PUT /api/admin/companies/:id - Update company
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Extract all possible fields (modern and legacy)
    const {
      // Modern fields
      legalName, brandName, companyCode, companyType, businessModel,
      primaryContactName, primaryContactEmail, primaryContactPhone,
      businessRegistrationNumber, taxId, ein,
      businessAddressStreet, businessAddressCity, businessAddressState,
      businessAddressZipCode, businessAddressCountry,
      billingAddressStreet, billingAddressCity, billingAddressState,
      billingAddressZipCode, billingAddressCountry,
      hqAddressLine1, hqAddressLine2, hqCity, hqState, hqPostcode, hqCountry,
      serviceModes, subscriptionPlanId, subscriptionStatus,
      subscriptionStartDate, subscriptionEndDate,
      commissionPercentage, bookingFeeFixed, bookingFeePercentage,
      paymentTerms, paymentSchedule, billingCurrency,
      primaryTimezone, supportedLanguages,
      documentsBusinessLicense, documentsInsuranceCertificate,
      documentsOperatingPermit, documentsTaxDocument,
      operationalMaxVehicles, operationalMaxDrivers,
      operationalServiceAreas, operationalOperatingHours,
      technicalApiEnabled, technicalWebhookUrl, technicalWebhookSecret,
      complianceBackgroundCheckRequired, complianceInsuranceMinimum,
      complianceVehicleAgeLimit,
      brandingLogoUrl, brandingPrimaryColor, brandingSecondaryColor,
      bankAccountName, bankAccountNumber, bankBankName,
      bankRoutingNumber, bankSwiftCode, bankIban,
      preferencesCurrency, preferencesDistanceUnit, preferencesLanguage,
      isActive, isVerified, isApproved,
      status,
      kycStatus, kycExpiryAt,
      website, description, services,

      // Legacy fields
      name, email, phone, address, subscription, settings,

      // Owner info
      ownerId, owner: ownerInfo
    } = req.body;

    // Check if company exists
    const existingCompany = await prisma.companies.findUnique({
      where: { id }
    });

    if (!existingCompany) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Smart field mapping (modern || legacy)
    const companyEmail = primaryContactEmail || email;

    // Check email uniqueness if changed
    if (companyEmail && companyEmail !== existingCompany.email && companyEmail !== existingCompany.primaryContactEmail) {
      const emailExists = await prisma.companies.findFirst({
        where: {
          OR: [
            { email: companyEmail },
            { primaryContactEmail: companyEmail }
          ],
          NOT: { id }
        }
      });
      if (emailExists) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Build update data object
    const updateData = {};

    // Modern fields
    if (legalName !== undefined) updateData.legalName = legalName;
    if (brandName !== undefined) updateData.brandName = brandName;
    if (companyCode !== undefined) updateData.companyCode = companyCode;
    if (companyType !== undefined) updateData.companyType = companyType;
    if (businessModel !== undefined) updateData.businessModel = businessModel;
    if (primaryContactName !== undefined) updateData.primaryContactName = primaryContactName;
    if (primaryContactEmail !== undefined) updateData.primaryContactEmail = primaryContactEmail;
    if (primaryContactPhone !== undefined) updateData.primaryContactPhone = primaryContactPhone;
    if (businessRegistrationNumber !== undefined) updateData.businessRegistrationNumber = businessRegistrationNumber;
    if (taxId !== undefined) updateData.taxId = taxId;
    if (ein !== undefined) updateData.ein = ein;
    if (businessAddressStreet !== undefined) updateData.businessAddressStreet = businessAddressStreet;
    if (businessAddressCity !== undefined) updateData.businessAddressCity = businessAddressCity;
    if (businessAddressState !== undefined) updateData.businessAddressState = businessAddressState;
    if (businessAddressZipCode !== undefined) updateData.businessAddressZipCode = businessAddressZipCode;
    if (businessAddressCountry !== undefined) updateData.businessAddressCountry = businessAddressCountry;
    if (billingAddressStreet !== undefined) updateData.billingAddressStreet = billingAddressStreet;
    if (billingAddressCity !== undefined) updateData.billingAddressCity = billingAddressCity;
    if (billingAddressState !== undefined) updateData.billingAddressState = billingAddressState;
    if (billingAddressZipCode !== undefined) updateData.billingAddressZipCode = billingAddressZipCode;
    if (billingAddressCountry !== undefined) updateData.billingAddressCountry = billingAddressCountry;
    if (hqAddressLine1 !== undefined) updateData.hqAddressLine1 = hqAddressLine1;
    if (hqAddressLine2 !== undefined) updateData.hqAddressLine2 = hqAddressLine2;
    if (hqCity !== undefined) updateData.hqCity = hqCity;
    if (hqState !== undefined) updateData.hqState = hqState;
    if (hqPostcode !== undefined) updateData.hqPostcode = hqPostcode;
    if (hqCountry !== undefined) updateData.hqCountry = hqCountry;
    if (serviceModes !== undefined) updateData.serviceModes = serviceModes;

    // Handle subscriptionPlanId with validation
    if (subscriptionPlanId !== undefined) {
      if (subscriptionPlanId === null || subscriptionPlanId === '') {
        updateData.subscriptionPlanId = null;
      } else {
        const parsedPlanId = parseInt(subscriptionPlanId);
        if (isNaN(parsedPlanId)) {
          return res.status(400).json({
            error: 'Invalid subscription plan ID',
            details: 'Subscription plan ID must be a valid number'
          });
        }

        // Validate that the plan exists
        const planExists = await prisma.subscription_plans.findUnique({
          where: { id: parsedPlanId }
        });

        if (!planExists) {
          return res.status(400).json({
            error: 'Invalid subscription plan',
            details: `Subscription plan with ID ${parsedPlanId} does not exist`
          });
        }

        updateData.subscriptionPlanId = parsedPlanId;
      }
    }

    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;
    if (subscriptionStartDate !== undefined) updateData.subscriptionStartDate = subscriptionStartDate;
    if (subscriptionEndDate !== undefined) updateData.subscriptionEndDate = subscriptionEndDate;
    if (commissionPercentage !== undefined) updateData.commissionPercentage = commissionPercentage;
    if (bookingFeeFixed !== undefined) updateData.bookingFeeFixed = bookingFeeFixed;
    if (bookingFeePercentage !== undefined) updateData.bookingFeePercentage = bookingFeePercentage;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
    if (paymentSchedule !== undefined) updateData.paymentSchedule = paymentSchedule;
    if (billingCurrency !== undefined) updateData.billingCurrency = billingCurrency;
    if (primaryTimezone !== undefined) updateData.primaryTimezone = primaryTimezone;
    if (supportedLanguages !== undefined) updateData.supportedLanguages = supportedLanguages;
    if (documentsBusinessLicense !== undefined) updateData.documentsBusinessLicense = documentsBusinessLicense;
    if (documentsInsuranceCertificate !== undefined) updateData.documentsInsuranceCertificate = documentsInsuranceCertificate;
    if (documentsOperatingPermit !== undefined) updateData.documentsOperatingPermit = documentsOperatingPermit;
    if (documentsTaxDocument !== undefined) updateData.documentsTaxDocument = documentsTaxDocument;
    if (operationalMaxVehicles !== undefined) updateData.operationalMaxVehicles = operationalMaxVehicles;
    if (operationalMaxDrivers !== undefined) updateData.operationalMaxDrivers = operationalMaxDrivers;
    if (operationalServiceAreas !== undefined) updateData.operationalServiceAreas = operationalServiceAreas;
    if (operationalOperatingHours !== undefined) updateData.operationalOperatingHours = operationalOperatingHours;
    if (technicalApiEnabled !== undefined) updateData.technicalApiEnabled = technicalApiEnabled;
    if (technicalWebhookUrl !== undefined) updateData.technicalWebhookUrl = technicalWebhookUrl;
    if (technicalWebhookSecret !== undefined) updateData.technicalWebhookSecret = technicalWebhookSecret;
    if (complianceBackgroundCheckRequired !== undefined) updateData.complianceBackgroundCheckRequired = complianceBackgroundCheckRequired;
    if (complianceInsuranceMinimum !== undefined) updateData.complianceInsuranceMinimum = complianceInsuranceMinimum;
    if (complianceVehicleAgeLimit !== undefined) updateData.complianceVehicleAgeLimit = complianceVehicleAgeLimit;
    if (brandingLogoUrl !== undefined) updateData.brandingLogoUrl = brandingLogoUrl;
    if (brandingPrimaryColor !== undefined) updateData.brandingPrimaryColor = brandingPrimaryColor;
    if (brandingSecondaryColor !== undefined) updateData.brandingSecondaryColor = brandingSecondaryColor;
    if (bankAccountName !== undefined) updateData.bankAccountName = bankAccountName;
    if (bankAccountNumber !== undefined) updateData.bankAccountNumber = bankAccountNumber;
    if (bankBankName !== undefined) updateData.bankBankName = bankBankName;
    if (bankRoutingNumber !== undefined) updateData.bankRoutingNumber = bankRoutingNumber;
    if (bankSwiftCode !== undefined) updateData.bankSwiftCode = bankSwiftCode;
    if (bankIban !== undefined) updateData.bankIban = bankIban;
    if (preferencesCurrency !== undefined) updateData.preferencesCurrency = preferencesCurrency;
    if (preferencesDistanceUnit !== undefined) updateData.preferencesDistanceUnit = preferencesDistanceUnit;
    if (preferencesLanguage !== undefined) updateData.preferencesLanguage = preferencesLanguage;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (isApproved !== undefined) updateData.isApproved = isApproved;

    if (status !== undefined) {
      const normalizedStatus = String(status).toUpperCase();
      if (!ALLOWED_COMPANY_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updateData.status = normalizedStatus;

      if (normalizedStatus === 'SUSPENDED' || normalizedStatus === 'TERMINATED') {
        updateData.isActive = false;
      } else if (normalizedStatus === 'ACTIVE' && isActive === undefined) {
        updateData.isActive = true;
      }
    }

    if (kycStatus !== undefined) {
      const normalizedStatus = String(kycStatus).toUpperCase();
      if (!ALLOWED_KYC_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid kycStatus' });
      }
      updateData.kycStatus = normalizedStatus;
      updateData.kycLastReviewedAt = ['APPROVED', 'REJECTED'].includes(normalizedStatus)
        ? new Date()
        : null;

      // Keep verification aligned to KYC status
      updateData.isVerified = normalizedStatus === 'APPROVED';
    }

    if (kycExpiryAt !== undefined) {
      updateData.kycExpiryAt = kycExpiryAt ? new Date(kycExpiryAt) : null;
    }

    // Legacy fields (with fallbacks to modern fields)
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (website !== undefined) updateData.website = website;
    if (description !== undefined) updateData.description = description;
    if (services !== undefined) updateData.services = services;
    if (address !== undefined) updateData.address = address;
    if (subscription !== undefined) updateData.subscription = subscription;
    if (settings !== undefined) updateData.settings = settings;

    // Update legacy fields from modern if legacy not provided
    if (legalName !== undefined && name === undefined) updateData.name = legalName;
    if (primaryContactEmail !== undefined && email === undefined) updateData.email = primaryContactEmail;
    if (primaryContactPhone !== undefined && phone === undefined) updateData.phone = primaryContactPhone;

    // Handle owner relationship if ownerId provided
    if (ownerId !== undefined) {
      if (ownerId === null) {
        updateData.ownerId = null;
      } else {
        // Verify owner exists
        const ownerExists = await prisma.user.findUnique({
          where: { id: ownerId }
        });
        if (ownerExists) {
          updateData.ownerId = ownerId;
        }
      }
    }

    const company = await prisma.companies.update({
      where: { id },
      data: updateData,
      include: {
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          }
        }
      }
    });

    // Transform for frontend
    const response = {
      ...company,
      owner: company.users_companies_ownerIdTousers || null
    };

    res.json({
      message: 'Company updated successfully',
      company: response
    });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// PATCH /api/admin/companies/:id/toggle-status - Toggle company active status
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.companies.findUnique({
      where: { id }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const updatedCompany = await prisma.companies.update({
      where: { id },
      data: { isActive: !company.isActive },
      include: {
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    // Transform for frontend
    const response = {
      ...updatedCompany,
      owner: updatedCompany.users_companies_ownerIdTousers || null
    };

    res.json({
      message: `Company ${updatedCompany.isActive ? 'activated' : 'deactivated'} successfully`,
      company: response
    });
  } catch (error) {
    console.error('Error toggling company status:', error);
    res.status(500).json({ error: 'Failed to toggle company status' });
  }
});

// PATCH /api/admin/companies/:id/verify - Verify company
router.patch('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { verified = true } = req.body;

    const existingCompany = await prisma.companies.findUnique({ where: { id } });

    if (!existingCompany) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const data = {
      isVerified: verified,
      kycStatus: verified ? 'APPROVED' : 'PENDING',
      kycLastReviewedAt: new Date(),
    };

    const company = await prisma.companies.update({
      where: { id },
      data,
      include: {
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    // Transform for frontend
    const response = {
      ...company,
      owner: company.users_companies_ownerIdTousers || null
    };

    res.json({
      message: `Company ${verified ? 'verified' : 'unverified'} successfully`,
      company: response
    });
  } catch (error) {
    console.error('Error verifying company:', error);
    res.status(500).json({ error: 'Failed to verify company' });
  }
});

// DELETE /api/admin/companies/:id - Delete company (soft delete by deactivating)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if company has active operations
    const [activeRides, activeDrivers] = await Promise.all([
      prisma.rides.count({
        where: {
          companyId: id,
          status: { in: ['REQUESTED', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_PROGRESS'] }
        }
      }),
      prisma.user.count({
        where: {
          companyId: id,
          role: 'DRIVER',
          isActive: true
        }
      })
    ]);

    if (activeRides > 0) {
      return res.status(400).json({
        error: 'Cannot delete company with active rides. Complete or cancel active rides first.'
      });
    }

    // Soft delete: deactivate company and all associated users/vehicles
    await Promise.all([
      prisma.companies.update({
        where: { id },
        data: {
          isActive: false,
          status: 'TERMINATED',
          deletedAt: new Date()
        }
      }),
      prisma.user.updateMany({
        where: { companyId: id },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      }),
      prisma.vehicles.updateMany({
        where: { companyId: id },
        data: { isActive: false }
      })
    ]);

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({
      error: 'Failed to delete company',
      details: error.message
    });
  }
});

// POST /api/admin/companies/:id/reactivate - Reactivate a deleted company
router.post('/:id/reactivate', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if company exists
    const existingCompany = await prisma.companies.findUnique({
      where: { id }
    });

    if (!existingCompany) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Check if company is actually deleted/inactive
    if (!existingCompany.deletedAt && existingCompany.isActive && existingCompany.status !== 'TERMINATED') {
      return res.status(400).json({
        error: 'Company is already active',
        details: 'This company is not deleted and does not need reactivation'
      });
    }

    // Reactivate company
    const company = await prisma.companies.update({
      where: { id },
      data: {
        isActive: true,
        status: 'ACTIVE',
        deletedAt: null
      },
      include: {
        subscription_plans: true,
        users_companies_ownerIdTousers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    res.json({
      message: 'Company reactivated successfully',
      company: {
        ...company,
        subscriptionPlan: company.subscription_plans || null,
        owner: company.users_companies_ownerIdTousers || null,
        status: getCompanyStatus(company)
      }
    });
  } catch (error) {
    console.error('Error reactivating company:', error);
    res.status(500).json({
      error: 'Failed to reactivate company',
      details: error.message
    });
  }
});

// GET /api/admin/companies/:id/analytics - Get company analytics
router.get('/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [rideStats, paymentStats, driverStats, dailyData] = await Promise.all([
      // Ride statistics
      prisma.rides.groupBy({
        by: ['status'],
        where: {
          companyId: id,
          createdAt: { gte: startDate }
        },
        _count: true
      }),

      // Payment statistics
      prisma.payments.aggregate({
        where: {
          companyId: id,
          createdAt: { gte: startDate }
        },
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true }
      }),

      // Driver statistics
      prisma.user.groupBy({
        by: ['isActive'],
        where: {
          companyId: id,
          role: 'DRIVER'
        },
        _count: true
      }),

      // Daily data for charts
      prisma.$queryRaw`
        SELECT 
          DATE("createdAt") as date,
          COUNT(*) as rides,
          SUM(CASE WHEN "actualFare" IS NOT NULL THEN "actualFare" ELSE 0 END) as revenue
        FROM "rides"
        WHERE "companyId" = ${id}
          AND "createdAt" >= ${startDate}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `
    ]);

    // Format analytics data
    const analytics = {
      rides: {
        total: rideStats.reduce((sum, stat) => sum + stat._count, 0),
        byStatus: rideStats.reduce((acc, stat) => {
          acc[stat.status.toLowerCase()] = stat._count;
          return acc;
        }, {})
      },
      revenue: {
        total: parseFloat(paymentStats._sum.amount || 0),
        average: parseFloat(paymentStats._avg.amount || 0),
        transactions: paymentStats._count
      },
      drivers: {
        total: driverStats.reduce((sum, stat) => sum + stat._count, 0),
        active: driverStats.find(stat => stat.isActive)?._count || 0,
        inactive: driverStats.find(stat => !stat.isActive)?._count || 0
      },
      dailyData: dailyData.map(row => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        rides: parseInt(row.rides || 0),
        revenue: parseFloat(row.revenue || 0)
      }))
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching company analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/admin/companies/:id/settings - Get company settings for admin
router.get('/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;

    // Get company settings, create defaults if not exists
    let settings = await prisma.company_settings.findUnique({
      where: { companyId: id }
    });

    if (!settings) {
      // Create default settings for company
      settings = await prisma.company_settings.create({
        data: {
          id: createId(),
          companyId: id,
          locationUpdateInterval: 2, // Default 2 seconds
          updatedAt: new Date()
        }
      });
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching company settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch company settings'
    });
  }
});

// PUT /api/admin/companies/:id/settings - Update company settings
router.put('/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    const { locationUpdateInterval, heartbeatInterval, ...otherSettings } = req.body;

    // Validate locationUpdateInterval
    if (locationUpdateInterval !== undefined) {
      if (!Number.isInteger(locationUpdateInterval) || locationUpdateInterval < 1 || locationUpdateInterval > 10) {
        return res.status(400).json({
          success: false,
          error: 'Location update interval must be an integer between 1 and 10 seconds'
        });
      }
    }

    // Validate heartbeatInterval
    if (heartbeatInterval !== undefined) {
      if (!Number.isInteger(heartbeatInterval) || heartbeatInterval < 2 || heartbeatInterval > 300) {
        return res.status(400).json({
          success: false,
          error: 'Heartbeat interval must be an integer between 2 and 300 seconds'
        });
      }
    }

    // Update or create company settings
    const settings = await prisma.company_settings.upsert({
      where: { companyId: id },
      update: {
        locationUpdateInterval,
        heartbeatInterval,
        ...otherSettings,
        updatedAt: new Date()
      },
      create: {
        id: createId(),
        companyId: id,
        locationUpdateInterval: locationUpdateInterval || 2,
        heartbeatInterval: heartbeatInterval || 30,
        ...otherSettings,
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: settings,
      message: 'Company settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating company settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update company settings'
    });
  }
});

module.exports = router;