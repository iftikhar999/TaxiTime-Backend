const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initialize Stripe with environment variables
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
    constructor() {
        this.stripe = stripe;
    }

    /**
     * Create a new customer in Stripe
     */
    async createCustomer(customerData) {
        try {
            const customer = await this.stripe.customers.create({
                email: customerData.email,
                name: `${customerData.firstName} ${customerData.lastName}`,
                phone: customerData.phone,
                metadata: {
                    userId: customerData.id,
                    role: customerData.role,
                    companyId: customerData.companyId || ''
                }
            });

            return customer;
        } catch (error) {
            console.error('Error creating Stripe customer:', error);
            throw error;
        }
    }

    /**
     * Create a payment intent for ride payment
     */
    async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency.toLowerCase(),
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata
            });

            return paymentIntent;
        } catch (error) {
            console.error('Error creating payment intent:', error);
            throw error;
        }
    }

    /**
     * Create a setup intent for saving payment methods
     */
    async createSetupIntent(customerId) {
        try {
            const setupIntent = await this.stripe.setupIntents.create({
                customer: customerId,
                usage: 'off_session',
                payment_method_types: ['card']
            });

            return setupIntent;
        } catch (error) {
            console.error('Error creating setup intent:', error);
            throw error;
        }
    }

    /**
     * Process subscription payment for company
     */
    async processSubscriptionPayment(companyId, planId, paymentMethodId) {
        try {
            // Get company and plan details
            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: { subscriptionPlan: true }
            });

            if (!company) {
                throw new Error('Company not found');
            }

            // Create or get Stripe customer for company
            let stripeCustomerId = company.stripeCustomerId;
            if (!stripeCustomerId) {
                const customer = await this.createCustomer({
                    email: company.email,
                    firstName: company.legalName,
                    lastName: '',
                    phone: company.phone,
                    id: company.id,
                    role: 'COMPANY',
                    companyId: company.id
                });
                stripeCustomerId = customer.id;

                // Update company with Stripe customer ID
                await prisma.company.update({
                    where: { id: companyId },
                    data: { stripeCustomerId }
                });
            }

            // Attach payment method to customer
            await this.stripe.paymentMethods.attach(paymentMethodId, {
                customer: stripeCustomerId,
            });

            // Get subscription plan details
            const plan = await prisma.subscriptionPlan.findUnique({
                where: { id: planId }
            });

            if (!plan) {
                throw new Error('Subscription plan not found');
            }

            // Create payment intent for subscription
            const paymentIntent = await this.createPaymentIntent(
                plan.monthlyPrice,
                'usd',
                {
                    companyId,
                    planId,
                    type: 'subscription',
                    billingPeriod: 'monthly'
                }
            );

            // Confirm payment
            const confirmedPayment = await this.stripe.paymentIntents.confirm(paymentIntent.id, {
                payment_method: paymentMethodId,
            });

            return confirmedPayment;
        } catch (error) {
            console.error('Error processing subscription payment:', error);
            throw error;
        }
    }

    /**
     * Create payout to driver
     */
    async createPayout(driverId, amount, currency = 'usd') {
        try {
            // Get driver bank details
            const driver = await prisma.user.findUnique({
                where: { id: driverId, role: 'DRIVER' }
            });

            if (!driver) {
                throw new Error('Driver not found');
            }

            // In a real implementation, you would:
            // 1. Verify driver has connected bank account
            // 2. Create Stripe Connect account for driver
            // 3. Create transfer to connected account

            const payout = {
                amount: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                recipient: driverId,
                metadata: {
                    driverId,
                    type: 'driver_payout'
                }
            };

            console.log('Mock payout created:', payout);
            return payout;
        } catch (error) {
            console.error('Error creating payout:', error);
            throw error;
        }
    }

    /**
     * Handle webhook events
     */
    async handleWebhook(event, signature, endpointSecret) {
        try {
            // Verify webhook signature
            const stripeEvent = this.stripe.webhooks.constructEvent(
                event,
                signature,
                endpointSecret
            );

            console.log('Stripe webhook received:', stripeEvent.type);

            switch (stripeEvent.type) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentSuccess(stripeEvent.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    await this.handlePaymentFailure(stripeEvent.data.object);
                    break;

                case 'invoice.payment_succeeded':
                    await this.handleInvoicePaymentSuccess(stripeEvent.data.object);
                    break;

                case 'invoice.payment_failed':
                    await this.handleInvoicePaymentFailure(stripeEvent.data.object);
                    break;

                default:
                    console.log(`Unhandled event type: ${stripeEvent.type}`);
            }

            return { received: true };
        } catch (error) {
            console.error('Error handling webhook:', error);
            throw error;
        }
    }

    /**
     * Handle successful payment
     */
    async handlePaymentSuccess(paymentIntent) {
        try {
            const metadata = paymentIntent.metadata;

            // Update payment record in database
            const payment = await prisma.payment.upsert({
                where: {
                    stripePaymentIntentId: paymentIntent.id
                },
                update: {
                    status: 'COMPLETED',
                    paidAt: new Date(),
                    stripePaymentIntentId: paymentIntent.id
                },
                create: {
                    id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    amount: paymentIntent.amount / 100,
                    currency: paymentIntent.currency.toUpperCase(),
                    status: 'COMPLETED',
                    paymentMethod: 'CARD',
                    stripePaymentIntentId: paymentIntent.id,
                    paidAt: new Date(),
                    companyId: metadata.companyId || null,
                    jobId: metadata.jobId || null,
                    customerId: metadata.customerId || null
                }
            });

            console.log('Payment success processed:', payment.id);
            return payment;
        } catch (error) {
            console.error('Error handling payment success:', error);
            throw error;
        }
    }

    /**
     * Handle failed payment
     */
    async handlePaymentFailure(paymentIntent) {
        try {
            // Update payment record
            await prisma.payment.upsert({
                where: {
                    stripePaymentIntentId: paymentIntent.id
                },
                update: {
                    status: 'FAILED',
                    stripePaymentIntentId: paymentIntent.id
                },
                create: {
                    id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    amount: paymentIntent.amount / 100,
                    currency: paymentIntent.currency.toUpperCase(),
                    status: 'FAILED',
                    paymentMethod: 'CARD',
                    stripePaymentIntentId: paymentIntent.id,
                    companyId: paymentIntent.metadata.companyId || null,
                    jobId: paymentIntent.metadata.jobId || null,
                    customerId: paymentIntent.metadata.customerId || null
                }
            });

            console.log('Payment failure processed for:', paymentIntent.id);
        } catch (error) {
            console.error('Error handling payment failure:', error);
            throw error;
        }
    }

    /**
     * Handle successful invoice payment
     */
    async handleInvoicePaymentSuccess(invoice) {
        try {
            // Update invoice status in database
            const invoiceRecord = await prisma.invoice.findFirst({
                where: { stripeInvoiceId: invoice.id }
            });

            if (invoiceRecord) {
                await prisma.invoice.update({
                    where: { id: invoiceRecord.id },
                    data: {
                        status: 'PAID',
                        paidAt: new Date()
                    }
                });
            }

            console.log('Invoice payment success processed:', invoice.id);
        } catch (error) {
            console.error('Error handling invoice payment success:', error);
            throw error;
        }
    }

    /**
     * Handle failed invoice payment
     */
    async handleInvoicePaymentFailure(invoice) {
        try {
            // Update invoice status
            const invoiceRecord = await prisma.invoice.findFirst({
                where: { stripeInvoiceId: invoice.id }
            });

            if (invoiceRecord) {
                await prisma.invoice.update({
                    where: { id: invoiceRecord.id },
                    data: {
                        status: 'PAYMENT_FAILED'
                    }
                });
            }

            console.log('Invoice payment failure processed:', invoice.id);
        } catch (error) {
            console.error('Error handling invoice payment failure:', error);
            throw error;
        }
    }

    /**
     * Create refund
     */
    async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
        try {
            const refund = await this.stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: amount ? Math.round(amount * 100) : undefined,
                reason
            });

            // Update payment record
            await prisma.payment.updateMany({
                where: { stripePaymentIntentId: paymentIntentId },
                data: { status: 'REFUNDED' }
            });

            return refund;
        } catch (error) {
            console.error('Error creating refund:', error);
            throw error;
        }
    }
}

module.exports = new StripeService();