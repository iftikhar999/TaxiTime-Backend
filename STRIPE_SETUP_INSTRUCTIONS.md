# Stripe Payment Integration Setup

## Current Issue

The mobile driver app is getting **404 errors** when trying to create Stripe Payment Intents because:

1. ✅ The endpoint exists and is correct: `/api/payments/create-intent`
2. ✅ The route is properly registered in `server.js` at line 1773
3. ⚠️ **The Stripe API keys are placeholder values** (`your-stripe-secret-key`)

## Solution: Get Real Stripe Keys

### Step 1: Get Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Create a Stripe account (free)
3. Verify your email

### Step 2: Get Test API Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. You'll see two keys:
   - **Publishable key** (starts with `pk_test_...`) - Safe to use in mobile app
   - **Secret key** (starts with `sk_test_...`) - Keep secure, backend only

### Step 3: Update Backend .env File

Edit `/Applications/A_B_TAXI/backend/.env.production`:

```bash
# Payment Gateways - REPLACE THESE WITH YOUR ACTUAL STRIPE KEYS
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

### Step 4: Restart Backend Server

```bash
cd /Applications/A_B_TAXI/backend
npm restart
# or
node server.js
```

### Step 5: Test Payment Flow

1. Open mobile driver app
2. Complete a trip
3. Click "COMPLETE TRIP" button
4. Select "CARD" payment method
5. ✅ Stripe Payment Sheet should now load successfully

## API Endpoint Details

**Endpoint:** `POST /api/payments/create-intent`

**Request Body:**

```json
{
  "amount": 14300, // Amount in cents (143.00 NZD)
  "currency": "nzd", // Currency code
  "jobId": "cmheiaaq...", // Job ID
  "customerId": "xyz123" // Passenger ID (optional)
}
```

**Response:**

```json
{
  "success": true,
  "paymentIntent": "pi_xxx_secret_yyy", // Client secret for payment
  "ephemeralKey": "ek_test_xxx", // Temporary key
  "customer": "cus_xxx", // Stripe customer ID
  "publishableKey": "pk_test_xxx" // Publishable key
}
```

## Mobile App Configuration

The mobile app is already correctly configured:

- ✅ API endpoint: `/payments/create-intent` (relative to base URL)
- ✅ Request format: Correct amount in cents, NZD currency
- ✅ Error handling: Shows user-friendly message if Stripe not configured
- ✅ Fallback: Other payment methods (Cash, EFTPOS, Account, Gift Card) work

**File:** `/Applications/A_B_TAXI/mobile/driver-app-v1/src/screens/Jobs/PaymentCollectionScreen.tsx`

- Line 202: Makes request to `/payments/create-intent`
- Line 213: Initializes Stripe Payment Sheet
- Line 232: Error handler shows helpful message

## Testing with Stripe Test Cards

Once configured, test with these cards:

| Card Number         | Scenario          |
| ------------------- | ----------------- |
| 4242 4242 4242 4242 | Success           |
| 4000 0000 0000 9995 | Declined          |
| 4000 0025 0000 3155 | Requires 3DS auth |

- Use any future expiry date (e.g., 12/34)
- Use any 3-digit CVC (e.g., 123)
- Use any billing postal code

## Production Setup (Later)

When ready for production:

1. Complete Stripe account activation
2. Get **live** API keys from https://dashboard.stripe.com/apikeys
3. Replace test keys with live keys:
   ```bash
   STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY
   STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
   ```
4. Set `NODE_ENV=production`

## Troubleshooting

### Error: "Request failed with status code 404"

- ✅ **FIXED**: Changed endpoint from `/api/payments/create-intent` to `/payments/create-intent`
- The httpClient already has `/api` in its base URL

### Error: "Invalid API Key provided"

- Check that Stripe keys in `.env.production` start with `sk_test_` and `pk_test_`
- Restart backend server after updating .env file

### Error: "Customer not found"

- Ignore if customer ID is optional
- Backend creates ephemeral customer for anonymous payments

## Current Status

✅ **Mobile App:** Correctly configured and ready
✅ **Backend API:** Endpoint exists and working
⏳ **Stripe Keys:** Need to be configured by user

**Action Required:** Add real Stripe test keys to `/Applications/A_B_TAXI/backend/.env.production`
