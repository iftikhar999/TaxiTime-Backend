const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { auth: authMiddleware } = require('../middleware/auth');
const { createId } = require('@paralleldrive/cuid2');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

// Configure multer for SVG uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../shared/assets/vehicle-icons');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        // Generate a safe filename: lowercase, replace spaces with hyphens
        const safeName = file.originalname.toLowerCase().replace(/\s+/g, '-');
        const timestamp = Date.now();
        const filename = `${timestamp}-${safeName}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept SVG files only
    if (file.mimetype === 'image/svg+xml' || path.extname(file.originalname).toLowerCase() === '.svg') {
        cb(null, true);
    } else {
        cb(new Error('Only SVG files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 // 1MB limit
    }
});

// Apply auth middleware to all routes
// router.use(authMiddleware); // Temporarily disabled for testing

// Get master data by type
router.get('/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { page = 1, limit = 50, search } = req.query;

        let data = [];
        let total = 0;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const searchCondition = search ? {
            name: { contains: search, mode: 'insensitive' }
        } : {};

        switch (type) {
            case 'countries':
                data = await prisma.countries.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.countries.count({ where: searchCondition });
                break;

            case 'currencies':
                data = await prisma.currencies.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.currencies.count({ where: searchCondition });
                break;

            case 'vehicleTypes':
                data = await prisma.vehicle_types.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.vehicle_types.count({ where: searchCondition });
                break;

            case 'cities':
                data = await prisma.service_cities.findMany({
                    where: searchCondition,
                    include: {
                        countries: {
                            select: { name: true, code: true }
                        }
                    },
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.service_cities.count({ where: searchCondition });
                break;

            case 'fareTypes':
                data = await prisma.fare_types.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.fare_types.count({ where: searchCondition });
                break;

            case 'documents':
                data = await prisma.document_types.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.document_types.count({ where: searchCondition });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid master data type'
                });
        }

        res.json({
            success: true,
            data,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching master data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch master data',
            error: error.message
        });
    }
});

// Create new master data entry
router.post('/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const data = req.body;

        // Validate required fields based on type
        if (type === 'cities' && !data.code) {
            return res.status(400).json({
                success: false,
                message: 'City code is required'
            });
        }

        let result;

        switch (type) {
            case 'countries':
                result = await prisma.countries.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        code: data.code,
                        phoneCode: data.phoneCode,
                        isActive: data.isActive || true,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'currencies':
                result = await prisma.currencies.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        code: data.code,
                        symbol: data.symbol,
                        decimalPlaces: data.decimalPlaces || 2,
                        isActive: data.isActive || true,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicle_types.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        code: data.code,
                        description: data.description,
                        capacity: data.capacity || 4,
                        icon: data.icon || null,
                        isActive: data.isActive !== false,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'cities':
                result = await prisma.service_cities.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        code: data.code,
                        countryId: data.countryId,
                        state: data.state || null,
                        timezone: data.timezone || 'UTC',
                        latitude: data.latitude || null,
                        longitude: data.longitude || null,
                        isActive: data.isActive || true,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'fareTypes':
                result = await prisma.fare_types.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        description: data.description,
                        multiplier: data.multiplier || 1.0,
                        isActive: data.isActive || true,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'documents':
                result = await prisma.document_types.create({
                    data: {
                        id: createId(),
                        name: data.name,
                        description: data.description,
                        isRequired: data.isRequired || false,
                        applicableFor: data.applicableFor || 'BOTH', // DRIVER, VEHICLE, BOTH
                        isActive: data.isActive || true,
                        updatedAt: new Date()
                    }
                });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid master data type'
                });
        }

        res.status(201).json({
            success: true,
            message: 'Master data created successfully',
            data: result
        });

    } catch (error) {
        console.error('Error creating master data:', error);
        
        // Handle unique constraint violations
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0] || 'field';
            return res.status(409).json({
                success: false,
                message: `A record with this ${field} already exists`,
                error: `Duplicate ${field}`
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to create master data',
            error: error.message
        });
    }
});

// Update master data entry
router.put('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const data = req.body;

        let result;

        switch (type) {
            case 'countries':
                result = await prisma.countries.update({
                    where: { id },
                    data: {
                        name: data.name,
                        code: data.code,
                        phoneCode: data.phoneCode,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'currencies':
                result = await prisma.currencies.update({
                    where: { id },
                    data: {
                        name: data.name,
                        code: data.code,
                        symbol: data.symbol,
                        decimalPlaces: data.decimalPlaces,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicle_types.update({
                    where: { id },
                    data: {
                        name: data.name,
                        code: data.code,
                        description: data.description,
                        capacity: data.capacity,
                        icon: data.icon,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'cities':
                result = await prisma.service_cities.update({
                    where: { id },
                    data: {
                        name: data.name,
                        code: data.code,
                        countryId: data.countryId,
                        state: data.state,
                        timezone: data.timezone,
                        latitude: data.latitude,
                        longitude: data.longitude,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'fareTypes':
                result = await prisma.fare_types.update({
                    where: { id },
                    data: {
                        name: data.name,
                        description: data.description,
                        multiplier: data.multiplier,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            case 'documents':
                result = await prisma.document_types.update({
                    where: { id },
                    data: {
                        name: data.name,
                        description: data.description,
                        isRequired: data.isRequired,
                        applicableFor: data.applicableFor,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid master data type'
                });
        }

        res.json({
            success: true,
            message: 'Master data updated successfully',
            data: result
        });

    } catch (error) {
        console.error('Error updating master data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update master data',
            error: error.message
        });
    }
});

// Delete master data entry
router.delete('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        let result;

        switch (type) {
            case 'countries':
                result = await prisma.countries.delete({
                    where: { id }
                });
                break;

            case 'currencies':
                result = await prisma.currencies.delete({
                    where: { id }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicle_types.delete({
                    where: { id }
                });
                break;

            case 'cities':
                result = await prisma.service_cities.delete({
                    where: { id }
                });
                break;

            case 'fareTypes':
                result = await prisma.fare_types.delete({
                    where: { id }
                });
                break;

            case 'documents':
                result = await prisma.document_types.delete({
                    where: { id }
                });
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid master data type'
                });
        }

        res.json({
            success: true,
            message: 'Master data deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting master data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete master data',
            error: error.message
        });
    }
});

// Upload SVG icon for vehicle type
router.post('/vehicleTypes/upload-icon', upload.single('icon'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Return the file path that will be stored in the database
        const iconPath = `/shared/assets/vehicle-icons/${req.file.filename}`;

        res.json({
            success: true,
            message: 'Icon uploaded successfully',
            data: {
                filename: req.file.filename,
                path: iconPath,
                url: iconPath // URL to access the file
            }
        });

    } catch (error) {
        console.error('Error uploading icon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload icon',
            error: error.message
        });
    }
});

// Delete SVG icon file
router.delete('/vehicleTypes/delete-icon/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../shared/assets/vehicle-icons', filename);

        try {
            await fs.unlink(filePath);
            res.json({
                success: true,
                message: 'Icon deleted successfully'
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({
                    success: false,
                    message: 'Icon file not found'
                });
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error('Error deleting icon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete icon',
            error: error.message
        });
    }
});

// Get statistics for dashboard
router.get('/stats/overview', async (req, res) => {
    try {
        const stats = await Promise.all([
            prisma.countries.count({ where: { isActive: true } }),
            prisma.currencies.count({ where: { isActive: true } }),
            prisma.vehicle_types.count({ where: { isActive: true } }),
            prisma.service_cities.count({ where: { isActive: true } }),
            prisma.fare_types.count({ where: { isActive: true } }),
            prisma.document_types.count({ where: { isActive: true } })
        ]);

        res.json({
            success: true,
            data: {
                countries: stats[0],
                currencies: stats[1],
                vehicleTypes: stats[2],
                cities: stats[3],
                fareTypes: stats[4],
                documentTypes: stats[5]
            }
        });

    } catch (error) {
        console.error('Error fetching master data stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

module.exports = router;