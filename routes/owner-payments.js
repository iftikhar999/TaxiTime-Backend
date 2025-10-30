const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { encrypt, decrypt } = require('../lib/crypto');
const {
  clearCompanyStripeCache,
} = require('../services/companyStripeService');

router.use(authenticateToken);
router.use(authorizeRoles('OWNER', 'ADMIN', 'COMPANY_ADMIN'));

const sanitizeKey = (key) => (key || '').trim();

router.get('/stripe', async (req, res) => {
  try {
    const { companyId } = req.user;

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: {
        stripePublicKey: true,
        stripeSecretKey: true,
      },
    });

    if (!settings) {
      return res.json({
        success: true,
        data: {
          enabled: false,
          publicKey: null,
          hasSecretKey: false,
        },
      });
    }

    res.json({
      success: true,
      data: {
        enabled: Boolean(settings.stripePublicKey && settings.stripeSecretKey),
        publicKey: settings.stripePublicKey
          ? decrypt(settings.stripePublicKey)
          : null,
        hasSecretKey: Boolean(settings.stripeSecretKey),
      },
    });
  } catch (error) {
    console.error('Get stripe settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load Stripe configuration',
      error: error.message,
    });
  }
});

router.put('/stripe', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { publicKey, secretKey } = req.body || {};

    const sanitizedPublicKey = sanitizeKey(publicKey);
    const sanitizedSecretKey = sanitizeKey(secretKey);

    if (!sanitizedPublicKey || !sanitizedSecretKey) {
      return res.status(400).json({
        success: false,
        message: 'Stripe public and secret keys are required',
      });
    }

    if (!sanitizedPublicKey.startsWith('pk_')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Stripe publishable key',
      });
    }

    if (!sanitizedSecretKey.startsWith('sk_')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Stripe secret key',
      });
    }

    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      update: {
        stripePublicKey: encrypt(sanitizedPublicKey),
        stripeSecretKey: encrypt(sanitizedSecretKey),
      },
      create: {
        companyId,
        stripePublicKey: encrypt(sanitizedPublicKey),
        stripeSecretKey: encrypt(sanitizedSecretKey),
      },
      select: {
        stripePublicKey: true,
        stripeSecretKey: true,
      },
    });

    res.json({
      success: true,
      message: 'Stripe keys saved successfully',
      data: {
        enabled: true,
        publicKey: decrypt(settings.stripePublicKey),
        hasSecretKey: Boolean(settings.stripeSecretKey),
      },
    });
    clearCompanyStripeCache(companyId);
  } catch (error) {
    console.error('Update stripe settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Stripe configuration',
      error: error.message,
    });
  }
});

router.delete('/stripe', async (req, res) => {
  try {
    const { companyId } = req.user;

    await prisma.companySettings.update({
      where: { companyId },
      data: {
        stripePublicKey: null,
        stripeSecretKey: null,
      },
    });

    res.json({
      success: true,
      message: 'Stripe keys removed successfully',
    });
    clearCompanyStripeCache(companyId);
  } catch (error) {
    console.error('Delete stripe settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove Stripe configuration',
      error: error.message,
    });
  }
});

module.exports = router;
