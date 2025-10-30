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

// GET /api/owner/vehicles - Get all company vehicles
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            vehicleType = ''
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build where clause
        const where = {
            companyId: req.companyId
        };

        if (search) {
            where.OR = [
                { make: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { licensePlate: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (status) {
            // Map status to isActive/isAvailable
            if (status.toUpperCase() === 'ACTIVE') {
                where.isActive = true;
                where.isAvailable = true;
            } else if (status.toUpperCase() === 'INACTIVE') {
                where.isActive = false;
            } else if (status.toUpperCase() === 'MAINTENANCE') {
                where.isActive = true;
                where.isAvailable = false;
            }
        }

        if (vehicleType) {
            where.vehicleType = vehicleType.toUpperCase();
        }

        const [vehicleRecords, totalCount] = await Promise.all([
            prisma.vehicle.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.vehicle.count({ where })
        ]);

        // Fetch drivers for all vehicles that have driverId
        const driverIds = vehicleRecords.filter(v => v.driverId).map(v => v.driverId);
        const driversMap = {};
        
        if (driverIds.length > 0) {
            const drivers = await prisma.user.findMany({
                where: {
                    id: { in: driverIds }
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true
                }
            });
            
            drivers.forEach(driver => {
                driversMap[driver.id] = driver;
            });
        }

        // Map vehicles to include backward compatible fields and proper status
        const vehicles = vehicleRecords.map(v => {
            // Determine correct status based on isActive and isAvailable
            let status = 'INACTIVE';
            if (v.isActive && v.isAvailable) {
                status = 'ACTIVE';
            } else if (v.isActive && !v.isAvailable) {
                status = 'MAINTENANCE';
            }

            const driver = v.driverId && driversMap[v.driverId];

            return {
                ...v,
                status,
                driver: driver ? {
                    id: driver.id,
                    name: `${driver.firstName} ${driver.lastName}`,
                    email: driver.email,
                    phone: driver.phone
                } : null,
                registrationNumber: v.registration?.number || '',
                registrationExpiry: v.registration?.expiry || '',
                insuranceExpiry: v.insurance?.expiry || '',
                inspectionExpiry: v.insurance?.inspectionExpiry || '',
                fuelType: v.features?.fuelType || '',
                transmission: v.features?.transmission || ''
            };
        });

        const totalPages = Math.ceil(totalCount / parseInt(limit));

        res.json({
            vehicles,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

// GET /api/owner/vehicles/:id - Get vehicle details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vehicle = await prisma.vehicle.findFirst({
            where: {
                id,
                companyId: req.companyId
            }
        });

        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Fetch driver if assigned
        let driver = null;
        if (vehicle.driverId) {
            driver = await prisma.user.findUnique({
                where: { id: vehicle.driverId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true
                }
            });
        }

        // Determine correct status based on isActive and isAvailable
        let status = 'INACTIVE';
        if (vehicle.isActive && vehicle.isAvailable) {
            status = 'ACTIVE';
        } else if (vehicle.isActive && !vehicle.isAvailable) {
            status = 'MAINTENANCE';
        }

        // Map to include backward compatible fields
        const mappedVehicle = {
            ...vehicle,
            status,
            driver: driver ? {
                id: driver.id,
                name: `${driver.firstName} ${driver.lastName}`,
                email: driver.email,
                phone: driver.phone
            } : null,
            registrationNumber: vehicle.registration?.number || '',
            registrationExpiry: vehicle.registration?.expiry || '',
            insuranceExpiry: vehicle.insurance?.expiry || '',
            inspectionExpiry: vehicle.insurance?.inspectionExpiry || '',
            fuelType: vehicle.features?.fuelType || '',
            transmission: vehicle.features?.transmission || ''
        };

        res.json(mappedVehicle);
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle details' });
    }
});

// POST /api/owner/vehicles - Add new vehicle
router.post('/', async (req, res) => {
    try {
        const {
            make,
            model,
            year,
            color,
            licensePlate,
            registrationNumber,
            vehicleType,
            capacity,
            fuelType,
            transmission,
            features,
            registrationExpiry,
            insuranceExpiry,
            inspectionExpiry,
            status = 'ACTIVE',
            driverId
        } = req.body;

        // Validate required fields
        if (!make || !model || !year || !licensePlate || !vehicleType) {
            return res.status(400).json({
                error: 'Missing required fields: make, model, year, licensePlate, vehicleType'
            });
        }

        // Check if license plate already exists in this company
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                licensePlate,
                companyId: req.companyId
            }
        });

        if (existingVehicle) {
            return res.status(400).json({
                error: 'A vehicle with this license plate already exists in your company'
            });
        }

        // Prepare features JSON object (for fuelType and transmission)
        const featuresData = {};
        if (fuelType && fuelType !== '') {
            featuresData.fuelType = fuelType;
        }
        if (transmission && transmission !== '') {
            featuresData.transmission = transmission;
        }
        if (features && typeof features === 'object') {
            Object.assign(featuresData, features);
        }

        // Prepare registration JSON object
        const registrationData = {};
        if (registrationNumber && registrationNumber !== '') {
            registrationData.number = registrationNumber;
        }
        if (registrationExpiry && registrationExpiry !== '') {
            registrationData.expiry = registrationExpiry;
        }

        // Prepare insurance JSON object (for insuranceExpiry and inspectionExpiry)
        const insuranceData = {};
        if (insuranceExpiry && insuranceExpiry !== '') {
            insuranceData.expiry = insuranceExpiry;
        }
        if (inspectionExpiry && inspectionExpiry !== '') {
            insuranceData.inspectionExpiry = inspectionExpiry;
        }

        const vehicle = await prisma.vehicle.create({
            data: {
                make,
                model,
                year: parseInt(year),
                color,
                licensePlate,
                vehicleType: vehicleType.toUpperCase(),
                capacity: capacity ? parseInt(capacity) : 4,
                features: Object.keys(featuresData).length > 0 ? featuresData : null,
                registration: Object.keys(registrationData).length > 0 ? registrationData : null,
                insurance: Object.keys(insuranceData).length > 0 ? insuranceData : null,
                companyId: req.companyId,
                driverId: driverId && driverId !== '' ? driverId : null,
                isActive: status ? status.toUpperCase() !== 'INACTIVE' : true,
                isAvailable: status ? status.toUpperCase() === 'ACTIVE' : true
            }
        });

        // Fetch driver if assigned
        let driver = null;
        if (vehicle.driverId) {
            driver = await prisma.user.findUnique({
                where: { id: vehicle.driverId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true
                }
            });
        }

        // Determine correct status
        let vehicleStatus = 'INACTIVE';
        if (vehicle.isActive && vehicle.isAvailable) {
            vehicleStatus = 'ACTIVE';
        } else if (vehicle.isActive && !vehicle.isAvailable) {
            vehicleStatus = 'MAINTENANCE';
        }

        res.status(201).json({
            message: 'Vehicle added successfully',
            vehicle: {
                ...vehicle,
                status: vehicleStatus,
                driver: driver ? {
                    id: driver.id,
                    name: `${driver.firstName} ${driver.lastName}`,
                    email: driver.email,
                    phone: driver.phone
                } : null,
                registrationNumber: vehicle.registration?.number || '',
                registrationExpiry: vehicle.registration?.expiry || '',
                insuranceExpiry: vehicle.insurance?.expiry || '',
                inspectionExpiry: vehicle.insurance?.inspectionExpiry || '',
                fuelType: vehicle.features?.fuelType || '',
                transmission: vehicle.features?.transmission || ''
            }
        });
    } catch (error) {
        console.error('Error adding vehicle:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'License plate must be unique' });
        } else {
            res.status(500).json({ error: 'Failed to add vehicle' });
        }
    }
});

