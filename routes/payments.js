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
const { randomUUID } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * GET /api/payments/config
 * Returns the Stripe publishable key so mobile clients can init StripeProvider
 * without hardcoding. Safe to call without auth (publishable keys are public).
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

/**
 * GET /api/payments/methods
 * List the current user's saved Stripe payment methods (cards). The Stripe
 * customer ID is cached in user.preferences.stripeCustomerId on first use.
 */
router.get('/methods', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });
    const stripeCustomerId = user?.preferences?.stripeCustomerId;
    if (!stripeCustomerId) {
      // No Stripe customer yet → nothing saved
      return res.json({ success: true, data: [] });
    }
    const list = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
    });
    const cards = (list.data || []).map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      funding: pm.card?.funding,
      createdAt: new Date(pm.created * 1000).toISOString(),
    }));
    res.json({ success: true, data: cards });
  } catch (err) {
    console.error('[payments.methods] list error:', err?.message);
    res.status(500).json({ success: false, error: err?.message || 'Failed to list payment methods' });
  }
});

/**
 * POST /api/payments/setup-intent
 * Create a Stripe SetupIntent so the mobile app can capture + save a card
 * WITHOUT ever seeing the raw PAN / CVC. The app passes `setupIntentClientSecret`
 * into Stripe's PaymentSheet (init with `setupIntentClientSecret`) — Stripe's
 * UI tokenizes the card and attaches it to the user's Stripe customer.
 *
 * Flow:
 *   1. App → POST /setup-intent             (this endpoint)
 *   2. App → initPaymentSheet({ setupIntent: clientSecret, ephemeralKey, customer })
 *   3. App → presentPaymentSheet()          (user enters card in Stripe UI)
 *   4. Card is attached to the customer     (available via GET /methods next time)
 */
router.post('/setup-intent', authenticateToken, async (req, res) => {
  try {
    // Get or create the Stripe customer for this user
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, preferences: true },
    });
    let stripeCustomerId = user?.preferences?.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user?.email || undefined,
        name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Customer',
        phone: user?.phone || undefined,
        metadata: { userId: user.id },
      });
      stripeCustomerId = stripeCustomer.id;
      const prefs = (typeof user?.preferences === 'object' && user.preferences) ? user.preferences : {};
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: { ...prefs, stripeCustomerId } },
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session', // so we can charge them later without re-auth
    });

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: '2024-12-18.acacia' },
    );

    res.json({
      success: true,
      setupIntent: setupIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: stripeCustomerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    console.error('[payments.setup-intent] error:', err?.message);
    res.status(500).json({ success: false, error: err?.message || 'Failed to create setup intent' });
  }
});

/**
 * DELETE /api/payments/methods/:id
 * Detach a saved card from the user's Stripe customer.
 */
router.delete('/methods/:id', authenticateToken, async (req, res) => {
  try {
    await stripe.paymentMethods.detach(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[payments.methods] detach error:', err?.message);
    res.status(500).json({ success: false, error: err?.message || 'Failed to remove card' });
  }
});

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
      // Look up customer in users table (our schema uses 'users' not 'passenger')
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, preferences: true }
      });

      // Check if we already have a Stripe customer ID stored in user preferences
      const savedStripeId = customer?.preferences?.stripeCustomerId;
      
      if (savedStripeId) {
        stripeCustomerId = savedStripeId;
      } else {
        // Create new Stripe customer
        const stripeCustomer = await stripe.customers.create({
          email: customer?.email || undefined,
          name: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Customer',
          phone: customer?.phone || undefined,
          metadata: {
            userId: customerId,
            jobId: jobId || '',
          }
        });

        stripeCustomerId = stripeCustomer.id;

        // Save Stripe customer ID to user preferences
        try {
          const prefs = typeof customer?.preferences === 'object' ? customer.preferences : {};
          await prisma.user.update({
            where: { id: customerId },
            data: { preferences: { ...prefs, stripeCustomerId } }
          });
        } catch (saveErr) {
          console.warn('⚠️ Could not save Stripe customer ID to user:', saveErr.message);
        }
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
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
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
 * POST /api/payments/connection-token
 * Returns a Stripe Terminal connection token the driver's phone uses to
 * authenticate as a Tap-to-Pay reader. Short-lived; the SDK asks for a new
 * one on demand via its tokenProvider.
 *
 * NOTE: Your Stripe account must have Tap to Pay enabled (Dashboard →
 * Terminal → Tap to Pay) and the SDK must be installed on the mobile app.
 */
router.post('/connection-token', authenticateToken, async (req, res) => {
  try {
    const token = await stripe.terminal.connectionTokens.create();
    return res.json({ success: true, secret: token.secret });
  } catch (error) {
    console.error('❌ Error creating Terminal connection token:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Terminal connection token',
      // Helps the client detect "not enabled on account" vs other errors.
      code: error.code || error.type || null,
    });
  }
});

