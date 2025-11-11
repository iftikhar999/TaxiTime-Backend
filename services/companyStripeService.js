const Stripe = require('stripe');
const prisma = require('../lib/prisma');
const { encrypt, decrypt } = require('../lib/crypto');

const stripeClientCache = new Map();
const GLOBAL_STRIPE_CONFIG_KEY = 'stripe_global_keys';

async function getGlobalStripeSettings() {
  const config = await prisma.global_configurations.findUnique({
    where: { key: GLOBAL_STRIPE_CONFIG_KEY },
  });

  if (!config?.value) {
    return { publicKey: null, secretKey: null };
  }

  const payload = config.value || {};
  return {
    publicKey: payload.publicKey ? decrypt(payload.publicKey) : null,
    secretKey: payload.secretKey ? decrypt(payload.secretKey) : null,
    metadata: payload.metadata || {},
  };
}

async function setGlobalStripeSettings({
  publicKey,
  secretKey,
  userId,
}) {
  const now = new Date().toISOString();
  const value = {
    publicKey: publicKey ? encrypt(publicKey) : null,
    secretKey: secretKey ? encrypt(secretKey) : null,
    metadata: {
      updatedAt: now,
      updatedBy: userId ?? null,
    },
  };

  await prisma.global_configurations.upsert({
    where: { key: GLOBAL_STRIPE_CONFIG_KEY },
    update: {
      value,
      updatedAt: new Date(),
      lastUpdatedBy: userId ?? null,
    },
    create: {
      key: GLOBAL_STRIPE_CONFIG_KEY,
      category: 'PAYMENTS',
      displayName: 'Stripe Global Configuration',
      description: 'Global Stripe keys managed by Super Admin',
      dataType: 'json',
      value,
      createdAt: new Date(),
      createdBy: userId ?? null,
    },
  });

  await prisma.systemActivity?.create?.({
    data: {
      type: 'payments.global_stripe.updated',
      title: 'Stripe global keys updated',
      description: 'Super admin updated global Stripe credentials',
      metadata: { updatedAt: now },
      userId: userId ?? null,
    },
  }).catch(() => null);

  stripeClientCache.clear();
}

async function deleteGlobalStripeSettings(userId) {
  await prisma.global_configurations.deleteMany({
    where: { key: GLOBAL_STRIPE_CONFIG_KEY },
  });

  stripeClientCache.clear();

  await prisma.systemActivity?.create?.({
    data: {
      type: 'payments.global_stripe.deleted',
      title: 'Stripe global keys removed',
      description: 'Super admin removed global Stripe credentials',
      metadata: {},
      userId: userId ?? null,
    },
  }).catch(() => null);
}

async function getCompanyStripeSettings(companyId) {
  if (!companyId) {
    return { publicKey: null, secretKey: null };
  }

  const settings = await prisma.company_settings.findUnique({
    where: { companyId },
    select: {
      stripePublicKey: true,
      stripeSecretKey: true,
    },
  });

  if (!settings || (!settings.stripePublicKey && !settings.stripeSecretKey)) {
    return { publicKey: null, secretKey: null };
  }

  return {
    publicKey: settings.stripePublicKey
      ? decrypt(settings.stripePublicKey)
      : null,
    secretKey: settings.stripeSecretKey
      ? decrypt(settings.stripeSecretKey)
      : null,
  };
}

async function getCompanyStripeClient(companyId) {
  const cacheKey = String(companyId || 'global');
  if (stripeClientCache.has(cacheKey)) {
    return stripeClientCache.get(cacheKey);
  }

  let { publicKey, secretKey } = await getCompanyStripeSettings(companyId);

  if (!publicKey || !secretKey) {
    const globalKeys = await getGlobalStripeSettings();
    publicKey = publicKey || globalKeys.publicKey;
    secretKey = secretKey || globalKeys.secretKey;
  }

  if (!publicKey || !secretKey) {
    return { stripe: null, publicKey: publicKey || null };
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: '2023-10-16',
  });

  const client = { stripe, publicKey };
  stripeClientCache.set(cacheKey, client);
  return client;
}

module.exports = {
  getGlobalStripeSettings,
  setGlobalStripeSettings,
  deleteGlobalStripeSettings,
  getCompanyStripeSettings,
  getCompanyStripeClient,
  clearCompanyStripeCache: (companyId) =>
    stripeClientCache.delete(String(companyId || 'global')),
};
