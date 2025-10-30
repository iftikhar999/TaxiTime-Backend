const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get global configurations (Super Admin only)
router.get('/global', auth, authorize(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { category, key } = req.query;
    
    let where = { isActive: true };
    if (category) where.category = category;
    if (key) where.key = key;

    const configurations = await prisma.globalConfiguration.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { displayName: 'asc' }
      ]
    });

    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error fetching global configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global configurations',
      error: error.message
    });
  }
});

// Create or update global configuration (Super Admin only)
router.post('/global', auth, authorize(['SUPER_ADMIN']), async (req, res) => {
  try {
    const {
      key,
      category,
      displayName,
      description,
      dataType,
      value,
      isActive = true
    } = req.body;

    if (!key || !category || !displayName || !dataType || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: key, category, displayName, dataType, value'
      });
    }

    // Check if configuration already exists
    const existing = await prisma.globalConfiguration.findUnique({
      where: { key }
    });

    let configuration;
    if (existing) {
      // Update existing
      configuration = await prisma.globalConfiguration.update({
        where: { key },
        data: {
          category,
          displayName,
          description,
          dataType,
          value,
          isActive,
          lastUpdatedBy: req.user.id,
          version: { increment: 1 }
        }
      });
    } else {
      // Create new
      configuration = await prisma.globalConfiguration.create({
        data: {
          key,
          category,
          displayName,
          description,
          dataType,
          value,
          isActive,
          createdBy: req.user.id,
          lastUpdatedBy: req.user.id
        }
      });
    }

    res.json({
      success: true,
      message: existing ? 'Global configuration updated' : 'Global configuration created',
      data: configuration
    });
  } catch (error) {
    console.error('Error saving global configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save global configuration',
      error: error.message
    });
  }
});

// Get company-specific configurations
router.get('/company/:companyId', auth, authorize(['SUPER_ADMIN', 'OWNER', 'DISPATCHER']), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { category, key } = req.query;

    // Check if user has access to this company
    if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId !== companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company\'s configurations'
      });
    }

    let where = { 
      companyId,
      isActive: true 
    };
    if (category) where.category = category;
    if (key) where.key = key;

    const companyConfigs = await prisma.companyConfiguration.findMany({
      where,
      include: {
        globalConfig: true
      },
      orderBy: [
        { category: 'asc' },
        { displayName: 'asc' }
      ]
    });

    // For configurations that inherit from global, merge the values
    const mergedConfigs = companyConfigs.map(config => {
      if (config.inheritFromGlobal && config.globalConfig) {
        return {
          ...config,
          effectiveValue: config.globalConfig.value,
          source: 'global'
        };
      }
      return {
        ...config,
        effectiveValue: config.value,
        source: 'company'
      };
    });

    // Also get global configurations that don't have company overrides
    const globalConfigs = await prisma.globalConfiguration.findMany({
      where: {
        isActive: true,
        ...(category && { category }),
        ...(key && { key }),
        // Only include globals that don't have company overrides
        key: {
          notIn: companyConfigs.map(c => c.key)
        }
      }
    });

    // Add global configs as inherited
    const inheritedConfigs = globalConfigs.map(config => ({
      id: `global_${config.id}`,
      companyId,
      globalConfigId: config.id,
      key: config.key,
      category: config.category,
      displayName: config.displayName,
      description: config.description,
      dataType: config.dataType,
      value: null,
      inheritFromGlobal: true,
      isActive: true,
      globalConfig: config,
      effectiveValue: config.value,
      source: 'global'
    }));

    const allConfigs = [...mergedConfigs, ...inheritedConfigs];

    res.json({
      success: true,
      data: allConfigs
    });
  } catch (error) {
    console.error('Error fetching company configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company configurations',
      error: error.message
    });
  }
});

// Create or update company configuration
router.post('/company/:companyId', auth, authorize(['SUPER_ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      key,
      category,
      displayName,
      description,
      dataType,
      value,
      inheritFromGlobal = false,
      globalConfigId,
      isActive = true
    } = req.body;

    // Check if user has access to this company
    if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId !== companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to modify this company\'s configurations'
      });
    }

    if (!key || !category || !displayName || !dataType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: key, category, displayName, dataType'
      });
    }

    // If inheriting from global, value can be null
    if (!inheritFromGlobal && value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Value is required when not inheriting from global'
      });
    }

    // Check if configuration already exists for this company
    const existing = await prisma.companyConfiguration.findUnique({
      where: {
        companyId_key: {
          companyId,
          key
        }
      }
    });

    let configuration;
    if (existing) {
      // Update existing
      configuration = await prisma.companyConfiguration.update({
        where: {
          companyId_key: {
            companyId,
            key
          }
        },
        data: {
          category,
          displayName,
          description,
          dataType,
          value: inheritFromGlobal ? null : value,
          inheritFromGlobal,
          globalConfigId,
          isActive,
          lastUpdatedBy: req.user.id,
          version: { increment: 1 }
        },
        include: {
          globalConfig: true
        }
      });
    } else {
      // Create new
      configuration = await prisma.companyConfiguration.create({
        data: {
          companyId,
          key,
          category,
          displayName,
          description,
          dataType,
          value: inheritFromGlobal ? null : value,
          inheritFromGlobal,
          globalConfigId,
          isActive,
          createdBy: req.user.id,
          lastUpdatedBy: req.user.id
        },
        include: {
          globalConfig: true
        }
      });
    }

    res.json({
      success: true,
      message: existing ? 'Company configuration updated' : 'Company configuration created',
      data: configuration
    });
  } catch (error) {
    console.error('Error saving company configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save company configuration',
      error: error.message
    });
  }
});

