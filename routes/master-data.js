const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { auth: authMiddleware } = require('../middleware/auth');
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
                data = await prisma.country.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.country.count({ where: searchCondition });
                break;

            case 'currencies':
                data = await prisma.currency.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.currency.count({ where: searchCondition });
                break;

            case 'vehicleTypes':
                data = await prisma.vehicleTypeMaster.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.vehicleTypeMaster.count({ where: searchCondition });
                break;

            case 'cities':
                data = await prisma.serviceCity.findMany({
                    where: searchCondition,
                    include: {
                        country: {
                            select: { name: true, code: true }
                        }
                    },
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.serviceCity.count({ where: searchCondition });
                break;

            case 'fareTypes':
                data = await prisma.fareType.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.fareType.count({ where: searchCondition });
                break;

            case 'documents':
                data = await prisma.documentTypeMaster.findMany({
                    where: searchCondition,
                    skip,
                    take,
                    orderBy: { name: 'asc' }
                });
                total = await prisma.documentTypeMaster.count({ where: searchCondition });
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

        let result;

        switch (type) {
            case 'countries':
                result = await prisma.country.create({
                    data: {
                        name: data.name,
                        code: data.code,
                        phoneCode: data.phoneCode,
                        isActive: data.isActive || true
                    }
                });
                break;

            case 'currencies':
                result = await prisma.currency.create({
                    data: {
                        name: data.name,
                        code: data.code,
                        symbol: data.symbol,
                        exchangeRate: data.exchangeRate || 1.0,
                        isActive: data.isActive || true
                    }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicleTypeMaster.create({
                    data: {
                        name: data.name,
                        code: data.code,
                        description: data.description,
                        capacity: data.capacity || 4,
                        icon: data.icon || null,
                        isActive: data.isActive !== false
                    }
                });
                break;

            case 'cities':
                result = await prisma.serviceCity.create({
                    data: {
                        name: data.name,
                        countryId: data.countryId,
                        timezone: data.timezone,
                        isActive: data.isActive || true
                    }
                });
                break;

            case 'fareTypes':
                result = await prisma.fareType.create({
                    data: {
                        name: data.name,
                        description: data.description,
                        multiplier: data.multiplier || 1.0,
                        isActive: data.isActive || true
                    }
                });
                break;

            case 'documents':
                result = await prisma.documentType.create({
                    data: {
                        name: data.name,
                        description: data.description,
                        isRequired: data.isRequired || false,
                        applicableFor: data.applicableFor || 'BOTH', // DRIVER, VEHICLE, BOTH
                        isActive: data.isActive || true
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
                result = await prisma.country.update({
                    where: { id: parseInt(id) },
                    data: {
                        name: data.name,
                        code: data.code,
                        phoneCode: data.phoneCode,
                        isActive: data.isActive
                    }
                });
                break;

            case 'currencies':
                result = await prisma.currency.update({
                    where: { id: parseInt(id) },
                    data: {
                        name: data.name,
                        code: data.code,
                        symbol: data.symbol,
                        exchangeRate: data.exchangeRate,
                        isActive: data.isActive
                    }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicleTypeMaster.update({
                    where: { id },
                    data: {
                        name: data.name,
                        code: data.code,
                        description: data.description,
                        capacity: data.capacity,
                        icon: data.icon,
                        isActive: data.isActive
                    }
                });
                break;

            case 'cities':
                result = await prisma.serviceCity.update({
                    where: { id: parseInt(id) },
                    data: {
                        name: data.name,
                        countryId: data.countryId,
                        timezone: data.timezone,
                        isActive: data.isActive
                    }
                });
                break;

            case 'fareTypes':
                result = await prisma.fareType.update({
                    where: { id: parseInt(id) },
                    data: {
                        name: data.name,
                        description: data.description,
                        multiplier: data.multiplier,
                        isActive: data.isActive
                    }
                });
                break;

            case 'documents':
                result = await prisma.documentType.update({
                    where: { id: parseInt(id) },
                    data: {
                        name: data.name,
                        description: data.description,
                        isRequired: data.isRequired,
                        applicableFor: data.applicableFor,
                        isActive: data.isActive
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
                result = await prisma.country.delete({
                    where: { id: parseInt(id) }
                });
                break;

            case 'currencies':
                result = await prisma.currency.delete({
                    where: { id: parseInt(id) }
                });
                break;

            case 'vehicleTypes':
                result = await prisma.vehicleTypeMaster.delete({
                    where: { id }
                });
                break;

            case 'cities':
                result = await prisma.serviceCity.delete({
                    where: { id: parseInt(id) }
                });
                break;

            case 'fareTypes':
                result = await prisma.fareType.delete({
                    where: { id: parseInt(id) }
                });
                break;

            case 'documents':
                result = await prisma.documentType.delete({
                    where: { id: parseInt(id) }
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
            prisma.country.count({ where: { isActive: true } }),
            prisma.currency.count({ where: { isActive: true } }),
            prisma.vehicleTypeMaster.count({ where: { isActive: true } }),
            prisma.serviceCity.count({ where: { isActive: true } }),
            prisma.fareType.count({ where: { isActive: true } }),
            prisma.documentTypeMaster.count({ where: { isActive: true } })
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