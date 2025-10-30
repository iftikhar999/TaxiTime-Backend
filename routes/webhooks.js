const express = require('express');
const stripeService = require('../services/stripeService');

const router = express.Router();

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
        console.error('Stripe webhook secret not configured');
        return res.status(400).send('Webhook secret not configured');
    }

    try {
        // Handle the webhook
        const result = await stripeService.handleWebhook(req.body, signature, endpointSecret);

        res.json(result);
    } catch (error) {
        console.error('Webhook error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

module.exports = router;