// Get effective configuration (merged global + company overrides)
router.get('/effective/:companyId', auth, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { keys } = req.query; // Optional comma-separated list of keys

    // Check if user has access to this company (or is accessing own company)
    if (req.user.role !== 'SUPER_ADMIN' && 
        req.user.companyId !== companyId && 
        !['OWNER', 'DISPATCHER', 'DRIVER'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company\'s configurations'
      });
    }

    let keyFilter = {};
    if (keys) {
      keyFilter = { key: { in: keys.split(',') } };
    }

    // Get all global configurations
    const globalConfigs = await prisma.globalConfiguration.findMany({
      where: {
        isActive: true,
        ...keyFilter
      }
    });

    // Get company overrides
    const companyConfigs = await prisma.companyConfiguration.findMany({
      where: {
        companyId,
        isActive: true,
        ...keyFilter
      },
      include: {
        globalConfig: true
      }
    });

    // Build effective configuration
    const effectiveConfig = {};
    
    // Start with global configs
    globalConfigs.forEach(config => {
      effectiveConfig[config.key] = {
        key: config.key,
        category: config.category,
        displayName: config.displayName,
        description: config.description,
        dataType: config.dataType,
        value: config.value,
        source: 'global',
        version: config.version
      };
    });

    // Override with company-specific configs
    companyConfigs.forEach(config => {
      if (config.inheritFromGlobal && config.globalConfig) {
        // Use global value but mark as company-inherited
        effectiveConfig[config.key] = {
          key: config.key,
          category: config.category,
          displayName: config.displayName,
          description: config.description,
          dataType: config.dataType,
          value: config.globalConfig.value,
          source: 'global',
          inheritedBy: 'company',
          version: config.version
        };
      } else {
        // Use company-specific value
        effectiveConfig[config.key] = {
          key: config.key,
          category: config.category,
          displayName: config.displayName,
          description: config.description,
          dataType: config.dataType,
          value: config.value,
          source: 'company',
          version: config.version
        };
      }
    });

    res.json({
      success: true,
      data: effectiveConfig
    });
  } catch (error) {
    console.error('Error fetching effective configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch effective configuration',
      error: error.message
    });
  }
});

// Delete global configuration (Super Admin only)
router.delete('/global/:key', auth, authorize(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { key } = req.params;

    const configuration = await prisma.globalConfiguration.findUnique({
      where: { key }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        message: 'Global configuration not found'
      });
    }

    // Soft delete by setting isActive to false
    await prisma.globalConfiguration.update({
      where: { key },
      data: {
        isActive: false,
        lastUpdatedBy: req.user.id,
        version: { increment: 1 }
      }
    });

    res.json({
      success: true,
      message: 'Global configuration deleted'
    });
  } catch (error) {
    console.error('Error deleting global configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete global configuration',
      error: error.message
    });
  }
});

// Delete company configuration
router.delete('/company/:companyId/:key', auth, authorize(['SUPER_ADMIN', 'OWNER']), async (req, res) => {
  try {
    const { companyId, key } = req.params;

    // Check if user has access to this company
    if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId !== companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to modify this company\'s configurations'
      });
    }

    const configuration = await prisma.companyConfiguration.findUnique({
      where: {
        companyId_key: {
          companyId,
          key
        }
      }
    });

    if (!configuration) {
      return res.status(404).json({
        success: false,
        message: 'Company configuration not found'
      });
    }

    // Soft delete by setting isActive to false
    await prisma.companyConfiguration.update({
      where: {
        companyId_key: {
          companyId,
          key
        }
      },
      data: {
        isActive: false,
        lastUpdatedBy: req.user.id,
        version: { increment: 1 }
      }
    });

    res.json({
      success: true,
      message: 'Company configuration deleted'
    });
  } catch (error) {
    console.error('Error deleting company configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete company configuration',
      error: error.message
    });
  }
});

// Get configuration categories
router.get('/categories', auth, async (req, res) => {
  try {
    const globalCategories = await prisma.globalConfiguration.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category']
    });

    const companyCategories = await prisma.companyConfiguration.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category']
    });

    const allCategories = [
      ...new Set([
        ...globalCategories.map(c => c.category),
        ...companyCategories.map(c => c.category)
      ])
    ].sort();

    res.json({
      success: true,
      data: allCategories
    });
  } catch (error) {
    console.error('Error fetching configuration categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configuration categories',
      error: error.message
    });
  }
});

module.exports = router;