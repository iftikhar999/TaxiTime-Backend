const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PrismaClient, CompanyDocumentType } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

const STORAGE_ROOT = process.env.COMPANY_DOCUMENTS_PATH || path.join(__dirname, '..', 'uploads', 'company-documents');

// Ensure storage directory exists
fs.mkdirSync(STORAGE_ROOT, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, STORAGE_ROOT);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, `${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.COMPANY_DOCUMENT_MAX_SIZE || 10 * 1024 * 1024, 10) // default 10MB
    }
});

// Restrict to owners and company admins
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
            return res.status(403).json({ error: 'User not associated with a company' });
        }

        next();
    } catch (error) {
        console.error('Company scope error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(scopeToCompany);

// GET /api/owner/company/documents - list company documents
router.get('/', async (req, res) => {
    try {
        const documents = await prisma.companyDocument.findMany({
            where: { companyId: req.companyId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            documents,
            metadata: {
                count: documents.length
            }
        });
    } catch (error) {
        console.error('Error fetching company documents:', error);
        res.status(500).json({ error: 'Failed to fetch company documents' });
    }
});

router.get('/types', (req, res) => {
    res.json({
        types: Object.values(CompanyDocumentType)
    });
});

// POST /api/owner/company/documents - upload new document
router.post('/', upload.single('file'), async (req, res) => {
    try {
        const { type, description, expiresAt } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'Document file is required' });
        }

        if (!type) {
            return res.status(400).json({ error: 'Document type is required' });
        }

        if (!Object.values(CompanyDocumentType).includes(type)) {
            return res.status(400).json({ error: 'Invalid document type' });
        }

        const document = await prisma.companyDocument.create({
            data: {
                companyId: req.companyId,
                type,
                description: description || null,
                fileName: req.file.originalname,
                fileUrl: `/uploads/company-documents/${req.file.filename}`,
                storagePath: req.file.path,
                fileSize: req.file.size,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                uploadedById: req.user.id,
                status: 'PENDING'
            }
        });

        res.status(201).json({
            message: 'Document uploaded successfully',
            document
        });
    } catch (error) {
        console.error('Error uploading company document:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

// DELETE /api/owner/company/documents/:id - remove document
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const document = await prisma.companyDocument.findFirst({
            where: {
                id,
                companyId: req.companyId
            }
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete file from storage if exists
        if (document.storagePath) {
            fs.promises.unlink(document.storagePath).catch((error) => {
                if (error.code !== 'ENOENT') {
                    console.warn('Failed to delete document file:', error.message);
                }
            });
        }

        await prisma.companyDocument.delete({ where: { id } });

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting company document:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

module.exports = router;