/**
 * POST /api/payments/terminal/create-intent
 * Creates a card_present PaymentIntent for Tap to Pay. The driver's phone
 * collects the tap, then the same intent is confirmed/captured by the SDK.
 *
 * Body: { amount (cents), currency?, jobId?, customerId? }
 */
router.post('/terminal/create-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, currency, jobId, customerId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Optional: look up Stripe customer the same way /create-intent does, so
    // the charge is attached to the rider when we know who they are.
    let stripeCustomerId;
    if (customerId) {
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, preferences: true },
      });
      const savedStripeId = customer?.preferences?.stripeCustomerId;
      if (savedStripeId) {
        stripeCustomerId = savedStripeId;
      } else if (customer) {
        const created = await stripe.customers.create({
          email: customer.email || undefined,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer',
          phone: customer.phone || undefined,
          metadata: { userId: customerId, jobId: jobId || '' },
        });
        stripeCustomerId = created.id;
        try {
          const prefs = typeof customer.preferences === 'object' ? customer.preferences : {};
          await prisma.user.update({
            where: { id: customerId },
            data: { preferences: { ...prefs, stripeCustomerId } },
          });
        } catch (_) { /* non-fatal */ }
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency || 'nzd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      customer: stripeCustomerId,
      metadata: {
        jobId: jobId || '',
        driverId: req.user?.id || '',
        channel: 'tap_to_pay',
        createdAt: new Date().toISOString(),
      },
    });

    console.log('✅ Terminal PaymentIntent created:', { id: paymentIntent.id, amount: amount / 100, jobId });

    return res.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('❌ Error creating Terminal PaymentIntent:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Terminal PaymentIntent',
      code: error.code || error.type || null,
    });
  }
});

/**
 * GET /api/payments/terminal/location
 * Returns (or lazily creates) a Stripe Terminal Location for this account.
 * Terminal requires every reader connection to specify a locationId — even
 * for Tap-to-Pay where the "reader" is the driver's phone. We cache the
 * chosen ID in process memory and fall back to STRIPE_TERMINAL_LOCATION_ID
 * env var if set.
 */
let cachedTerminalLocationId = null;
router.get('/terminal/location', authenticateToken, async (req, res) => {
  try {
    if (cachedTerminalLocationId) {
      return res.json({ success: true, locationId: cachedTerminalLocationId });
    }
    if (process.env.STRIPE_TERMINAL_LOCATION_ID) {
      cachedTerminalLocationId = process.env.STRIPE_TERMINAL_LOCATION_ID;
      return res.json({ success: true, locationId: cachedTerminalLocationId });
    }
    // List existing locations; use first if present.
    const list = await stripe.terminal.locations.list({ limit: 1 });
    if (list.data && list.data.length > 0) {
      cachedTerminalLocationId = list.data[0].id;
      return res.json({ success: true, locationId: cachedTerminalLocationId });
    }
    // Create a default one. Uses a generic address — drivers roam, so the
    // address here is just for Stripe's records.
    const created = await stripe.terminal.locations.create({
      display_name: 'AB Taxi — Mobile Drivers',
      address: {
        line1: '1 Mobile Way',
        city: 'Auckland',
        country: 'NZ',
        postal_code: '1010',
      },
    });
    cachedTerminalLocationId = created.id;
    return res.json({ success: true, locationId: cachedTerminalLocationId });
  } catch (error) {
    console.error('❌ Error resolving Terminal location:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve Terminal location',
      code: error.code || error.type || null,
    });
  }
});

/**
 * POST /api/payments/terminal/capture
 * Manual capture for Tap-to-Pay intents that used capture_method=manual.
 * With capture_method=automatic (our default above) this is a no-op success,
 * but exposing it lets the mobile app switch to manual capture later without
 * another backend change.
 */