// PUT /api/owner/vehicles/:id - Update vehicle
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            make,
            model,
            year,
            color,
            licensePlate,
            registrationNumber,
            vehicleType,
            capacity,
            fuelType,
            transmission,
            features,
            registrationExpiry,
            insuranceExpiry,
            inspectionExpiry,
            status,
            driverId
        } = req.body;

        // Check if vehicle belongs to this company
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                id,
                companyId: req.companyId
            }
        });

        if (!existingVehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Check license plate uniqueness if it's being changed
        if (licensePlate && licensePlate !== existingVehicle.licensePlate) {
            const duplicateVehicle = await prisma.vehicle.findFirst({
                where: {
                    licensePlate,
                    companyId: req.companyId,
                    id: { not: id }
                }
            });

            if (duplicateVehicle) {
                return res.status(400).json({
                    error: 'A vehicle with this license plate already exists in your company'
                });
            }
        }

        // Prepare update data
        const updateData = {
            updatedAt: new Date()
        };

        if (make) updateData.make = make;
        if (model) updateData.model = model;
        if (year) updateData.year = parseInt(year);
        if (color) updateData.color = color;
        if (licensePlate) updateData.licensePlate = licensePlate;
        if (vehicleType) updateData.vehicleType = vehicleType.toUpperCase();
        if (capacity !== undefined) updateData.capacity = capacity ? parseInt(capacity) : 4;
        
        // Handle driverId
        if (driverId !== undefined) {
            updateData.driverId = driverId && driverId !== '' ? driverId : null;
        }

        // Handle status
        if (status !== undefined) {
            updateData.isActive = status.toUpperCase() !== 'INACTIVE';
            updateData.isAvailable = status.toUpperCase() === 'ACTIVE';
        }

        // Prepare features JSON update (for fuelType and transmission)
        if (fuelType !== undefined || transmission !== undefined || features !== undefined) {
            const featuresData = existingVehicle.features || {};
            if (fuelType !== undefined && fuelType !== '') {
                featuresData.fuelType = fuelType;
            }
            if (transmission !== undefined && transmission !== '') {
                featuresData.transmission = transmission;
            }
            if (features !== undefined && typeof features === 'object') {
                Object.assign(featuresData, features);
            }
            updateData.features = Object.keys(featuresData).length > 0 ? featuresData : null;
        }

        // Prepare registration JSON update
        if (registrationNumber !== undefined || registrationExpiry !== undefined) {
            const registrationData = existingVehicle.registration || {};
            if (registrationNumber !== undefined && registrationNumber !== '') {
                registrationData.number = registrationNumber;
            }
            if (registrationExpiry !== undefined && registrationExpiry !== '') {
                registrationData.expiry = registrationExpiry;
            } else if (registrationExpiry === '') {
                delete registrationData.expiry;
            }
            updateData.registration = Object.keys(registrationData).length > 0 ? registrationData : null;
        }

        // Prepare insurance JSON update (for insuranceExpiry and inspectionExpiry)
        if (insuranceExpiry !== undefined || inspectionExpiry !== undefined) {
            const insuranceData = existingVehicle.insurance || {};
            if (insuranceExpiry !== undefined && insuranceExpiry !== '') {
                insuranceData.expiry = insuranceExpiry;
            } else if (insuranceExpiry === '') {
                delete insuranceData.expiry;
            }
            if (inspectionExpiry !== undefined && inspectionExpiry !== '') {
                insuranceData.inspectionExpiry = inspectionExpiry;
            } else if (inspectionExpiry === '') {
                delete insuranceData.inspectionExpiry;
            }
            updateData.insurance = Object.keys(insuranceData).length > 0 ? insuranceData : null;
        }

        const updatedVehicle = await prisma.vehicle.update({
            where: { id },
            data: updateData
        });

        // Fetch driver if assigned
        let driver = null;
        if (updatedVehicle.driverId) {
            driver = await prisma.user.findUnique({
                where: { id: updatedVehicle.driverId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true
                }
            });
        }

        // Determine correct status
        let vehicleStatus = 'INACTIVE';
        if (updatedVehicle.isActive && updatedVehicle.isAvailable) {
            vehicleStatus = 'ACTIVE';
        } else if (updatedVehicle.isActive && !updatedVehicle.isAvailable) {
            vehicleStatus = 'MAINTENANCE';
        }

        res.json({
            message: 'Vehicle updated successfully',
            vehicle: {
                ...updatedVehicle,
                status: vehicleStatus,
                driver: driver ? {
                    id: driver.id,
                    name: `${driver.firstName} ${driver.lastName}`,
                    email: driver.email,
                    phone: driver.phone
                } : null,
                registrationNumber: updatedVehicle.registration?.number || '',
                registrationExpiry: updatedVehicle.registration?.expiry || '',
                insuranceExpiry: updatedVehicle.insurance?.expiry || '',
                inspectionExpiry: updatedVehicle.insurance?.inspectionExpiry || '',
                fuelType: updatedVehicle.features?.fuelType || '',
                transmission: updatedVehicle.features?.transmission || ''
            }
        });
    } catch (error) {
        console.error('Error updating vehicle:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'License plate must be unique' });
        } else {
            res.status(500).json({ error: 'Failed to update vehicle' });
        }
    }
});

