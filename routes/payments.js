/**
 * Payments API Routes
 * 
 * Handles payment processing via Stripe:
 * - Create Payment Intent
 * - Process payments
 * - Record payment transactions
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const prisma = new PrismaClient();

// ⚠️ IMPORTANT: Replace with your actual Stripe secret key
// Get from: https://dashboard.stripe.com/apikeys
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_KEY_HERE');

/**
 * Create Stripe Payment Intent
 * POST /api/payments/create-intent
 * 
 * Creates a Payment Intent for processing card payments
 * Supports: Card, Card Scan, NFC Tap-to-Pay, Google Pay, Apple Pay
 */
router.post('/create-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, currency, jobId, customerId } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    // Get or create Stripe customer
    let stripeCustomerId;
    
    if (customerId) {
      // Check if customer already has a Stripe ID
      const passenger = await prisma.passenger.findUnique({
        where: { id: customerId },
        select: { stripeCustomerId: true, firstName: true, lastName: true, email: true }
      });

      if (passenger?.stripeCustomerId) {
        stripeCustomerId = passenger.stripeCustomerId;
      } else {
        // Create new Stripe customer
        const stripeCustomer = await stripe.customers.create({
          email: passenger?.email,
          name: `${passenger?.firstName || ''} ${passenger?.lastName || ''}`.trim() || 'Customer',
          metadata: {
            passengerId: customerId,
            jobId: jobId || '',
          }
        });

        stripeCustomerId = stripeCustomer.id;

        // Save Stripe customer ID to database
        await prisma.passenger.update({
          where: { id: customerId },
          data: { stripeCustomerId }
        });
      }
    } else {
      // Create ephemeral customer for anonymous payments
      const stripeCustomer = await stripe.customers.create({
        metadata: {
          jobId: jobId || '',
          anonymous: 'true'
        }
      });
      stripeCustomerId = stripeCustomer.id;
    }

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Amount in cents
      currency: currency || 'nzd',
      customer: stripeCustomerId,
      automatic_payment_methods: {
        enabled: true, // Enables Card, Google Pay, Apple Pay, etc.
      },
          metadata: {
        jobId: jobId || '',
        driverId: req.user?.id || '',
        createdAt: new Date().toISOString(),
      },
    });

    // Create ephemeral key for customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: '2024-12-18.acacia' } // Latest Stripe API version
    );

    console.log('✅ Payment Intent created:', {
      paymentIntentId: paymentIntent.id,
      amount: amount / 100,
      currency,
      jobId,
      customerId: stripeCustomerId
    });

    res.json({
      success: true,
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: stripeCustomerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_YOUR_KEY_HERE'
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment intent'
    });
  }
});

/**
 * Record Payment Transaction
 * POST /api/payments/record
 * 
 * Records payment details after successful payment
 */
router.post('/record', authenticateToken, async (req, res) => {
  try {
    const {
      jobId,
      method,
      amount,
      baseFare,
      extraAmount,
      discountAmount,
      totalMobility,
      adjustmentReason,
      breakdown,
      pauseRecords,
      stripePaymentIntentId
    } = req.body;

    // Create payment record
    const payment = await prisma.payments.create({
      data: {
        jobId,
        amount: parseFloat(amount),
        method,
        status: 'COMPLETED',
        stripePaymentIntentId,
        metadata: {
          baseFare,
          extraAmount,
          discountAmount,
          totalMobility,
          adjustmentReason,
          breakdown,
          pauseRecords,
          recordedAt: new Date().toISOString(),
          driverId: req.user?.id,
        },
      },
    });

    // Update job status to completed with payment
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        finalFare: parseFloat(amount),
        paymentMethod: method,
        paymentStatus: 'PAID',
        completedAt: new Date(),
      },
    });

    console.log('✅ Payment recorded:', {
      paymentId: payment.id,
      jobId,
      amount,
      method
    });

    res.json({
      success: true,
      payment
    });

  } catch (error) {
    console.error('❌ Error recording payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record payment'
    });
  }
});

/**
 * Get Payment History
 * GET /api/payments/history
 * 
 * Retrieves payment history for the authenticated driver
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const payments = await prisma.payments.findMany({
      where: {
        job: {
          driverId: req.user.id
        }
      },
      include: {
        job: {
          select: {
            id: true,
            publicJobId: true,
            pickupAddress: true,
            dropoffAddress: true,
            passenger: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    res.json({
      success: true,
      payments,
      total: payments.length
    });

  } catch (error) {
    console.error('❌ Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payment history'
    });
  }
});

module.exports = router;