router.post('/terminal/capture', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: 'paymentIntentId required' });
    }
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status === 'succeeded') {
      return res.json({ success: true, paymentIntent: pi });
    }
    if (pi.status === 'requires_capture') {
      const captured = await stripe.paymentIntents.capture(paymentIntentId);
      return res.json({ success: true, paymentIntent: captured });
    }
    return res.status(409).json({ success: false, error: `Cannot capture from status ${pi.status}` });
  } catch (error) {
    console.error('❌ Error capturing Terminal PaymentIntent:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture Terminal PaymentIntent',
    });
  }
});

/**
 * POST /api/payments/tip
 * Record (and, if paid by card, charge) a post-ride tip for a driver.
 *
 * Body: { tripId?, jobId?, amount, driverId? }
 *
 * Behaviour:
 *  - CASH ride → just records the tip as a separate payments row so driver
 *    earnings / wallet show it. Passenger is expected to hand cash to driver.
 *  - CARD ride → creates a Stripe PaymentIntent against the saved customer
 *    + default payment method (off-session) and records it on success.
 */
router.post('/tip', authenticateToken, async (req, res) => {
  try {
    const { tripId, jobId, amount, driverId: driverIdFromBody } = req.body;
    const tipAmount = parseFloat(amount);
    if (!tipAmount || tipAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid tip amount' });
    }

    // Resolve the ride/job → get driverId, companyId, stripe customer
    let job = null;
    if (jobId) {
      job = await prisma.job.findFirst({ where: { OR: [{ id: jobId }, { jobId }] } });
    }
    if (!job && tripId) {
      job = await prisma.job.findFirst({ where: { tripId } });
    }
    if (!job) {
      return res.status(404).json({ success: false, error: 'Ride not found' });
    }
    const driverId = driverIdFromBody || job.assignedDriverId;
    if (!driverId) {
      return res.status(400).json({ success: false, error: 'Driver not known for this ride' });
    }

    // Look up passenger's Stripe customer
    const passenger = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });
    const stripeCustomerId = passenger?.preferences?.stripeCustomerId;

    let stripePaymentIntentId = null;
    let status = 'COMPLETED';

    if (job.paymentMethod === 'CARD' && stripeCustomerId) {
      // Charge the tip off-session via saved card
      try {
        const pms = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
        if (pms.data.length === 0) {
          return res.status(400).json({ success: false, error: 'No saved card to charge the tip' });
        }
        const intent = await stripe.paymentIntents.create({
          amount: Math.round(tipAmount * 100),
          currency: 'nzd',
          customer: stripeCustomerId,
          payment_method: pms.data[0].id,
          off_session: true,
          confirm: true,
          metadata: { jobId: job.id, driverId, type: 'TIP' },
        });
        stripePaymentIntentId = intent.id;
        status = intent.status === 'succeeded' ? 'COMPLETED' : 'PENDING';
      } catch (stripeErr) {
        console.error('[payments.tip] Stripe charge failed:', stripeErr?.message);
        return res.status(402).json({ success: false, error: 'Card charge failed: ' + stripeErr?.message });
      }
    } else if (job.paymentMethod === 'CASH') {
      // Cash tip — record only; passenger is expected to hand cash to driver
      status = 'PENDING';
    }

    const payment = await prisma.payments.create({
      data: {
        id: randomUUID(),
        jobId: job.id,
        tripId: job.tripId,
        driverId,
        customerId: job.customerId,
        companyId: job.companyId,
        amount: tipAmount,
        paymentMethod: job.paymentMethod || 'CASH',
        status,
        stripePaymentIntentId,
        paidAt: status === 'COMPLETED' ? new Date() : null,
        updatedAt: new Date(),
        metadata: { type: 'TIP', recordedAt: new Date().toISOString() },
      },
    });

    res.json({ success: true, payment, status });
  } catch (err) {
    console.error('[payments.tip] error:', err?.message);
    res.status(500).json({ success: false, error: err?.message || 'Failed to record tip' });
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

    // Fetch job to get driverId, companyId, tripId
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const driverId = req.user?.id || job.assignedDriverId;

    // Create payment record
    const payment = await prisma.payments.create({
      data: {
        id: randomUUID(),
        jobId,
        driverId,
        companyId: job.companyId,
        customerId: job.customerId,
        tripId: job.tripId,
        amount: parseFloat(amount),
        paymentMethod: method,
        status: 'COMPLETED',
        stripePaymentIntentId,
        paidAt: new Date(),
        metadata: {
          baseFare,
          extraAmount,
          discountAmount,
          totalMobility,
          adjustmentReason,
          breakdown,
          pauseRecords,
          recordedAt: new Date().toISOString(),
        },
      },
    });

    // Update job status to completed with payment
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        finalAmount: parseFloat(amount),
        paymentMethod: method,
        completedAt: new Date(),
      },
    });

    // Sync linked ride
    if (job.tripId) {
      try {
        await prisma.rides.updateMany({
          where: { id: job.tripId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            actualFare: parseFloat(amount),
            paymentMethod: method,
            paymentStatus: 'PAID',
            updatedAt: new Date(),
          },
        });
      } catch (rideErr) {
        console.warn(`⚠️ Failed to sync ride ${job.tripId}:`, rideErr.message);
      }
    }

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

    // `payments` has no `job` relation in the Prisma schema — only scalar FKs
    // `driverId`, `customerId`, `companyId`, `tripId`. Filter on driverId for
    // DRIVER role, customerId for PASSENGER, companyId for everyone else.
    const role = req.user?.role;
    const where = role === 'DRIVER'
      ? { driverId: req.user.id }
      : role === 'PASSENGER'
        ? { customerId: req.user.id }
        : req.user?.companyId
          ? { companyId: req.user.companyId }
          : { driverId: req.user.id }; // safe fallback

    const payments = await prisma.payments.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    // Attach minimal job context for each payment (pickup/dropoff + passenger name)
    const jobIds = [...new Set(payments.map(p => p.jobId).filter(Boolean))];
    const jobs = jobIds.length
      ? await prisma.job.findMany({
          where: { id: { in: jobIds } },
          select: {
            id: true, jobId: true, pickupAddress: true, dropoffAddress: true,
            users_jobs_customerIdTousers: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const jobById = Object.fromEntries(jobs.map(j => [j.id, j]));

    const enriched = payments.map(p => ({
      ...p,
      job: p.jobId ? (jobById[p.jobId] ? {
        id: jobById[p.jobId].id,
        publicJobId: jobById[p.jobId].jobId,
        pickupAddress: jobById[p.jobId].pickupAddress,
        dropoffAddress: jobById[p.jobId].dropoffAddress,
        passenger: jobById[p.jobId].users_jobs_customerIdTousers || null,
      } : null) : null,
    }));

    res.json({ success: true, payments: enriched, total: enriched.length });
  } catch (error) {
    console.error('❌ Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payment history'
    });
  }
});