// PATCH /api/owner/vehicles/:id/status - Update vehicle status
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Check if vehicle belongs to this company
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                id,
                companyId: req.companyId
            }
        });

        if (!existingVehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        const normalizedStatus = status.toUpperCase();

        const statusUpdate = {
            updatedAt: new Date(),
            isActive: ['ACTIVE', 'MAINTENANCE'].includes(normalizedStatus),
            isAvailable: normalizedStatus === 'ACTIVE'
        };

        const updatedVehicle = await prisma.vehicle.update({
            where: { id },
            data: statusUpdate
        });

        res.json({
            message: 'Vehicle status updated successfully',
            vehicle: {
                ...updatedVehicle,
                status: normalizedStatus
            }
        });
    } catch (error) {
        console.error('Error updating vehicle status:', error);
        res.status(500).json({ error: 'Failed to update vehicle status' });
    }
});

// DELETE /api/owner/vehicles/:id - Delete vehicle
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if vehicle belongs to this company
        const existingVehicle = await prisma.vehicle.findFirst({
            where: {
                id,
                companyId: req.companyId
            }
        });

        if (!existingVehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Check if vehicle is currently assigned to any active jobs
        const activeJobs = await prisma.job.findFirst({
            where: {
                vehicleId: id,
                status: { in: ['PENDING', 'ACCEPTED', 'PICKING_UP', 'IN_PROGRESS'] }
            }
        });

        if (activeJobs) {
            return res.status(400).json({
                error: 'Cannot delete vehicle that is assigned to active jobs'
            });
        }

        await prisma.vehicle.delete({
            where: { id }
        });

        res.json({
            message: 'Vehicle deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        res.status(500).json({ error: 'Failed to delete vehicle' });
    }
});

module.exports = router;