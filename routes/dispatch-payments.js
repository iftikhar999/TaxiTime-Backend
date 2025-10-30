const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getCompanyStripeClient,
} = require('../services/companyStripeService');

const allowedRoles = ['DISPATCHER', 'OWNER', 'COMPANY_ADMIN', 'ADMIN'];

router.use(authenticateToken);
router.use(authorizeRoles(...allowedRoles));

router.get('/config', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { stripe, publicKey } = await getCompanyStripeClient(companyId);

    res.json({
      success: true,
      data: {
        enabled: Boolean(stripe && publicKey),
        publishableKey: publicKey || null,
      },
    });
  } catch (error) {
    console.error('Dispatch stripe config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load payment configuration',
      error: error.message,
    });
  }
});

router.post('/intent', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { amount, currency, description, metadata } = req.body || {};

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount for payment intent',
      });
    }

    const { stripe, publicKey } = await getCompanyStripeClient(companyId);
    if (!stripe || !publicKey) {
      return res.status(400).json({
        success: false,
        message: 'Stripe is not configured for this company',
      });
    }

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { defaultCurrency: true },
    });

    const resolvedCurrency = (currency || settings?.defaultCurrency || 'USD')
      .toLowerCase()
      .trim();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(numericAmount * 100),
      currency: resolvedCurrency,
      automatic_payment_methods: { enabled: true },
      capture_method: 'automatic',
      description: description || 'Dispatch job payment',
      metadata: {
        companyId,
        ...(metadata || {}),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        publishableKey: publicKey,
      },
    });
  } catch (error) {
    console.error('Dispatch payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message,
    });
  }
});

module.exports = router;