/**
 * GET /api/payments/wallet/balance
 *
 * Returns the authenticated user's current wallet balance + recent transactions.
 * Balance is derived from the latest wallet_transactions row's balanceAfter so we
 * don't need to store it redundantly on the User record.
 */
router.get('/wallet/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [last, recent] = await Promise.all([
      prisma.wallet_transactions.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.wallet_transactions.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const balance = last ? parseFloat(last.balanceAfter) : 0;
    const currency = last?.currency || 'USD';
    res.json({
      success: true,
      data: {
        balance,
        currency,
        transactions: recent.map(t => ({
          id: t.id,
          createdAt: t.createdAt,
          type: t.type,
          amount: parseFloat(t.amount),
          currency: t.currency,
          description: t.description,
          balanceAfter: parseFloat(t.balanceAfter),
          paymentId: t.paymentId,
        })),
      },
    });
  } catch (err) {
    console.error('[wallet/balance]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch wallet balance' });
  }
});

/**
 * GET /api/payments/wallet/transactions?page=&limit=&type=
 * Paginated wallet transaction history. /wallet/balance already returns the
 * most recent 20 as a convenience, but the wallet screen's "See all" view
 * needs proper pagination + optional type filtering (CREDIT / DEBIT / etc).
 */
router.get('/wallet/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where = { userId };
    if (req.query.type) {
      // Client may pass multiple types comma-separated: ?type=CREDIT,TOPUP
      const types = String(req.query.type).split(',').map(t => t.trim()).filter(Boolean);
      if (types.length === 1) where.type = types[0];
      else if (types.length > 1) where.type = { in: types };
    }

    const [rows, total] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wallet_transactions.count({ where }),
    ]);

    res.json({
      success: true,
      data: rows.map(t => ({
        id: t.id,
        createdAt: t.createdAt,
        type: t.type,
        amount: parseFloat(t.amount),
        currency: t.currency,
        description: t.description,
        balanceBefore: parseFloat(t.balanceBefore),
        balanceAfter: parseFloat(t.balanceAfter),
        paymentId: t.paymentId,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[wallet/transactions]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch transactions' });
  }
});

/**
 * POST /api/payments/wallet/topup
 * Body: { amount: number, currency?: string }
 *
 * Creates a Stripe PaymentIntent so the mobile app can present PaymentSheet.
 * The wallet is only credited after the client confirms via /wallet/topup/confirm
 * (webhook-safe: even if the client never calls confirm, the scheduled
 * reconciliation job will sweep captured PaymentIntents later).
 */
router.post('/wallet/topup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Number(req.body?.amount);
    const currency = (req.body?.currency || 'usd').toLowerCase();
    if (!Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({ success: false, message: 'amount must be at least 1' });
    }
    // Stripe customer. The User model has no dedicated stripeCustomerId column —
    // per project convention we cache it in users.preferences.stripeCustomerId
    // (matches /setup-intent, /methods, and /payment-intent above). Previously this
    // block wrote a top-level `stripeCustomerId` column which does not exist on the
    // User model in prisma/schema.prisma, causing Prisma to throw
    // "Unknown argument `stripeCustomerId`" on every wallet top-up attempt.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, preferences: true },
    });
    let stripeCustomerId = user?.preferences?.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      const prefs = (typeof user?.preferences === 'object' && user.preferences) ? user.preferences : {};
      await prisma.user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, stripeCustomerId } },
      });
    }
    // Ephemeral key so the mobile SDK can fetch saved cards inside PaymentSheet
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: '2024-06-20' },
    );
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: { userId, purpose: 'WALLET_TOPUP' },
    });
    res.json({
      success: true,
      data: {
        paymentIntent: pi.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: stripeCustomerId,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        paymentIntentId: pi.id,
      },
    });
  } catch (err) {
    console.error('[wallet/topup]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create topup intent' });
  }
});

/**
 * POST /api/payments/wallet/topup/confirm
 * Body: { paymentIntentId: string }
 *
 * Called by the mobile app after PaymentSheet reports success. We re-verify
 * the PaymentIntent status against Stripe (never trust the client) and, only
 * if 'succeeded' and not already credited, append a CREDIT wallet transaction.
 */
router.post('/wallet/topup/confirm', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentIntentId } = req.body || {};
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'paymentIntentId required' });
    }
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ success: false, message: `PaymentIntent status: ${pi.status}` });
    }
    if (pi.metadata?.userId !== userId || pi.metadata?.purpose !== 'WALLET_TOPUP') {
      return res.status(403).json({ success: false, message: 'PaymentIntent does not belong to this user' });
    }
    // Idempotency — don't double-credit
    const existing = await prisma.wallet_transactions.findFirst({
      where: { userId, description: { contains: paymentIntentId } },
    });
    if (existing) {
      return res.json({ success: true, data: { alreadyCredited: true, transactionId: existing.id } });
    }
    const amount = pi.amount_received / 100;
    const currency = pi.currency.toUpperCase();
    const lastTx = await prisma.wallet_transactions.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const balanceBefore = lastTx ? parseFloat(lastTx.balanceAfter) : 0;
    const balanceAfter = balanceBefore + amount;
    const tx = await prisma.wallet_transactions.create({
      data: {
        id: randomUUID(),
        userId,
        type: 'CREDIT',
        amount,
        currency,
        description: `Wallet top-up via Stripe ${paymentIntentId}`,
        balanceBefore,
        balanceAfter,
      },
    });
    res.json({
      success: true,
      data: {
        transactionId: tx.id,
        balanceAfter,
        currency,
        amount,
      },
    });
  } catch (err) {
    console.error('[wallet/topup/confirm]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to confirm topup' });
  }
});

module.exports = router;
